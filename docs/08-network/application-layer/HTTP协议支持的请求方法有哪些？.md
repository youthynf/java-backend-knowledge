# HTTP协议支持的请求方法有哪些？

HTTP协议支持的请求方法有哪些？
HTTP协议支持的请求方法：
GET：请求URL标志的文档；
HEAD：请求URL标志的文档的首部；
POST：向服务器发送数据；
PUT：指明的URL下存储一个文档；
DELETE：删除URL标志的文档；
CONNECT：用于代理服务器；
OPTIONS：请求一些选项信息；
TRACE：用来进行环回测试；
PATCH：对PUT方法的补充，用来对已知资源进行局部更新；

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

