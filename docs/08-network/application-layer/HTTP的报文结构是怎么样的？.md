# HTTP的报文结构是怎么样的？

HTTP的报文结构是怎么样的？
HTTP是面向文本的，其报文中的每一个字段都是一些ASCII码串，并且每个字段的长度都是不确定的。HTTP报文分为请求报文和响应报文来说明。

请求报文结构：
请求行：包含请求方法、请求目标（URL或URI）和HTTP协议版本；
请求头部：包含关于请求的附加信息，如Host、User-Agent、Content-Type等；
空行：请求头部和请求体之间用空行分隔；
请求体：可选，包含请求的数据，通常用于POST请求等需要传输数据的情况。

响应报文结构：
状态行：包含HTTP协议版本、状态码和状态信息；
响应头部：包含关于响应的附加信息，如Content-Type、Content-Length等；
空行：响应头部和响应体之间用空行分隔；
响应体：包含响应的数据，通常是服务器返回的HTML、JSON等内容。

<!-- 面试复习补充 -->

## 面试复习补充

### 核心概念

HTTP 是应用层请求-响应协议，报文由起始行、Header、空行和 Body 组成。它本身无状态，状态通常靠 Cookie、Session、Token 或业务参数维护。

### 面试官想考什么

面试官常考 GET/POST 区别、常见 Header、长连接、无状态、报文结构以及 HTTP 与 TCP Socket 的关系。

### 标准回答

GET 通常用于查询，参数常在 URL，语义应安全幂等；POST 常用于提交资源或触发处理，Body 承载数据。HTTP 运行在 TCP/TLS 之上，Socket 是更底层的编程接口。常见 Header 包括 Host、Content-Type、Accept、Authorization、Cookie、Cache-Control、User-Agent、Connection。

### 深挖追问

- 如果线上出现超时/失败，如何验证是不是这个环节？
- 它和相邻层协议的职责边界是什么？
- 有哪些参数或默认行为会影响生产表现？

### 实战场景/示例

REST 接口设计中，查询订单用 GET，创建订单用 POST；即使 POST 因网络重试被重复提交，也要靠业务幂等号避免重复下单。

### 易错点/总结

GET 和 POST 的本质差异主要是语义和协议使用约定，不是“GET 一定没有 Body”或“POST 一定更安全”。

