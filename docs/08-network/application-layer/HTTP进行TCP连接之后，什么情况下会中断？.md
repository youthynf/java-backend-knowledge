# HTTP 进行 TCP 连接之后什么情况下会中断

## 核心概念

HTTP 基于 TCP，TCP 连接建立后并非永久保持。中断原因分四类：应用层主动关闭（close 或 Connection: close）、超时机制触发（keep-alive 超时、读超时、重传超限）、网络异常（断网、路由变化）、应用层错误（RST 复位、协议错误）。理解这些场景是排查"连接莫名断开""接口偶发超时"的基础。

## 标准回答

HTTP over TCP 连接中断的常见原因：

| 类别 | 触发条件 | 谁发起 |
|------|---------|--------|
| 主动关闭 | 应用层 close() / Connection: close | 客户端或服务端 |
| 空闲超时 | keep-alive timeout 到期 | 服务端 |
| 请求数上限 | keepalive_requests 达到 | 服务端 |
| 读超时 | 客户端读响应超时 | 客户端 |
| 重传超限 | tcp_retries2 达到上限 | 内核 |
| keepalive 探测失败 | TCP keepalive 探测失败 | 内核 |
| 网络异常 | 断网、路由变化、NAT 失效 | 网络 |
| RST 复位 | 协议错误、SO_LINGER=0、全连接队列满 | 客户端或服务端 |
| 应用崩溃 | 进程崩溃，OS 发 FIN/RST | OS |

## 详细机制

### 1. 应用层主动关闭

**close()**：调用 close 触发四次挥手。

```java
Socket socket = new Socket("example.com", 80);
// ... 业务处理
socket.close();   // 触发 FIN，四次挥手
```

**Connection: close 头**：HTTP/1.1 默认 keep-alive，发此头表示响应后关闭。

```http
GET / HTTP/1.1
Connection: close
```

### 2. 空闲超时（keep-alive timeout）

服务端配置 keep-alive 空闲超时，超时主动关闭：

```nginx
keepalive_timeout 65;       # Nginx 默认 65 秒
keepalive_requests 1000;    # 默认 1000 次请求
```

```java
// Tomcat 配置
server:
  tomcat:
    connection-timeout: 20000    # 连接超时 20 秒
    keep-alive-timeout: 60000    # keep-alive 超时 60 秒
```

为什么需要空闲超时？防止连接泄漏（客户端崩溃不通知服务端时，连接永久占用资源）。

### 3. 请求数上限

服务端限制单连接最大请求数，达上限主动关闭，防止长期连接积累问题：

```nginx
keepalive_requests 1000;    # 1000 次后关闭
```

### 4. 读超时

客户端等待响应超时，主动断开：

```java
Socket socket = new Socket("example.com", 80);
socket.setSoTimeout(10000);   // 读超时 10 秒
try {
    int b = socket.getInputStream().read();
} catch (SocketTimeoutException e) {
    // 10 秒没收到数据，主动断开
    socket.close();
}
```

### 5. 重传超限

TCP 数据段发送后等 ACK，超时重传。重传次数受 `tcp_retries2` 控制（默认 15），达到后内核放弃连接：

```bash
$ sysctl net.ipv4.tcp_retries2
net.ipv4.tcp_retries2 = 15
```

15 次重传约 924 秒（指数退避），约 15 分钟。生产中可调小加速失败：

```bash
$ sysctl net.ipv4.tcp_retries2=8
```

应用层会收到 `ETIMEDOUT` 错误。

### 6. keepalive 探测失败

启用 TCP keepalive 后，空闲连接定期探测对端是否活着。多次无响应判定死亡：

```bash
$ sysctl net.ipv4.tcp_keepalive_time     # 默认 7200 秒开始探测
$ sysctl net.ipv4.tcp_keepalive_intvl    # 默认 75 秒间隔
$ sysctl net.ipv4.tcp_keepalive_probes   # 默认 9 次失败判定死亡
```

最坏 7200 + 75 × 9 = 7875 秒（约 2 小时 11 分）才发现死亡连接。生产通常调短或用应用层心跳。

### 7. 网络异常

- **断网**：物理层断开，TCP 不感知，靠重传或 keepalive 发现
- **路由变化**：原有路径不通，重传失败
- **NAT 失效**：NAT 设备清理 UDP/TCP 表项，连接被 NAT 丢弃
- **网线拔插**：物理断开后插回，重传期间可恢复

### 8. RST 复位

RST 是强制关闭，不经过四次挥手：

**协议错误**：发送的包不符合 TCP 状态机预期，对端回 RST。

**SO_LINGER=0**：

```java
Socket socket = new Socket();
socket.setSoLinger(true, 0);   // close 时发 RST 而非 FIN
socket.close();
// 对端收到 "Connection reset by peer"
```

**全连接队列满**：`tcp_abort_on_overflow=1` 时回 RST。

**服务端进程崩溃**：OS 可能发 RST（如未处理的 SIGPIPE）。

### 9. 应用崩溃

- **进程崩溃**：OS 回收资源时发 FIN，对端正常进入四次挥手
- **进程被 kill -9**：OS 兜底发 FIN（同上）
- **主机宕机**：无法发 FIN，对端靠重传或 keepalive 发现
- **OOM**：进程被 OOM Killer 杀，OS 发 FIN

### 抓包与排查

