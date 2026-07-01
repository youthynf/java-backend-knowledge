# TCP 头部格式有哪些

## 核心概念

TCP 头部固定 20 字节，加上可变选项最多 60 字节。它把"端口、序号、确认、窗口、控制标志、校验"这六类信息编码进紧凑的字节布局，是 TCP 实现可靠、有序、流控、拥塞控制的所有控制平面。

## 标准回答

TCP 头部结构（每行 32 位）：

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|          Source Port          |       Destination Port        |  字节 0-3
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Sequence Number                        |  字节 4-7
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Acknowledgment Number                      |  字节 8-11
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  Data |           |U|A|P|R|S|F|                               |
| Offset| Reserved  |R|C|S|S|Y|I|            Window             |  字节 12-15
|       |           |G|K|H|T|N|N|                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|           Checksum            |         Urgent Pointer        |  字节 16-19
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Options (0-40 bytes)                       |  字节 20+
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

## 详细机制

### 各字段含义

| 字段 | 位数 | 含义 |
|------|------|------|
| Source Port | 16 | 发送方端口 |
| Destination Port | 16 | 接收方端口 |
| Sequence Number | 32 | 本报文数据段第一个字节的序号；SYN 报文中是 ISN |
| Acknowledgment Number | 32 | 期望收到的下一个字节序号；ACK 标志为 1 时才有效 |
| Data Offset | 4 | 头部长度，单位 4 字节，所以头部最大 60 字节 |
| Reserved | 6 | 保留位 |
| Control Flags | 6 | URG/ACK/PSH/RST/SYN/FIN |
| Window | 16 | 接收方通告的可用缓冲区大小（流量控制） |
| Checksum | 16 | 头部+数据的校验和，含伪首部 |
| Urgent Pointer | 16 | URG=1 时有效，指向紧急数据末尾 |
| Options | 0-40 字节 | MSS、Window Scale、SACK、Timestamp 等 |

### 控制标志位

- **URG**：紧急指针有效，紧急数据优先处理（实际很少用）
- **ACK**：确认号有效（除初始 SYN 外几乎所有包都置 1）
- **PSH**：提示接收方立即把数据交给应用层
- **RST**：复位连接，强制关闭
- **SYN**：同步序号，建立连接
- **FIN**：发送方完成数据发送，关闭连接

### 序列号和确认号

序列号是 32 位无符号数，标识字节流的字节偏移。SYN 和 FIN 各占一个序号，所以握手时 `ack = seq + 1`，普通数据时 `ack = seq + 数据长度`。

序列号会回绕（wrap around），32 位约 4 GB 数据后就回到 0。这是为什么需要 PAWS（Protect Against Wrapped Sequence numbers）机制，依赖 timestamp 选项。

### 选项字段

握手期间协商的关键选项：

- **MSS**（Maximum Segment Size）：本端能接收的最大数据段，默认 536，以太网常用 1460
- **Window Scale**（WSOPT）：把 16 位窗口扩展到 30 位，缩放因子在握手时协商
- **SACK Permitted**：选择确认，允许接收方告知哪些段已收到，避免不必要的重传
- **Timestamps**：发送时间戳和回显时间戳，用于 RTT 估算和 PAWS

### 伪首部和校验和

校验和不仅覆盖 TCP 头和数据，还覆盖一个 12 字节的"伪首部"，包含源 IP、目的 IP、协议号（6）和 TCP 长度。这样能检测出 IP 路由错误导致的数据投递错位。

### 抓包示例

```bash
$ tcpdump -i any -n -v 'tcp port 80'
10:00:01.123 IP 10.0.0.1.54321 > 10.0.0.2.80: Flags [S], seq 1000, win 65535, options [mss 1460,nop,wscale 8,nop,nop,sackOK], length 0
```

解读：
- `Flags [S]`：SYN 标志
- `seq 1000`：客户端 ISN
- `win 65535`：原始窗口（带 wscale 8 实际约 16 MB）
- `options`：MSS=1460，Window Scale=8，SACK 允许

