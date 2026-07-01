# HTTP 协议常见的请求头有哪些

## 核心概念

HTTP 请求头是请求报文中"起始行之后、空行之前"的部分，按 `Name: Value` 格式逐行排列，每个头表达一个维度的信息：客户端环境、期望的响应格式、身份凭证、缓存策略、连接控制等。掌握常见请求头是阅读抓包输出、调试跨域、优化性能、设计 API 的基础。

## 标准回答

按用途分类的常见请求头：

| 类别 | 头部 | 用途 |
|------|------|------|
| 通用 | Host、Connection、Date、Cache-Control | 请求和响应都用 |
| 客户端环境 | User-Agent、Accept、Accept-Language、Accept-Encoding | 告知服务端客户端能力 |
| 身份认证 | Authorization、Cookie | 携带凭证 |
| 内容描述 | Content-Type、Content-Length、Content-Encoding | 描述请求体 |
| 跨域 | Origin、Access-Control-Request-Method | CORS 触发 |
| 缓存 | If-Modified-Since、If-None-Match、Cache-Control | 协商缓存 |
| 转发 | X-Forwarded-For、X-Forwarded-Proto、Via | 代理链路 |
| 自定义 | X-Request-Id、X-Trace-Id | 链路追踪 |

## 详细机制

### 客户端环境头

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
Accept-Encoding: gzip, deflate, br
```

- **User-Agent**：客户端类型（浏览器、操作系统、引擎版本）。服务端可据此返回不同页面
- **Accept**：客户端能接受的 MIME 类型，按优先级排序（q 值 0-1）
- **Accept-Language**：能接受的语言
- **Accept-Encoding**：能解压的编码（gzip、br、deflate）

### 身份认证头

```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0...
Cookie: sessionId=abc123; userId=42; theme=dark
```

- **Authorization**：标准认证头，格式 `Scheme credentials`。常见 Scheme：Basic、Bearer、Digest
- **Cookie**：浏览器自动携带的 Cookie 字符串，多个用 `;` 分隔

### 内容描述头

```
Content-Type: application/json; charset=UTF-8
Content-Length: 256
Content-Encoding: gzip
Transfer-Encoding: chunked
```

- **Content-Type**：请求体的 MIME 类型。常见：`application/json`、`application/x-www-form-urlencoded`、`multipart/form-data`、`text/plain`
- **Content-Length**：请求体字节数
- **Transfer-Encoding: chunked**：分块传输，与 Content-Length 互斥

### 跨域头

```
Origin: https://app.example.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type, Authorization
```

浏览器发起跨域请求时自动带上 Origin。复杂请求（如 POST JSON）会先发 OPTIONS 预检，预检请求带 `Access-Control-Request-*`。

### 缓存头

```
Cache-Control: no-cache
If-Modified-Since: Wed, 01 Jan 2025 10:00:00 GMT
If-None-Match: "abc123"
```

- **Cache-Control: no-cache**：客户端要求"不直接用缓存，必须先验证"
- **If-Modified-Since**：上次响应的 Last-Modified 值
- **If-None-Match**：上次响应的 ETag 值

服务端返回 304 表示资源未修改，客户端用本地缓存。

### 转发头（代理场景）

```
X-Forwarded-For: 203.0.113.1, 70.41.3.18
X-Forwarded-Proto: https
X-Real-IP: 203.0.113.1
Via: 1.1 proxy1.example.com, 1.1 proxy2.example.com
```

- **X-Forwarded-For（XFF）**：客户端真实 IP 链路。每经过一个代理追加一个 IP
- **X-Forwarded-Proto**：客户端原始协议（http/https）
- **Via**：经过的代理链路

注意：XFF 可被伪造，重要场景要用 mTLS 或可信代理白名单。

### 连接控制头

```
Connection: keep-alive
Connection: close
Keep-Alive: timeout=60, max=1000
```

- **keep-alive**（HTTP/1.1 默认）：复用 TCP 连接发多个请求
- **close**：响应后关闭连接
- HTTP/2 不再使用 Connection 头（多路复用，单连接天然 keep-alive）

### 自定义头

```
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
X-Trace-Id: abc123
X-Tenant-Id: tenant-001
```

通常以 `X-` 开头（虽然 RFC 6648 不再建议但仍是事实标准）。用于链路追踪、多租户、灰度路由。

### 抓包示例

```bash
$ curl -v -H "Authorization: Bearer token" -H "X-Request-Id: abc123" \
    -H "Content-Type: application/json" -d '{"name":"Alice"}' \
    https://api.example.com/users

