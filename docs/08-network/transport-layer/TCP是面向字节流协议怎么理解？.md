# TCP 是面向字节流协议怎么理解

## 核心概念

"TCP 是面向字节流"是 TCP 区别于 UDP 的本质特征。意思是：**应用层调用 write() 写入的数据，TCP 不保证按写入边界传输**。两次 write 可能合并成一个 TCP 段（粘包），一次 write 也可能被拆成多个段（拆包）。TCP 把应用层数据看作一个连续的字节流，按自己的判断（MSS、窗口、Nagle 等）来切割发送。

UDP 相反，是"面向报文"：一次 sendto 对应一个 UDP 报文，边界保留。

## 标准回答

TCP 面向字节流体现在三点：

1. **发送方无消息边界**：write() 的数据进入发送缓冲区，TCP 按 MSS、窗口、Nagle 算法决定怎么切割，与应用层 write 次数无关。
2. **接收方无消息边界**：read() 返回的字节数与发送方 write 次数无关，可能多包合并，也可能一包拆开。
3. **应用层必须自己定义边界**：用固定长度、分隔符或长度前缀切分消息。

UDP 面向报文：一次 sendto 一次 recvfrom，保留消息边界，不存在粘包/拆包。

## 详细机制

### TCP 为什么是字节流

应用层调用 `send()` 后，数据只是被拷贝到内核发送缓冲区，何时发、发多少由 TCP 协议栈决定：

```
应用层: write("ABC"), write("DEF")
              ↓
发送缓冲区: "ABCDEF" (合并)
              ↓
TCP 协议栈决定:
  - 按 MSS 切分（如 1460 字节一段）
  - 受发送窗口限制
  - Nagle 算法可能攒包
  - 一段 = 一个 IP 包
```

接收方 read 时也是从接收缓冲区按字节流读，不知道写入边界：

```
接收缓冲区: "ABCDEF"
              ↓
应用层第一次 read(buf, 100) 可能返回 "ABCDE" 或 "ABCDEF" 或 "ABC"
```

### UDP 为什么是报文流

UDP 不切割应用层数据。应用层一次 sendto 的数据加 8 字节 UDP 头，整个作为 IP 包 payload 发出（如果超过 MTU，IP 层分片，但接收方 IP 层会重组，UDP 层看到的还是完整报文）。

```
应用层: sendto("ABC"), sendto("DEF")
              ↓
两个独立的 UDP 报文:
  - 报文1: UDP头 + "ABC"
  - 报文2: UDP头 + "DEF"
              ↓
接收方:
  - 第一次 recvfrom 返回 "ABC"
  - 第二次 recvfrom 返回 "DEF"
  - 不会合并成 "ABCDEF"
```

### TCP 切割数据的依据

- **MSS**：每个 TCP 段数据部分不超过 MSS（默认 536，以太网常用 1460）
- **发送窗口**：受对端 RWND 和自身 CWND 限制
- **Nagle 算法**：小包攒够 MSS 或收到上次 ACK 才发
- **应用层写入时机**：write 频率和大小影响但不决定切割

### 粘包/拆包的本质

```
发送方 write:
  write("Hello")  // 5 字节
  write("World")  // 5 字节

TCP 可能这样发:
  情况1: 一个段 "HelloWorld"  → 接收方 read 一次拿到 "HelloWorld" (粘包)
  情况2: 两个段 "Hello" + "World"  → 接收方 read 两次 (正常)
  情况3: 两个段 "Hell" + "oWorld"  → 接收方 read 两次 (拆包)
```

应用层无法预测 TCP 怎么切，所以必须自己定义消息边界。

### 边界定义方案

1. **固定长度**：每条消息 N 字节
2. **分隔符**：消息间用特殊字符（如 `\r\n`）
3. **长度前缀**：包头含长度字段，最常用

详见 `TCP粘包问题如何解决？`。

## 代码示例

观察 TCP 字节流特性：

