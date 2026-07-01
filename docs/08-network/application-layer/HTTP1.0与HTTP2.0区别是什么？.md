# HTTP 1.0 与 HTTP 2.0 区别是什么

## 核心概念

HTTP/1.0 和 HTTP/2 是 HTTP 协议的两个重要版本，相隔 20 年（1996 vs 2015）。HTTP/1.0 默认短连接、纯文本报文、串行请求；HTTP/2 引入二进制分帧、多路复用、头部压缩、服务端推送，在协议语义不变的前提下大幅提升性能。理解两者差异是优化 Web 性能、排查抓包异常的基础。

## 标准回答

HTTP/1.0 vs HTTP/2 核心差异：

| 维度 | HTTP/1.0 | HTTP/2 |
|------|----------|--------|
| 发布年份 | 1996 | 2015 |
| 默认连接 | 短连接（每请求独立 TCP） | 长连接 + 多路复用 |
| 报文格式 | 纯文本 | 二进制分帧 |
| 请求并发 | 串行（或浏览器开 6 个连接） | 单连接多 Stream 并发 |
| 头部 | 明文重复发送 | HPACK 压缩（静态表+动态表+Huffman） |
| 服务端推送 | 不支持 | 支持（PUSH_PROMISE 帧） |
| 队头阻塞 | 应用层（请求串行） | 应用层无，TCP 层仍有 |
| 协议协商 | 无 | ALPN 或 Upgrade |
| 加密 | 不强制 | 实际强制 TLS（事实标准） |

## 详细机制

### HTTP/1.0 的限制

1. **短连接**：默认每请求独立 TCP 连接，握手开销大
2. **串行请求**：一个连接上请求必须按序发出，响应按序返回
3. **头部浪费**：每次请求都带完整头部，Cookie 大时尤其浪费
4. **明文传输**：无加密，易被窃听篡改

```http
# HTTP/1.0 默认短连接
GET / HTTP/1.0
Host: example.com

# 显式开启 keep-alive
GET / HTTP/1.0
Host: example.com
Connection: keep-alive
```

### HTTP/2 的核心改进

#### 1. 二进制分帧

HTTP/2 把报文拆成二进制帧：

```
HTTP/1.1 报文（文本）：
GET / HTTP/1.1\r\n
Host: example.com\r\n
\r\n

HTTP/2 报文（二进制帧）：
+--------+--------+--------+--------+
| Length (3 bytes)                  |
+--------+--------+--------+--------+
| Type (1) | Flags (1) | Stream ID (4) |
+--------+--------+--------+--------+
| Payload ...                      |
+--------+--------+--------+--------+
```

- **HEADERS 帧**：存放头部（HPACK 压缩）
- **DATA 帧**：存放正文
- **Stream ID**：标识所属流（多路复用）

二进制解析快、紧凑，但人眼不可读，需用工具（如 Wireshark HTTP/2 解析器）。

#### 2. 多路复用

HTTP/2 在一个 TCP 连接上并发处理多个请求-响应：

```
HTTP/1.1：6 个 TCP 连接，每连接串行请求
HTTP/2：1 个 TCP 连接，多 Stream 并发

Client: Stream1 HEADERS ──> Stream2 HEADERS ──> Stream1 DATA ──> Stream3 HEADERS ──>
Server: Stream1 HEADERS ──> Stream3 HEADERS ──> Stream2 HEADERS ──> Stream1 DATA ──>
```

- 每个请求-响应是独立 Stream
- 帧可乱序发送，按 Stream ID 重组
- 客户端 Stream ID 奇数，服务端偶数

解决了 HTTP/1.1 的应用层队头阻塞。

#### 3. HPACK 头部压缩

HPACK 算法三件套：

- **静态表**：61 个高频头部（如 `:method: GET`、`accept-encoding: gzip`）预定义，发索引号即可
- **动态表**：连接内首次发送的头部加入动态表，后续发索引号
- **Huffman 编码**：字符串用 Huffman 编码压缩

```
首次请求:
  :method: GET          # 静态表索引 2
  :path: /index.html    # 加入动态表索引 62
  user-agent: Mozilla... # Huffman 编码

后续请求:
  :method: GET          # 静态表索引 2
  :path: /index.html    # 动态表索引 62
  user-agent: Mozilla... # 动态表索引 63
```

头部压缩率 50-90%，对 Cookie 大的场景尤其有效。

#### 4. 服务端推送

服务端可主动推送资源：

```
客户端请求 /index.html
服务端响应 HTML + 推送 /style.css + 推送 /script.js
  PUSH_PROMISE 帧（Stream ID 2）：告知客户端将推送 style.css
  DATA 帧（Stream ID 2）：style.css 内容
  PUSH_PROMISE 帧（Stream ID 4）：script.js
  DATA 帧（Stream ID 4）：script.js
```

客户端请求 HTML 时，服务端预测客户端会要 CSS/JS，提前推送，省往返。

#### 5. 流量控制

HTTP/2 Stream 级别的流量控制，类似 TCP 滑动窗口但更细粒度：

- 每个 Stream 独立窗口
- 接收方按 Stream 通告窗口大小
- 防止快速发送方淹没慢速接收方

