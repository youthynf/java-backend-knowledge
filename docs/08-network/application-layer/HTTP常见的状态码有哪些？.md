# HTTP 常见的状态码有哪些

## 核心概念

HTTP 状态码是服务端对请求处理结果的三位数字编码，告知客户端"发生了什么"。状态码分五大类（1xx 信息、2xx 成功、3xx 重定向、4xx 客户端错误、5xx 服务端错误），每类有具体码值。掌握状态码不仅是背数字，更要理解语义和实际场景中的对应关系——同样 401 和 403 经常被混用，502 和 504 的差异决定排查方向。

## 标准回答

五类状态码：

| 类别 | 含义 | 典型 |
|------|------|------|
| 1xx | 信息性，请求已接收继续处理 | 100 Continue、101 Switching Protocols |
| 2xx | 成功 | 200 OK、201 Created、204 No Content、206 Partial Content |
| 3xx | 重定向 | 301 Moved Permanently、302 Found、304 Not Modified、307/308 |
| 4xx | 客户端错误 | 400 Bad Request、401 Unauthorized、403 Forbidden、404 Not Found、429 Too Many Requests |
| 5xx | 服务端错误 | 500 Internal Server Error、502 Bad Gateway、503 Service Unavailable、504 Gateway Timeout |

## 详细机制

### 2xx 成功

| 码 | 短语 | 语义 | 场景 |
|----|------|------|------|
| 200 | OK | 请求成功，响应体是资源 | GET/POST 普通成功响应 |
| 201 | Created | 资源已创建 | POST 创建资源成功，响应体可含新资源 |
| 202 | Accepted | 请求已接收，未处理完 | 异步任务接收，如发邮件、转码 |
| 204 | No Content | 成功但无内容返回 | DELETE 删除成功、PUT 更新成功无返回 |
| 206 | Partial Content | 部分内容 | Range 请求（断点续传、视频流） |

### 3xx 重定向

| 码 | 短语 | 是否改方法 | 缓存 | 场景 |
|----|------|----------|------|------|
| 301 | Moved Permanently | 可能改 POST→GET | 永久缓存 | 域名迁移、HTTP→HTTPS |
| 302 | Found | 可能改 POST→GET | 不缓存 | 临时跳转（登录后跳首页） |
| 303 | See Other | 改 GET | 不缓存 | POST 后用 GET 看结果（PRG 模式） |
| 307 | Temporary Redirect | 不改方法 | 不缓存 | 临时跳转，保留方法和 body |
| 308 | Permanent Redirect | 不改方法 | 永久缓存 | 永久跳转，保留方法和 body |
| 304 | Not Modified | - | - | 协商缓存命中，无正文 |

301 和 302 的坑：早期浏览器把 301/302 的 POST 改成 GET，HTTP/1.1 规范虽然规定不改方法，但浏览器为兼容仍改。307/308 是规范版本，严格保留方法。

### 4xx 客户端错误

| 码 | 短语 | 语义 | 场景 |
|----|------|------|------|
| 400 | Bad Request | 请求格式错误 | 参数缺失、JSON 解析失败 |
| 401 | Unauthorized | 未认证 | 缺少或无效的 Authorization、Cookie |
| 403 | Forbidden | 已认证但无权限 | 用户角色不够、IP 被封 |
| 404 | Not Found | 资源不存在 | URL 错误、资源已删除 |
| 405 | Method Not Allowed | 方法不允许 | GET 接口收到 POST |
| 406 | Not Acceptable | 内容协商失败 | Accept 头不匹配 |
| 409 | Conflict | 冲突 | 并发更新冲突、唯一约束冲突 |
| 413 | Payload Too Large | 请求体过大 | 上传文件超限 |
| 415 | Unsupported Media Type | Content-Type 不支持 | 服务端只收 JSON，客户端发 XML |
| 429 | Too Many Requests | 限流 | QPS 超限 |

401 vs 403：

- **401**：你是谁？未登录或 token 失效
- **403**：我知道你是谁，但你没权限。已登录但角色不够

### 5xx 服务端错误

| 码 | 短语 | 语义 | 排查方向 |
|----|------|------|---------|
| 500 | Internal Server Error | 服务端内部错误 | 看应用日志，未捕获异常 |
| 501 | Not Implemented | 不支持该方法 | 服务端没实现 OPTIONS/TRACE |
| 502 | Bad Gateway | 网关上游错误 | 上游服务挂了或返回非法响应 |
| 503 | Service Unavailable | 暂时不可用 | 服务过载、维护中、依赖中间件故障 |
| 504 | Gateway Timeout | 网关超时 | 上游响应超时 |
| 505 | HTTP Version Not Supported | 不支持协议版本 | 客户端发 HTTP/2 但服务端不支持 |

502 vs 504：

- **502**：网关连上了上游，但上游返回了错误响应（进程崩、非法响应）
- **504**：网关连上了上游，但上游在超时时间内没响应

