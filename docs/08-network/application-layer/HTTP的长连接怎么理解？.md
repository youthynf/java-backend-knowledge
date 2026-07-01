# HTTP 的长连接怎么理解

## 核心概念

HTTP 长连接（Keep-Alive）指一个 TCP 连接上可以连续发送多个 HTTP 请求-响应，而不是每个请求都新建+关闭 TCP。HTTP/1.0 默认短连接（每个请求独立 TCP），HTTP/1.1 默认长连接（Connection: keep-alive），HTTP/2 进一步用多路复用让单连接并发处理多个请求。长连接减少握手开销、降低延迟、提升吞吐，是现代 Web 性能优化的基础。

## 标准回答

HTTP 各版本的连接管理：

| 版本 | 默认连接方式 | 头部 | 多请求并发 |
|------|------------|------|----------|
| HTTP/1.0 | 短连接 | `Connection: keep-alive` 显式开启 | 串行 |
| HTTP/1.1 | 长连接 | `Connection: close` 显式关闭 | 管道化（少用） |
| HTTP/2 | 长连接 + 多路复用 | 不用 Connection 头 | 单连接并发 |
| HTTP/3 | 长连接 + 多路复用 | 同 HTTP/2 | 单连接并发 |

长连接的本质：复用 TCP 连接，避免每次请求都三次握手 + 慢启动。

## 详细机制

### HTTP/1.0 短连接

```
请求 1: TCP 三次握手 → HTTP 请求-响应 → TCP 四次挥手
请求 2: TCP 三次握手 → HTTP 请求-响应 → TCP 四次挥手
请求 3: TCP 三次握手 → HTTP 请求-响应 → TCP 四次挥手
```

每个请求独立 TCP 连接，握手开销大。10 个请求 = 10 次 TCP 握手 + 10 次挥手，浪费 RTT。

### HTTP/1.0 Keep-Alive（显式开启）

```
GET / HTTP/1.0
Connection: keep-alive
```

客户端在请求头加 `Connection: keep-alive`，服务端响应也带上，表示同意复用连接。

### HTTP/1.1 默认长连接

```
GET / HTTP/1.1
Host: example.com
# 默认 keep-alive，无需显式声明

# 显式关闭
Connection: close
```

HTTP/1.1 默认所有连接都是 keep-alive，要关闭才需要 `Connection: close`。

### 长连接的请求序列

```
Client                          Server
  | --- TCP 握手 -------------->     |
  | --- HTTP 请求 1 ----------->     |
  | <== HTTP 响应 1 ===========     |
  | --- HTTP 请求 2 ----------->     |  复用同一 TCP 连接
  | <== HTTP 响应 2 ===========     |
  | --- HTTP 请求 3 ----------->     |
  | <== HTTP 响应 3 ===========     |
  | --- TCP 关闭 (FIN) ------->     |  空闲超时后关闭
```

请求必须按序发出（HTTP/1.1 管道化少见），响应也按序返回。

### 长连接的生命周期

连接什么时候关闭？

1. **客户端发 `Connection: close`**：明确告知服务端不要复用
2. **服务端发 `Connection: close`**：服务端主动关闭（如负载高、维护）
3. **空闲超时**：服务端配置 keep-alive timeout（Nginx 默认 65 秒），超时主动关
4. **请求数达到上限**：Nginx `keepalive_requests`（默认 1000），达上限主动关
5. **连接异常**：网络中断、进程崩溃

```nginx
# Nginx 配置
keepalive_timeout 65;       # 空闲 65 秒后关闭
keepalive_requests 1000;    # 1000 次请求后关闭
```

### 长连接 vs 管道化

**长连接（默认）**：请求-响应-请求-响应-...，必须等响应才能发下一请求。

**管道化（pipelining）**：客户端连续发多个请求不等响应。

```
长连接：
  Client: 请求1 ──> 响应1 ──> 请求2 ──> 响应2 ──> 请求3 ──> 响应3

管道化：
  Client: 请求1 ──> 请求2 ──> 请求3 ──> 响应1 ──> 响应2 ──> 响应3
```

管道化的问题：

- 响应必须按请求顺序返回（队头阻塞）
- 第一个请求慢，后续响应都被阻塞
- 中间代理支持不一致
- 浏览器基本默认关闭管道化

实际生产中管道化很少用，HTTP/2 的多路复用是更好的替代。

### HTTP/2 多路复用

HTTP/2 在一个 TCP 连接上并发处理多个请求-响应：

```
Client: Stream1 帧 ──> Stream2 帧 ──> Stream1 帧 ──> Stream3 帧 ──>
Server: Stream1 帧 ──> Stream3 帧 ──> Stream2 帧 ──> Stream1 帧 ──>
```

- 每个请求-响应是一个独立 Stream（流）
- 帧可以乱序发送，按 Stream ID 重组
- 一个流丢包不影响其他流的应用层逻辑（但 TCP 层仍队头阻塞，这是 HTTP/3 的动机）

### 长连接的资源占用

每个 TCP 连接占用：

- 内核 sock 结构（约 4 KB）
- 发送/接收缓冲区（默认各 64-128 KB）
- 应用层 socket fd（受 `ulimit -n` 限制）

10 万个长连接约占用 2-3 GB 内存。生产中要调大 fd 限制和缓冲区配置。

### 抓包示例

