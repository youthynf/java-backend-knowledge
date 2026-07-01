# IPv4 和 IPv6 有什么区别

## 核心概念

IPv4 和 IPv6 是互联网协议的两个版本。IPv4 是 RFC 791（1981 年）定义的版本，地址长度 32 位，理论上有约 43 亿地址，已经被分配殆尽。IPv6 是 RFC 8200（2017 年，最初 RFC 2460 1998 年）定义的版本，地址长度 128 位，地址空间约 3.4×10^38，几乎"用不完"。

IPv6 不是 IPv4 的"小升级"，而是大幅重设计：地址变长、首部简化、取消分片、内置安全（IPSec）、内置地址自动配置（SLAAC）、用 NDP 替代 ARP、用 MLD 替代 IGMP。设计目的是既解决地址耗尽问题，也修复 IPv4 的若干历史包袱。

理解 IPv4 与 IPv6 的差异是当前云原生与运营商网络演进的基础。手机 5G 网络已经默认 IPv6，国内运营商宽带也大规模部署 IPv6，但企业 IT 与公网服务 IPv6 普及率仍参差不齐，所以"双栈"（Dual Stack）与"NAT64"在过渡期共存。

## 标准回答

IPv4 是 32 位地址、首部 20 字节起、需 DHCP/静态配 IP、路由器可分片、ARP 解析 MAC；IPv6 是 128 位地址、首部固定 40 字节、SLAAC 自动配置、路由器不分片（只源主机分片）、NDP 替代 ARP、IPSec 内置支持。IPv6 简化了首部、扩大了地址空间、提升了安全性，但兼容性需要双栈或翻译机制过渡。

要点：

- IPv4 地址 `192.168.1.1`（点分十进制），IPv6 地址 `2001:db8::1`（冒号十六进制，支持零压缩）。
- IPv4 首部可变长（20-60 字节，带选项），IPv6 首部固定 40 字节，选项放到扩展首部。
- IPv4 路由器可分片，IPv6 路由器不分片，只源主机通过 Path MTU Discovery 控制包大小。
- IPv4 用 ARP（广播），IPv6 用 NDP（基于 ICMPv6，组播）。
- IPv4 用 DHCP（DORA 四步），IPv6 可选 SLAAC（无状态）或 DHCPv6（有状态）。

## 实现原理

### 地址格式对比

**IPv4 地址**：32 位，点分十进制，4 段，每段 0-255：

```
192.168.1.100
11000000.10101000.00000001.01100100
```

**IPv6 地址**：128 位，冒号十六进制，8 组每组 16 位：

```
2001:0db8:0000:0000:0000:0000:0000:0001
```

IPv6 简化规则：

1. 每组前导 0 可省略：`0db8` → `db8`，`0000` → `0`。
2. 连续的零组可用 `::` 压缩一次（且只能一次）：
   `2001:0db8:0000:0000:0000:0000:0000:0001` → `2001:db8::1`
3. IPv4-mapped IPv6：`::ffff:192.168.1.1`（用于双栈过渡）。

IPv6 地址分类（前缀）：

| 前缀 | 类型 | 说明 |
|------|------|------|
| `0000::/8`  | 保留 | 包括 `::1` 环回、`::` 未指定 |
| `2000::/3`  | 全球单播 | 公网可路由地址，相当于 IPv4 公网 |
| `fc00::/7`  | 唯一本地（ULA） | 类似 IPv4 私网，不公网路由 |
| `fe80::/10` | 链路本地 | 仅本网段有效，自动生成，用于 NDP |
| `ff00::/8`  | 组播 | 替代 IPv4 D 类 |

### 首部对比

**IPv4 首部（20-60 字节，可变长）**：

```
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|Version| IHL | DSCP/ECN |       Total Length (16)            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Identification (16) |Flags| Fragment Offset (13)            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| TTL (8)     | Protocol (8) | Header Checksum (16)           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Source Address (32)                                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Destination Address (32)                                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Options (variable, 0-40 bytes)                              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**IPv6 首部（固定 40 字节）**：

```
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|Version| Traffic Class |        Flow Label (20)              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Payload Length (16) | Next Header (8) | Hop Limit (8)       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Source Address (128)                                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Destination Address (128)                                    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

