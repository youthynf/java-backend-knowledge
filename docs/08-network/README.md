# 计算机网络专题

## 面试复习重点

- 网络分层模型、TCP/UDP、HTTP/HTTPS 和 DNS 的职责边界。
- 连接建立、数据传输、拥塞控制、加密和路由转发。
- 抓包、日志、连接状态和指标如何配合定位网络问题。

## 建议掌握程度

- **能讲清概念**：用自己的话说明定义、背景和解决的问题。
- **能画出链路**：把关键组件、核心流程和状态变化串起来。
- **能回答追问**：准备优缺点、适用场景、常见坑和替代方案。
- **能落地排查**：结合日志、指标、工具和案例说明定位思路。

## 面试表达模板

1. 先给结论：说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。


本目录整理后端面试复习文章，建议围绕概念、追问、实战和易错点复习。

## 复习建议

- 先用导航建立知识地图，再逐篇补齐自己的项目案例。
- 每篇文章复习时都按“核心概念 → 面试官想考什么 → 标准回答 → 深挖追问 → 示例/实战场景 → 易错点/总结”检查。
- 遇到协议、架构或排障题时，主动补充异常分支、监控指标和工程取舍。

## 子目录导航

- [应用层协议](/08-network/application-layer/README.md)：本目录覆盖 HTTP、HTTPS、Cookie/Session、WebSocket、DNS、RPC 等应用层高频题。
- [网络层协议](/08-network/network-layer/README.md)：本目录覆盖 IP、ARP、NAT、DHCP、ICMP、路由等网络层知识和跨网段通信过程。
- [网络模型](/08-network/network-model/README.md)：本目录用于建立网络分层知识地图，帮助把协议流程和排障步骤拆层理解。
- [网络安全](/08-network/network-security/README.md)：本目录覆盖 Web 与网络安全高频题，建议按攻击原理、防护手段和防护边界复习。
- [传输层协议](/08-network/transport-layer/README.md)：本目录覆盖 TCP/UDP、连接状态、可靠传输、拥塞控制和常见网络异常排查。

## 文章导航

### application-layer

