# IP 分片与重组机制是什么

## 核心概念

IP 分片（Fragmentation）解决一个问题：**IP 包长度超过了下一跳链路的 MTU 时怎么发出去**。不同链路层有不同的 MTU（最大传输单元），以太网常见 1500 字节，PPP 拨号可能只有 1492，VPN/隧道叠加封装后会更小（如 GRE over IPv4 实际有效 MTU = 1500 - 20 IP - 4 GRE = 1476）。如果一个 IP 包大于出接口 MTU，要么分片发，要么直接丢弃。

IPv4 与 IPv6 的分片策略差异巨大：IPv4 允许中间路由器分片（DF 位未置位时），目的主机负责重组；IPv6 取消了路由器分片，只让源主机通过 Path MTU Discovery 控制包大小。这个设计差异背后的原因是分片代价很高——任何一个分片丢失就导致整个 IP 包失败，且重组消耗目的主机内存。

实际生产中应当**尽量避免 IP 分片**：TCP 通过 MSS 协商主动控制段大小，UDP 应用应当自己控制数据报大小或实现应用层分片重传。理解 MTU、MSS、PMTUD 三者关系是排障"小包能通大包不通"、"VPN 后访问某些网站卡住"等问题的关键。

## 标准回答

IP 分片是把超过 MTU 的 IP 包拆成多个小包发送、目的主机重组的机制。IPv4 路由器在 DF=0 时可分片，IPv6 路由器不分片。每个分片携带同一 Identification 号，用 Fragment Offset 标识在原包中的位置。任何一个分片丢失，整个原 IP 包都无法重组，上层必须重传。生产中应通过 TCP MSS、PMTUD、应用控制 UDP 报文大小等手段避免 IP 分片。

要点：

- MTU 是链路层一次可承载的最大 IP 包字节数（不含链路层头），以太网常见 1500。
- MSS 是 TCP 报文段最大应用数据字节数，等于 MTU - IP 头 - TCP 头（通常 1460）。
- IPv4 分片字段：Identification（16 位）、Flags（DF/MF）、Fragment Offset（13 位，以 8 字节为单位）。
- IPv6 用 Fragment 扩展首部承载分片信息，路由器不分片。
- PMTUD（Path MTU Discovery）依赖 ICMP Fragmentation Needed 反馈，被防火墙屏蔽会出现"黑洞"。

## 实现原理

### IPv4 首部分片相关字段

```
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Identification (16 位) |Flags(3)| Fragment Offset (13 位)    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

Flags:
  bit 0: 保留 (0)
  bit 1: DF (Don't Fragment)  1=不分片
  bit 2: MF (More Fragments)  1=后面还有分片，0=最后一个分片

Fragment Offset:
  该分片在原包中的偏移，以 8 字节为单位（所以分片长度必须是 8 的倍数）
```

### 分片示例

假设原 IP 包总长度 4000 字节（含 20 字节 IP 头），MTU = 1500：

```
原 IP 包:  [IP 头 20] [载荷 3980]
              │
              ▼ 拆分为 3 个分片

分片 1:  [IP 头 20] [载荷 1480]   Offset=0,    MF=1, ID=12345
分片 2:  [IP 头 20] [载荷 1480]   Offset=1480, MF=1, ID=12345
分片 3:  [IP 头 20] [载荷 1020]   Offset=2960, MF=0, ID=12345

注意:
  - 每个分片都是独立的 IP 包，有自己的 IP 头
  - 载荷长度必须是 8 的倍数（因为 Offset 以 8 字节为单位）
  - 所有分片共享同一 Identification 号
  - 第一个分片 Offset=0，最后一个 MF=0
  - 总长度字段 = IP 头 + 本分片载荷
```

### 重组过程

目的主机收齐所有分片后才重组：

1. 收到第一个分片（Offset=0）时，根据 MF=1 知道还有后续，分配重组缓冲区。
2. 后续分片按 Offset 插入缓冲区正确位置。
3. 收到 MF=0 的分片时，知道最后一个分片到达，可计算原包总长度。
4. 所有分片到齐后，按 Offset 顺序拼接载荷，交给上层协议。
5. 重组有超时机制（默认 30 秒，`ipfrag_time`），超时未收齐则丢弃所有分片。

### 分片的代价

