# 网络层

本目录覆盖网络层核心协议与机制：IP 地址、ARP、ICMP、IGMP、CIDR、NAT、DHCP、路由协议，以及跨网段通信全流程。

## 目录

- [ARP 协议作用是什么](ARP协议作用是什么？.md) — 已知 IP 求 MAC 的地址解析机制，ARP 缓存、免费 ARP、ARP 欺骗防御
- [CIDR 无分类地址是什么](CIDR无分类地址是什么？.md) — 取消 A/B/C 类边界、任意前缀长度、子网划分与路由聚合、私有 IP 范围
- [DHCP 协议作用是什么](DHCP协议作用是什么？.md) — DORA 四步自动获取 IP 配置、租期续约、DHCP Relay 跨网段
- [ICMP 是什么](ICMP是什么？.md) — IP 控制与诊断协议，ping/traceroute 原理、差错报文约束、ICMPv6
- [IGMP 是什么](IGMP是什么？.md) — IPv4 组播成员管理，主机-路由器信令、Snooping、与 PIM 协作
- [IPv4 和 IPv6 有什么区别](IPv4和IPv6有什么区别？.md) — 32 位 vs 128 位、首部简化、分片策略、SLAAC/NDP、双栈与 NAT64
- [IP 分片与重组机制是什么](IP分片与重组机制是什么？.md) — MTU/MSS/PMTUD 关系、IPv4 路由器分片与 IPv6 仅源主机分片、生产中如何避免分片
- [IP 地址是如何分类的](IP地址是如何分类的？.md) — A/B/C/D/E 五类划分、私有 IP 范围、特殊地址、与 CIDR 的关系
- [NAT 网络地址转换是什么](NAT网络地址转换是什么？.md) — NAPT 端口复用、NAT 表生命周期、Cone/Symmetric NAT、STUN/TURN 穿透
- [路由协议有哪些？OSPF 与 BGP 有什么区别](路由协议有哪些？OSPF与BGP有什么区别？.md) — 静态/动态路由、IGP/EGP、链路状态 vs 路径矢量、最长前缀匹配
- [打开网页发生的网络过程是怎么样的](打开网页发生的网络过程是怎么样的？.md) — DNS/ARP/TCP/TLS/HTTP 全流程串讲、各阶段排障工具
