# HTTP的长连接怎么理解？

HTTP的长连接怎么理解？
HTTP 协议采用的是「请求-应答」的模式，也就是客户端发起了请求，服务端才会返回响应，一来一回这样子。由于 HTTP 是基于 TCP 传输协议实现的，客户端与服务端要进行 HTTP 通信前，需要先建立 TCP 连接，然后客户端发送 HTTP 请求，服务端收到后就返回响应，至此「请求-应答」的模式就完成了，随后就会释放 TCP 连接。

HTTP短连接：
HTTP短连接每次请求都要经历这样的过程：建立 TCP ->请求资源 ->响应资源 ->释放连接，性能开销大；

HTTP长连接：
HTTP 的 Keep-Alive 实现在第一个 HTTP 请求完后，先不断开 TCP 连接，让后续的 HTTP 请求继续使用此连接，可以使用同一个 TCP 连接来发送和接收多个 HTTP 请求/应答避免了连接建立和释放的开销。HTTP 长连接的特点是，只要任意一端没有明确提出断开连接，则保持 TCP 连接状态

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

