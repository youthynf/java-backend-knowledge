# HTTP/2 是什么

## 核心概念

HTTP/2 是 HTTP 协议的第二个主要版本，2015 年发布（RFC 7540）。它在 HTTP/1.1 语义不变的前提下，通过二进制分帧、多路复用、HPACK 头部压缩、服务端推送四大特性大幅提升性能。HTTP/2 通常基于 TLS（事实标准），解决了 HTTP/1.1 的应用层队头阻塞和头部浪费问题，是现代 Web 的主流协议。

## 标准回答

HTTP/2 的核心特性：

1. **二进制分帧**：报文拆成二进制帧（HEADERS、DATA 等），解析快、紧凑
2. **多路复用**：单 TCP 连接并发处理多个 Stream，消除应用层队头阻塞
3. **HPACK 头部压缩**：静态表 + 动态表 + Huffman 编码，压缩率 50-90%
4. **服务端推送**：服务端主动推送资源（PUSH_PROMISE 帧）
5. **流量控制**：Stream 级别独立窗口

## 详细机制

### 1. 二进制分帧层

HTTP/2 在 HTTP 应用层和 TCP 之间插入"二进制分帧层"：

```
应用层:    HTTP 请求/响应（语义不变）
              ↓ 拆成帧
分帧层:    HEADERS 帧 + DATA 帧（二进制）
              ↓
传输层:    TCP（不变）
```

帧结构（9 字节头 + payload）：

```
+-----------------------------------+
| Length (3 bytes)                  |  payload 长度
+-----------------------------------+
| Type (1 byte)                     |  帧类型
+-----------------------------------+
| Flags (1 byte)                    |  控制标志
+-----------------------------------+
| Stream ID (4 bytes)               |  所属流 ID（最高位保留）
+-----------------------------------+
| Payload ...                       |
+-----------------------------------+
```

帧类型：

| 类型 | 用途 |
|------|------|
| HEADERS | 头部（HPACK 压缩） |
| DATA | 正文 |
| PRIORITY | Stream 优先级 |
| RST_STREAM | 终止 Stream |
| SETTINGS | 连接参数 |
| PUSH_PROMISE | 服务端推送预告 |
| PING | 心跳 |
| GOAWAY | 优雅关闭 |
| WINDOW_UPDATE | 流量控制 |
| CONTINUATION | 头部延续 |

### 2. 多路复用

Stream、Message、Frame 三层关系：

```
HTTP/2 连接
├── Stream 1（客户端发起，奇数）
│   ├── Message: 请求
│   │   ├── HEADERS 帧
│   │   └── DATA 帧
│   └── Message: 响应
│       ├── HEADERS 帧
│       └── DATA 帧
├── Stream 3
│   └── ...
└── Stream 2（服务端推送，偶数）
    └── ...
```

- **Stream**：双向虚拟通道，独立收发
- **Message**：完整的请求或响应，由多个帧组成
- **Frame**：最小传输单位

特性：

- 单 TCP 连接上可有任意多 Stream（受 SETTINGS_MAX_CONCURRENT_STREAMS 限制）
- Stream 间帧可交错发送
- 同一 Stream 内帧必须有序
- Stream 可被 RST_STREAM 终止

### 3. HPACK 头部压缩

三件套：

**静态表**（61 项，RFC 7541 定义）：

```
索引  名称                  值
1    :authority             (空)
2    :method                GET
3    :method                POST
4    :path                  /
...
61   www-authenticate       (空)
```

发索引号即可，无需发名称和值。

**动态表**：

连接内首次发送的头部加入动态表（索引 62 起），后续发索引号：

```
请求 1: :path: /users/1   # 加入动态表索引 62
请求 2: :path: /users/2   # 加入动态表索引 63
请求 3: :path: /users/1   # 直接用动态表索引 62
```

**Huffman 编码**：

字符串值用 Huffman 编码压缩，常见字符（如 `application/json`）压缩率 50%+。

整体效果：HTTP/1.1 头部约 800 字节，HTTP/2 HPACK 压缩后约 100 字节。

### 4. 服务端推送

服务端预测客户端需要的资源，主动推送：

```
1. 客户端请求 GET /index.html
2. 服务端在响应前先发 PUSH_PROMISE 帧
   PUSH_PROMISE: Stream ID 2, :method=GET, :path=/style.css
   → 告知客户端"我将在 Stream 2 推送 style.css"
3. 服务端响应 Stream 1（HTML）
4. 服务端在 Stream 2 推送 style.css
```

客户端可通过 SETTINGS_ENABLE_PUSH=0 禁用推送。

### 5. 流量控制

每个 Stream 独立窗口，类似 TCP 滑动窗口：

```
SETTINGS: INITIAL_WINDOW_SIZE = 65535（默认）
WINDOW_UPDATE: Stream 1, increment = 1000   # Stream 1 窗口 +1000
```

接收方按 Stream 通告窗口，防止快速发送方淹没慢速接收方。

### 6. Stream 优先级

客户端可指定 Stream 优先级（权重 + 依赖）：

```
PRIORITY 帧:
  Stream ID: 5
  Dependency: 0    # 不依赖其他 Stream
  Weight: 201      # 权重 1-256
```

