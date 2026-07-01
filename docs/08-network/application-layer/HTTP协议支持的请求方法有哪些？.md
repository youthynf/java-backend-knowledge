# HTTP 协议支持的请求方法有哪些

## 核心概念

HTTP 请求方法（也叫"动词"）描述客户端希望对资源执行的语义动作。RFC 7231 定义了 8 个核心方法：GET、HEAD、POST、PUT、DELETE、PATCH、OPTIONS、TRACE，加上 RFC 2817 的 CONNECT 共 9 个。每个方法有"安全性"和"幂等性"两个关键属性，决定了它在 REST 设计、缓存、重试、CORS 预检中的行为。

## 标准回答

9 个 HTTP 方法：

| 方法 | 语义 | 安全 | 幂等 | 用途 |
|------|------|------|------|------|
| GET | 获取资源 | 是 | 是 | 查询 |
| HEAD | 获取响应头 | 是 | 是 | 检查资源是否存在、ETag |
| POST | 提交数据，触发处理 | 否 | 否 | 创建资源、提交表单 |
| PUT | 整体替换资源 | 否 | 是 | 更新（覆盖整个资源） |
| PATCH | 局部修改资源 | 否 | 视实现 | 部分字段更新 |
| DELETE | 删除资源 | 否 | 是 | 删除 |
| OPTIONS | 查询能力 | 是 | 是 | CORS 预检、查询支持的方法 |
| HEAD | 同 GET 但只要头 | 是 | 是 | 节省带宽 |
| TRACE | 回显请求 | 是 | 是 | 调试，生产禁用 |
| CONNECT | 建立隧道 | 否 | 否 | HTTPS 代理 |

**安全**：不修改服务端状态（GET/HEAD/OPTIONS/TRACE）。
**幂等**：多次调用效果相同（GET/HEAD/PUT/DELETE/OPTIONS/TRACE）。

## 详细机制

### GET

```
GET /api/users/1 HTTP/1.1
Host: api.example.com
```

- 安全、幂等
- 参数在 URL query string（`?key=value&...`）
- 可缓存（响应有 Cache-Control 等）
- 浏览器对 URL 长度有限制（IE 2KB，Chrome 2MB，规范未限定）
- 不应有副作用（不要在 GET 里改数据库）

### POST

```
POST /api/users HTTP/1.1
Host: api.example.com
Content-Type: application/json
Content-Length: 35

{"name":"Alice","age":30}
```

- 不安全、不幂等
- 参数在请求体
- 用于创建资源、提交表单、上传文件、触发操作
- 默认不缓存
- 重试需谨慎（可能重复创建）

### PUT vs PATCH

PUT：整体替换

```
PUT /api/users/1
{"name":"Alice","age":30,"email":"a@x.com"}
# 即使原资源有 10 个字段，也只保留这 3 个
```

PATCH：局部修改

```
PATCH /api/users/1
{"age":31}
# 只改 age，其他字段不变
```

PATCH 是否幂等取决于实现：

- **JSON Patch（RFC 6902）**：明确指定操作（add/remove/replace），幂等
- **JSON Merge Patch（RFC 7396）**：合并 JSON，幂等
- **自定义 PATCH**：不一定幂等（如 `{"age": "+1"}` 每次调用年龄 +1）

### DELETE

```
DELETE /api/users/1
```

- 不安全、幂等（删除一次和删除十次效果相同）
- 第一次返回 204，第二次仍 204 或 404（视实现）
- 即使返回 404 也不破坏幂等性（资源已不存在是同样的状态）

### OPTIONS

```
OPTIONS /api/users HTTP/1.1
Origin: https://app.example.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: Content-Type
```

响应：

```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

- 用于 CORS 预检（浏览器检查跨域权限）
- 也用于查询服务端支持的方法（响应 `Allow` 头）

### HEAD

```
HEAD /api/users/1 HTTP/1.1
```

响应：

```
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 28
# 无响应体
```

- 同 GET 但服务端不返回 body
- 用于检查资源是否存在（404 表示不存在）、ETag 是否变化
- 节省带宽，常用于客户端缓存验证

### TRACE

```
TRACE /api/users HTTP/1.1
X-Custom-Header: hello
```

响应：

```
HTTP/1.1 200 OK
Content-Type: message/http

TRACE /api/users HTTP/1.1
X-Custom-Header: hello
```

- 服务端回显收到的请求
- 用于调试代理链路
- **生产禁用**：可能泄露内部头信息（XST 攻击）

### CONNECT

```
CONNECT api.example.com:443 HTTP/1.1
Host: api.example.com:443
```

- 用于 HTTPS 代理隧道
- 客户端通过 HTTP 代理访问 HTTPS 时，先发 CONNECT 建立隧道，再在隧道里做 TLS 握手
- 不常用但代理场景必需

### 安全方法与缓存

安全方法（GET/HEAD）的响应可被缓存。不安全方法（POST/PUT/DELETE）的响应默认不缓存，除非显式设置 `Cache-Control`（如 POST 后缓存查询结果）。

### 抓包示例

```bash
# GET 请求
$ curl -v http://example.com/api/users
> GET /api/users HTTP/1.1

