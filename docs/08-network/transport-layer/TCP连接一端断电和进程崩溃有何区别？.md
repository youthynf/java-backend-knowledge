# TCP 连接一端断电和进程崩溃有何区别

## 核心概念

进程崩溃和主机断电对 TCP 的影响截然不同：**进程崩溃时操作系统会发 FIN，对端正常进入四次挥手**；**主机断电无法发 FIN，对端需要靠重传或 keepalive 才能发现**。这是排查"连接莫名卡住"问题的关键区分点。

## 标准回答

| 情况 | 是否发 FIN | 对端反应 | 发现方式 |
|------|-----------|---------|---------|
| 进程崩溃 | 操作系统代发 FIN | 对端正常四次挥手 | 立即感知 |
| 主机断电（不开机） | 无法发 FIN | 对端连接卡住 | 重传超时或 keepalive |
| 主机断电后重启 | 重启后丢失连接状态 | 对端发包时收到 RST | 发数据时感知 |
| 拔网线（物理断） | 不影响 TCP 状态 | 对端不知 | 数据重传或 keepalive |

进程崩溃由操作系统兜底（OS 回收进程资源时发 FIN），主机断电操作系统都死了，没人发 FIN。

## 详细机制

### 进程崩溃

```
进程崩溃
  ↓
操作系统回收进程资源
  ↓
OS 内核代发 FIN（不需要进程参与）
  ↓
对端收到 FIN，进入 CLOSE_WAIT
  ↓
对端 read() 返回 0（EOF）或 -1（连接关闭）
  ↓
应用层感知到连接断开
```

进程崩溃时 TCP 连接信息在内核中，OS 会扫到这些连接并发 FIN，对端正常进入四次挥手。**不需要 keepalive**。

### 主机断电（不开机）

```
主机断电
  ↓
无法发 FIN（OS 都死了）
  ↓
对端不知道，连接保持 ESTABLISHED
  ↓
对端发数据时收不到 ACK，触发重传
  ↓
重传达 tcp_retries2 上限（默认 15），约 924 秒
  ↓
内核通知应用层 ETIMEDOUT，连接断开
```

如果对端不发数据，且未开 keepalive，连接会一直卡在 ESTABLISHED。

### 主机断电后重启

```
主机断电 → 重启
  ↓
重启后丢失所有 TCP 连接状态
  ↓
对端发包到重启的主机
  ↓
重启的主机找不到对应连接（socket 不存在）
  ↓
回 RST 报文
  ↓
对端收到 RST，连接立即关闭
```

对端发包时才知道对方重启了。如果对端不发数据，仍要等重传或 keepalive。

### tcp_retries2 和重传超时

Linux 中数据段重传次数由 `tcp_retries2` 控制（默认 15）。重传间隔指数退避：

- 前 10 次按指数增长（200ms ~ 102.4s）
- 第 11 次起固定 120s
- 15 次总耗时约 924.6 秒（约 15 分钟）

```bash
$ sysctl net.ipv4.tcp_retries2
net.ipv4.tcp_retries2 = 15
```

调整这个值能改变对端宕机的发现速度。

### keepalive 兜底

未开 keepalive 且无数据传输时，主机断电后对端永远不知道。开启 keepalive 后：

```
空闲 tcp_keepalive_time（默认 7200 秒）
  ↓
发探测包，无响应
  ↓
重试 tcp_keepalive_probes 次（默认 9）
  ↓
判定连接死亡
```

最坏 7200 + 75×9 = 7875 秒（约 2 小时 11 分）。生产中通常调短。

## 代码示例

Java 处理进程崩溃和断电的不同：

