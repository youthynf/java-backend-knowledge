# GET 和 POST 的区别是什么

## 核心概念

GET 和 POST 是 HTTP 最常用的两个方法，本质区别在于语义：GET 用于获取资源（安全、幂等），POST 用于提交数据触发处理（不安全、不幂等）。很多人误以为"GET 参数在 URL，POST 参数在 body"是本质区别，这只是约定和实现习惯，不是协议要求。理解语义差异才能正确设计 REST API 和处理重试、缓存、安全等问题。

## 标准回答

GET 和 POST 的核心差异：

| 维度 | GET | POST |
|------|-----|------|
| 语义 | 获取资源 | 提交数据触发处理 |
| 安全 | 是（不修改服务端状态） | 否 |
| 幂等 | 是（多次调用效果相同） | 否（默认） |
| 可缓存 | 是 | 否 |
| 可书签 | 是 | 否 |
| 参数位置 | URL query string（约定） | 请求体（约定） |
| 参数长度 | 受 URL 长度限制（浏览器实现） | 理论上无限制 |
| 参数类型 | ASCII（URL 编码） | 任意（Content-Type 决定） |
| 浏览器历史 | 保留 URL | 不保留 |
| 回退行为 | 无副作用重新请求 | 提交确认 |

## 详细机制

### 语义差异

**GET**：获取资源的表示。安全（不修改服务端状态）+ 幂等（多次调用结果相同）。

```
GET /api/users/1   → 返回用户 1 的信息
                    多次调用返回相同结果（除非中间被修改）
                    不应在 GET 里改数据
```

**POST**：提交数据让服务端处理。不安全（可能创建/修改资源）+ 不幂等（多次调用可能创建多个资源）。

```
POST /api/users    → 创建用户
                    多次调用创建多个用户（除非业务幂等）
```

### 参数位置（约定，非规范）

```
GET /api/users?name=Alice&age=30 HTTP/1.1
Host: api.example.com

POST /api/users HTTP/1.1
Host: api.example.com
Content-Type: application/json
Content-Length: 26

{"name":"Alice","age":30}
```

- **GET 参数在 URL**：浏览器/服务器约定，方便书签和历史记录
- **POST 参数在 body**：不受 URL 长度限制，可传大量数据

但 HTTP 规范不禁止 GET 带 body，也不禁止 POST 在 URL 传参。某些 API（如 Elasticsearch）的 GET 请求带 body 用于复杂查询。

### 长度限制

| 客户端 | URL 长度限制 |
|--------|------------|
| IE | 2083 字符 |
| Chrome | 2 MB |
| Firefox | 65536 字符 |
| curl | 无限制 |
| HTTP 规范 | 未限定 |

浏览器对 URL 长度有限制，所以 GET 参数不能太多。POST body 没有协议限制，但服务器有限制（Nginx `client_max_body_size` 默认 1 MB）。

### 缓存行为

- **GET 可缓存**：响应可被浏览器、CDN、代理缓存（受 Cache-Control 控制）
- **POST 默认不缓存**：除非显式设置 `Cache-Control: max-age`（少见）

### 浏览器行为差异

| 行为 | GET | POST |
|------|-----|------|
| 书签保存 | URL 含参数，可保存 | 不能保存 |
| 历史记录 | URL 在历史中，可重新访问 | 警告"重新提交表单" |
| 回退 | 重新发请求，无副作用 | 浏览器警告"重新提交" |
| 链接 | 可直接链接 | 不能直接链接 |
| 爬虫 | 默认爬取 | 默认不爬取 |

### 安全性误区

**误区 1**："GET 比 POST 安全（不被窃听）"

不。GET 和 POST 都明文传输（除非 HTTPS）。GET 参数在 URL 容易被日志/历史记录泄露，POST 在 body 不易泄露，但抓包都可见。

**误区 2**："POST 比 GET 安全（密码用 POST）"

POST 在 body 中传密码相对安全（不进 URL/日志），但仍需 HTTPS 保护传输。语义上 POST 不是"安全方法"（可能修改数据），但密码保护是惯例。

**误区 3**："GET 不能传敏感数据"

不绝对，但 GET 参数会进 URL、日志、浏览器历史、Referer 头，敏感数据（密码、Token）应避免放 URL。

### 重试行为

- **GET 重试安全**：幂等，重复请求无副作用
- **POST 重试需谨慎**：不幂等，重复请求可能重复创建。需配合业务幂等号

```
# 反例：POST 创建订单无幂等号
客户端发 POST /api/orders，网络超时
客户端重试 POST /api/orders → 创建了 2 个订单！

# 正例：POST 配合幂等号
POST /api/orders
X-Idempotency-Key: uuid-12345
服务端检查 X-Idempotency-Key 是否已处理，避免重复创建
```

### 抓包对比

