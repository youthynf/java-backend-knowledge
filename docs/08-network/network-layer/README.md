# 网络层

这一部分关注网络分层、协议交互、安全机制和问题排查。复习时要能从一次请求的完整链路解释连接建立、传输、路由、加密和异常定位。

## 面试复习重点

- OSI/TCP-IP 分层、TCP/UDP、HTTP/HTTPS 和 DNS。
- 连接建立、拥塞控制、TLS 握手和常见状态码。
- 网络超时、连接池耗尽、证书异常和抓包定位。

## 建议掌握程度

- **能讲清概念**：先用自己的话解释定义、背景和解决的问题。
- **能画出链路**：把核心流程、关键组件和状态变化串起来。
- **能回答追问**：准备优缺点、适用场景、常见坑和替代方案。
- **能落地排查**：结合日志、指标、工具和案例说明如何定位问题。

## 文章导航

- [ARP协议作用是什么？](/08-network/network-layer/ARP协议作用是什么？.md)
- [CIDR无分类地址是什么？](/08-network/network-layer/CIDR无分类地址是什么？.md)
- [DHCP协议作用是什么？](/08-network/network-layer/DHCP协议作用是什么？.md)
- [ICMP是什么？](/08-network/network-layer/ICMP是什么？.md)
- [IGMP是什么？](/08-network/network-layer/IGMP是什么？.md)
- [IPV4和IPV6有什么区别？](/08-network/network-layer/IPV4和IPV6有什么区别？.md)
- [IP分片与重组机制是什么？](/08-network/network-layer/IP分片与重组机制是什么？.md)
- [IP地址是如何分类的？](/08-network/network-layer/IP地址是如何分类的？.md)
- [NAT网络地址转换是什么？](/08-network/network-layer/NAT网络地址转换是什么？.md)
- [打开网页发生的网络过程是怎么样的？](/08-network/network-layer/打开网页发生的网络过程是怎么样的？.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
