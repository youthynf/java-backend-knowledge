# HTTP/1.1 如何对请求拆包

## 核心概念

HTTP/1.1 跑在 TCP 字节流之上，TCP 不保留应用层消息边界，所以 HTTP 必须自己定义"请求边界"——这就是"拆包"。HTTP/1.1 通过三种机制确定请求体长度：Content-Length（明确字节数）、Transfer-Encoding: chunked（分块传输）、连接关闭（HTTP/1.0 风格，长连接下不用）。理解拆包机制是看懂抓包、调试接口、防范请求走私的基础。

## 标准回答

HTTP/1.1 请求解析三步：

1. **读请求行和头部**：按 `\r\n` 分行，直到空行 `\r\n\r\n` 表示头部结束
2. **判断是否有请求体**：GET/HEAD/DELETE 通常无；POST/PUT/PATCH 通常有
3. **确定请求体长度**：
   - 有 Content-Length：读指定字节数
   - 有 Transfer-Encoding: chunked：按分块格式读到 0 长度块
   - 都没有：HTTP/1.0 风格靠连接关闭，HTTP/1.1 长连接下报 400

## 详细机制

### 请求行和头部解析

```
POST /api/users HTTP/1.1\r\n       ← 请求行
Host: api.example.com\r\n           ← 头部行 1
Content-Type: application/json\r\n  ← 头部行 2
Content-Length: 35\r\n              ← 头部行 3
\r\n                                ← 空行（头部结束）
{"name":"Alice","age":30}          ← 请求体
```

服务端按字节读，遇到 `\r\n\r\n` 表示头部结束。

### Content-Length 拆包

最常用方式，明确告知请求体字节数：

```http
POST /api/users HTTP/1.1
Host: api.example.com
Content-Type: application/json
Content-Length: 35

{"name":"Alice","age":30}
```

服务端读到空行后，继续读 35 字节作为请求体。读完正好是一个完整请求。

### Transfer-Encoding: chunked

未知总长度或流式响应时用：

```http
POST /upload HTTP/1.1
Host: api.example.com
Transfer-Encoding: chunked

5\r\n
Hello\r\n
6\r\n
 World\r\n
0\r\n
\r\n
```

格式：

- 每块以"长度（十六进制）\r\n"开头
- 接着是数据
- 最后以 `0\r\n\r\n` 结束

服务端逐块读，直到读到长度为 0 的块。

### 没有 Content-Length 也没有 chunked

HTTP/1.0：靠连接关闭确定请求体结束。

```
POST /upload HTTP/1.0
Host: api.example.com

some data...
```

服务端读到连接关闭（read 返回 0），认为请求体结束。

HTTP/1.1 长连接下不能用此方式（连接不关闭），如果请求有 body 但没 Content-Length 也没 chunked，服务端通常报 400 Bad Request 或 Length Required。

### 长连接下的多请求拆包

HTTP/1.1 默认 keep-alive，一个 TCP 连接上可有多个请求：

```
Client → Server: 请求 1（Content-Length: 35）+ 请求 2（Content-Length: 20）+ ...
Server: 按 Content-Length 切分，先处理请求 1，再处理请求 2
```

服务端必须严格按 Content-Length 读字节，多读会污染下一请求，少读会留下半包。

### 请求走私（Request Smuggling）

Content-Length 和 Transfer-Encoding 同时存在时的安全问题：

```http
POST / HTTP/1.1
Content-Length: 6
Transfer-Encoding: chunked

0
```

不同服务器解析顺序不同：

- 前端代理用 Content-Length：认为请求体 6 字节（`0\r\n\r\n`）
- 后端用 chunked：认为请求体结束（0 长度块）

前端把后续请求当成第一个请求的 body，后端却当成新请求 → 请求走私。

防护：

- 同时存在时拒绝（RFC 7230 要求优先 Transfer-Encoding）
- 严格校验，不允许两者同时出现

### 抓包示例

```bash
# Content-Length 拆包
$ curl -v -d '{"name":"Alice"}' -H "Content-Type: application/json" http://example.com/api/users
> POST /api/users HTTP/1.1
> Content-Type: application/json
> Content-Length: 16
>
> {"name":"Alice"}
< HTTP/1.1 201 Created

# chunked 拆包（流式上传）
$ curl -v -H "Transfer-Encoding: chunked" --data-binary @- http://example.com/upload <<EOF
> hello
> world
> EOF
> POST /upload HTTP/1.1
> Transfer-Encoding: chunked
>
> 6\r\nhello\n\r\n
> 6\r\nworld\n\r\n
> 0\r\n
> \r\n
```

