# HTTP 的报文结构是怎么样的

## 核心概念

HTTP 是应用层请求-响应协议，报文分为请求报文和响应报文两类。两者结构高度一致：起始行 + 头部 + 空行 + 正文。HTTP/1.x 是纯文本协议，每行以 `\r\n` 结尾，头部和正文之间用空行（`\r\n\r\n`）分隔。HTTP/2 改为二进制分帧但语义不变。理解报文结构是排查 HTTP 问题、写抓包过滤规则、设计自定义协议的基础。

## 标准回答

HTTP 报文由四部分组成：

```
请求报文:
+-----------------------+
| 请求行  方法 URI 版本   |  起始行
+-----------------------+
| Header1: value1       |
| Header2: value2       |  头部（多个）
| ...                   |
+-----------------------+
| (空行 \r\n)            |  分隔
+-----------------------+
| 请求体（可选）           |  正文
+-----------------------+

响应报文:
+-----------------------+
| 状态行  版本 码 短语    |  起始行
+-----------------------+
| Header1: value1       |  头部
| ...                   |
+-----------------------+
| (空行 \r\n)            |
+-----------------------+
| 响应体                  |  正文
+-----------------------+
```

请求行：`GET /api/users HTTP/1.1`
状态行：`HTTP/1.1 200 OK`

## 详细机制

### 请求报文示例

```http
POST /api/users HTTP/1.1
Host: api.example.com
Content-Type: application/json
Content-Length: 35
Authorization: Bearer eyJhbGc...
User-Agent: Mozilla/5.0
Accept: application/json
Connection: keep-alive

{"name":"Alice","age":30}
```

请求行三个字段：

- **方法**：GET/POST/PUT/DELETE 等
- **URI**：`/api/users`，可以是绝对路径或完整 URL（代理场景）
- **版本**：`HTTP/1.1` 或 `HTTP/2`

### 响应报文示例

```http
HTTP/1.1 200 OK
Server: nginx/1.21.0
Date: Wed, 01 Jan 2025 10:00:00 GMT
Content-Type: application/json
Content-Length: 28
Connection: keep-alive

{"id":1,"name":"Alice"}
```

状态行三个字段：

- **版本**：`HTTP/1.1`
- **状态码**：200
- **状态短语**：OK（人类可读，不影响处理）

### 头部字段

格式：`Name: Value`，每行一个，大小写不敏感。

按用途分类：

| 类别 | 示例 | 用途 |
|------|------|------|
| 通用 | `Cache-Control`、`Connection` | 请求和响应都可用 |
| 请求 | `Host`、`User-Agent`、`Accept`、`Authorization` | 客户端发 |
| 响应 | `Server`、`Set-Cookie`、`Location` | 服务端发 |
| 实体 | `Content-Type`、`Content-Length`、`Content-Encoding` | 描述正文 |

### 正文长度确定

服务端/客户端如何知道正文多长？三种方式：

1. **Content-Length**：明确字节数，最常用
2. **Transfer-Encoding: chunked**：分块传输，未知总长度时用
3. **无正文**：GET/HEAD/DELETE 通常无正文，靠连接关闭确定（HTTP/1.0 风格，1.1 不推荐）

### 分块传输（chunked）

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Transfer-Encoding: chunked

5\r\n
Hello\r\n
6\r\n
 World\r\n
