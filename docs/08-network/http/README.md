# HTTP/HTTPS 协议

## 核心概念

HTTP（HyperText Transfer Protocol）是应用层协议，用于 Web 浏览器和服务器之间的通信。HTTPS 是 HTTP 的安全版本，通过 TLS/SSL 加密传输。

### HTTP 版本演进

| 版本 | 年份 | 主要特性 |
|------|------|----------|
| HTTP/0.9 | 1991 | 仅 GET，无头部 |
| HTTP/1.0 | 1996 | POST/HEAD，状态码，头部 |
| HTTP/1.1 | 1997 | 持久连接，管道化，Host 头 |
| HTTP/2 | 2015 | 多路复用，头部压缩，服务器推送 |
| HTTP/3 | 2022 | QUIC 协议，UDP 基础，0-RTT |

---

## HTTP 报文结构

### 请求报文

```
POST /api/users HTTP/1.1          // 请求行：方法 路径 协议版本
Host: api.example.com             // 请求头
Content-Type: application/json
Content-Length: 25
Authorization: Bearer token123

{"name":"John","age":25}          // 请求体
```

### 响应报文

```
HTTP/1.1 201 Created              // 状态行：协议版本 状态码 状态描述
Content-Type: application/json    // 响应头
Content-Length: 45
Date: Mon, 01 Jan 2024 00:00:00 GMT

{"id":1,"name":"John","age":25}   // 响应体
```

---

## HTTP 方法

| 方法 | 描述 | 幂等性 | 安全性 |
|------|------|--------|--------|
| GET | 获取资源 | 是 | 是 |
| POST | 创建资源 | 否 | 否 |
| PUT | 更新资源（全量） | 是 | 否 |
| PATCH | 更新资源（部分） | 否 | 否 |
| DELETE | 删除资源 | 是 | 否 |
| HEAD | 获取响应头 | 是 | 是 |
| OPTIONS | 获取支持的方法 | 是 | 是 |

**幂等性**：多次请求结果相同
**安全性**：不改变服务器状态

```java
// RESTful API 设计
GET    /users          // 获取用户列表
GET    /users/1        // 获取单个用户
POST   /users          // 创建用户
PUT    /users/1        // 更新用户（全量）
PATCH  /users/1        // 更新用户（部分）
DELETE /users/1        // 删除用户
```

---

## HTTP 状态码

### 分类

| 类别 | 含义 |
|------|------|
| 1xx | 信息性响应 |
| 2xx | 成功 |
| 3xx | 重定向 |
| 4xx | 客户端错误 |
| 5xx | 服务端错误 |

### 常见状态码

```
// 2xx 成功
200 OK                 // 请求成功
201 Created            // 创建成功
204 No Content         // 成功但无返回内容

// 3xx 重定向
301 Moved Permanently  // 永久重定向
302 Found              // 临时重定向
304 Not Modified       // 缓存有效

// 4xx 客户端错误
400 Bad Request        // 请求格式错误
401 Unauthorized       // 未认证
403 Forbidden          // 无权限
404 Not Found          // 资源不存在
405 Method Not Allowed // 方法不允许
408 Request Timeout    // 请求超时
429 Too Many Requests  // 请求过多

// 5xx 服务端错误
500 Internal Server Error  // 服务器内部错误
502 Bad Gateway            // 网关错误
503 Service Unavailable    // 服务不可用
504 Gateway Timeout        // 网关超时
```

---

## HTTP 头部

### 请求头

```
Host: www.example.com           // 目标主机（必需）
User-Agent: Mozilla/5.0         // 客户端信息
Accept: text/html               // 接受的内容类型
Accept-Language: zh-CN          // 接受的语言
Accept-Encoding: gzip           // 接受的编码
Content-Type: application/json  // 请求体类型
Content-Length: 100             // 请求体长度
Authorization: Bearer token     // 认证信息
Cookie: session=abc123          // Cookie
Connection: keep-alive          // 连接方式
Cache-Control: no-cache         // 缓存控制
```

### 响应头