```bash
# GET 请求
$ curl -v "http://example.com/api/users?name=Alice"
> GET /api/users?name=Alice HTTP/1.1
> Host: example.com
> User-Agent: curl/7.81.0
>
< HTTP/1.1 200 OK
< Content-Type: application/json
< {"name":"Alice","id":1}

# POST 请求
$ curl -v -X POST -d '{"name":"Alice"}' -H "Content-Type: application/json" http://example.com/api/users
> POST /api/users HTTP/1.1
> Host: example.com
> Content-Type: application/json
> Content-Length: 16
>
> {"name":"Alice"}
< HTTP/1.1 201 Created
< Location: /api/users/1
```

## 代码示例

REST API 设计：

```java
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping("/{id}")               // GET 查询
    public User getUser(@PathVariable Long id) {
        return userService.findById(id);   // 安全幂等
    }

    @GetMapping                        // GET 列表查询
    public List<User> list(@RequestParam(defaultValue = "1") int page,
                           @RequestParam(defaultValue = "20") int size) {
        return userService.list(page, size);
    }

    @PostMapping                        // POST 创建
    public ResponseEntity<User> create(@RequestBody User user,
                                       @RequestHeader("X-Idempotency-Key") String key) {
        // 幂等号防重
        if (userService.existsByKey(key)) {
            return ResponseEntity.ok(userService.findByKey(key));
        }
        User created = userService.create(user);
        return ResponseEntity.created(URI.create("/api/users/" + created.getId())).body(created);
    }
}
```

文件上传用 POST（多部分表单）：

```java
@PostMapping("/upload")
public String upload(@RequestPart("file") MultipartFile file) {
    // POST 适合大文件，无 URL 长度限制
    String path = storageService.save(file);
    return path;
}
```

复杂查询用 POST（即使语义是查询）：

```java
// Elasticsearch 风格：复杂查询用 POST + body
@PostMapping("/api/users/search")
public List<User> search(@RequestBody SearchQuery query) {
    // 查询条件复杂，放 body 比 URL 清晰
    // 虽然语义是查询（GET），但实际用 POST 是工程取舍
    return userService.search(query);
}
```

## 实战场景

| 场景 | 选择 | 原因 |
|------|------|------|
| 查询接口 | GET | 安全幂等，可缓存 |
| 创建资源 | POST + 幂等号 | 不幂等，需防重 |
| 上传文件 | POST（multipart） | body 可传大数据 |
| 复杂查询 | POST（body 传条件） | URL 长度限制 |
| 删除资源 | DELETE（不是 POST） | 语义明确 |
| 更新资源 | PUT/PATCH（不是 POST） | 语义明确 |
| 触发动作 | POST | 不安全不幂等的操作 |

## 深挖追问

**Q1：GET 一定不能带 body 吗？**
HTTP 规范不禁止，但很多代理/服务器会丢弃 GET body。Elasticsearch 用 GET + body 做复杂查询，但需要客户端支持。生产中避免依赖。

**Q2：POST 一定不幂等吗？**
规范上不要求幂等，但业务可设计幂等 POST。带幂等号的创建、根据业务键 upsert 都是幂等 POST。

**Q3：为什么浏览器对 POST 提交有"重新提交"警告？**
因为 POST 不幂等，重复提交可能产生副作用（如重复下单）。浏览器让用户确认。

**Q4：GET 能用于登录吗？**
技术上能，但密码会进 URL/日志/历史，极不安全。登录必须用 POST + HTTPS。

**Q5：URL 长度限制是 HTTP 规范定的吗？**
不是。HTTP 规范未限定 URL 长度，是浏览器/服务器的实现限制。RFC 7230 建议服务器至少支持 8000 字符。

## 易错点

- **"GET 参数一定在 URL"** — 约定，不是规范。GET 可以带 body（不推荐）。
- **"POST 比 GET 安全"** — 仅指参数不进 URL，传输仍需 HTTPS。
- **"GET 比 POST 快"** — 不一定，差异极小，可忽略。
- **"POST 数据量无限制"** — 服务器有限制（Nginx 默认 1MB）。
- **"GET 不能修改数据"** — 技术上能，但违反语义，不应这么做。

## 总结

GET 和 POST 的本质区别是语义：GET 获取资源（安全、幂等、可缓存），POST 提交数据（不安全、不幂等、不可缓存）。参数位置（URL vs body）是约定实现，不是规范要求。设计 REST API 应按语义选方法，POST 创建配合幂等号防重。安全传输靠 HTTPS，不是 GET/POST 选择。理解语义边界是设计规范 API 的基础。

## 参考资料

- [RFC 7231 — HTTP/1.1 Semantics and Content, Methods](https://datatracker.ietf.org/doc/html/rfc7231#section-4)
- [MDN — HTTP Methods GET vs POST](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