关键差异：

- IPv4 有 Header Checksum，每跳都要重算（因 TTL 变化），影响性能；IPv6 取消首部校验，交给链路层（FCS）和上层协议（TCP/UDP 校验和）保证完整性。
- IPv4 的 Identification/Flags/Fragment Offset 在 IPv6 基本首部里取消，分片信息放到了 Fragment 扩展首部。
- IPv4 有 Options 字段，IPv6 用 Next Header 串联扩展首部，路由器可不解析扩展首部，转发更快。
- IPv6 新增 Flow Label，标识同一流的包，便于 QoS 与负载均衡。

### 分片策略差异

- **IPv4**：路由器可在 DF=0 时分片，目的主机重组。路径 MTU 发现可选。
- **IPv6**：路由器不分片。源主机必须用 Path MTU Discovery（PMTUD，RFC 8201）发现路径 MTU，按路径 MTU 切包。若包太大且 PMTUD 失败，路由器丢弃并回 ICMPv6 Packet Too Big，源主机据此降低包大小。

### 地址配置对比

- **IPv4**：静态配置或 DHCP（DORA 四步），DHCP 是有状态分配。
- **IPv6**：
  - **SLAAC（无状态地址自动配置，RFC 4862）**：主机根据路由器通告（RA）里的网络前缀 + 自己的 MAC（EUI-64）自动构造地址，无需 DHCPv6。这是 IPv6 默认推荐方式。
  - **DHCPv6（有状态，RFC 8415）**：与 IPv4 DHCP 类似，服务器集中分配地址，便于审计与管控。
  - 实际部署常两者结合：SLAAC 给地址，DHCPv6 给 DNS/NTP 等额外配置。

### 邻居发现对比

- **IPv4 ARP**：广播 ARP 请求，全网段主机被迫处理，无认证。
- **IPv6 NDP（Neighbor Discovery Protocol，RFC 4861）**：基于 ICMPv6（Type 133-137），使用 Solicited-Node 组播地址（`ff02::1:ff00:0/104` + 目标 IPv6 后 24 位），只打扰相关主机；强制支持 IPSec，安全性更高。

## 代码示例

Linux 下查看与配置 IPv4/IPv6：

```bash
# 查看本机所有地址（v4 + v6）
ip addr show

# 只看 IPv6
ip -6 addr show

# 查看 IPv6 路由
ip -6 route show

# 测试 IPv6 连通性
ping6 -c 4 ipv6.google.com
ping6 -c 4 2001:4860:4860::8888   # Google Public DNS64

# traceroute IPv6
traceroute6 ipv6.google.com

# 抓取 IPv6 流量
tcpdump -i eth0 -nn ip6

# 查看 IPv6 邻居（替代 arp -n）
ip -6 neigh show

# 临时给网卡加 IPv6 地址
ip -6 addr add 2001:db8::100/64 dev eth0
```

Java 中检测 IPv4/IPv6 双栈支持：