```
Content-Type: text/html; charset=utf-8  // 响应体类型
Content-Length: 1234                     // 响应体长度
Content-Encoding: gzip                   // 内容编码
Content-Disposition: attachment          // 下载文件
Set-Cookie: session=xyz; HttpOnly        // 设置 Cookie
Location: /new-url                       // 重定向地址
Cache-Control: max-age=3600              // 缓存策略
ETag: "abc123"                           // 资源标识
Last-Modified: Mon, 01 Jan 2024          // 最后修改时间
Server: nginx/1.20.0                     // 服务器信息
```

---

## HTTP 缓存

### 缓存策略

```
强缓存（不请求服务器）：
Cache-Control: max-age=3600     // 缓存3600秒
Cache-Control: no-cache         // 每次都要验证
Cache-Control: no-store         // 不缓存
Cache-Control: private          // 仅浏览器缓存
Cache-Control: public           // 可被代理缓存

Expires: Mon, 01 Jan 2024       // 过期时间（HTTP/1.0）

协商缓存（需要验证）：
ETag: "abc123"                  // 资源标识
If-None-Match: "abc123"         // 请求验证

Last-Modified: Mon, 01 Jan 2024 // 最后修改时间
If-Modified-Since: Mon, 01 Jan  // 请求验证
```

### 缓存流程

```
浏览器请求资源
    |
    v
强缓存有效？
    | 是 ------------------------> 直接使用缓存（200 from cache）
    | 否
    v
协商缓存验证
    | ETag / Last-Modified
    v
资源未修改？
    | 是 ------------------------> 304 Not Modified（使用缓存）
    | 否
    v
返回新资源 + 新缓存标识（200）
```

---

## Cookie 和 Session

### Cookie

```
// Set-Cookie 响应头
Set-Cookie: session=abc123; Path=/; Domain=.example.com; 
            Max-Age=3600; HttpOnly; Secure; SameSite=Lax

属性：
- Name=Value  Cookie 名称和值
- Domain      作用域名
- Path        作用路径
- Expires     过期时间
- Max-Age     有效期（秒）
- HttpOnly    JavaScript 无法访问（防 XSS）
- Secure      仅 HTTPS 传输
- SameSite    跨站限制（Strict/Lax/None，防 CSRF）
```

```javascript
// 浏览器操作 Cookie
document.cookie = "name=John; max-age=3600; path=/";

// 读取 Cookie
const cookies = document.cookie;  // "name=John; session=abc123"

// 删除 Cookie（设置过期时间为过去）
document.cookie = "name=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
```

### Session

```
工作流程：
1. 用户登录
2. 服务器创建 Session，生成 Session ID
3. 通过 Set-Cookie 发送 Session ID
4. 浏览器后续请求携带 Cookie
5. 服务器根据 Session ID 查找 Session

Session 存储方式：
- 内存：简单但重启丢失，不支持分布式
- Redis：支持分布式，推荐
- 数据库：持久化但性能较低
```

### Cookie vs Session

| 特性 | Cookie | Session |
|------|--------|---------|
| 存储位置 | 浏览器 | 服务器 |
| 安全性 | 较低 | 较高 |
| 存储大小 | 4KB | 无限制 |
| 性能 | 快 | 需服务器查询 |
| 分布式支持 | 天然支持 | 需共享存储 |

---

## HTTPS

### TLS/SSL 握手

```
客户端                                      服务端
   |                                          |
   |-------- Client Hello --------------->   |
   |        支持的TLS版本、加密套件           |
   |        随机数 Random1                   |
   |                                          |
   |<------- Server Hello ----------------   |
   |        选定的TLS版本、加密套件           |
   |        随机数 Random2                   |
   |        证书                              |
   |                                          |
   |-------- Certificate Verify ---------->  |
   |        验证证书                          |
   |        生成预主密钥 Pre-Master Secret    |
   |        用公钥加密发送                    |
   |                                          |
   |        双方计算：                        |
   |        Master Secret = PRF(Random1,     |
   |          Random2, Pre-Master Secret)    |
   |                                          |
   |-------- Change Cipher Spec --------->   |
   |-------- Finished ------------------->   |
   |                                          |
   |<------- Change Cipher Spec -----------   |
   |<------- Finished --------------------   |
   |                                          |
   |        加密通信开始                      |
```