```bash
# HTTP/1.1 长连接抓包
$ tcpdump -i any -n 'tcp port 80 and host example.com'
10:00:00 IP C.5000 > S.80: Flags [S], seq 1          # TCP 握手
10:00:00 IP S.80 > C.5000: Flags [S.], seq 2, ack 2
10:00:00 IP C.5000 > S.80: Flags [.], ack 2
10:00:00 IP C.5000 > S.80: Flags [P.], seq 2:100      # HTTP 请求 1
10:00:00 IP S.80 > C.5000: Flags [P.], seq 2:500, ack 100   # 响应 1
10:00:01 IP C.5000 > S.80: Flags [P.], seq 100:200    # HTTP 请求 2（复用连接）
10:00:01 IP S.80 > C.5000: Flags [P.], seq 500:1000, ack 200 # 响应 2
# 没有 TCP 握手和挥手，连接复用
```

```bash
# curl 观察长连接
$ curl -v http://example.com/ http://example.com/foo
# 两个请求复用同一连接，第二个请求没有 "Connected to..."
```

## 代码示例

Java HttpClient 自动管理连接池：

```java
import java.net.http.*;
import java.net.URI;
import java.time.*;

HttpClient client = HttpClient.newBuilder()
    .version(HttpClient.Version.HTTP_2)
    .connectTimeout(Duration.ofSeconds(5))
    .build();

// 多个请求复用底层连接（HttpClient 内部连接池）
HttpRequest req1 = HttpRequest.newBuilder().uri(URI.create("https://example.com/")).build();
HttpRequest req2 = HttpRequest.newBuilder().uri(URI.create("https://example.com/foo")).build();

HttpResponse<String> r1 = client.send(req1, HttpResponse.BodyHandlers.ofString());
HttpResponse<String> r2 = client.send(req2, HttpResponse.BodyHandlers.ofString());
// 内部复用 TCP 连接，无需应用层管理
```

Apache HttpClient 显式配置连接池：

```java
import org.apache.http.impl.client.*;
import org.apache.http.client.config.*;

CloseableHttpClient client = HttpClients.custom()
    .setMaxConnTotal(100)            // 总连接数
    .setMaxConnPerRoute(20)          // 每个路由（host）最大连接数
    .setDefaultRequestConfig(RequestConfig.custom()
        .setConnectTimeout(5000)     // 建连超时
        .setSocketTimeout(10000)     // 读超时
        .setConnectionRequestTimeout(2000)  // 从连接池获取连接的超时
        .build())
    .build();
```

服务端配置 keep-alive（Nginx）：

```nginx
http {
    keepalive_timeout 65;          # 空闲超时
    keepalive_requests 1000;       # 单连接最大请求数
    keepalive_time 1h;             # 单连接最大存活时间（Nginx 1.19+）

    # 上游 keepalive（让 Nginx 与后端也复用连接）
    upstream backend {
        server 10.0.0.1:8080;
        keepalive 32;              # 缓存 32 个空闲连接
    }
}
```

## 实战场景

| 场景 | 配置 | 注意点 |
|------|------|--------|
| API 网关 | 长连接 + 连接池 | 连接池大小要匹配 QPS |
| 移动端 App | 长连接 + 心跳 | 心跳间隔 < NAT 超时（5-30 分钟） |
| 微服务调用 | gRPC over HTTP/2 | 单连接多请求，连接数少 |
| 高并发短请求 | HTTP/2 多路复用 | 避免队头阻塞 |
| 静态资源 | 长连接 + CDN | 资源合并减少请求数 |

## 深挖追问

**Q1：长连接和 keep-alive 是一回事吗？**
HTTP 层面是。TCP 层的 `SO_KEEPALIVE` 是另一种机制（检测死亡连接，默认 2 小时），和 HTTP keep-alive 完全不同。

**Q2：长连接会一直保持吗？**
不会。受超时、请求数上限、异常断开等影响，最终都会关闭。生产中通常 1-5 分钟空闲就关。

**Q3：HTTP/2 还需要 Connection: keep-alive 吗？**
不需要。HTTP/2 默认多路复用，禁止使用 Connection 头。

**Q4：长连接会让服务端内存涨吗？**
会。每个连接占用 sock 结构和缓冲区，几 KB 到几百 KB 不等。10 万连接约几 GB。

**Q5：客户端连接池大小怎么定？**
按 Little's Law：连接数 = QPS × 平均处理时间。1000 QPS × 10ms = 10 个连接。预留 50% 余量。

## 易错点

- **"HTTP 长连接 = TCP keepalive"** — 不是，前者是 HTTP 应用层复用连接，后者是 TCP 内核检测死亡。
- **"HTTP/1.1 默认短连接"** — 反了，默认长连接，要关才需 `Connection: close`。
- **"管道化解决了队头阻塞"** — 没有，管道化响应仍按序返回，前一个慢会阻塞后续。
- **"长连接永远不断"** — 不，受超时和上限控制。
- **"HTTP/2 用多个 TCP 连接"** — 不，HTTP/2 单 TCP 连接多路复用。

## 总结

HTTP 长连接指复用 TCP 连接发多个请求，HTTP/1.1 默认开启。长连接减少握手开销但增加服务端资源占用，需要合理的超时和连接池配置。HTTP/2 进一步用多路复用让单连接并发处理多个请求，是现代 Web 的主流。和 TCP keepalive 是完全不同的概念，HTTP/2 不再使用 Connection 头。

## 参考资料

- [RFC 7230 — HTTP/1.1 Message Syntax and Routing, Section 6.3 Persistence](https://datatracker.ietf.org/doc/html/rfc7230#section-6.3)
- [RFC 7540 — HTTP/2](https://datatracker.ietf.org/doc/html/rfc7540)
- [MDN — HTTP Persistent Connections](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Keep-Alive)
