# 既然 IP 会分片，为什么 TCP 层还需要 MSS

## 核心概念

MTU 是链路层一个 IP 包的最大字节数（以太网典型 1500），MSS 是 TCP 一个数据段的最大字节数（典型 1460）。两者关系：MSS = MTU - IP 头（20）- TCP 头（20）。既然 IP 层能分片，TCP 为什么还要自己切？答案是**重传效率**：IP 分片后任一分片丢失要重传整个 TCP 段，TCP 分片后只重传丢失的段。

## 标准回答

TCP 用 MSS 而不依赖 IP 分片的核心原因：**IP 分片丢失会导致整个 TCP 段重传，效率极低**。

- IP 分片：发送方把大 TCP 段切成多个 IP 分片，任一分片丢失，接收方无法重组，不回 ACK，发送方超时重传**整个大 TCP 段**（包括所有分片）
- TCP 分片：发送方按 MSS 切成多个 TCP 段，每个独立发送、独立 ACK，任一段丢失只重传那一段

MSS 让 TCP 在传输层就控制段大小，避免 IP 层分片，提升重传效率。

## 详细机制

### MTU 和 MSS

```
以太网帧: [DMAC][SMAC][Type][IP包][FCS]
                       ↑
                       MTU = 1500 字节（IP 包最大长度）

IP 包: [IP头 20][TCP段]
                 ↑
                 TCP 段最大 1480 字节

TCP 段: [TCP头 20][TCP数据]
                  ↑
                  MSS = 1460 字节
```

### IP 分片场景

假设 MSS 协商失败，TCP 发了一个 4000 字节的大段：

```
发送方: TCP段 = 4000 字节
  ↓
IP层: 超过 MTU 1500，分片
  - IP分片1: IP头(20) + 数据1480
  - IP分片2: IP头(20) + 数据1480
  - IP分片3: IP头(20) + 数据1040
  ↓
传输: 假设分片2 丢失
  ↓
接收方: 只收到分片1和3，无法重组完整 TCP 段
  ↓
接收方: 不回 ACK
  ↓
发送方: 超时重传整个 4000 字节 TCP 段
  ↓
再次 IP 分片，可能又丢一个，恶性循环
```

### TCP 分片场景

```
发送方: 按 MSS 1460 切分
  - TCP段1: TCP头(20) + 数据1460
  - TCP段2: TCP头(20) + 数据1460
  - TCP段3: TCP头(20) + 数据1080
  ↓
每个 TCP 段单独成一个 IP 包，不超过 MTU，无需 IP 分片
  ↓
传输: 假设段2 丢失
  ↓
接收方: 收到段1和段3，回 ACK 段1（期待段2）
  ↓
发送方: 快速重传段2（仅 1460 字节）
  ↓
接收方: 收到段2，回 ACK 段3
```

重传数据量从 4000 字节降到 1460 字节，效率提升明显。

### MSS 协商

握手期间双方在 SYN 报文中宣告自己的 MSS：

```bash
$ tcpdump -i any -n 'tcp port 80 and tcp[tcpflags] & tcp-syn != 0'
10:00:01 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [S], seq 1000, options [mss 1460,...]
10:00:01 IP 10.0.0.2.80 > 10.0.0.1.5000: Flags [S.], seq 2000, ack 1001, options [mss 1460,...]
```

双方取较小值作为实际 MSS。如果一方不宣告，默认 536 字节（RFC 793）。

### PMTUD（Path MTU Discovery）

MSS 基于本端 MTU，但路径中可能有更小的 MTU（如 VPN 隧道再封装 50 字节）。PMTUD 通过发带 DF（Don't Fragment）标志的 IP 包探测路径 MTU：

- 路径中路由器发现 MTU 不够，回 ICMP "Fragmentation Needed"
- 发送方收到 ICMP，减小 MSS 重发

```bash
# Linux 默认开启 PMTUD
$ sysctl net.ipv4.ip_no_pmtu_disc
net.ipv4.ip_no_pmtu_disc = 0  # 0 表示开启 PMTUD
```

### 抓包示例

