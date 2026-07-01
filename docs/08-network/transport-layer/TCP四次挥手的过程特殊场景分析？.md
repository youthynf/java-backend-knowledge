# TCP 四次挥手的过程特殊场景分析

## 核心概念

四次挥手的标准流程是 FIN → ACK → FIN → ACK，但实际网络中各种异常分支让挥手过程复杂：包丢失、应用层迟迟不 close、第二三次挥手合并、close 与 shutdown 行为差异等。理解这些特殊场景是排查连接异常关闭的基础。

## 标准回答

四次挥手的关键边界场景：

1. **第二三次挥手合并**：被动方无待发数据且开启延迟确认时，ACK 和 FIN 合成一个包，变三次挥手。
2. **第一次挥手丢失**：主动方重传 FIN，达到 `tcp_orphan_retries` 后放弃。
3. **第二次挥手丢失**：被动方 ACK 不重传，主动方重传 FIN。
4. **第三次挥手延迟**：被动方应用没 close()，主动方在 `FIN_WAIT_2` 等，受 `tcp_fin_timeout` 限制。
5. **第四次挥手丢失**：主动方在 TIME_WAIT 等，被动方重传 FIN。

## 详细机制

### 场景 1：第二三次挥手合并（变三次挥手）

```
正常四次挥手：
Active → FIN → ACK ← Passive → FIN → ACK → Active (TIME_WAIT)

合并场景：
Active → FIN → FIN+ACK ← Passive → ACK → Active (TIME_WAIT)
```

合并条件：

1. 被动方收到 FIN 时**没有待发数据**
2. 被动方开启**TCP 延迟确认**（默认开启）

此时被动方的 ACK 和自己的 FIN 可以合并成一个包发出。这是 TCP 的优化，不是 bug。

抓包特征：

```bash
$ tcpdump -i any -n 'tcp port 80'
10:00:00 IP A.5000 > B.80: Flags [F.], seq 1000, ack 2000
10:00:00 IP B.80 > A.5000: Flags [F.], seq 2000, ack 1001  # FIN+ACK 合并
10:00:00 IP A.5000 > B.80: Flags [.], ack 2001              # 主动方回 ACK
```

### 场景 2：第一次挥手丢失

主动方发 FIN 后进入 `FIN_WAIT_1`，等被动方 ACK。丢失后触发超时重传：

```bash
# 重传次数控制
$ sysctl net.ipv4.tcp_orphan_retries
net.ipv4.tcp_orphan_retries = 0   # 0 表示用 tcp_retries2（默认 15）
```

重传间隔指数退避，达到上限后主动方进入 `CLOSED`，连接被清理。被动方仍在 `ESTABLISHED`，下次发数据时收到 RST。

### 场景 3：第二次挥手丢失

被动方收到 FIN 后内核立即回 ACK（这步不依赖应用层），进入 `CLOSE_WAIT`。ACK 不会重传，所以丢失后：

- 被动方已进入 `CLOSE_WAIT`
- 主动方仍在 `FIN_WAIT_1`，等不到 ACK 触发重传 FIN
- 被动方收到重传 FIN 后再次回 ACK

### 场景 4：第三次挥手延迟（应用层没 close）

被动方收到 FIN 后内核回 ACK 进入 `CLOSE_WAIT`，但发自己的 FIN 需要**应用层调用 close()**。如果应用层迟迟不 close：

- 连接一直卡在 `CLOSE_WAIT`
- 主动方在 `FIN_WAIT_2` 等待，受 `tcp_fin_timeout` 限制（默认 60 秒）

```bash
$ sysctl net.ipv4.tcp_fin_timeout
net.ipv4.tcp_fin_timeout = 60
```

超时后主动方强制关闭，被动方仍卡在 `CLOSE_WAIT` 直到应用层 close 或进程退出。

### 场景 5：close() vs shutdown()

```java
// close()：完全关闭，进入四次挥手
socket.close();
// shutdown()：只关闭一个方向，可继续收或发
socket.shutdownOutput();  // 关闭发送方向，进入 FIN_WAIT_2 但仍能收
```

`shutdown(SHUT_WR)` 触发 FIN 但不关闭 socket，主动方进入 `FIN_WAIT_2` 后仍能收数据（半关闭）。这是 HTTP 1.0 关闭前的常见模式：客户端发完请求 shutdownOutput，服务端发完响应再 close。

### 场景 6：第四次挥手丢失

主动方收到被动方 FIN 后回 ACK 进入 `TIME_WAIT`。ACK 丢失时：

- 主动方在 TIME_WAIT 等 2 MSL
- 被动方收不到 ACK，重传 FIN
- 主动方收到重传 FIN 后重新回 ACK，重置 TIME_WAIT 定时器

```bash
# 被动方 FIN 重传次数（默认 0，表示用 tcp_retries2）
$ sysctl net.ipv4.tcp_orphan_retries
```

### 场景 7：SO_LINGER 控制 close 行为

```java
// 默认：close 后内核继续发缓冲区数据，然后 FIN
socket.close();

// SO_LINGER 超时 > 0：close 阻塞等待数据发完，超时发 RST
socket.setSoLinger(true, 10);  // 等 10 秒

// SO_LINGER 超时 = 0：close 立即发 RST，缓冲区数据丢弃
socket.setSoLinger(true, 0);   // 跳过 TIME_WAIT，但非优雅关闭
```