> POST /users HTTP/1.1
> Host: api.example.com
> User-Agent: curl/7.81.0
> Accept: */*
> Authorization: Bearer token
> X-Request-Id: abc123
> Content-Type: application/json
> Content-Length: 16
>
> {"name":"Alice"}

< HTTP/1.1 201 Created
< Server: nginx/1.21.0
< Content-Type: application/json
< Content-Length: 28
< Location: /users/1
< X-Request-Id: abc123   # 服务端回传相同 ID
```

## 代码示例

Java 设置自定义请求头：

```java
import java.net.http.*;
import java.net.URI;

HttpClient client = HttpClient.newHttpClient();
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users"))
    .header("Authorization", "Bearer " + token)
    .header("X-Request-Id", UUID.randomUUID().toString())
    .header("X-Trace-Id", traceId)
    .header("Content-Type", "application/json")
    .header("Accept", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString("{\"name\":\"Alice\"}"))
    .build();

HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
String requestId = resp.headers().firstValue("X-Request-Id").orElse("");
```

服务端读取客户端 IP（考虑代理）：

```java
import javax.servlet.http.*;

public class ClientIpUtil {
    public static String getClientIp(HttpServletRequest req) {
        // 优先从 XFF 取（经过代理）
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isEmpty()) {
            // XFF 是逗号分隔列表，第一个是原始客户端 IP
            return xff.split(",")[0].trim();
        }
        // 没有代理，直接用 remoteAddr
        return req.getRemoteAddr();
    }
}
```

Spring Boot 配置常用响应头：

```java
import org.springframework.context.annotation.*;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest req, HttpServletResponse resp, Object h) {
                resp.setHeader("X-Content-Type-Options", "nosniff");
                resp.setHeader("X-Frame-Options", "DENY");
                resp.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
                resp.setHeader("Content-Security-Policy", "default-src 'self'");
                return true;
            }
        });
    }
}
```

## 实战场景

| 场景 | 关注头 | 排查 |
|------|-------|------|
| 跨域失败 | Origin、Access-Control-Allow-Origin | 看响应头是否带 CORS 头 |
| 缓存失效 | Cache-Control、ETag、If-None-Match | 检查请求头是否带验证字段 |
| 重复请求 | X-Request-Id | 服务端日志按 ID 关联 |
| 客户端 IP 错乱 | X-Forwarded-For | 检查代理是否正确转发 |
| 压缩不生效 | Accept-Encoding、Content-Encoding | 服务端要看请求是否声明支持 |
| 上传文件失败 | Content-Type、Boundary | multipart 请求要看 boundary |
| 移动端适配 | User-Agent | 服务端按 UA 返回不同模板 |

## 深挖追问

**Q1：自定义头一定要 `X-` 前缀吗？**
不必须。RFC 6648 不再建议 `X-` 前缀，但事实标准仍广泛使用。新协议（如 Forwarded 头替代 XFF）不再加 `X-`。

**Q2：头部字段大小写敏感吗？**
不敏感。`Content-Type` 和 `content-type` 等价。但生产中按惯例首字母大写。

**Q3：头部可以重复吗？**
可以。如 `Set-Cookie` 可多次出现设置多个 Cookie。其他头通常合并为逗号分隔的单个值。

**Q4：头部有大小限制吗？**
HTTP 规范未限定，服务器有实现限制。Nginx 默认 8KB（`large_client_header_buffers`），超过返回 414 或 400。

**Q5：HTTP/2 还用这些头吗？**
用。HTTP/2 用 HPACK 压缩头部，但语义不变。Connection 头在 HTTP/2 中被禁止（连接控制由帧层处理）。

## 易错点

- **"XFF 第一个 IP 一定真实"** — 不一定，XFF 可伪造。生产要从可信代理开始取。
- **"Content-Length 是字符数"** — 是字节数，UTF-8 中文一个字符 3 字节。
- **"HTTP/2 仍用 Connection: keep-alive"** — 不用，HTTP/2 默认多路复用，禁止 Connection 头。
- **"User-Agent 不可伪造"** — 可任意伪造，curl/Postman 都能改，不要用于安全判断。
- **"自定义头不传给下游"** — 默认传，除非代理显式过滤。敏感头（如内部认证）要过滤。

## 总结

HTTP 请求头按用途分类：客户端环境（User-Agent、Accept-*）、身份认证（Authorization、Cookie）、内容描述（Content-Type/Length）、跨域（Origin）、缓存（If-None-Match）、转发（XFF）、自定义（X-Request-Id）。掌握这些头能排查跨域、缓存、IP 错乱、压缩失效等常见问题。生产中注意安全头（HSTS、CSP）和链路追踪头的统一注入。

## 参考资料

- [RFC 7231 — HTTP/1.1 Semantics and Content, Header Fields](https://datatracker.ietf.org/doc/html/rfc7231#section-5)
- [RFC 6648 — Deprecating the X- Prefix](https://datatracker.ietf.org/doc/html/rfc6648)
- [MDN — HTTP Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers)
