# HTTP、SOCKET和GET的区别是什么？

HTTP、SOCKET和GET的区别是什么？
HTTP是应用层协议，定义了客户端和服务器之间交换的数据格式和规则；Socket是通信的一端，提供了网络通信的接口；TCP是传输层协议，负责在网络中建立可靠的数据传输连接。它们在网络通信中扮演不同的角色和层次。
HTTP是一种用于传输超文本数据的应用层协议，用于在客户端和服务器之间传输和显示Web页面。
Socket用于描述通信链路的一端，提供了底层的通信接口，可实现不同计算机之间的数据交换，是计算机,网络中的一种抽象，。
TCP是一种面向连接的、可靠的传输层协议，负责在通信的两端之间建立可靠的数据传输连接

## 面试总结
### 核心概念

HTTP 是应用层请求-响应协议，报文由起始行、Header、空行和 Body 组成。它本身无状态，状态通常靠 Cookie、Session、Token 或业务参数维护。

### 面试官想考什么

面试官常考 GET/POST 区别、常见 Header、长连接、无状态、报文结构以及 HTTP 与 TCP Socket 的关系。

### 标准回答

GET 通常用于查询，参数常在 URL，语义应安全幂等；POST 常用于提交资源或触发处理，Body 承载数据。HTTP 运行在 TCP/TLS 之上，Socket 是更底层的编程接口。常见 Header 包括 Host、Content-Type、Accept、Authorization、Cookie、Cache-Control、User-Agent、Connection。

### 深挖追问

- 这个行为发生在浏览器、客户端库、代理网关还是后端服务？
- 如果接口偶发超时/失败，如何用 curl、DevTools、网关日志和 tcpdump 分层验证？
- 连接池、缓存、CDN、TLS 或反向代理配置会怎样改变现象？

### 实战场景/示例

REST 接口设计中，查询订单用 GET，创建订单用 POST；即使 POST 因网络重试被重复提交，也要靠业务幂等号避免重复下单。

### 易错点/总结

GET 和 POST 的本质差异主要是语义和协议使用约定，不是“GET 一定没有 Body”或“POST 一定更安全”。