服务端据此调度资源，重要资源（如 HTML、CSS）优先发。

### 协议协商

HTTP/2 通常 over TLS，用 ALPN 协商：

```
TLS ClientHello:
  ALPN extension: ["h2", "http/1.1"]

服务端选 h2 → HTTP/2
服务端选 http/1.1 → HTTP/1.1
```

明文 HTTP/2（h2c）用 Upgrade 机制，但浏览器不支持：

```
GET / HTTP/1.1
Upgrade: h2c
Connection: Upgrade, HTTP2-Settings

HTTP/1.1 101 Switching Protocols
Upgrade: h2c
```

### 抓包示例

```bash
# 用 curl --http2
$ curl -v --http2 https://example.com/
* ALPN: offers h2,http/1.1
* ALPN: server accepted h2
* Using HTTP2
> GET / HTTP/2
< HTTP/2 200

# 用 tshark 解析 HTTP/2
$ tshark -i any -Y "http2" -O http2
Frame 1: HEADERS (stream=1)
  Length: 120
  Type: HEADERS (1)
  Flags: 0x04 (END_HEADERS)
  Stream ID: 1
  Header Block: :method=GET, :path=/, :authority=example.com

Frame 2: HEADERS (stream=1, response)
Frame 3: DATA (stream=1, len=1024)
```

## 代码示例

Java HttpClient HTTP/2：

```java
import java.net.http.*;
import java.net.URI;

HttpClient client = HttpClient.newBuilder()
    .version(HttpClient.Version.HTTP_2)
    .build();

HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("https://example.com/"))
    .header("Accept", "text/html")
    .GET()
    .build();

HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
System.out.println("Version: " + resp.version());   // HTTP_2
```

并发多请求（多路复用）：

```java
import java.util.*;
import java.util.concurrent.*;

List<URI> uris = List.of(
    URI.create("https://example.com/"),
    URI.create("https://example.com/foo"),
    URI.create("https://example.com/bar")
);

List<CompletableFuture<HttpResponse<String>>> futures = uris.stream()
    .map(uri -> client.sendAsync(
        HttpRequest.newBuilder().uri(uri).GET().build(),
        HttpResponse.BodyHandlers.ofString()))
    .toList();

CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
// 三个请求复用同一 TCP 连接，并发发送
```

Nginx 启用 HTTP/2：

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;
    ssl_certificate /etc/nginx/ssl/example.com.crt;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;

    location / {
        root /var/www/html;
        http2_push /style.css;
        http2_push /script.js;
    }
}
```

## 实战场景

| 场景 | 优势 | 注意点 |
|------|------|--------|
| 多资源网页 | 多路复用减少连接数 | 仍受 TCP 队头阻塞 |
| API 网关 | 单连接多请求 | 连接异常影响所有请求 |
| 移动端 | 头部压缩省流量 | 弱网下提升明显 |
| 服务端推送 | 预加载资源 | 客户端可能已缓存，浪费 |
| 微服务 | gRPC 基于 HTTP/2 | 单连接多请求 |

## 深挖追问

**Q1：HTTP/2 还用 TCP 吗？**
用。HTTP/2 仍基于 TCP，多 Stream 共享一个 TCP 连接。TCP 层队头阻塞是 HTTP/3 改用 QUIC 的动机。

**Q2：HTTP/2 必须用 HTTPS 吗？**
规范上不必，明文 HTTP/2（h2c）存在但浏览器不支持。事实标准是 HTTP/2 over TLS。

**Q3：HPACK 动态表会无限增长吗？**
不会。两端协商动态表大小（SETTINGS_HEADER_TABLE_SIZE，默认 4096），超限 LRU 淘汰。

**Q4：服务端推送有什么坑？**
客户端可能已缓存资源，推送浪费带宽。HTTP/2 缓存摘要（Cache Digest）扩展可解决，但用得少。

**Q5：HTTP/2 比 HTTP/1.1 快多少？**
首屏渲染快 20-50%，头部流量省 80%+。稳态吞吐差异不大。

## 易错点

- **"HTTP/2 是 HTTP/3 的别名"** — 不是，HTTP/2 基于 TCP，HTTP/3 基于 QUIC。
- **"HTTP/2 多 TCP 连接"** — 不，单 TCP 连接多 Stream。
- **"HTTP/2 头部仍是文本"** — 不，HPACK 压缩成二进制。
- **"HTTP/2 必须用 TLS"** — 规范不必，浏览器要求。
- **"HTTP/2 完全消除队头阻塞"** — 只消除应用层，TCP 层仍有。

## 总结

HTTP/2 通过二进制分帧、多路复用、HPACK 头部压缩、服务端推送大幅提升性能，是现代 Web 的主流协议。它消除了 HTTP/1.1 的应用层队头阻塞和头部浪费，但 TCP 层队头阻塞仍存在（HTTP/3 用 QUIC 解决）。生产推荐 HTTP/2 + TLS，移动端和 API 网关收益最大。

## 参考资料

- [RFC 7540 — HTTP/2](https://datatracker.ietf.org/doc/html/rfc7540)
- [RFC 7541 — HPACK Header Compression](https://datatracker.ietf.org/doc/html/rfc7541)
- [HTTP/2 简介](https://web.dev/articles/performance-http2)