# POST 请求
$ curl -v -X POST -d '{"name":"Alice"}' -H "Content-Type: application/json" http://example.com/api/users
> POST /api/users HTTP/1.1
> Content-Type: application/json
> Content-Length: 16
>
> {"name":"Alice"}

# OPTIONS 预检
$ curl -v -X OPTIONS -H "Origin: https://app.com" -H "Access-Control-Request-Method: POST" http://example.com/api/users
> OPTIONS /api/users HTTP/1.1
> Origin: https://app.com
> Access-Control-Request-Method: POST
```

## 代码示例

Java Spring REST 控制器：

```java
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping("/{id}")               // GET 查询
    public User getUser(@PathVariable Long id) { ... }

    @PostMapping                        // POST 创建
    public User createUser(@RequestBody User user) { ... }

    @PutMapping("/{id}")                // PUT 整体更新
    public User replaceUser(@PathVariable Long id, @RequestBody User user) { ... }

    @PatchMapping("/{id}")              // PATCH 局部更新
    public User patchUser(@PathVariable Long id, @RequestBody Map<String, Object> updates) { ... }

    @DeleteMapping("/{id}")             // DELETE 删除
    public void deleteUser(@PathVariable Long id) { ... }

    @RequestMapping(method = RequestMethod.OPTIONS)   // OPTIONS CORS 预检
    public ResponseEntity<Void> options() {
        return ResponseEntity.ok()
            .header("Allow", "GET, POST, PUT, PATCH, DELETE")
            .build();
    }
}
```

幂等性保证（防止 POST 重试重复创建）：

```java
@PostMapping("/api/orders")
public ResponseEntity<Order> createOrder(@RequestBody OrderRequest req) {
    // 用业务幂等号防止重试导致重复下单
    if (orderRepository.existsByIdempotencyKey(req.getIdempotencyKey())) {
        return ResponseEntity.ok(orderRepository.findByIdempotencyKey(req.getIdempotencyKey()));
    }
    Order order = orderService.create(req);
    return ResponseEntity.created(URI.create("/api/orders/" + order.getId())).body(order);
}
```

## 实战场景

| 方法 | REST 设计 | 注意点 |
|------|----------|--------|
| GET | 查询接口 | 不要在 GET 里改数据（违反安全语义） |
| POST | 创建资源、复杂查询 | 创建需配合幂等号防重 |
| PUT | 整体替换 | 客户端要发送完整资源 |
| PATCH | 局部更新 | 明确使用 JSON Patch 还是 Merge Patch |
| DELETE | 删除资源 | 注意软删除 vs 硬删除 |
| OPTIONS | CORS 预检 | 中间件自动处理，业务很少直接处理 |

## 深挖追问

**Q1：GET 一定不能带 body 吗？**
HTTP 规范不禁止 GET 带 body，但很多代理/服务器会丢弃，且部分浏览器不支持。生产中不要依赖 GET body，参数放 URL。

**Q2：POST 一定不幂等吗？**
规范上 POST 不要求幂等，但业务可以设计成幂等（如带幂等号的创建）。重试时检查幂等号，已存在则返回旧结果。

**Q3：为什么 PATCH 单独拿出来？**
PUT 是整体替换，要求客户端发送完整资源；PATCH 只发变更部分，节省带宽。早期 HTTP 没有 PATCH，REST 实践中用 PUT 做局部更新不规范，所以 RFC 5789 引入 PATCH。

**Q4：DELETE 第二次返回 404 算不算破坏幂等？**
不算。幂等性指"多次调用效果相同"，第一次删除资源（不存在状态），第二次发现资源不存在（仍是不存在状态），效果相同。返回码不同不影响幂等性。

**Q5：CORS 预检什么时候触发？**
非简单请求触发。简单请求 = GET/HEAD/POST + 仅 CORS 安全头 + Content-Type 限于 form/text/plain。其他方法（PUT/DELETE）、自定义头、application/json 都触发预检。

## 易错点

- **"GET 比 POST 安全"** — 安全指"不修改服务端状态"，不是"不被窃听"。GET 参数在 URL 会被日志/浏览器历史记录，敏感数据不该放 URL。
- **"POST 比 GET 安全"** — 同样指语义不是加密。
- **"PUT 和 PATCH 一样"** — PUT 整体替换，PATCH 局部修改。
- **"POST 一定不幂等"** — 业务可设计幂等 POST。
- **"DELETE 第二次必须 404"** — 实现自由，返回 204 也对。

## 总结

HTTP 9 个方法描述对资源的语义动作。安全（GET/HEAD/OPTIONS/TRACE）和幂等（GET/HEAD/PUT/DELETE/OPTIONS/TRACE）是两个关键属性，决定缓存、重试、CORS 预检的行为。REST 设计中 GET 查、POST 创建、PUT 整体替换、PATCH 局部更新、DELETE 删除是标准映射。理解每个方法的语义边界是设计规范 RESTful API 的基础。

## 参考资料

- [RFC 7231 — HTTP/1.1 Semantics and Content, Request Methods](https://datatracker.ietf.org/doc/html/rfc7231#section-4)
- [RFC 5789 — PATCH Method](https://datatracker.ietf.org/doc/html/rfc5789)
- [MDN — HTTP Request Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
