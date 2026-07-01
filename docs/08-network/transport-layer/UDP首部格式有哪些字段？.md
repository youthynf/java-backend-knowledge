# UDP 首部格式有哪些字段

## 核心概念

UDP 首部固定 8 字节，是 TCP/IP 协议族中最简单的传输层头部。只有 4 个字段：源端口、目的端口、长度、校验和。设计哲学就是"能省则省"，把可靠性、顺序、流控全部留给应用层。

## 标准回答

UDP 首部结构（8 字节）：

```
 0      7 8     15 16    23 24    31
+--------+--------+--------+--------+
|     Source      |   Destination   |
|      Port       |      Port       |  字节 0-3
+--------+--------+--------+--------+
|     Length       |    Checksum     |  字节 4-7
+--------+--------+--------+--------+
|          data octets ...          |
+-----------------------------------+
```

| 字段 | 长度 | 含义 |
|------|------|------|
| Source Port | 16 位 | 发送方端口，可置 0（不需要回包时） |
| Destination Port | 16 位 | 接收方端口 |
| Length | 16 位 | UDP 头部 + 数据总长度，最小值 8 |
| Checksum | 16 位 | 头部 + 数据 + 伪首部的校验和 |

## 详细机制

### 各字段说明

**Source Port**：发送方端口。不要求对端回复时可置 0（如 syslog）。

**Destination Port**：接收方端口。DNS=53、DHCP=67/68、NTP=123 等是常见 UDP 端口。

**Length**：UDP 头部 + 数据的总长度，最小 8（仅头部无数据）。最大 65535，但实际受 IP 层 MTU 限制（典型 1500，UDP 数据最大 1472）。

**Checksum**：覆盖 UDP 头 + 数据 + 12 字节伪首部（源 IP、目的 IP、协议号 17、UDP 长度）。IPv4 中可置 0 表示不校验，IPv6 中强制校验。实际生产几乎都开启。

### 为什么 UDP 没有"首部长度"字段

TCP 头部有"Data Offset"字段（4 位），因为 TCP 有可变长选项字段（0-40 字节），需要明确头部到哪里结束。

UDP 头部固定 8 字节，没有选项，所以不需要首部长度字段。

### 为什么 UDP 有"长度"字段，TCP 没有

理论上 UDP 数据长度 = IP 总长度 - IP 头 - UDP 头（8），可以算出来。但 UDP 仍保留 Length 字段，原因有二：

1. **历史原因**：UDP 早期可能不基于 IP，需要自己声明长度
2. **对齐**：8 字节头部 + Length 字段使总长度按 4 字节对齐，方便硬件处理

TCP 没有长度字段，数据长度从 IP 头算出来：TCP 数据长度 = IP 总长度 - IP 头长 - TCP 头长。

### 校验和与伪首部

UDP 校验和不仅校验 UDP 报文，还包括 12 字节"伪首部"：

```
+--------+--------+--------+--------+
|          Source IP Address        |  4 字节
+--------+--------+--------+--------+
|        Destination IP Address     |  4 字节
+--------+--------+--------+--------+
|  Zero  | Protocol|  UDP Length    |  4 字节
+--------+--------+--------+--------+
```

伪首部包含 IP 信息，能让 UDP 检测到 IP 路由错误（数据被投递到错误的主机）。

### 抓包示例

```bash
$ tcpdump -i any -n -v 'udp port 53'
10:00:01.123 IP 10.0.0.1.54321 > 10.0.0.2.53: UDP, bad length 0 > 1472, length 30
```

解读：
- `10.0.0.1.54321`：源 IP + 源端口
- `10.0.0.2.53`：目的 IP + 目的端口（DNS）
- `length 30`：UDP 数据 30 字节，加上 8 字节头共 38 字节

### UDP 数据大小限制

- 单个 UDP 报文最大 65535 字节（含 8 字节头）
- 实际应用层一般不超过 1472 字节（MTU 1500 - IP 头 20 - UDP 头 8），避免 IP 分片
- 超过 MTU 会被 IP 层分片，任何一个分片丢失整个 UDP 报文丢弃