### 证书验证

```
证书链：
根证书 CA
    |
    v
中间证书
    |
    v
服务器证书

验证过程：
1. 浏览器检查证书是否过期
2. 验证证书签名是否有效
3. 检查证书域名是否匹配
4. 验证证书链到根证书
5. 检查证书吊销状态（CRL/OCSP）
```

### HTTPS 优势

```
1. 数据加密：防止窃听
2. 身份验证：防止冒充
3. 数据完整性：防止篡改

性能影响：
- 握手增加 1-2 个 RTT
- 加解密消耗 CPU
- HTTP/2 必须使用 HTTPS
- 会话复用减少握手开销
```

---

## HTTP/2

### 核心特性

```javascript
// 1. 二进制分帧
// HTTP/1.1 文本协议
GET /index.html HTTP/1.1\r\n
Host: example.com\r\n
\r\n

// HTTP/2 二进制帧
+-----------------------------------------------+
|                 Length (24)                   |
+---------------+---------------+---------------+
|   Type (8)    |   Flags (8)   |
+-+-------------+---------------+-------------------------------+
|R|                 Stream Identifier (31)                      |
+=+=============================================================+
|                   Frame Payload (0...)                      ...
+---------------------------------------------------------------+

// 2. 多路复用
// 单个 TCP 连接并行多个请求
Stream 1: Request A -> Response A
Stream 3: Request B -> Response B  // 可以乱序
Stream 5: Request C -> Response C

// 3. 头部压缩（HPACK）
// 使用 Huffman 编码和索引表
// 相同头部只发送一次

// 4. 服务器推送
// 服务端主动推送资源
Push Promise: /style.css
Push Promise: /script.js
```

### HTTP/1.1 vs HTTP/2

| 特性 | HTTP/1.1 | HTTP/2 |
|------|----------|--------|
| 传输格式 | 文本 | 二进制 |
| 多路复用 | 否（需多连接） | 是 |
| 头部压缩 | 否 | HPACK |
| 服务器推送 | 否 | 是 |
| 优先级 | 无 | 有 |
| 队头阻塞 | 有 | 无（应用层） |

---

## HTTP/3 (QUIC)

### 核心特性

```
1. 基于 UDP
   - 避免 TCP 队头阻塞
   - 更快的连接建立

2. 0-RTT 连接
   - 复用之前的会话密钥
   - 立即发送数据

3. 连接迁移
   - 使用 Connection ID
   - 网络切换不断连

4. 改进的拥塞控制
   - 可插拔的拥塞控制算法
   - 更精确的 RTT 测量
```

### 为什么选择 UDP？

```
TCP 问题：
- 队头阻塞：一个丢包阻塞所有流
- 连接建立慢：三次握手 + TLS 握手
- 不支持连接迁移：IP/端口变化断连

QUIC 优势：
- 独立流：一个丢包不影响其他流
- 快速建立：0-RTT 或 1-RTT
- 连接迁移：网络切换不断连
```

---

## CORS 跨域

### 同源策略

```
同源 = 协议 + 域名 + 端口 相同

http://example.com/page1
http://example.com/page2       // 同源
https://example.com/page1      // 不同源（协议不同）
http://example.com:8080/page1  // 不同源（端口不同）
http://sub.example.com/page1   // 不同源（域名不同）
```

### CORS 请求

```
// 简单请求
GET /api/users HTTP/1.1
Host: api.example.com
Origin: http://example.com

// 响应
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://example.com
Access-Control-Allow-Credentials: true

// 预检请求（非简单请求）
OPTIONS /api/users HTTP/1.1
Host: api.example.com
Origin: http://example.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type

// 预检响应
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

### 服务端配置

```java
// Spring Boot
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins("https://example.com")
            .allowedMethods("GET", "POST", "PUT", "DELETE")
            .allowedHeaders("*")
            .allowCredentials(true)
            .maxAge(3600);
    }
}

