# HTTP进行TCP连接之后，什么情况下会中断？

HTTP进行TCP连接之后，什么情况下会中断？
通信一方主动断开：
当服务端或者客户端执行 close 系统调用的时候，会发送FIN报文，就会进行四次挥手的过程；
超时重传次数超限：
当发送方发送了数据之后，接收方超过一段时间没有响应ACK报文，发送方重传数据达到最大次数的时候，就会断开TCP连接；
长时间没有通信：
当HTTP长时间没有进行请求和响应的时候，超过一定的时间，就会释放连接；
单TCP复用次数超限：
一个TCP连接复用的HTTP请求数量超过一定阈值也会断开连接。

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