- **丢包放大**：一个 4000 字节包分成 3 个分片，任意一个丢失就导致整个包失败。假设单包丢失率 1%，整体丢包率约 1 - (1-0.01)^3 ≈ 3%。
- **重组缓存消耗**：目的主机需要为每个未完成的分片流分配缓冲区，可能被攻击者利用做分片 flood 攻击。
- **防火墙兼容性**：很多防火墙只检查首片，后续分片绕过检查，是经典攻击面。
- **乱序处理复杂**：分片可能乱序到达，重组逻辑较复杂。

### IPv4 vs IPv6 分片策略

| 维度 | IPv4 | IPv6 |
|------|------|------|
| 谁能分片 | 源主机 + 路由器（DF=0 时） | 仅源主机 |
| 分片字段位置 | 基本首部 | Fragment 扩展首部 |
| 路由器反馈 | ICMP Type 3 Code 4 (Fragmentation Needed) | ICMPv6 Packet Too Big |
| PMTUD | 可选 | 必需 |
| DF 位 | 有 | 取消（默认不分片） |

### Path MTU Discovery (PMTUD)

源主机发送 IP 包时设置 DF=1（IPv6 隐式 DF=1），如果路径上某跳 MTU 不够，路由器丢弃包并回 ICMP Fragmentation Needed（IPv4）或 ICMPv6 Packet Too Big（IPv6），携带下一跳 MTU。源主机据此降低发送包大小，逐步收敛到路径 MTU。

PMTUD 黑洞问题：如果防火墙屏蔽了 ICMP Fragmentation Needed 报文，源主机永远收不到反馈，包一直被丢弃，表现为"小包能通大包不通"或"HTTPS 协商卡住"。Linux 内核通过 `net.ipv4.tcp_mtu_probing=1` 在检测到黑洞时自动探测 MTU 缓解。

### TCP MSS 与 IP 分片的关系

TCP 三次握手中双方通过 MSS Option 通告自己能接收的最大段大小（默认 1460 = 1500 MTU - 20 IP - 20 TCP）。发送方按对端 MSS 切分数据，每个 TCP 段封装成一个 IP 包后不会超过路径 MTU（前提是 PMTUD 正常），从而避免 IP 分片。

TCP MSS Clamp 是路由器/防火墙的常见优化：在 SYN/SYN-ACK 中改写 MSS Option 为较小值（如 PPPoE 链路改成 1452），强制 TCP 用更小段，避免后续 PMTUD 失败。

## 代码示例

Linux 下排查 MTU 与分片问题：

```bash
# 查看本机各接口 MTU
ip link show

# 查看路径 MTU（自动 PMTUD）
tracepath example.com
# 输出示例: 1:  10.0.0.1     0.123ms pmtu 1500
#          2:  ...           pmtu 1492  ← 路径上某跳 MTU=1492

# 主动探测路径 MTU，禁止分片
ping -M do -s 1472 example.com   # 1472 + 8 ICMP + 20 IP = 1500
ping -M do -s 1472 -i eth0 example.com
# 若返回 "Frag needed and DF set" 表示路径 MTU < 1500

# 查看分片重组相关内核参数
sysctl net.ipv4.ipfrag_time          # 重组超时（默认 30 秒）
sysctl net.ipv4.ipfrag_high_thresh   # 重组缓冲区上限

# 抓取 IP 分片
tcpdump -i eth0 -nn 'ip[6:2] & 0x1fff != 0 or ip[6] & 0x20 != 0'

# 抓取 ICMP Fragmentation Needed
tcpdump -i eth0 -nn 'icmp[icmptype] = 3 and icmp[icmpcode] = 4'

# 临时修改接口 MTU
ip link set eth0 mtu 1400
```

Java 中控制 UDP 报文大小避免分片：