```java
import java.net.*;
import java.io.*;

public class RobustClient {
    public static void main(String[] args) {
        while (true) {
            try (Socket socket = new Socket("server.example.com", 8080)) {
                socket.setKeepAlive(true);  // 兜底检测主机宕机
                socket.setSoTimeout(30000);  // 读超时 30 秒

                BufferedReader in = new BufferedReader(
                    new InputStreamReader(socket.getInputStream()));
                String line;
                while ((line = in.readLine()) != null) {
                    System.out.println("Recv: " + line);
                }
                // readLine 返回 null → 对端正常关闭（进程崩溃或主动 close）
                System.out.println("Server closed gracefully");
            } catch (SocketTimeoutException e) {
                System.out.println("Read timeout, reconnecting");
            } catch (IOException e) {
                System.out.println("Connection lost: " + e.getMessage());
                // 主机断电、网络中断 → 这里感知到
            }

            try { Thread.sleep(5000); } catch (InterruptedException e) {}
        }
    }
}
```

调整内核参数加速发现：

```bash
# 调短 keepalive：60 秒空闲开始探测，10 秒间隔，3 次失败
$ sysctl net.ipv4.tcp_keepalive_time=60
$ sysctl net.ipv4.tcp_keepalive_intvl=10
$ sysctl net.ipv4.tcp_keepalive_probes=3
# 最坏 60 + 10×3 = 90 秒发现主机宕机

# 减小数据重传次数，加速发现
$ sysctl net.ipv4.tcp_retries2=8  # 默认 15，调小加速失败
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 服务进程 OOM 崩溃 | 客户端立即收到 EOF | 自动重连机制 |
| 服务主机宕机 | 客户端卡住约 15 分钟 | 调短 `tcp_retries2` 或开 keepalive |
| 服务主机重启 | 客户端发包时收到 RST | 自动重连 |
| 网络中断（无数据） | 连接永久卡住 | 必须开 keepalive 或应用层心跳 |
| 网络中断（有数据） | 重传 15 分钟后失败 | 同上 |

## 深挖追问

**Q1：进程被 kill -9 和正常退出对 TCP 一样吗？**
一样。OS 回收进程资源时不区分正常退出还是被杀，都会发 FIN。

**Q2：进程崩溃时缓冲区的数据会发出去吗？**
会。OS 会尝试把发送缓冲区的数据发完再发 FIN。但如果对端不可达，数据丢失。

**Q3：主机断电后多长时间对端能发现？**
- 有数据传输：`tcp_retries2` 重传上限（默认 15 次，约 924 秒）
- 无数据传输 + keepalive：约 2 小时（默认）
- 无数据传输 + 无 keepalive：永远发现不了

**Q4：容器被强制停止（docker kill）属于哪种？**
属于进程崩溃。容器本质是进程，被 kill 时 OS 回收资源发 FIN。

**Q5：进程崩溃对端 read 返回什么？**
返回 -1（EOF），表示对端关闭。如果对端是 RST 关闭则返回 -1 并设置 errno 为 ECONNRESET。

## 易错点

- **"进程崩溃需要 keepalive 才能发现"** — 不需要，OS 会发 FIN。
- **"主机断电对端立即知道"** — 不，要靠重传或 keepalive 发现。
- **"主机重启和主机宕机一样"** — 不一样，重启后会回 RST。
- **"调短 `tcp_retries2` 没副作用"** — 有，正常网络抖动也可能触发连接断开。
- **"进程被 kill -9 不会发 FIN"** — 会，OS 兜底发 FIN。

## 总结

进程崩溃由 OS 兜底发 FIN，对端立即感知；主机断电无法发 FIN，对端要靠重传（约 15 分钟）或 keepalive（默认 2 小时）发现。生产中长连接服务必须配置应用层心跳或调短 keepalive，否则主机宕机会导致连接卡死、资源泄漏。理解这个区别是排查"连接莫名卡住"的起点。

## 参考资料

- [RFC 793 — TCP, Connection Close](https://datatracker.ietf.org/doc/html/rfc793#section-3.5)
- [RFC 1122 — TCP Keep-Alives](https://datatracker.ietf.org/doc/html/rfc1122#section-4.2.3.6)
- [Linux tcp_retries2 文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