```bash
# 抓 FIN 和 RST
$ tcpdump -i any -n 'tcp[tcpflags] & tcp-fin != 0 or tcp[tcpflags] & tcp-rst != 0'

10:00:00 IP C.5000 > S.80: Flags [F.], seq 1000   # 客户端发 FIN
10:00:00 IP S.80 > C.5000: Flags [.], ack 1001     # 服务端回 ACK
10:00:00 IP S.80 > C.5000: Flags [F.], seq 2000    # 服务端发 FIN
10:00:00 IP C.5000 > S.80: Flags [.], ack 2001     # 客户端回 ACK

# 或
10:00:00 IP S.80 > C.5000: Flags [R.], seq 2000    # 服务端发 RST，强制关闭

# 看连接状态分布
$ ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c
   1234 ESTAB
     42 TIME-WAIT
     17 CLOSE-WAIT    # 应用 bug，未 close
      5 FIN-WAIT-2
```

## 代码示例

Java 设置合理超时避免连接卡死：

```java
import java.net.*;
import java.io.*;

Socket socket = new Socket();
socket.setConnectTimeout(5000);    // 建连超时 5 秒
socket.setSoTimeout(10000);        // 读超时 10 秒
socket.setKeepAlive(true);         // 启用 TCP keepalive
socket.setReuseAddress(true);      // 重启时复用 TIME_WAIT 端口

socket.connect(new InetSocketAddress("example.com", 80), 5000);

try (OutputStream out = socket.getOutputStream();
     InputStream in = socket.getInputStream()) {
    out.write("GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n".getBytes());
    out.flush();

    byte[] buf = new byte[4096];
    int n = in.read(buf);   // 10 秒内没数据抛 SocketTimeoutException
    // ...
}
```

服务端配置合理 keep-alive（Spring Boot）：

```yaml
server:
  tomcat:
    connection-timeout: 20000         # 建连超时
    keep-alive-timeout: 60000         # keep-alive 空闲超时
    max-connections: 8192             # 最大连接数
    threads:
      max: 200                        # 最大工作线程
    accept-count: 100                 # 全连接队列大小
```

Nginx 配置：

```nginx
http {
    keepalive_timeout 65;             # 空闲超时
    keepalive_requests 1000;          # 请求数上限
    client_body_timeout 60;           # 请求体读取超时
    client_header_timeout 60;         # 请求头读取超时
    send_timeout 60;                  # 响应发送超时

    # 上游 keepalive
    upstream backend {
        server 10.0.0.1:8080;
        keepalive 32;
    }
}
```

## 实战场景

| 场景 | 原因 | 排查 |
|------|------|------|
| 接口偶发超时 | 服务端 GC、慢查询 | 看应用日志、JVM 监控 |
| 大量 CLOSE_WAIT | 应用未 close() | 检查代码 try-with-resources |
| 大量 TIME_WAIT | 短连接主动关闭 | 改长连接、开 tcp_tw_reuse |
| Connection reset | RST 关闭 | 检查 SO_LINGER、协议错误 |
| 长连接断开 | NAT 超时 | 心跳间隔 < NAT 超时 |
| 移动端切网断连 | IP 变化 | 用 HTTP/3 或应用层重连 |

## 深挖追问

**Q1：进程崩溃和主机宕机对 TCP 连接有什么不同？**
进程崩溃 OS 发 FIN，对端正常进入四次挥手立即感知。主机宕机无法发 FIN，对端要靠重传（约 15 分钟）或 keepalive（默认 2 小时）发现。

**Q2：RST 和 FIN 关闭的区别？**
FIN 是优雅关闭，缓冲区数据先发完。RST 是强制关闭，缓冲区数据丢弃，对端收到 "Connection reset" 错误。

**Q3：keep-alive 超时调小有什么影响？**
连接更早关闭，客户端要重新建连（增加延迟）。但能更快释放资源，防止连接泄漏。需平衡。

**Q4：为什么会有大量 TIME_WAIT？**
通常是短连接 + 服务端主动关闭。改长连接或让客户端主动关闭可减少。开 `tcp_tw_reuse` 缓解端口耗尽。

**Q5：连接卡在 ESTABLISHED 但不响应怎么办？**
看 `ss -ti` 的重传统计，看 keepalive 是否开启。如果未开 keepalive 且无数据传输，连接会一直卡着。生产中长连接服务必须配心跳。

## 易错点

- **"TCP 连接永久保持"** — 不，受超时、请求数上限、异常等影响最终都会关闭。
- **"keep-alive 超时是 TCP keepalive"** — 不是，前者是 HTTP 应用层超时，后者是 TCP 内核保活。
- **"RST 是优雅关闭"** — 不，是强制关闭，对端收到错误。
- **"进程崩溃连接立即断"** — 不一定，进程崩溃 OS 发 FIN，但对端要等 read 才感知。
- **"调短 keepalive 超时总是好的"** — 不，过短增加重新建连开销。

## 总结

HTTP over TCP 连接中断的原因分四类：应用层主动关闭（close、Connection: close）、超时机制（keep-alive 超时、读超时、重传超限、keepalive 探测失败）、网络异常（断网、NAT 失效）、应用错误（RST、协议错误、崩溃）。生产中要配置合理的超时和心跳，避免连接卡死或泄漏。CLOSE_WAIT 堆积是应用 bug，TIME_WAIT 堆积改长连接，长连接断开加心跳。

## 参考资料

- [RFC 7230 — HTTP/1.1 Connection Management](https://datatracker.ietf.org/doc/html/rfc7230#section-6)
- [RFC 793 — TCP, Connection Close](https://datatracker.ietf.org/doc/html/rfc793#section-3.5)
- [Linux TCP 参数文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
