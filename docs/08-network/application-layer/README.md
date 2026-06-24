# 应用层协议

本目录覆盖 HTTP、HTTPS、Cookie/Session、WebSocket、DNS、RPC 等应用层高频题。

## 复习建议

- 先用导航建立知识地图，再逐篇补齐自己的项目案例。
- 每篇文章复习时都按“核心概念 → 面试官想考什么 → 标准回答 → 深挖追问 → 示例/实战场景 → 易错点/总结”检查。
- 遇到协议、架构或排障题时，主动补充异常分支、监控指标和工程取舍。

## 文章导航

### 基础文章

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

## 面试复习检查清单

- 能否用 30 秒给出一句话定义？
- 能否口述核心流程、关键状态或算法不变量？
- 能否说出至少 3 个追问点和 2 个易错点？
- 能否结合项目或线上排障讲一个真实场景？
- 能否说明方案边界、风险、优化方向和验证指标？