```java
import java.net.*;

public class UdpSizeGuard {
    public static void main(String[] args) throws Exception {
        DatagramSocket socket = new DatagramSocket();
        byte[] payload = new byte[8192];  // 8KB 远超以太网 MTU

        // 直接发会触发 IP 分片，丢一个分片就整包失败
        // 推荐做法：应用层切分到 1400 字节以内
        int safeSize = 1400;
        for (int offset = 0; offset < payload.length; offset += safeSize) {
            int len = Math.min(safeSize, payload.length - offset);
            byte[] chunk = new byte[len];
            System.arraycopy(payload, offset, chunk, 0, len);
            DatagramPacket pkt = new DatagramPacket(
                chunk, len, InetAddress.getByName("127.0.0.1"), 9000);
            socket.send(pkt);
        }
        socket.close();
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| VPN/隧道后访问卡顿 | 隧道封装降低有效 MTU，大包触发分片或被丢弃 | 降低接口 MTU 或启用 TCP MSS Clamp |
| 容器跨主机大包丢失 | VXLAN 封装降低 50 字节 MTU，UDP 大包易丢 | 配置宿主机 MTU 1450 或开启 PMTUD |
| HTTPS 协商卡死 | ClientHello 大包超过路径 MTU 且 ICMP 被屏蔽 | 开启 `tcp_mtu_probing` 或放行 ICMP Fragmentation Needed |
| DNS 大响应被丢 | UDP DNS 响应超 512 字节触发分片，丢片导致解析失败 | 改用 TCP DNS 或限制 EDNS0 UDP buffer size |
| 视频流卡顿 | UDP 大包分片后高丢包率 | 应用层 FEC + 限制单包大小 |

## 深挖追问

- **既然 IP 层会分片，为什么 TCP 还要 MSS？**
  IP 分片代价高（丢片放大、重组消耗、防火墙兼容性）。TCP MSS 让源端在 TCP 层就控制段大小，避免 IP 层分片。MSS = MTU - IP 头 - TCP 头，确保每个 TCP 段封装成 IP 包后不会超过路径 MTU。

- **ICMP 被防火墙屏蔽会出现什么问题？**
  PMTUD 依赖 ICMP Fragmentation Needed 反馈。ICMP 被屏蔽时源主机收不到反馈，包一直被丢弃，表现为"小包能通大包不通"。这是经典的 PMTUD 黑洞问题，Linux 可通过 `tcp_mtu_probing` 自动探测缓解。

- **IPv6 为什么禁止路由器分片？**
  路由器分片是性能瓶颈（每包都要拆分+加头），且分片代价高。IPv6 设计上把分片责任交给源主机，路由器只做转发，性能更好。源主机必须 PMTUD，否则包会被丢弃。

- **一个 UDP 包分成 10 个 IP 分片，整体丢包概率有多大？**
  假设单分片丢失率 p=1%，整体丢失率 = 1 - (1-p)^10 ≈ 9.6%。分片数越多丢包放大越严重，所以 UDP 大包生产中要谨慎。

- **为什么防火墙要看"所有分片"而不只是首片？**
  首片含传输层头部（TCP/UDP 端口），后续分片只有载荷。早期防火墙只检查首片，攻击者可构造恶意后续分片绕过检测。现代防火墙启用"分片重组"或"虚拟重组"在转发前先重组检查。

## 易错点

- **把 MTU 和 MSS 混为一谈**：MTU 是链路层最大 IP 包字节数（1500），MSS 是 TCP 最大应用数据字节数（1460 = 1500 - 20 - 20）。
- **以为分片只丢失那一片**：丢一片导致整个原 IP 包失败，上层重传整个包。
- **以为 IPv6 也允许路由器分片**：IPv6 路由器不分片，源主机必须 PMTUD。
- **以为 DF 位是 IPv6 字段**：IPv6 取消了 DF 位，默认就是不分片。
- **忽略 PMTUD 黑洞**：防火墙屏蔽 ICMP Fragmentation Needed 会导致大包神秘丢失，需放行该 ICMP 类型。

## 总结

IP 分片是网络层应对 MTU 限制的机制，但代价高昂——丢片放大、重组消耗、安全风险。IPv4 允许路由器分片，IPv6 把分片责任完全交给源主机配 PMTUD。生产中应当尽量避免 IP 分片：TCP 通过 MSS 协商主动控制段大小，UDP 应用自行控制报文大小或做应用层分片重传，VPN/隧道场景启用 TCP MSS Clamp 或降低接口 MTU。排障"小包通大包不通"问题，第一步是 `ping -M do -s 1472` 测路径 MTU，第二步检查 ICMP 是否被防火墙屏蔽。

## 参考资料

- [RFC 791 - Internet Protocol (Fragmentation)](https://www.rfc-editor.org/rfc/rfc791)
- [RFC 8200 - IPv6 Specification (No Router Fragmentation)](https://www.rfc-editor.org/rfc/rfc8200)
- [RFC 8201 - Path MTU Discovery for IP version 6](https://www.rfc-editor.org/rfc/rfc8201)
- [RFC 1191 - Path MTU Discovery (IPv4)](https://www.rfc-editor.org/rfc/rfc1191)
- [RFC 8900 - IP Fragmentation Considered Fragile](https://www.rfc-editor.org/rfc/rfc8900)

---
