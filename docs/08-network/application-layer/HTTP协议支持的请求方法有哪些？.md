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

## 面试总结
### 核心概念

HTTP 方法描述客户端对资源希望执行的语义。常见方法包括 GET、HEAD、POST、PUT、DELETE、PATCH、OPTIONS、TRACE、CONNECT。面试时不仅要背名字，更要说清安全性、幂等性、是否可缓存以及 REST 设计中的使用边界。

### 面试官想考什么

面试官想看你能否把方法语义和接口设计、重试、缓存、代理行为联系起来。例如支付接口为什么不能因为网络超时就盲目重试 POST，资源整体替换为什么更适合 PUT，局部更新为什么用 PATCH。

### 标准回答

GET 获取资源，语义安全且幂等；HEAD 只获取响应头；POST 提交数据或触发处理，通常非幂等；PUT 对目标资源做整体创建或替换，幂等；PATCH 做局部修改，是否幂等取决于补丁语义；DELETE 删除资源，语义幂等但多次返回状态可不同；OPTIONS 查询服务能力，常用于 CORS 预检；CONNECT 建立隧道，常见于 HTTPS 代理；TRACE 用于回显诊断，生产通常禁用。

### 深挖追问

- GET、PUT、DELETE 为什么说是幂等？“响应码相同”是不是幂等的必要条件？
- 浏览器 CORS 预检为什么会发送 OPTIONS？
- DELETE 请求第二次返回 404，是否破坏幂等性？

### 实战场景/代码示例

REST 示例：`GET /orders/1` 查询订单，`POST /orders` 创建订单，`PUT /users/7` 整体替换用户资料，`PATCH /users/7/email` 修改邮箱，`DELETE /cart/items/3` 删除购物车项。对于创建订单这类 POST，要使用业务幂等号防止客户端重试造成重复下单。

### 易错点/总结

不要把方法差异简单说成“GET 参数在 URL，POST 参数在 Body”。协议并不绝对禁止 GET Body，POST 也不天然安全；真正重要的是语义、缓存、幂等和中间件对方法的处理。

