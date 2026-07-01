# 应用层

本目录覆盖 HTTP/HTTPS、DNS、CDN、邮件协议、WebSocket、RPC 等应用层高频知识点。

## 目录

### HTTP 基础

- [HTTP 的报文结构是怎么样的](HTTP的报文结构是怎么样的？.md) — 起始行 + 头部 + 空行 + 正文，HTTP/2 二进制分帧
- [HTTP 协议支持的请求方法有哪些](HTTP协议支持的请求方法有哪些？.md) — GET/POST/PUT/PATCH/DELETE 等方法的安全与幂等性
- [HTTP 常见的状态码有哪些](HTTP常见的状态码有哪些？.md) — 1xx-5xx 状态码语义与 401/403、502/504 区别
- [HTTP 协议常见的请求头有哪些](HTTP协议常见的请求头有哪些？.md) — Host、Authorization、Cookie、X-Forwarded-For 等头部用途
- [GET 和 POST 的区别是什么](GET和POST的区别是什么？.md) — 语义差异：安全幂等 vs 不安全不幂等
- [HTTP 的无状态怎么理解](HTTP的无状态怎么理解？.md) — 协议不维护请求间状态，Cookie/Session/Token 是应用层方案
- [HTTP 的长连接怎么理解](HTTP的长连接怎么理解？.md) — keep-alive 复用 TCP 连接，HTTP/2 多路复用
- [HTTP 进行 TCP 连接之后什么情况下会中断](HTTP进行TCP连接之后，什么情况下会中断？.md) — 主动关闭、超时、重传超限、RST 等场景
- [HTTP、SOCKET 和 GET 的区别是什么](HTTP、SOCKET和GET的区别是什么？.md) — 协议、接口、方法三个不同维度的概念

### HTTP 版本演进

- [HTTP/2 是什么](HTTP-2是什么？.md) — 二进制分帧、多路复用、HPACK、服务端推送
- [HTTP/3 是什么](HTTP-3是什么？.md) — 基于 QUIC，解决 TCP 队头阻塞与连接迁移
- [HTTP 1.0 与 HTTP 2.0 区别是什么](HTTP1.0与HTTP2.0区别是什么？.md) — 短连接 vs 多路复用，文本 vs 二进制
- [HTTP 各个版本是如何管理多个 TCP 连接的](HTTP各个版本是如何管理多个TCP连接的？.md) — 每请求 1 连接 → 6 连接 → 单连接多路复用
- [HTTP 1.1 队头阻塞是什么](HTTP1.1队头阻塞是什么？.md) — 串行请求-响应模型的应用层 HOL
- [HTTP/2 的 HPACK 队头阻塞问题是什么](HTTP-2的HPACK对头阻塞问题是什么？.md) — 动态表时序依赖，QPACK 的解决
- [HTTP 1.1 如何对请求拆包](HTTP1.1如何对请求拆包？.md) — Content-Length 与 Transfer-Encoding: chunked

### HTTP 缓存与安全

- [HTTP 缓存机制是怎么样的](HTTP缓存机制是怎么样的？.md) — 强缓存与协商缓存，Cache-Control/ETag
- [HTTP 为什么不安全](HTTP为什么不安全？.md) — 窃听、篡改、伪装三大风险
- [HTTP 和 HTTPS 区别是什么](HTTP和HTTPS区别是什么？.md) — HTTP over TLS 的三大保障
- [HTTPS 握手过程是怎么样的](HTTPS握手过程是怎么样的？.md) — TLS 1.2 vs 1.3 握手流程与密钥协商
- [HTTPS 如何优化](HTTPS如何优化？.md) — TLS 1.3、会话复用、OCSP Stapling、ECDSA 证书
- [HTTPS 如何防范中间人攻击](HTTPS如何防范中间人攻击？.md) — 证书认证 + 密钥协商 + 完整性校验
- [SSL 与 TLS 有什么联系](SSL与TSL有什么联系？.md) — TLS 是 SSL 的标准化继任者，SSL 已废弃

### 会话与认证

- [Cookie 和 Session 区别是什么](Cookie和Session区别是什么？.md) — 客户端存储 vs 服务端会话
- [Token、Session、Cookie 区别是什么](token、session、cookie区别是什么？.md) — 三个不同维度的概念对比
- [JWT 令牌是什么](JWT令牌是什么？.md) — 自包含令牌，Header.Payload.Signature 三段式
- [localStorage 和 Cookie 区别是什么](localStorage和Cookie区别是什么？.md) — 通信设计 vs 纯客户端存储
- [如果客户端禁用了 Cookie，Session 还能用吗](如果客户端禁用了cookie，session还能用吗？.md) — URL 重写、隐藏表单、改用 Token

### DNS 与 CDN

- [DNS 是什么](DNS是什么？.md) — 域名系统层次化结构与解析流程
- [DNS 域名解析的工作流程是怎么样的](DNS域名解析的工作流程是怎么样的？.md) — 浏览器/OS/hosts/本地 DNS 多级缓存与迭代查询
- [DNS 底层使用 TCP 还是 UDP](DNS底层使用TCP还是UDP？.md) — 默认 UDP，大响应与区域传送用 TCP
- [CDN 是什么](CDN是什么？.md) — 边缘节点缓存、就近访问、回源机制

### 实时通信与 RPC

- [既然有 HTTP 为什么还需要 WebSocket](既然有HTTP为什么还需要WebSocket？.md) — 全双工通信解决服务端主动推送
- [既然有 HTTP 为什么还要有 RPC](既然有HTTP为什么还要有RPC？.md) — 内部微服务调用的高性能与治理优势

### 其他应用层协议

- [应用层常用协议有哪些](应用层常用协议有哪些？.md) — HTTP/DNS/SMTP/FTP/SNMP/MQTT 等协议分类
- [邮件协议有哪些](邮件协议有哪些？.md) — SMTP 发送、POP3/IMAP 接收的完整邮件流程
