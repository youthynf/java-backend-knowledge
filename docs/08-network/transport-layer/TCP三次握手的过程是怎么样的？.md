# TCP 三次握手的过程是怎么样的

## 核心概念

TCP 在发送数据之前必须先建立连接，建立连接的过程叫"三次握手"（Three-Way Handshake）。它的本质是双方交换各自的初始序列号（ISN），并各自确认对方收到了自己的 ISN。三次而不是两次，是因为 TCP 是**全双工**的，两个方向的数据流要分别同步。

## 标准回答

三次握手流程：

```
Client                                              Server
CLOSED                                              LISTEN
  |                                                    |
  | --- SYN, seq=x ------------------------------->   |  (1)
SYN_SENT                                            SYN_RCVD
  |                                                    |
  | <== SYN+ACK, seq=y, ack=x+1 ==================    |  (2)
  |                                                    |
  | --- ACK, seq=x+1, ack=y+1 --------------------->  |  (3)
ESTABLISHED                                         ESTABLISHED
```

1. 客户端发送 SYN 报文，seq=client_isn，进入 `SYN_SENT`。
2. 服务端回复 SYN+ACK，seq=server_isn，ack=client_isn+1，进入 `SYN_RCVD`。
3. 客户端再发 ACK，ack=server_isn+1，进入 `ESTABLISHED`；服务端收到后也进入 `ESTABLISHED`。

第三次握手可以携带数据，前两次不行。

## 详细机制

### 每一步在做什么

**第一次握手（SYN）**：客户端告诉服务端"我想建立连接，我的初始序列号是 x"。此时客户端不知道服务端是否收到了，所以处于 `SYN_SENT`，等待回应。

**第二次握手（SYN+ACK）**：服务端做两件事——确认客户端的 SYN（ack=x+1），同时发送自己的 SYN（seq=y）。一个报文同时承担两件事，所以叫 SYN+ACK。服务端进入 `SYN_RCVD`，等待客户端确认自己的 SYN。

**第三次握手（ACK）**：客户端确认服务端的 SYN（ack=y+1）。这次确认后双方都知道了对方的 ISN，连接建立完成。

### 为什么第三次可以携带数据

第三次握手时，客户端已经知道服务端的接收能力和发送能力都正常（因为收到了 SYN+ACK），所以这个 ACK 报文可以顺便携带应用数据，省一个 RTT。但服务端必须收到这个 ACK 才进入 `ESTABLISHED`，所以即使携带数据，连接仍然算"未完全建立"直到 ACK 到达。

### 抓包示例

```bash
$ tcpdump -i any -n 'tcp port 80 and tcp[tcpflags] & (tcp-syn|tcp-ack) != 0'
10:00:01.123456 IP 10.0.0.1.54321 > 10.0.0.2.80: Flags [S], seq 1000, win 65535, options [mss 1460,nop,wscale 8], length 0
10:00:01.123789 IP 10.0.0.2.80 > 10.0.0.1.54321: Flags [S.], seq 2000, ack 1001, win 65535, options [mss 1460,nop,wscale 8], length 0
10:00:01.123990 IP 10.0.0.1.54321 > 10.0.0.2.80: Flags [.], ack 2001, win 512, length 0
```

`Flags [S]` 表示 SYN，`[S.]` 表示 SYN+ACK，`[.]` 表示 ACK。注意 ack 是对方 seq+1（SYN/FIN 占一个序号）。

### 序列号为什么是 +1

SYN 和 FIN 虽然不携带数据，但都消耗一个序号。这是因为它们是连接的关键事件，必须被确认；如果消耗 0 个序号，对方就无法区分"确认的是 SYN 本身"还是"确认的是 SYN 之后的第一字节"。

## 代码示例

Java 中观察三次握手最直接的方式是抓 ServerSocket.accept() 之前的内核行为：

```java
import java.net.*;
import java.io.*;

public class HandshakeDemo {
    public static void main(String[] args) throws IOException {
        // 服务端 listen —— 内核进入 LISTEN 状态
        try (ServerSocket server = new ServerSocket(8080)) {
            // accept() 返回时，三次握手已完成，连接已在全连接队列里
            Socket client = server.accept();
            System.out.println("Connected: " + client.getRemoteSocketAddress());
        }
    }
}
```

`accept()` 是从内核的**全连接队列**（accept queue）里取出已建立的连接，并不参与握手本身。

## 实战场景

| 场景 | 现象 | 排查 |
|------|------|------|
| 客户端连不上服务端 | 大量 `SYN_SENT` 不消失 | 服务端未启动/防火墙丢包/半连接队列满 |
| 服务端连接数暴涨 | `ss -tnl` Recv-Q 高 | 全连接队列满，accept 不及时 |
| 跨地域建连慢 | 第一包 SYN 后等几百毫秒 | RTT 高，握手本身耗时 1.5 RTT |
| HTTPS 首包慢 | 三次握手后还要 TLS 握手 | 启用 TCP Fast Open 或 TLS 1.3 0-RTT |

## 深挖追问

**Q1：第三次握手丢了怎么办？**
客户端已进入 `ESTABLISHED`，会直接发数据；服务端还在 `SYN_RCVD`，收到数据报文时会同时确认这个 ACK（数据报文自带 ACK 标志），从而进入 `ESTABLISHED`。如果客户端不发数据，服务端会重传 SYN+ACK（默认 5 次，由 `tcp_synack_retries` 控制），超时后放弃。

**Q2：ISN 为什么要随机？**
防止**序号预测攻击**（盲注攻击）。如果 ISN 可预测，攻击者可以伪造源 IP 发包，绕过认证。RFC 6528 规定 ISN 应基于时钟和散列函数每 4 微秒变化一次。

**Q3：握手期间服务端在做什么？**
分配 sock 结构、生成 ISN、构造 SYN+ACK、加入半连接队列。**不分配文件描述符**，fd 是 accept() 时才分配。详见 `TCP握手期间服务端工作内容是什么？`。

**Q4：SYN 报文里的 options 有什么用？**
MSS 协商（必选）、窗口缩放（Window Scale，扩到 32 位）、SACK 许可、时间戳。这些都是握手期间协商好的，连接建立后不能改。

## 易错点

- **"三次握手 = 三次发包"** — 不准确，第二次是 SYN+ACK 合并成一个包，不是两个包。
- **"accept() 触发握手"** — 错。accept() 是从队列里取已建立的连接，握手由内核完成。
- **"前两次握手不能带数据"** — 严格说是 RFC 793 不允许，但 TCP Fast Open（TFO，RFC 7413）允许 SYN 携带数据。
- **ack = 对方 seq + 1** — 只有 SYN/FIN 才 +1，普通数据报文 ack = 对方 seq + 数据长度。

## 总结

三次握手的本质是双向同步 ISN，每一方都要"发自己的 ISN + 确认对方的 ISN"，因为全双工所以需要第三次。第三次可以携带数据是工程优化。理解 ack 的计算规则（SYN/FIN 占一个序号）是看抓包的关键。

## 参考资料

- [RFC 793 — TCP, Section 3.4 Establishing a connection](https://datatracker.ietf.org/doc/html/rfc793#section-3.4)
- [RFC 7413 — TCP Fast Open](https://datatracker.ietf.org/doc/html/rfc7413)