```java
import java.net.*;

public class DualStackCheck {
    public static void main(String[] args) throws Exception {
        // 查询某域名的所有地址（v4 + v6）
        InetAddress[] all = InetAddress.getAllByName("www.google.com");
        for (InetAddress addr : all) {
            System.out.println(addr.getClass().getSimpleName() + " : " + addr.getHostAddress());
        }

        // 优先解析 IPv6（系统默认偏好可由 java.net.preferIPv6Addresses 控制）
        System.out.println("\npreferIPv6Addresses = "
            + System.getProperty("java.net.preferIPv6Addresses", "false"));

        // 测试 IPv6 连通性
        InetAddress v6 = InetAddress.getByName("2001:4860:4860::8888");
        System.out.println("IPv6 reachable: " + v6.isReachable(2000));
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 云主机 IPv6 接入 | 阿里云/腾讯云已默认支持 IPv6，按控制台开启即可 | 安全组规则需同时配 v4/v6，否则 IPv6 流量绕过 v4 规则 |
| 移动端服务 | 5G/4G 默认 IPv6，App 需正确处理 IPv6 地址 | Java `InetAddress.getByName` 默认返回 v4，可能漏掉 v6 |
| 容器网络 | Kubernetes 1.13+ 支持 IPv6 双栈 | CNI 插件需支持 IPv6（如 Calico、Cilium 已支持） |
| 内网迁移 | 内部应用先用 ULA（`fc00::/7`）做隔离，逐步对接公网 | ULA 不在公网路由，避免与公网地址冲突 |
| 家庭宽带 | 国内运营商默认下发 IPv6 前缀，路由器做 PD（Prefix Delegation） | 家用路由器需开启 IPv6 转发与防火墙规则 |

## 深挖追问

- **既然 IPv6 这么好，为什么这么多年还没普及完？**
  IPv4 的网络效应太强——NAT 让 IPv4 续命，企业改造成本高、收益不明显，应用层长期不感知 IPv6。运营商、CDN、云厂商逐步推进，但终端到端到端的全 IPv6 路径仍需要时间。

- **IPv6 没有 NAT 行不行？**
  IPv6 设计上不鼓励 NAT（地址足够）。但企业出于安全/审计习惯仍会部署 IPv6 防火墙或 NPTv6（Network Prefix Translation，RFC 6296）。家用路由器 IPv6 一般做 Prefix Delegation 而非 NAT。

- **IPv6 地址那么多，会不会浪费？**
  IPv6 设计上故意"浪费"以简化路由：终端网段用 `/64`（1800 京地址），站点用 `/48`。这种"宽裕"换来路由表小、地址分配简单的好处。

- **双栈与 NAT64 怎么选？**
  双栈（同时支持 v4/v6）是过渡期最简单方式，但需维护两套地址与路由。NAT64（RFC 6146）让纯 IPv6 网络访问 IPv4 资源，需 DNS64 配合把 IPv4 域名解析成 IPv6 合成地址。新建网络建议优先 IPv6-only + NAT64 兜底。

- **IPv6 的 Link-Local 地址有什么用？**
  `fe80::/10` 链路本地地址自动生成，只在同网段有效，不被路由。它是 NDP 协议通信的基础——路由器通告、邻居发现都走链路本地地址，类似 IPv4 中 ARP 协议的工作地址。

## 易错点

- **以为 IPv6 地址能"压缩多次" `::`**：`::` 只能在地址中出现一次，否则歧义无法还原。
- **以为 IPv4 与 IPv6 是同一套首部格式**：完全不同，IPv6 简化基本首部、扩展首部串联。
- **以为 IPv6 路由器会分片**：IPv6 路由器不分片，源主机必须 PMTUD 控制包大小，依赖 ICMPv6 Packet Too Big 反馈。
- **以为关闭 IPv6 就一定安全**：很多安全组/防火墙只配 v4 规则，IPv6 流量可能绕过——关闭 v6 或显式配 v6 规则都是必要防护。
- **以为 IPv6 不需要 DHCP**：SLAAC 是默认推荐，但 DHCPv6 在需要 DNS/NTP/审计的企业环境仍是常见选择。

## 总结

IPv4 与 IPv6 不是版本号差异，而是网络层的"重新设计"：IPv6 用 128 位地址解决耗尽问题，同时砍掉 Header Checksum、路由器分片、ARP 等历史包袱，引入 Flow Label、扩展首部、NDP/MLD 等更现代的机制。掌握两者差异的关键在于把"地址表示、首部结构、分片策略、地址配置、邻居发现"五个维度并列对比。过渡期采用双栈与 NAT64 共存，云原生与移动网络已大规模部署 IPv6，企业应用需做好 v4/v6 双栈适配。

## 参考资料

- [RFC 791 - Internet Protocol (IPv4)](https://www.rfc-editor.org/rfc/rfc791)
- [RFC 8200 - Internet Protocol, Version 6 (IPv6) Specification](https://www.rfc-editor.org/rfc/rfc8200)
- [RFC 4291 - IPv6 Addressing Architecture](https://www.rfc-editor.org/rfc/rfc4291)
- [RFC 4861 - Neighbor Discovery for IP version 6 (IPv6)](https://www.rfc-editor.org/rfc/rfc4861)
- [RFC 4862 - IPv6 Stateless Address Autoconfiguration (SLAAC)](https://www.rfc-editor.org/rfc/rfc4862)
- [RFC 6146 - Stateful NAT64](https://www.rfc-editor.org/rfc/rfc6146)

---