## 代码示例

Java 构造 UDP 报文：

```java
import java.net.*;

public class UdpSender {
    public static void main(String[] args) throws Exception {
        DatagramSocket socket = new DatagramSocket();
        byte[] data = "Hello UDP".getBytes();
        // DatagramPacket 自带 UDP 头部封装
        DatagramPacket packet = new DatagramPacket(
            data, data.length,
            InetAddress.getByName("8.8.8.8"), 53
        );
        socket.send(packet);

        // 接收响应
        byte[] buf = new byte[1024];
        DatagramPacket response = new DatagramPacket(buf, buf.length);
        socket.receive(response);
        System.out.println("Recv: " + new String(response.getData(), 0, response.getLength()));
    }
}
```

用 scapy 直接构造 UDP 报文观察头部：

```python
from scapy.all import *

# 构造 UDP 报文
packet = IP(dst='8.8.8.8') / UDP(sport=12345, dport=53) / DNS(rd=1, qd=DNSQR(qname='example.com'))
packet.show()

## 输出：
## [ IP ]
##   dst = 8.8.8.8
## [ UDP ]
##   sport = 12345
##   dport = 53
##   len = 30  # UDP 头 + 数据总长
##   chksum = 0x1234
## [ DNS ]
##   ...
```

## 实战场景

| 场景 | UDP 报文大小 | 注意点 |
|------|-------------|--------|
| DNS 查询 | < 512 字节 | 超过 512 走 TCP |
| DHCP | < 576 字节 | 兼容老设备 MTU |
| 实时音视频 | 1000-1400 字节 | 避免分片，丢包不影响 |
| SNMP Trap | < 1472 字节 | 标准 MTU 内 |
| 大文件传输（如 TFTP） | 512 字节固定 | 块大小协商 |

## 深挖追问

**Q1：UDP 校验和能关吗？**
IPv4 中可以置 0 表示不校验（发送方计算后置 0）。IPv6 中强制校验（因为 IPv6 头部没有校验和）。实际生产几乎都开启。

**Q2：UDP 报文最大多大？**
65535 字节（含 8 字节头），实际受 MTU 限制。超过 MTU 会被 IP 分片。

**Q3：UDP 分片后丢了怎么办？**
任何一个 IP 分片丢失，整个 UDP 报文无法重组，被丢弃。所以 UDP 应用层一般控制单包不超过 MSS。

**Q4：为什么 DNS 用 UDP？**
DNS 查询通常很小（< 512 字节），UDP 无连接开销小、延迟低。响应超过 512 字节或区域传送用 TCP。

**Q5：UDP 端口和 TCP 端口冲突吗？**
不冲突。TCP 80 和 UDP 80 是两个独立端口，可以同时被不同进程使用。

## 易错点

- **"UDP 校验和可选就是不开"** — IPv4 可选但实际几乎都开，IPv6 强制。
- **"UDP 头部可变长"** — 固定 8 字节，没有选项字段。
- **"UDP 数据可以任意大"** — 最大 65535 字节，实际受 MTU 限制。
- **"UDP 端口和 TCP 端口共享"** — 独立，TCP 80 和 UDP 80 是两个端口。
- **"Length 字段是数据长度"** — 是头部 + 数据总长度，最小 8。

## 总结

UDP 头部仅 8 字节，4 个字段：源端口、目的端口、长度、校验和。简单是它的设计哲学——把可靠性、顺序、流控全部留给应用层。校验和覆盖伪首部，能检测 IP 路由错误。实际应用层单包一般不超过 1472 字节避免 IP 分片。

## 参考资料

- [RFC 768 — User Datagram Protocol](https://datatracker.ietf.org/doc/html/rfc768)
- [UDP 校验和伪首部](https://en.wikipedia.org/wiki/User_Datagram_Protocol#Checksum_computation)