```bash
# 看 MSS 协商
$ tcpdump -i any -n -v 'tcp[tcpflags] & tcp-syn != 0'
... options [mss 1460,nop,wscale 8,nop,nop,sackOK]
# MSS = 1460，对应 MTU 1500

# IP 分片抓包（异常情况）
$ tcpdump -i any -n 'ip[6:2] & 0x1fff != 0'
# 有输出表示发生 IP 分片，需要排查
```

## 代码示例

Java 不直接控制 MSS，由内核根据 MTU 自动协商。但可以观察：

```java
import java.net.*;

Socket socket = new Socket("example.com", 80);
// Java 没有直接 API 设置 MSS
// 内核根据 MTU 自动计算并协商 MSS
// 应用层只关心读写
```

调整内核 MTU 和 MSS：

```bash
# 查看网卡 MTU
$ ip link show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 ...

# 修改 MTU（如 VPN 隧道场景）
$ ip link set eth0 mtu 1400

# 限制 TCP MSS（如 PPPoE 场景）
$ iptables -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| VPN 隧道丢包多 | IP 分片频繁 | 降低 MTU 或开启 PMTUD |
| PPPoE 网络 | MTU 1492（不是 1500） | MSS 自动降到 1452 |
| 跨云专线 | MTU 不一致 | 统一 MTU 或开 PMTUD |
| 容器网络 | 嵌套虚拟化叠加 | 调小 MTU 避免分片 |
| ICMP 被防火墙挡 | PMTUD 失败 | 静态配置 MSS |

## 深挖追问

**Q1：MSS 默认值是多少？**
- 以太网：1460 字节（MTU 1500 - 20 IP - 20 TCP）
- PPPoE：1452 字节（MTU 1492 - 40）
- 不协商时默认 536 字节（RFC 793，老标准）

**Q2：DF 标志是什么？**
Don't Fragment，IP 头部标志位。设置后路由器不能分片，超过 MTU 直接丢弃并回 ICMP。PMTUD 就是靠这个探测路径 MTU。

**Q3：ICMP 被防火墙挡了 PMTUD 怎么办？**
PMTUD 失败，发送方不知道实际 MTU，会持续发大包被丢，连接卡死。解决：静态配置较小 MSS，或清理防火墙 ICMP 规则。

**Q4：UDP 没有 MSS 怎么避免分片？**
UDP 应用层自己控制单包大小不超过 MSS（1472 字节）。如果应用层发大包，IP 层会分片，丢一个分片整个 UDP 报文丢。

**Q5：IPv6 还需要 PMTUD 吗？**
更需要。IPv6 路由器不允许分片（ IPv6 头部没有分片字段，分片只能在源端），所以必须靠 PMTUD 知道路径 MTU。

## 易错点

- **"MSS = MTU"** — 错，MSS = MTU - IP 头 - TCP 头。
- **"IP 分片和 TCP 分片一样"** — 不，IP 分片丢一个全丢，TCP 分片独立。
- **"MSS 越大越好"** — 不，超过路径 MTU 会触发 IP 分片。
- **"DF 标志禁止分片"** — 设置后路由器丢弃超 MTU 包并回 ICMP。
- **"UDP 不会分片"** — 会，IP 层会分片，但应用层一般控制大小避免。

## 总结

TCP 用 MSS 而不依赖 IP 分片，是因为 IP 分片后任一分片丢失要重传整个 TCP 段，效率极低。MSS 让 TCP 在传输层控制段大小，每段独立 ACK、独立重传。PMTUD 动态探测路径 MTU 调整 MSS。生产中要注意 VPN/PPPoE/容器等场景 MTU 不一致导致分片或 PMTUD 黑洞问题。

## 参考资料

- [RFC 879 — The TCP Maximum Segment Size](https://datatracker.ietf.org/doc/html/rfc879)
- [RFC 1191 — Path MTU Discovery](https://datatracker.ietf.org/doc/html/rfc1191)
- [RFC 8201 — Path MTU Discovery for IPv6](https://datatracker.ietf.org/doc/html/rfc8201)