## 代码示例

服务端正确解析请求体（Spring Boot）：

```java
import org.springframework.web.bind.annotation.*;

@RestController
public class UserController {

    // Spring 自动按 Content-Length 或 chunked 读取请求体
    @PostMapping("/api/users")
    public User create(@RequestBody User user) {
        // @RequestBody 触发 HttpMessageConverter 解析
        // 框架内部已处理拆包，应用层无需关心
        return userService.create(user);
    }
}
```

Netty 自定义协议解析（演示拆包原理）：

```java
import io.netty.buffer.*;
import io.netty.channel.*;
import io.netty.handler.codec.http.*;

public class HttpServerHandler extends SimpleChannelInboundHandler<HttpObject> {
    @Override
    protected void channelRead0(ChannelHandlerContext ctx, HttpObject msg) {
        if (msg instanceof HttpRequest) {
            HttpRequest req = (HttpRequest) msg;
            // Netty 的 HttpServerCodec 已解析请求行和头部
            System.out.println("Method: " + req.method());
            System.out.println("URI: " + req.uri());
        }
        if (msg instanceof HttpContent) {
            HttpContent content = (HttpContent) msg;
            ByteBuf buf = content.content();
            // 按 chunked 或 Content-Length 读到的数据
            System.out.println("Body chunk: " + buf.toString(CharsetUtil.UTF_8));
            if (msg instanceof LastHttpContent) {
                // 请求体读完
                System.out.println("Request complete");
            }
        }
    }
}
```

流式响应（chunked）：

```java
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import reactor.core.publisher.Flux;

@GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<String> stream() {
    // Spring WebFlux 自动用 chunked 传输
    return Flux.interval(Duration.ofSeconds(1))
        .map(i -> "data " + i + "\n");
}
```

## 实战场景

| 场景 | 拆包方式 | 注意点 |
|------|---------|--------|
| 普通 POST/PUT | Content-Length | 必须正确，错会半包或污染 |
| 文件上传 | Content-Length 或 chunked | 大文件用 chunked 流式 |
| 流式响应（SSE） | chunked | 中间件要支持透传 chunked |
| 长连接多请求 | Content-Length 严格切分 | 不能靠连接关闭 |
| HTTP/2 | 帧自带长度 | 不需要 Content-Length |

## 深挖追问

**Q1：Content-Length 是字符数还是字节数？**
字节数。UTF-8 中文一个字符 3 字节，Content-Length 要按字节算。

**Q2：Content-Length 错会怎样？**
- 比实际短：服务端只读一部分，后续请求污染
- 比实际长：服务端等待不存在的数据，超时

**Q3：chunked 和 Content-Length 能同时用吗？**
RFC 7230 规定优先 Transfer-Encoding: chunked，但实际生产应避免同时出现（请求走私风险）。

**Q4：HTTP/2 还需要 Content-Length 吗？**
建议有。HTTP/2 帧自带长度，没有 Content-Length 也能正确解析，但有 Content-Length 客户端能预知大小。

**Q5：服务端怎么防止慢请求攻击？**
限制 Header 大小（Nginx `large_client_header_buffers`）、Body 大小（`client_max_body_size`）、读超时（`client_body_timeout`）。

## 易错点

- **"Content-Length 是字符数"** — 是字节数。
- **"长连接靠连接关闭拆包"** — 不，长连接必须靠 Content-Length 或 chunked。
- **"Content-Length 和 chunked 能同时用"** — 规范上 Transfer-Encoding 优先，但应避免同时出现。
- **"HTTP/2 还要拆包"** — 帧自带长度，应用层无需拆包。
- **"拆包 = TCP 拆包"** — 不是，HTTP 拆包是应用层消息边界，TCP 拆包是传输层分段。

## 总结

HTTP/1.1 拆包靠 Content-Length（明确字节数）或 Transfer-Encoding: chunked（分块传输）确定请求体边界。长连接下必须用这两者之一，不能靠连接关闭。Content-Length 错误会导致半包或请求走私。HTTP/2 用帧自带长度，不需要应用层拆包。生产中用成熟 Web 框架避免手写解析器，限制 Header/Body 大小防慢请求攻击。

## 参考资料

- [RFC 7230 — HTTP/1.1 Message Syntax and Routing, Message Body](https://datatracker.ietf.org/doc/html/rfc7230#section-3.3)
- [RFC 7230 — Chunked Transfer Coding](https://datatracker.ietf.org/doc/html/rfc7230#section-4.1)
- [HTTP Request Smuggling](https://owasp.org/www-community/attacks/HTTP_Request_Smuggling)