// 或使用 @CrossOrigin 注解
@CrossOrigin(origins = "https://example.com")
@RestController
public class UserController {
    // ...
}
```

---

## 面试高频问题

### 1. GET 和 POST 的区别？

| 特性 | GET | POST |
|------|-----|------|
| 参数位置 | URL | 请求体 |
| 参数长度 | URL 长度限制 | 无限制 |
| 安全性 | 参数暴露 | 相对安全 |
| 幂等性 | 是 | 否 |
| 缓存 | 可被缓存 | 不可缓存 |
| 历史记录 | 可保留 | 不保留 |
| 书签 | 可收藏 | 不可收藏 |

**本质区别**：GET 是获取资源，POST 是提交数据。

### 2. HTTP 状态码 301 和 302 的区别？

```
301 Moved Permanently
- 永久重定向
- 浏览器会缓存新地址
- SEO 权重转移
- 场景：域名变更、HTTP 转 HTTPS

302 Found / 307 Temporary Redirect
- 临时重定向
- 浏览器不缓存
- SEO 权重不转移
- 场景：临时维护、A/B 测试

308 Permanent Redirect
- 永久重定向，不改变请求方法和体
- 替代 301

307 Temporary Redirect
- 临时重定向，不改变请求方法和体
- 替代 302
```

### 3. HTTP/1.1 如何解决队头阻塞？

```
问题：
HTTP/1.1 管道化（Pipelining）仍存在队头阻塞
前一个请求阻塞，后续请求无法响应

解决方案：
1. 多个 TCP 连接（浏览器限制 6 个/域名）
2. 域名分片（多个子域名）
3. 升级到 HTTP/2（多路复用）
```

### 4. HTTPS 为什么安全？

```
1. 数据加密
   - 使用对称加密（AES）加密数据
   - 密钥由 TLS 握手协商

2. 身份验证
   - 服务器证书由 CA 签名
   - 浏览器验证证书链

3. 数据完整性
   - 使用 MAC（消息认证码）
   - 防止数据被篡改

4. 防止中间人攻击
   - 证书验证确保服务器身份
   - 加密防止内容被窃听
```

### 5. 什么是跨域？如何解决？

```
跨域：浏览器同源策略限制，不同源的资源不能互相访问

解决方案：

1. CORS（推荐）
   - 服务端设置 Access-Control-Allow-Origin

2. JSONP（仅 GET）
   - 利用 <script> 标签不受同源限制
   - 返回 JavaScript 回调

3. 代理服务器
   - Nginx 反向代理
   - 开发环境代理

4. WebSocket
   - 不受同源策略限制

5. postMessage
   - 跨窗口通信
```

---

## 实战场景

### 场景1：大文件上传

```javascript
// 前端分片上传
async function uploadFile(file) {
  const CHUNK_SIZE = 5 * 1024 * 1024;  // 5MB
  const chunks = Math.ceil(file.size / CHUNK_SIZE);
  
  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    
    const formData = new FormData();
    formData.append('file', chunk);
    formData.append('chunkIndex', i);
    formData.append('totalChunks', chunks);
    formData.append('fileHash', await calculateHash(file));
    
    await fetch('/api/upload/chunk', {
      method: 'POST',
      body: formData
    });
  }
  
  // 合并分片
  await fetch('/api/upload/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileHash, fileName: file.name })
  });
}