```java
import java.net.*;
import java.io.*;

public class ByteStreamDemo {
    public static void main(String[] args) throws Exception {
        Socket socket = new Socket("example.com", 80);
        OutputStream out = socket.getOutputStream();

        // 两次 write，TCP 不保证按这两次边界发送
        out.write("GET / HTTP/1.1\r\n".getBytes());
        out.write("Host: example.com\r\n".getBytes());
        out.write("\r\n".getBytes());
        out.flush();
        // TCP 可能把三次 write 合并成一个段发出
        // 也可能拆成多个段

        // 接收方一次 read 可能拿到任意字节数
        InputStream in = socket.getInputStream();
        byte[] buf = new byte[4096];
        int n = in.read(buf);  // n 不一定等于对方 write 的字节数
        System.out.println("Read " + n + " bytes");
    }
}
```

UDP 对比：

```java
import java.net.*;

public class DatagramDemo {
    public static void main(String[] args) throws Exception {
        DatagramSocket socket = new DatagramSocket();
        byte[] data1 = "Hello".getBytes();
        byte[] data2 = "World".getBytes();

        // 两次 sendto，对方收到两个独立的 UDP 报文
        socket.send(new DatagramPacket(data1, data1.length,
            InetAddress.getByName("127.0.0.1"), 9999));
        socket.send(new DatagramPacket(data2, data2.length,
            InetAddress.getByName("127.0.0.1"), 9999));
        // 接收方 recvfrom 一次拿到 "Hello"，再一次拿到 "World"
        // 不会合并
    }
}
```

## 实战场景

| 场景 | 用 TCP | 用 UDP |
|------|--------|--------|
| HTTP 请求/响应 | 用 Content-Length 或 chunked 定义边界 | 不适合 |
| 实时音视频 | 字节流不适合（要求低延迟容忍丢包） | 直接发，丢包不管 |
| RPC 调用 | 长度前缀定义边界 | QUIC 基于 UDP 自实现可靠性 |
| 文件传输 | 字节流天然适合 | 需要应用层保证可靠性 |
| 消息推送 | WebSocket 帧自带边界 | 适合（如游戏） |

## 深挖追问

**Q1：UDP 一次 sendto 数据太大会怎样？**
UDP 不分片，整个报文交给 IP 层。如果超过 MTU（1500 字节），IP 层分片。任何一个 IP 分片丢失，整个 UDP 报文被丢弃。所以 UDP 应用层一般控制单包不超过 MSS（1472 字节 = 1500 - 20 IP头 - 8 UDP头）。

**Q2：TCP send 返回成功表示数据发出去了吗？**
不。send 只是把数据拷贝到内核发送缓冲区，何时发由协议栈决定。要确认对端收到，需要应用层 ACK 机制。

**Q3：TCP recv 返回 0 表示什么？**
表示对端关闭了连接（发了 FIN）。和"暂时没数据"（阻塞或返回 EAGAIN）不同。

**Q4：HTTP/2 也是基于 TCP，怎么解决粘包？**
HTTP/2 自己有帧（Frame）结构，每帧有长度字段和流 ID。虽然底层 TCP 是字节流，但 HTTP/2 应用层有边界定义。所以 HTTP/2 不需要应用层处理粘包。

**Q5：为什么 TCP 不直接保留消息边界？**
设计取舍。TCP 目标是高效可靠的字节流传输，让应用层灵活定义自己的协议。如果 TCP 强制保留边界，就失去流式特性，无法支持 telnet 这种交互式字节流。

## 易错点

- **"TCP send 一次 = 一个 IP 包"** — 错。TCP 按自己的判断切割，可能合并或拆分。
- **"TCP recv 一次 = 对方 send 一次"** — 错。read 返回字节数任意。
- **"UDP 一定不会粘包"** — 对，UDP 面向报文，保留边界。
- **"字节流就是字节加边界"** — 反了，字节流就是没有边界。
- **"TCP send 返回表示对方收到"** — 错，只表示数据进入内核缓冲区。

## 总结

TCP 面向字节流是指 TCP 不保留应用层消息边界，按 MSS、窗口、Nagle 等自行切割数据。这导致粘包/拆包现象，应用层必须自己定义边界（固定长度、分隔符、长度前缀）。UDP 面向报文，一次 sendto 对应一次 recvfrom，天然有边界。理解这一点是看懂所有应用层协议（HTTP、gRPC、自定义协议）设计的钥匙。

## 参考资料

- [RFC 793 — TCP, Section 2.6 Reliable Communication](https://datatracker.ietf.org/doc/html/rfc793#section-2.6)
- [RFC 768 — UDP](https://datatracker.ietf.org/doc/html/rfc768)