### 抓包示例

```bash
$ curl -i http://example.com/
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 1256
...

$ curl -i http://example.com/nonexistent
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=UTF-8
...

$ curl -i -X DELETE http://example.com/api/users/1
HTTP/1.1 204 No Content
Date: Wed, 01 Jan 2025 10:00:00 GMT
# 204 无正文，没有 Content-Length

$ curl -i http://example.com/redirect
HTTP/1.1 301 Moved Permanently
Location: https://example.com/new
Cache-Control: max-age=3600
```

### 自定义状态码

某些场景会扩展，如：

- **420/421**：Twitter 早期的限流、Cloudflare 的 Misdirected Request
- **418 I'm a teapot**：愚人节 RFC 2324 彩蛋，部分框架用于"我拒绝煮咖啡"
- **522/523/524**：Cloudflare 网络层错误

业务系统不应自定义状态码，应使用标准码 + 业务错误码在响应体中。

## 代码示例

Java Spring 返回不同状态码：

```java
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping("/{id}")
    public ResponseEntity<User> getUser(@PathVariable Long id) {
        User user = userService.findById(id);
        if (user == null) {
            return ResponseEntity.notFound().build();  // 404
        }
        return ResponseEntity.ok(user);   // 200
    }

    @PostMapping
    public ResponseEntity<User> createUser(@RequestBody User user) {
        User created = userService.create(user);
        URI location = URI.create("/api/users/" + created.getId());
        return ResponseEntity.created(location).body(created);   // 201
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.delete(id);
        return ResponseEntity.noContent().build();   // 204
    }

    @GetMapping("/forbidden")
    public ResponseEntity<String> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body("No permission");   // 403
    }
}
```

限流场景返回 429：

```java
@GetMapping("/api/expensive")
public ResponseEntity<String> expensive(@RequestHeader("X-User-Id") String userId) {
    if (rateLimiter.isLimited(userId)) {
        return ResponseEntity.status(429)
            .header("Retry-After", "60")   // 告诉客户端 60 秒后重试
            .body("Too many requests");
    }
    return ResponseEntity.ok("done");
}
```

## 实战场景

| 码 | 场景 | 排查 |
|----|------|------|
| 401 | 用户 token 过期 | 前端自动刷新 token |
| 403 | 越权访问 | 检查权限校验逻辑 |
| 404 | 静态资源 404 | 检查 Nginx 静态文件路径 |
| 499 | Nginx 特有，客户端主动断开 | 检查客户端超时配置 |
| 502 | 上游服务崩溃 | 看上游进程、看 Nginx error.log |
| 504 | 上游响应慢 | 看上游接口耗时、网络 |
| 0 | 浏览器看到 status=0 | 跨域被拦、证书错误、网络断 |

## 深挖追问

**Q1：4xx 一定是客户端错吗？**
不一定。比如 404 可能是服务端路由配置错，413 可能是服务端限值设太低。状态码只是"按规范应归咎的一方"，实际根因要具体分析。

**Q2：500 一定是服务端 bug 吗？**
通常是，但也可能是依赖故障（数据库连不上）导致的内部错误。本质是"服务端无法处理"，未必是代码 bug。

**Q3：304 算成功吗？**
算。304 表示"资源未修改，用你缓存的版本"，没有正文，节省带宽。配合 ETag/Last-Modified 使用。

**Q4：503 和 502 的区别？**
503 是"我知道我不可用，请稍后再试"，服务端主动告知；502 是"网关上游错"，网关连不上游或上游返回错误。

**Q5：Nginx 的 499 是标准状态码吗？**
不是，是 Nginx 自定义的，表示客户端在服务端响应前主动断开（如客户端超时）。仅在 Nginx access.log 看到。

## 易错点

- **混淆 401 和 403** — 401 是未认证（没登录），403 是无权限（登录了但角色不够）。
- **混淆 502 和 504** — 502 上游返回错误，504 上游没响应。
- **301 和 302 都改方法** — HTTP/1.1 规范是不改，但浏览器实现改。307/308 才严格不改。
- **204 不该有 Content-Length** — 204 表示无内容，理论上没有 Content-Length 头。
- **自定义业务状态码** — 不要用 4xx/5xx 表达业务错误，应使用标准码 + 响应体业务码。

## 总结

HTTP 状态码五大类：1xx 信息、2xx 成功、3xx 重定向、4xx 客户端错误、5xx 服务端错误。生产中重点掌握 200/201/204、301/302/304、400/401/403/404/429、500/502/503/504。401 vs 403、502 vs 504 是面试和排查的高频考点。业务错误应使用标准码 + 响应体业务码，不要自定义状态码。

## 参考资料

- [RFC 7231 — HTTP/1.1 Semantics and Content, Status Codes](https://datatracker.ietf.org/doc/html/rfc7231#section-6)
- [MDN — HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