0\r\n
\r\n
```

每块格式：`长度（十六进制）\r\n 数据 \r\n`，长度 0 表示结束。流式响应（如 SSE、大文件）常用。

### 抓包示例

```bash
$ curl -v http://example.com/
*   Trying 93.184.216.34:80...
* Connected to example.com (93.184.216.34) port 80 (#0)
> GET / HTTP/1.1                    # 请求行
> Host: example.com                 # 请求头
> User-Agent: curl/7.81.0
> Accept: */*
>
>                                   # 空行（请求头结束）
< HTTP/1.1 200 OK                   # 状态行
< Content-Type: text/html           # 响应头
< Content-Length: 1256
< ETag: "abc123"
< Accept-Ranges: bytes
< Last-Modified: Wed, 01 Jan 2025 10:00:00 GMT
< Vary: Accept-Encoding
< Server: ECS (dcb/7F84)
< Connection: keep-alive
<
<                                  # 空行（响应头结束）
<!doctype html>                    # 响应体
<html>
...
```

`>` 是客户端发出，`<` 是服务端响应。注意空行分隔。

### HTTP/2 的二进制分帧

HTTP/2 报文不再是纯文本，而是拆成二进制帧：

```
HTTP/1.1 报文：
GET / HTTP/1.1\r\n
Host: example.com\r\n
\r\n

HTTP/2 拆成帧：
+--------+--------+--------+--------+
| Length (3)  | Type (1) | Flags (1) |
+--------+--------+--------+--------+
| Stream ID (4)                    |
+--------+--------+--------+--------+
| Frame Payload ...                |
+--------+--------+--------+--------+
```

- **HEADERS 帧**：存放头部（HPACK 压缩）
- **DATA 帧**：存放正文
- **Stream ID**：标识所属流（多路复用）

但 HTTP/2 语义和 HTTP/1.1 一致，仍是请求-响应模型，方法、状态码、头部含义不变。

## 代码示例

Java 构造 HTTP 请求并观察报文：

```java
import java.net.*;
import java.io.*;

public class HttpRawDemo {
    public static void main(String[] args) throws Exception {
        Socket socket = new Socket("example.com", 80);
        OutputStream out = socket.getOutputStream();

        // 手动构造 HTTP 请求报文
        out.write("GET / HTTP/1.1\r\n".getBytes());
        out.write("Host: example.com\r\n".getBytes());
        out.write("User-Agent: Java-HttpDemo/1.0\r\n".getBytes());
        out.write("Connection: close\r\n".getBytes());
        out.write("\r\n".getBytes());   // 空行表示头部结束
        out.flush();

        // 读取响应
        BufferedReader in = new BufferedReader(
            new InputStreamReader(socket.getInputStream()));
        String line;
        while ((line = in.readLine()) != null) {
            System.out.println(line);
        }
        socket.close();
    }
}
```

Java 11+ HttpClient（自动构造报文）：

```java
import java.net.http.*;
import java.net.URI;

HttpClient client = HttpClient.newHttpClient();
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("http://example.com/"))
    .header("User-Agent", "Java-HttpDemo/1.0")
    .GET()
    .build();

HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
System.out.println("Status: " + resp.statusCode());
System.out.println("Headers: " + resp.headers());
System.out.println("Body: " + resp.body().substring(0, 100));
```

## 实战场景

| 场景 | 关注字段 | 排查 |
|------|---------|------|
| 接口参数解析失败 | Content-Type | JSON 接口必须 `application/json` |
| 大文件上传慢 | Content-Length、Expect: 100-continue | 检查是否分块、是否被代理缓冲 |
| 流式响应 | Transfer-Encoding: chunked | 确认中间件支持分块透传 |
| 缓存命中 | ETag、Last-Modified、Cache-Control | 检查请求头 If-None-Match |
| 跨域 | Origin、Access-Control-Allow-Origin | 看响应头是否带 CORS 头 |
| 重定向 | Location、3xx | 看是否循环重定向 |

## 深挖追问

**Q1：HTTP 报文为什么用 `\r\n` 而不是 `\n`？**
历史原因，HTTP 沿用 MIME 标准，MIME 沿用 RFC 822 邮件格式，邮件用 `\r\n` 是因为早期电报打字机 CR（回车）+ LF（换行）是两个动作。现代系统保持兼容。

**Q2：头部字段顺序重要吗？**
不重要，HTTP 规范不要求顺序。但生产中通常按惯例（Host 第一，Content-Type 在 Content-Length 前）便于阅读。

**Q3：Content-Length 错误会怎样？**
响应体截断或客户端 hang 住。如果 Content-Length 比实际短，客户端只读一部分；比实际长，客户端等不存在的数据直到超时。

**Q4：HTTP/2 的头部为什么是二进制？**
二进制解析快、紧凑。HTTP/2 用 HPACK 算法压缩头部，重复字段只发索引号，比纯文本省 50-90% 流量。

**Q5：请求行和状态行的版本字段是协议版本吗？**
是。但 HTTP/2 的请求行实际不存在（拆成帧了），抓包看到的 `GET / HTTP/2` 是工具按 HTTP/1 风格显示的。

## 易错点

- **"GET 一定没有请求体"** — 不，HTTP 规范不禁止 GET 带 body，但很多代理/服务器会丢弃。
- **"Content-Length 是字节数还是字符数"** — 字节数。中文字符 UTF-8 占 3 字节，Content-Length 要按字节算。
- **"HTTP/2 头部也是文本"** — 不，HTTP/2 头部经 HPACK 压缩成二进制。
- **"空行就是 \n"** — 是 `\r\n\r\n`，不是 `\n\n`。部分服务器容忍 `\n\n` 但不标准。
- **"状态码和状态短语必须匹配"** — 不，短语是给人看的，可以自定义（如 `200 OK` 写成 `200 Good`），客户端按状态码处理。

## 总结

HTTP 报文由起始行 + 头部 + 空行 + 正文组成，纯文本格式，行尾 `\r\n`。请求行包含方法/URI/版本，状态行包含版本/状态码/短语。正文长度靠 Content-Length 或 Transfer-Encoding: chunked 确定。HTTP/2 改为二进制分帧但语义不变。掌握报文结构是抓包分析、协议设计、跨语言调试的基础。

## 参考资料

- [RFC 7230 — HTTP/1.1 Message Syntax and Routing](https://datatracker.ietf.org/doc/html/rfc7230)
- [RFC 7540 — HTTP/2](https://datatracker.ietf.org/doc/html/rfc7540)
- [MDN — HTTP Messages](https://developer.mozilla.org/en-US/docs/Web/HTTP/Messages)
