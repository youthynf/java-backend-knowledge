# localStorage和Cookie区别是什么？

localStorage和Cookie区别是什么？
localStorage和Cookie区别：
存储容量：Cookie 的存储容量通常较小，每个 Cookie 的大小限制在几 KB 左右。而 LocalStorage 的存储容量通常较大，一般限制在几 MB 左右。因此,如果需要存储大量数据，LocalStorage 通常更适合；
数据发送：Cookie 在每次 HTTP 请求中都会自动发送到服务器，这使得 Cookie 适合用于在客户端和服务器之间传递数据；而localStorage 的数据不会自动发送到服务器,它仅在浏览器端存储数据，因此 LocalStorage 适合用于在同一域名下的不同页面之间共享数据；
生命周期：Cookie 可以设置一个过期时间，使得数据在指定时间后自动过期。而 LocalStorage 的数据将永久存储在浏览器中，除非通过 JavaScript 代码手动删除；
安全性：Cookie 的安全性较低，因为 Cookie 在每次 HTTP 请求中都会自动发送到服务器，存在被窃取或篡改的风,险。而 LocalStorage 的数据仅在浏览器端存储,不会自动发送到服务器，相对而言更安全一些。

什么数据应该存在到cookie，什么数据存放到 Localstorage：
Cookie 适合用于在客户端和服务器之间传递数据、跨域访问和设置过期时间，而 LocalStorage 适合用于在同一域名下的不同页面之间共享数据、存储大量数据和永久存储数据。

## 面试总结
### 核心概念

Cookie、Session、Token、JWT 都用于解决 HTTP 无状态下的身份和会话问题。Cookie 是客户端存储和自动携带机制，Session 是服务端会话，Token/JWT 通常由客户端携带并由服务端校验。

### 面试官想考什么

面试官想考登录态存储位置、安全风险、分布式 Session、JWT 优缺点以及 Cookie 被禁用时的替代方案。

### 标准回答

Session 数据在服务端，客户端只保存 SessionId；Token/JWT 可减少服务端会话存储压力，但撤销、过期和泄露处理要设计好。Cookie 会自动随域名请求携带，localStorage 不会自动携带但容易被 XSS 读取。敏感令牌要配合 HTTPS、HttpOnly、SameSite、短有效期和刷新机制。

### 深挖追问

- 这个行为发生在浏览器、客户端库、代理网关还是后端服务？
- 如果接口偶发超时/失败，如何用 curl、DevTools、网关日志和 tcpdump 分层验证？
- 连接池、缓存、CDN、TLS 或反向代理配置会怎样改变现象？

### 实战场景/示例

前后端分离系统可用 Authorization Bearer Token；传统 Web 可用 Session + Cookie。分布式部署时 Session 通常外置到 Redis。

### 易错点/总结

JWT 不是加密本身，默认只是签名防篡改，载荷不要放敏感明文。

