# TCP 和 UDP 有什么区别

## 核心概念

传输层负责在两台主机之间提供**端到端**的进程通信能力，把 IP 层"主机到主机"的服务扩展到"进程到进程"。TCP 和 UDP 是这一层最核心的两个协议，出自同一个 RFC 1024 时代的协议族，但设计哲学截然不同：TCP 用复杂的状态机换取可靠、有序、面向流的传输；UDP 几乎不做任何额外工作，只把应用数据加上 8 字节头部就丢给 IP 层，把可靠性、顺序、拥塞控制全部交给应用层自己决定。

一句话总结：**TCP 像挂号信，UDP 像广播喇叭**。前者保证送到、保证顺序，代价是慢和重；后者只管发出去，能不能听到看运气，但快和轻。

## 标准回答

| 维度 | TCP | UDP |
|------|-----|-----|
| 连接 | 面向连接，三次握手建立 | 无连接，直接发送 |
| 可靠性 | 可靠：不丢、不重、不乱序 | 尽最大努力交付，不保证 |
| 传输方式 | 面向字节流，无边界 | 面向报文，保留边界 |
| 流量/拥塞控制 | 滑动窗口 + 拥塞控制 | 都没有，发送速率不受网络状态影响 |
| 首部开销 | 最小 20 字节，可变长 | 固定 8 字节 |
| 通信模式 | 一对一 | 一对一、一对多（广播/多播） |
| 分片位置 | 在传输层按 MSS 分片 | 在 IP 层按 MTU 分片 |
| 典型应用 | HTTP/HTTPS、SSH、FTP、SMTP | DNS、DHCP、TFTP、QUIC、实时音视频 |

选型原则：**要可靠选 TCP，要低延迟/可容忍丢包选 UDP，需要多播只能 UDP**。

## 详细机制

### 首部对比

TCP 头部（20 字节起，含选项可变长）：

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|          Source Port          |       Destination Port        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Sequence Number                        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Acknowledgment Number                      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  Data |           |U|A|P|R|S|F|                               |
| Offset| Reserved  |R|C|S|S|Y|I|            Window             |
|       |           |G|K|H|T|N|N|                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|           Checksum            |         Urgent Pointer        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Options (if any)                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

UDP 头部（固定 8 字节）：

```
 0      7 8     15 16    23 24    31
+--------+--------+--------+--------+
|     Source      |   Destination   |
|      Port       |      Port       |
+--------+--------+--------+--------+
|                 |                 |
|     Length       |    Checksum     |
+--------+--------+--------+--------+
```

UDP 的 Length 字段包含了头部和应用数据总长度，最小值 8。UDP 校验和可选（IPv4 中可置 0 表示不校验，IPv6 中强制），但实际生产中几乎都启用。

### 分片位置差异

TCP 在传输层就按 MSS（默认 536 字节，常见协商为 1460 字节）切分，每个分段独立可控；任何一个分段丢失只需重传该分段。UDP 不切分，整个报文交给 IP 层，IP 层按 MTU（典型 1500）分片后发送；任何一个 IP 分片丢失，**整个 UDP 报文都要重传**，这是 UDP 大包传输的典型坑。

## 代码示例

Java 中分别用 TCP 和 UDP 发送数据：

```java
import java.net.*;
import java.io.*;

// TCP 客户端
public class TcpClient {
    public static void main(String[] args) throws IOException {
        try (Socket socket = new Socket("example.com", 80);
             OutputStream out = socket.getOutputStream()) {
            out.write("GET / HTTP/1.1\r\nHost: example.com\r\n\r\n".getBytes());
        }
    }
}

// UDP 客户端
public class UdpClient {
    public static void main(String[] args) throws IOException {
        try (DatagramSocket socket = new DatagramSocket()) {
            byte[] data = "ping".getBytes();
            DatagramPacket packet = new DatagramPacket(
                data, data.length, InetAddress.getByName("8.8.8.8"), 53);
            socket.send(packet);
        }
    }
}
```

## 实战场景

| 场景 | 选型 | 原因 |
|------|------|------|
| Web API、RPC 调用 | TCP | 必须可靠，请求/响应需要按序 |
| DNS 查询 | UDP | 单次小包，低延迟，丢了重查即可 |
| 直播/视频会议 | UDP（基于 UDP 自实现可靠性，如 QUIC） | 实时性优先，丢一两帧不影响 |
| 文件传输 | TCP | 必须保证完整无误 |
| 心跳/服务发现 | UDP | 频繁小包，无连接开销 |
| IoT 海量设备上报 | UDP + 应用层 ACK | 连接数受限场景 |

## 深挖追问

**Q1：既然 UDP 不可靠，为什么 QUIC 还要基于 UDP？**
QUIC 在 UDP 之上自己实现了 TCP 的可靠性（ACK、重传、拥塞控制），同时避免了 TCP 的两个固有缺陷：队头阻塞（QUIC 各流独立）和握手慢（QUIC 把传输层握手和 TLS 握手合并）。基于 UDP 还能绕开内核 TCP 协议栈的僵化，让应用层快速迭代。

**Q2：UDP 没有拥塞控制，会不会拖垮网络？**
会。UDP 应用如果不自己限速，在拥塞链路上会持续抢带宽，导致 TCP 流饿死（TCP 退让、UDP 不退让）。这就是早期 ADSL 时代 BT/迅雷被骂的原因，也是 TCP-friendly 速率控制（TFRC）出现的动机。

**Q3：TCP 一定比 UDP 慢吗？**
不一定。TCP 慢的是建连和拥塞控制阶段；一旦进入稳态、窗口打开，吞吐量可以打满带宽。UDP 在小包低延迟场景天然有优势，但在可靠传输需求下叠加应用层重传逻辑后，未必比 TCP 快。

**Q4：为什么 DNS 同时支持 TCP 和 UDP？**
默认查询用 UDP（512 字节以内），响应超过 512 字节或区域传送（zone transfer）用 TCP。DNSSEC 引入后大响应增多，TCP 使用比例上升。

## 易错点

- **"TCP 是数据报，UDP 是字节流"** — 正好相反。TCP 面向字节流无边界，UDP 面向报文有边界。
- **"UDP 一定比 TCP 快"** — 不一定，要看是否需要可靠性。需要重传的 UDP 实现未必更快。
- **"TCP 不会丢数据"** — TCP 保证的是应用层看到的数据不丢不重，但链路上仍可能丢，只是会被重传补上。
- **混淆 MTU 和 MSS** — MTU 是链路层概念（IP 包最大字节数），MSS 是 TCP 概念（TCP 数据段最大字节数），MSS = MTU - IP 头 - TCP 头。
- **以为 UDP 校验和可关** — IPv4 中可以置 0，但 Linux 默认开启；IPv6 强制开启。

## 总结

TCP 和 UDP 是传输层两种互补的设计：TCP 用复杂换可靠，UDP 用简单换灵活。选型核心看应用是否容忍丢包、是否需要顺序、是否需要低延迟。理解了"TCP 是字节流"和"UDP 是报文流"这一点，后面所有粘包、可靠性、流控的问题都能串起来。

## 参考资料

- [RFC 793 — Transmission Control Protocol](https://datatracker.ietf.org/doc/html/rfc793)
- [RFC 768 — User Datagram Protocol](https://datatracker.ietf.org/doc/html/rfc768)
- 《TCP/IP 详解 卷 1：协议》