## 代码示例

Java 解析 TCP 头部（基于pcap抓包）：

```java
// 使用 Pcap4J 解析 TCP 头
import org.pcap4j.packet.TcpPacket;
import org.pcap4j.packet.namednumber.TcpPort;

TcpPacket tcp = ...;
System.out.println("Src port: " + tcp.getHeader().getSrcPort());
System.out.println("Dst port: " + tcp.getHeader().getDstPort());
System.out.println("Seq: " + tcp.getHeader().getSeqNumber());
System.out.println("Ack: " + tcp.getHeader().getAckNumber());
System.out.println("Flags: SYN=" + tcp.getHeader().getSyn()
    + " ACK=" + tcp.getHeader().getAck()
    + " FIN=" + tcp.getHeader().getFin()
    + " RST=" + tcp.getHeader().getRst());
System.out.println("Window: " + tcp.getHeader().getWindow());
```

## 实战场景

| 场景 | 用到的字段 |
|------|-----------|
| 防火墙规则 | 源/目的端口 |
| 抓包分析 | 序列号、确认号、标志位 |
| 性能调优 | Window Scale、MSS、SACK |
| 攻击检测 | SYN 标志 + 源 IP 分布 |
| RTT 监控 | Timestamp 选项 |

## 深挖追问

**Q1：为什么 Data Offset 只有 4 位？**
4 位最大值 15，单位 4 字节，所以头部最大 60 字节，去掉固定 20 字节，选项最多 40 字节。这是协议设计时的取舍，足够容纳常用选项。

**Q2：Window 为什么是 16 位？**
16 位最大 65535 字节，对应 64 KB。在高带宽延迟积（BDP）链路上不够，所以引入 Window Scale 选项扩展到 30 位（约 1 GB）。

**Q3：校验和能 100% 检测错误吗？**
不能。校验和是 16 位反码求和，有 1/65536 的概率漏检。CRC32 更强但开销大，TCP 选了折中。链路层（如以太网 FCS）会再做一道校验。

**Q4：URG 紧急数据怎么用？**
发送方把紧急数据放在数据段开头，Urgent Pointer 指向紧急数据末尾的偏移；接收方优先处理。实际生产中很少用，HTTP/SSH 等用带外信号（如 Ctrl+C）才偶尔触发。

**Q5：SACK 怎么工作？**
接收方收到不连续的段时，在 SACK 选项中列出已收到的段范围（最多 4 个），发送方据此只重传缺失段，避免不必要的回退重传。

## 易错点

- **混淆 MSS 和 MTU** — MSS 是 TCP 数据段最大字节数，MTU 是 IP 包最大字节数。MSS = MTU - 20 (IP头) - 20 (TCP头)。
- **以为 SYN/FIN 不占序号** — 它们各占 1 个序号，所以 `ack = seq + 1`。
- **以为 Window 字段是发送窗口** — 它是接收方通告的接收窗口（RWND），发送窗口还要考虑拥塞窗口（CWND）。
- **以为选项字段必填** — 选项可变长，0-40 字节，最小 0 字节（头部就是 20 字节）。

## 总结

TCP 头部是协议所有功能的载体：端口寻址、序号保证顺序、ACK 确认到达、Window 流控、Flags 控制状态、Checksum 检错、Options 协商扩展能力。看懂抓包输出是排查网络问题的基本功，关键是理解每个字段对应协议中的哪个机制。

## 参考资料

- [RFC 793 — TCP, Section 3.1 Header Format](https://datatracker.ietf.org/doc/html/rfc793#section-3.1)
- [RFC 7323 — TCP Extensions for High Performance (Window Scale, Timestamps)](https://datatracker.ietf.org/doc/html/rfc7323)
- [RFC 2018 — TCP Selective Acknowledgment Options](https://datatracker.ietf.org/doc/html/rfc2018)