### 抓包示例

```bash
# 三次挥手场景
$ tcpdump -i any -n 'tcp port 80 and (tcp[tcpflags] & tcp-fin != 0 or tcp[tcpflags] & tcp-ack != 0)'
10:00:00 IP A.5000 > B.80: Flags [F.], seq 1000, ack 2000     # 第一次
10:00:00 IP B.80 > A.5000: Flags [F.], seq 2000, ack 1001     # 第二三次合并
10:00:00 IP A.5000 > B.80: Flags [.], ack 2001                 # 第四次

# FIN 重传场景
10:00:00 IP A.5000 > B.80: Flags [F.], seq 1000   # 第一次 FIN
10:00:01 IP A.5000 > B.80: Flags [F.], seq 1000   # 重传（间隔 1s）
10:00:03 IP A.5000 > B.80: Flags [F.], seq 1000   # 重传（间隔 2s）
```

## 代码示例

观察 close 和 shutdown 的区别：

```java
import java.net.*;
import java.io.*;

public class CloseVsShutdown {
    public static void main(String[] args) throws Exception {
        Socket socket = new Socket("example.com", 80);
        OutputStream out = socket.getOutputStream();

        out.write("GET / HTTP/1.1\r\nHost: example.com\r\n\r\n".getBytes());
        out.flush();

        // 半关闭：通知对端我发完了，但还能收
        socket.shutdownOutput();

        // 继续读响应
        InputStream in = socket.getInputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) {
            System.out.write(buf, 0, n);
        }
        // 对端 close 后 read 返回 -1

        socket.close();  // 真正关闭
    }
}
```

强制 RST 关闭（跳过 TIME_WAIT）：

```java
Socket socket = new Socket("example.com", 80);
socket.setSoLinger(true, 0);   // close 时发 RST
socket.close();
// 对端会收到 "Connection reset by peer"
```

调整内核参数：

```bash
# FIN_WAIT_2 等待时间
$ sysctl net.ipv4.tcp_fin_timeout=15

# 孤儿连接（已 close 但未完全关闭）的 FIN 重传次数
$ sysctl net.ipv4.tcp_orphan_retries=3
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 三次挥手 | 抓包只看到三个包 | 正常优化，不是 bug |
| 服务端 CLOSE_WAIT 堆积 | 应用层没 close() | 检查代码，用 try-with-resources |
| 客户端 FIN_WAIT_2 长时间不消失 | 等被动方 FIN | 检查 `tcp_fin_timeout` |
| close 后立刻 RST | SO_LINGER=0 | 排查是否误设 |
| 重启后 bind 失败 | TIME_WAIT 占用 | 启用 `SO_REUSEADDR` |

## 深挖追问

**Q1：四次挥手一定是四次发包吗？**
不一定。第二三次合并变三次，特殊场景甚至两次（同时关闭）。"四次"是流程上的四次状态变化，不是包的数量。

**Q2：被动方收到 FIN 后能立即 close 吗？**
内核立即回 ACK，但发自己的 FIN 必须等应用层 close()。如果应用层还有数据要发，先发数据再 close。

**Q3：FIN_WAIT_2 会一直等被动方 FIN 吗？**
看关闭方式：

- `close()` 关闭的孤儿连接：受 `tcp_fin_timeout` 限制，超时强制关闭
- `shutdown(SHUT_WR)` 半关闭：可一直等，应用层显式 close 才结束

**Q4：同时关闭（Simultaneous Close）是什么？**
双方几乎同时发 FIN，都从 ESTABLISHED 进入 FIN_WAIT_1，收到对方 FIN 后回 ACK 进入 CLOSING，再进入 TIME_WAIT。罕见但协议支持。

**Q5：`tcp_fin_timeout` 调小有副作用吗？**
有。如果被动方处理慢，主动方过早关闭会导致被动方 FIN 时收到 RST，被动方 read 返回 ECONNRESET。

## 易错点

- **"四次挥手一定是四个包"** — 不，合并后变三个。
- **"FIN_WAIT_2 会一直等"** — close 的孤儿连接受 `tcp_fin_timeout` 限制。
- **"close() 立即关连接"** — 默认是优雅关闭，内核继续发缓冲区数据。
- **"SO_LINGER=0 是优化"** — 不是，是跳过 TIME_WAIT 的非常手段，对端会收到 RST。
- **"被动方 ACK 后立即发 FIN"** — 不，要等应用层 close()。

## 总结

四次挥手的特殊场景围绕几个核心：第二三次合并（无待发数据时）、ACK 不重传（丢失靠对方重传）、应用层 close 控制 FIN 时机、close 与 shutdown 行为差异。生产中排查连接异常状态（CLOSE_WAIT 堆积、FIN_WAIT_2 卡住、TIME_WAIT 过多）的关键是理解这些边界场景和对应内核参数。

## 参考资料

- [RFC 793 — TCP, Section 3.5 Closing a Connection](https://datatracker.ietf.org/doc/html/rfc793#section-3.5)
- [Linux TCP 参数文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