// 计算文件 Hash
async function calculateHash(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

```java
// 后端分片上传处理
@RestController
public class UploadController {
    
    @PostMapping("/upload/chunk")
    public void uploadChunk(
        @RequestParam("file") MultipartFile file,
        @RequestParam("chunkIndex") int chunkIndex,
        @RequestParam("fileHash") String fileHash
    ) {
        // 保存分片到临时目录
        Path chunkPath = Paths.get("/tmp", fileHash, String.valueOf(chunkIndex));
        Files.createDirectories(chunkPath.getParent());
        Files.copy(file.getInputStream(), chunkPath);
    }
    
    @PostMapping("/upload/merge")
    public void mergeChunks(@RequestBody MergeRequest request) {
        Path targetPath = Paths.get("/uploads", request.getFileName());
        try (OutputStream os = Files.newOutputStream(targetPath)) {
            for (int i = 0; i < request.getTotalChunks(); i++) {
                Path chunkPath = Paths.get("/tmp", request.getFileHash(), String.valueOf(i));
                Files.copy(chunkPath, os);
                Files.delete(chunkPath);
            }
        }
    }
}
```

### 场景2：接口防刷

```java
// 方案1：限流注解
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {
    int value() default 100;      // 请求数
    int duration() default 60;    // 秒
}

@Aspect
@Component
public class RateLimitAspect {
    private final RedisTemplate<String, Integer> redisTemplate;
    
    @Around("@annotation(rateLimit)")
    public Object around(ProceedingJoinPoint point, RateLimit rateLimit) throws Throwable {
        String key = "rate_limit:" + point.getSignature().toLongString();
        Integer count = redisTemplate.opsForValue().get(key);
        
        if (count != null && count >= rateLimit.value()) {
            throw new RuntimeException("请求过于频繁");
        }
        
        redisTemplate.opsForValue().increment(key);
        if (count == null) {
            redisTemplate.expire(key, rateLimit.duration(), TimeUnit.SECONDS);
        }
        
        return point.proceed();
    }
}

// 方案2：滑动窗口
public class SlidingWindow {
    private final int limit;
    private final long windowMs;
    private final LinkedList<Long> timestamps = new LinkedList<>();
    
    public synchronized boolean tryAcquire() {
        long now = System.currentTimeMillis();
        long start = now - windowMs;
        
        // 移除过期时间戳
        while (!timestamps.isEmpty() && timestamps.peekFirst() < start) {
            timestamps.pollFirst();
        }
        
        if (timestamps.size() < limit) {
            timestamps.addLast(now);
            return true;
        }
        return false;
    }
}
```

### 场景3：防止重复提交

```java
// 方案1：前端防抖
const submit = debounce(async (data) => {
  await fetch('/api/submit', { method: 'POST', body: JSON.stringify(data) });
}, 1000);

// 方案2：后端幂等性控制
@RestController
public class OrderController {
    
    @PostMapping("/order")
    @Idempotent(key = "#request.orderId", expire = 10)
    public Order createOrder(@RequestBody OrderRequest request) {
        return orderService.create(request);
    }
}

// 幂等性注解实现
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Idempotent {
    String key();
    int expire() default 10;
}

@Aspect
@Component
public class IdempotentAspect {
    private final RedisTemplate<String, String> redisTemplate;
    
    @Around("@annotation(idempotent)")
    public Object around(ProceedingJoinPoint point, Idempotent idempotent) throws Throwable {
        String key = "idempotent:" + parseKey(point, idempotent.key());
        
        Boolean success = redisTemplate.opsForValue()
            .setIfAbsent(key, "1", idempotent.expire(), TimeUnit.SECONDS);
        
        if (!success) {
            throw new RuntimeException("请勿重复提交");
        }
        
        return point.proceed();
    }
}
```

---

## 延伸思考

### Q1: HTTP/2 多路复用会完全消除队头阻塞吗？

不会。HTTP/2 解决了 HTTP 层的队头阻塞，但 TCP 层仍存在：
- 一个 TCP 丢包会阻塞所有流
- 需要等待重传才能继续
- HTTP/3 通过 QUIC（UDP）彻底解决

### Q2: 为什么要有 OPTIONS 预检请求？

- 保护旧服务器的兼容性
- 让服务器有机会拒绝跨域请求
- 避免直接发送可能有副作用的请求

### Q3: HTTPS 握手会影响多少性能？

- 首次连接：增加 1-2 个 RTT
- 会话复用：0 RTT（HTTP/3）或 1 RTT（TLS 1.2）
- 加解密：现代 CPU 影响很小（<5%）
- 优化手段：OCSP Stapling、Session Ticket、HTTP/2

---

## 参考资料

- [RFC 7230-7235: HTTP/1.1](https://www.rfc-editor.org/rfc/rfc7230)
- [RFC 7540: HTTP/2](https://www.rfc-editor.org/rfc/rfc7540)
- [RFC 9000: QUIC](https://www.rfc-editor.org/rfc/rfc9000)
- 《图解 HTTP》
- 《HTTP 权威指南》
- [MDN Web Docs: HTTP](https://developer.mozilla.org/zh-CN/docs/Web/HTTP)