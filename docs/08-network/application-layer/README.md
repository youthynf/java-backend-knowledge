# application-layer

- [既然有HTTP为什么还需要WebSocket？](08-network/application-layer/既然有HTTP为什么还需要WebSocket？.md)
- [既然有HTTP为什么还要有RPC？](08-network/application-layer/既然有HTTP为什么还要有RPC？.md)
- [如果客户端禁用了cookie，session还能用吗？](08-network/application-layer/如果客户端禁用了cookie，session还能用吗？.md)
- [应用层常用协议有哪些？](08-network/application-layer/应用层常用协议有哪些？.md)
- [Cookie和Session区别是什么？](08-network/application-layer/Cookie和Session区别是什么？.md)
- [DNS底层使用TCP还是UDP？](08-network/application-layer/DNS底层使用TCP还是UDP？.md)
- [DNS是什么？](08-network/application-layer/DNS是什么？.md)
- [DNS域名解析的工作流程是怎么样的？](08-network/application-layer/DNS域名解析的工作流程是怎么样的？.md)
- [GET和POST的区别是什么？](08-network/application-layer/GET和POST的区别是什么？.md)
- [HTTP1.0与HTTP2.0区别是什么？](08-network/application-layer/HTTP1.0与HTTP2.0区别是什么？.md)
- [HTTP1.1队头阻塞是什么？](08-network/application-layer/HTTP1.1队头阻塞是什么？.md)
- [HTTP1.1如何对请求拆包？](08-network/application-layer/HTTP1.1如何对请求拆包？.md)
- [HTTP-2的HPACK对头阻塞问题是什么？](08-network/application-layer/HTTP-2的HPACK对头阻塞问题是什么？.md)
- [HTTP-2是什么？](08-network/application-layer/HTTP-2是什么？.md)
- [HTTP-3是什么？](08-network/application-layer/HTTP-3是什么？.md)
- [HTTP常见的状态码有哪些？](08-network/application-layer/HTTP常见的状态码有哪些？.md)
- [HTTP的报文结构是怎么样的？](08-network/application-layer/HTTP的报文结构是怎么样的？.md)
- [HTTP的长连接怎么理解？](08-network/application-layer/HTTP的长连接怎么理解？.md)
- [HTTP的无状态怎么理解？](08-network/application-layer/HTTP的无状态怎么理解？.md)
- [HTTP各个版本是如何管理多个TCP连接的？](08-network/application-layer/HTTP各个版本是如何管理多个TCP连接的？.md)
- [HTTP和HTTPS区别是什么？](08-network/application-layer/HTTP和HTTPS区别是什么？.md)
- [HTTP进行TCP连接之后，什么情况下会中断？](08-network/application-layer/HTTP进行TCP连接之后，什么情况下会中断？.md)
- [HTTP为什么不安全？](08-network/application-layer/HTTP为什么不安全？.md)
- [HTTP协议常见的请求头有哪些？](08-network/application-layer/HTTP协议常见的请求头有哪些？.md)
- [HTTP协议支持的请求方法有哪些？](08-network/application-layer/HTTP协议支持的请求方法有哪些？.md)
- [HTTPS如何防范中间人攻击？](08-network/application-layer/HTTPS如何防范中间人攻击？.md)
- [HTTPS如何优化？](08-network/application-layer/HTTPS如何优化？.md)
- [HTTPS握手过程是怎么样的？](08-network/application-layer/HTTPS握手过程是怎么样的？.md)
- [HTTP、SOCKET和GET的区别是什么？](08-network/application-layer/HTTP、SOCKET和GET的区别是什么？.md)
- [JWT令牌是什么？](08-network/application-layer/JWT令牌是什么？.md)
- [localStorage和Cookie区别是什么？](08-network/application-layer/localStorage和Cookie区别是什么？.md)
- [SSL与TSL有什么联系？](08-network/application-layer/SSL与TSL有什么联系？.md)
- [token、session、cookie区别是什么？](08-network/application-layer/token、session、cookie区别是什么？.md)

<!-- 面试复习补充 -->

## 面试复习补充

### 核心概念

本页是 `application-layer` 相关知识的目录入口。复习时要把目录中的零散问题串成一条后端链路：请求如何进入系统、如何被转发/处理、如何保证可靠性、性能和安全。

### 面试官想考什么

面试官通常不是考你能否背出目录，而是看你能否建立知识地图：哪些概念属于基础机制，哪些属于工程落地，线上出现问题时如何定位到具体层次或组件。

### 标准回答

可以先给出总览，再按高频问题展开：核心概念是什么、解决什么痛点、在 Java 后端中出现在哪里、关键参数或边界条件是什么、如果线上异常应该看哪些指标。

### 深挖追问

- 这个目录中哪些知识点最容易和实际线上故障关联？
- 相邻组件或协议的职责边界是什么？
- 如果只允许你重点复习三类问题，你会选哪些？

### 实战场景/示例

例如排查一次接口超时，可能同时涉及 DNS、TCP 连接、TLS 握手、HTTP 连接池、网关转发、Tomcat 线程池、MQ 异步链路和下游存储。目录复习要服务于这种端到端分析。

### 易错点/总结

不要只背名词。面试回答要能落到“现象、原因、排查、解决、预防”五步。