- [Cookie和Session区别是什么？](/08-network/application-layer/Cookie和Session区别是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [DNS域名解析的工作流程是怎么样的？](/08-network/application-layer/DNS域名解析的工作流程是怎么样的？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [DNS底层使用TCP还是UDP？](/08-network/application-layer/DNS底层使用TCP还是UDP？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [DNS是什么？](/08-network/application-layer/DNS是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [GET和POST的区别是什么？](/08-network/application-layer/GET和POST的区别是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP/2是什么？](/08-network/application-layer/HTTP-2是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP/2的HPACK对头阻塞问题是什么？](/08-network/application-layer/HTTP-2的HPACK对头阻塞问题是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP/3是什么？](/08-network/application-layer/HTTP-3是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP1.0与HTTP2.0区别是什么？](/08-network/application-layer/HTTP1.0与HTTP2.0区别是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP1.1如何对请求拆包？](/08-network/application-layer/HTTP1.1如何对请求拆包？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP1.1队头阻塞是什么？](/08-network/application-layer/HTTP1.1队头阻塞是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTPS如何优化？](/08-network/application-layer/HTTPS如何优化？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTPS如何防范中间人攻击？](/08-network/application-layer/HTTPS如何防范中间人攻击？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTPS握手过程是怎么样的？](/08-network/application-layer/HTTPS握手过程是怎么样的？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP、SOCKET和GET的区别是什么？](/08-network/application-layer/HTTP、SOCKET和GET的区别是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP为什么不安全？](/08-network/application-layer/HTTP为什么不安全？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP协议常见的请求头有哪些？](/08-network/application-layer/HTTP协议常见的请求头有哪些？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP协议支持的请求方法有哪些？](/08-network/application-layer/HTTP协议支持的请求方法有哪些？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP各个版本是如何管理多个TCP连接的？](/08-network/application-layer/HTTP各个版本是如何管理多个TCP连接的？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP和HTTPS区别是什么？](/08-network/application-layer/HTTP和HTTPS区别是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP常见的状态码有哪些？](/08-network/application-layer/HTTP常见的状态码有哪些？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP的报文结构是怎么样的？](/08-network/application-layer/HTTP的报文结构是怎么样的？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP的无状态怎么理解？](/08-network/application-layer/HTTP的无状态怎么理解？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP的长连接怎么理解？](/08-network/application-layer/HTTP的长连接怎么理解？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [HTTP进行TCP连接之后，什么情况下会中断？](/08-network/application-layer/HTTP进行TCP连接之后，什么情况下会中断？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [JWT令牌是什么？](/08-network/application-layer/JWT令牌是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [SSL与TSL有什么联系？](/08-network/application-layer/SSL与TSL有什么联系？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [localStorage和Cookie区别是什么？](/08-network/application-layer/localStorage和Cookie区别是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [token、session、cookie区别是什么？](/08-network/application-layer/token、session、cookie区别是什么？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [如果客户端禁用了cookie，session还能用吗？](/08-network/application-layer/如果客户端禁用了cookie，session还能用吗？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [应用层常用协议有哪些？](/08-network/application-layer/应用层常用协议有哪些？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [既然有HTTP为什么还要有RPC？](/08-network/application-layer/既然有HTTP为什么还要有RPC？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [既然有HTTP为什么还需要WebSocket？](/08-network/application-layer/既然有HTTP为什么还需要WebSocket？.md)：应用层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。

### network-layer

- [ARP协议作用是什么？](/08-network/network-layer/ARP协议作用是什么？.md)：ARP 地址解析、缓存机制与 ARP 欺骗防御。
- [CIDR无分类地址是什么？](/08-network/network-layer/CIDR无分类地址是什么？.md)：CIDR 任意前缀、子网划分与路由聚合、私有 IP 范围。
- [DHCP协议作用是什么？](/08-network/network-layer/DHCP协议作用是什么？.md)：DORA 四步获取 IP 配置、租期续约与 DHCP Relay。
- [ICMP是什么？](/08-network/network-layer/ICMP是什么？.md)：IP 控制与诊断协议，ping/traceroute 原理与 ICMPv6。
- [IGMP是什么？](/08-network/network-layer/IGMP是什么？.md)：IPv4 组播成员管理、Snooping 与 PIM 协作。
- [IPv4和IPv6有什么区别？](/08-network/network-layer/IPv4和IPv6有什么区别？.md)：地址格式、首部简化、分片策略与 SLAAC/NDP 差异。
- [IP分片与重组机制是什么？](/08-network/network-layer/IP分片与重组机制是什么？.md)：MTU/MSS/PMTUD 关系与生产中避免分片的实践。
- [IP地址是如何分类的？](/08-network/network-layer/IP地址是如何分类的？.md)：A/B/C/D/E 五类划分、私有 IP 范围与特殊地址。
- [NAT网络地址转换是什么？](/08-network/network-layer/NAT网络地址转换是什么？.md)：NAPT 端口复用、NAT 类型与 STUN/TURN 穿透。
- [路由协议有哪些？OSPF与BGP有什么区别？](/08-network/network-layer/路由协议有哪些？OSPF与BGP有什么区别？.md)：IGP/EGP、链路状态 vs 路径矢量、最长前缀匹配。
- [打开网页发生的网络过程是怎么样的？](/08-network/network-layer/打开网页发生的网络过程是怎么样的？.md)：DNS/ARP/TCP/TLS/HTTP 全流程串讲与排障工具。

### network-model

- [OSI模型与TCPIP模型有什么区别？](/08-network/network-model/OSI模型与TCPIP模型有什么区别？.md)：七层 vs 四层、每层职责、封装解封装与分层意义。

### network-security

- [CSRF跨站请求伪造攻击是什么？](/08-network/network-security/CSRF跨站请求伪造攻击是什么？.md)：网络安全面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [DDOS攻击是什么？](/08-network/network-security/DDOS攻击是什么？.md)：网络安全面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [DNS 劫持是什么？](/08-network/network-security/DNS劫持是什么？.md)：网络安全面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [SQL注入攻击是什么？](/08-network/network-security/SQL注入攻击是什么？.md)：网络安全面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [XSS攻击和CSRF攻击区别是什么？](/08-network/network-security/XSS攻击和CSRF攻击区别是什么？.md)：网络安全面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [XSS跨站脚本攻击事例有哪些？](/08-network/network-security/XSS跨站脚本攻击事例有哪些？.md)：网络安全面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [XSS跨站脚本攻击是什么？](/08-network/network-security/XSS跨站脚本攻击是什么？.md)：网络安全面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [对称加密和非对称加密有什么区别？](/08-network/network-security/对称加密和非对称加密有什么区别？.md)：网络安全面试复习，重点关注核心机制、典型追问、实战场景和易错点。

### transport-layer

- [QUIC协议是什么？](/08-network/transport-layer/QUIC协议是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP keepalive是什么？](/08-network/transport-layer/TCP keepalive是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP三次握手SYN报文什么情况下会被丢弃？](/08-network/transport-layer/TCP三次握手SYN报文什么情况下会被丢弃？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP 三次握手和 TLS 握手能合并吗？](/08-network/transport-layer/TCP三次握手和TLS握手能合并吗？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP三次握手和accept是什么关系？](/08-network/transport-layer/TCP三次握手和accept是什么关系？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP三次握手的过程是怎么样的？](/08-network/transport-layer/TCP三次握手的过程是怎么样的？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP与UDP端口绑定有区别吗？](/08-network/transport-layer/TCP与UDP端口绑定有区别吗？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP中的tcp_tw_reuse为什么默认关闭？](/08-network/transport-layer/TCP中的tcp_tw_reuse为什么默认关闭？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP为什么需要TIME_WAIT状态？](/08-network/transport-layer/TCP为什么需要TIME_WAIT状态？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP为什么需要三次握手？](/08-network/transport-layer/TCP为什么需要三次握手？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP协议有什么缺陷？](/08-network/transport-layer/TCP协议有什么缺陷？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP和UDP有什么区别？](/08-network/transport-layer/TCP和UDP有什么区别？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP四次挥手如果服务端的FIN报文比数据报文先到会发生什么？](/08-network/transport-layer/TCP四次挥手如果服务端的FIN报文比数据报文先到会发生什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP四次挥手的过程特殊场景分析？](/08-network/transport-layer/TCP四次挥手的过程特殊场景分析？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP四次挥手过程是怎么样的？](/08-network/transport-layer/TCP四次挥手过程是怎么样的？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP处于TIME_WAIT状态收到SYN报文会怎么样？](/08-network/transport-layer/TCP处于TIME_WAIT状态收到SYN报文会怎么样？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP头部格式有哪些？](/08-network/transport-layer/TCP头部格式有哪些？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP如何优化性能？](/08-network/transport-layer/TCP如何优化性能？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP如何保证可靠传输？](/08-network/transport-layer/TCP如何保证可靠传输？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP延迟确认机制是什么？](/08-network/transport-layer/TCP延迟确认机制是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP快速建立连接是什么？](/08-network/transport-layer/TCP快速建立连接是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP拥塞控制机制是什么？](/08-network/transport-layer/TCP拥塞控制机制是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP握手期间服务端工作内容是什么？](/08-network/transport-layer/TCP握手期间服务端工作内容是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP握手过程数据包丢失会发生什么？](/08-network/transport-layer/TCP握手过程数据包丢失会发生什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP数据一定不会丢失吗？](/08-network/transport-layer/TCP数据一定不会丢失吗？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP是面向字节流协议怎么理解？](/08-network/transport-layer/TCP是面向字节流协议怎么理解？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP每次建立连接的初始序列号为什么要不一样？](/08-network/transport-layer/TCP每次建立连接的初始序列号为什么要不一样？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP流量控制是什么？](/08-network/transport-layer/TCP流量控制是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP滑动窗口是什么？](/08-network/transport-layer/TCP滑动窗口是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP粘包问题如何解决？](/08-network/transport-layer/TCP粘包问题如何解决？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP连接一端断电和进程崩溃有何区别？](/08-network/transport-layer/TCP连接一端断电和进程崩溃有何区别？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP连接在拔掉网线后会发生什么？](/08-network/transport-layer/TCP连接在拔掉网线后会发生什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP连接处于ESTABLISH状态，收到SYN报文会发生什么？](/08-network/transport-layer/TCP连接处于ESTABLISH状态，收到SYN报文会发生什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP重传机制是什么？](/08-network/transport-layer/TCP重传机制是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TIME_WAIT过多有什么危害？](/08-network/transport-layer/TIME_WAIT过多有什么危害？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [UDP首部格式有哪些字段？](/08-network/transport-layer/UDP首部格式有哪些字段？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [什么是SYN攻击？半连接和全连接队列？](/08-network/transport-layer/什么是SYN攻击？半连接和全连接队列？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [如何提升TCP性能？](/08-network/transport-layer/如何提升TCP性能？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [既然IP会分片，为什么TCP层还需要MSS？](/08-network/transport-layer/既然IP会分片，为什么TCP层还需要MSS？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [服务端出现大量CLOSE_WAIT状态原因是什么？](/08-network/transport-layer/服务端出现大量CLOSE_WAIT状态原因是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [没有listen能建立TCP连接吗？](/08-network/transport-layer/没有listen能建立TCP连接吗？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。

## 面试复习检查清单

- 能否用 30 秒给出一句话定义？
- 能否口述核心流程、关键状态或算法不变量？
- 能否说出至少 3 个追问点和 2 个易错点？
- 能否结合项目或线上排障讲一个真实场景？
- 能否说明方案边界、风险、优化方向和验证指标？