### HTTP/2 仍存在的问题

**TCP 层队头阻塞**：

HTTP/2 多 Stream 跑在一个 TCP 连接上，TCP 保证字节流有序：

```
Stream1 数据1 ──> Stream2 数据1 ──> Stream1 数据2
Stream1 数据1 在网络中丢失
TCP 必须重传 Stream1 数据1 才能交付 Stream2 数据1 给应用层
→ 所有 Stream 都被阻塞
```

这是 HTTP/3 改用 QUIC 的核心动机。

### 协议协商

HTTP/2 通常基于 TLS，用 ALPN 协商：

```
TLS ClientHello:
  extension: ALPN
  protocols: ["h2", "http/1.1"]

服务端选 h2 → 走 HTTP/2
服务端选 http/1.1 → 退回 HTTP/1.1
```

```bash
# curl 测试 HTTP/2
$ curl -v --http2 https://example.com/
* ALPN: server accepted h2
* Using HTTP2, server supports multiplexing
> GET / HTTP/2
```

### 抓包示例

```bash
# HTTP/1.0 抓包（纯文本）
$ tcpdump -i any -n -A 'tcp port 80'
10:00:00 IP C.5000 > S.80: GET / HTTP/1.0
10:00:00 IP S.80 > C.5000: HTTP/1.0 200 OK..Content-Type: text/html..

# HTTP/2 抓包（二进制）
$ tcpdump -i any -n 'tcp port 443' -w h2.pcap
$ tshark -r h2.pcap -Y "http2"
10:00:00 HEADERS (stream=1, len=120)
10:00:00 DATA (stream=1, len=1024)
10:00:00 HEADERS (stream=3, len=80)
10:00:00 PUSH_PROMISE (stream=1, promised_stream=2)
```

## 代码示例

Java HttpClient 使用 HTTP/2：

```java
import java.net.http.*;
import java.net.URI;

HttpClient client = HttpClient.newBuilder()
    .version(HttpClient.Version.HTTP_2)   // 优先 HTTP/2
    .build();

HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("https://example.com/"))
    .GET()
    .build();

HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
System.out.println("Version: " + resp.version());   // HTTP_2
```

Nginx 启用 HTTP/2：

```nginx
server {
    listen 443 ssl http2;            # 启用 HTTP/2
    server_name example.com;
    ssl_certificate /etc/nginx/ssl/example.com.crt;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    # 服务端推送
    location / {
        root /var/www/html;
        http2_push /style.css;
        http2_push /script.js;
    }
}
```

## 实战场景

| 场景 | 选择 | 原因 |
|------|------|------|
| Web 站点 | HTTP/2 + TLS | 多路复用提升性能 |
| API 网关 | HTTP/2 | 减少连接数，提升吞吐 |
| 移动端 | HTTP/2 | 弱网首屏更快 |
| 内部服务 | HTTP/2 或 HTTP/1.1 | 内网可不用 TLS |
| 老旧客户端 | HTTP/1.1 | 兼容性 |

## 深挖追问

**Q1：HTTP/2 一定要 TLS 吗？**
规范上不强制，但主流浏览器只在 HTTPS 上支持 HTTP/2（h2）。明文 HTTP/2（h2c）只在内部场景使用。

**Q2：HTTP/2 完全消除队头阻塞吗？**
消除了应用层（多 Stream 并发），但 TCP 层仍有队头阻塞。HTTP/3 用 QUIC 解决 TCP 层问题。

**Q3：服务端推送总是好吗？**
不一定。如果客户端已有缓存，推送浪费带宽。需要配合 Cache-Digest 等机制。

**Q4：HPACK 动态表会无限增长吗？**
不会。两端协商动态表大小（SETTINGS_HEADER_TABLE_SIZE），超过 LRU 淘汰。

**Q5：HTTP/2 比 HTTP/1.1 快多少？**
首屏渲染快 20-50%，头部压缩节省 50-90% 头部流量。但稳态吞吐差异不大（都受 TCP 限制）。

## 易错点

- **"HTTP/2 是 HTTP + 加密"** — 不，加密是 TLS 的事，HTTP/2 不强制。
- **"HTTP/2 完全消除队头阻塞"** — 只消除应用层，TCP 层仍有。
- **"HTTP/2 必须用 TLS"** — 规范上不必，浏览器要求。
- **"HTTP/2 头部还是文本"** — 不，HPACK 压缩成二进制。
- **"HTTP/2 多连接"** — 不，单 TCP 连接多 Stream。

## 总结

HTTP/1.0 默认短连接、纯文本、串行请求；HTTP/2 引入二进制分帧、多路复用、HPACK 头部压缩、服务端推送，大幅提升性能。HTTP/2 消除了应用层队头阻塞但 TCP 层仍存在（HTTP/3 用 QUIC 解决）。生产推荐 HTTP/2 + TLS，移动端和 API 网关收益最大。

## 参考资料

- [RFC 1945 — HTTP/1.0](https://datatracker.ietf.org/doc/html/rfc1945)
- [RFC 7540 — HTTP/2](https://datatracker.ietf.org/doc/html/rfc7540)
- [RFC 7541 — HPACK](https://datatracker.ietf.org/doc/html/rfc7541)
