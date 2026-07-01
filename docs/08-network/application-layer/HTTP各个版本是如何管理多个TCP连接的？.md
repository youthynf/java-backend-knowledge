# HTTP 各个版本是如何管理多个 TCP 连接的

## 核心概念

HTTP 各版本对 TCP 连接的管理策略差异巨大：HTTP/1.0 默认短连接（每请求独立 TCP），HTTP/1.1 默认长连接 + 浏览器开 6 个连接绕开队头阻塞，HTTP/2 单连接多路复用，HTTP/3 基于 QUIC 单连接多 Stream。理解连接管理的演进是优化 Web 性能、排查连接数异常的基础。

## 标准回答

HTTP 各版本连接管理：

| 版本 | 连接方式 | 并发请求 | 连接数 |
|------|---------|---------|--------|
| HTTP/1.0 | 短连接（默认） | 串行 | 每请求 1 个 TCP |
| HTTP/1.0 + keep-alive | 长连接 | 串行 | 复用 |
| HTTP/1.1 | 长连接（默认） | 串行 + 浏览器 6 连接 | 每域名 6 个 |
| HTTP/2 | 长连接 + 多路复用 | 单连接并发 | 每域名 1 个 |
| HTTP/3 | QUIC + 多路复用 | 单连接并发 | 每域名 1 个 |

## 详细机制

### HTTP/1.0：短连接

```
请求 1: TCP 握手 → HTTP 请求-响应 → TCP 关闭
请求 2: TCP 握手 → HTTP 请求-响应 → TCP 关闭
```

每个请求独立 TCP 连接，握手开销大。

显式开启 keep-alive：

```
GET / HTTP/1.0
Connection: keep-alive
```

### HTTP/1.1：长连接 + 多连接绕开 HOL

默认 keep-alive：

```
TCP 握手 → 请求 1-响应 1 → 请求 2-响应 2 → ... → 空闲超时关闭
```

单连接内请求串行，前一个慢阻塞后续（应用层队头阻塞）。

浏览器绕开：对同一域名开 6-8 个 TCP 连接并发：

```
连接 1: 请求 1 ──> 响应 1
连接 2: 请求 2 ──> 响应 2
...
连接 6: 请求 6 ──> 响应 6
```

每个连接内部仍串行，但 6 个连接并发。

### HTTP/1.1 多连接的实现

**浏览器连接池**：

- 每域名维护连接池，默认上限 6 个（Chrome/Firefox）
- 连接复用（keep-alive），避免重复握手
- 超时空闲连接自动关闭

**连接建立流程**：

1. DNS 解析
2. TCP 三次握手（每个连接独立）
3. TLS 握手（HTTPS，每连接独立）
4. HTTP 请求-响应
5. 复用或关闭

**资源调度**：

- 浏览器按资源优先级分配连接（HTML 优先于图片）
- 高优先级资源先用连接
- 低优先级排队

**多连接的代价**：

- 6 次握手（6 RTT）
- 6 次慢启动爬坡
- 6 倍服务端资源（sock、缓冲区、fd）
- 6 倍客户端端口消耗

### HTTP/2：单连接多路复用

```
单 TCP 连接：
Stream 1: 请求 ──> 响应
Stream 3: 请求 ──> 响应   ← 并发，不等 Stream 1
Stream 5: 请求 ──> 响应
```

- 一个 TCP 连接上可有任意多 Stream（受 SETTINGS_MAX_CONCURRENT_STREAMS 限制，默认 100+）
- Stream 间帧可交错发送
- 应用层无队头阻塞

**连接数**：每域名 1 个 TCP 连接即可。

**但仍受 TCP 层队头阻塞**：TCP 字节流有序，一个包丢失阻塞所有 Stream。

### HTTP/3：QUIC 多路复用

```
单 QUIC 连接（基于 UDP）：
Stream 1: 请求 ──> 响应
Stream 3: 请求 ──> 响应   ← Stream 间完全独立
Stream 5: 请求 ──> 响应
```

- 各 Stream 独立，丢一个 Stream 的包不影响其他 Stream
- 连接迁移：IP 变化连接保持

### 各版本对比

```
HTTP/1.0:
  Client ──[TCP1]──> Server  请求 1
  Client ──[TCP2]──> Server  请求 2
  # 每请求独立连接

HTTP/1.1:
  Client ──[TCP1]──> Server  请求 1, 2, 3...  串行
  Client ──[TCP2]──> Server  请求 4, 5, 6...  串行
  ...
  Client ──[TCP6]──> Server  请求 16, 17, 18...  串行
  # 6 个连接并发，每连接内串行

HTTP/2:
  Client ──[TCP1]──> Server  Stream 1, 3, 5, 7, ...  并发
  # 单连接多 Stream

HTTP/3:
  Client ──[QUIC1]──> Server  Stream 1, 3, 5, 7, ...  并发
  # 单 QUIC 连接多 Stream，无 TCP HOL
```

### 连接数监控

```bash
# 浏览器 DevTools Network → 看连接数
# 同域名下：
#   HTTP/1.1: 6 个 TCP 连接
#   HTTP/2: 1 个 TCP 连接
#   HTTP/3: 1 个 QUIC 连接

# 服务端看连接数
$ ss -tan | grep :443 | wc -l
# HTTP/1.1: 数千（每用户 6 个）
# HTTP/2: 数百（每用户 1 个）
```

### 域名分片（HTTP/1.1 优化）

HTTP/1.1 时代为绕开 6 连接限制，用多个子域名：

```html
<img src="https://img1.example.com/a.jpg">
<img src="https://img2.example.com/b.jpg">
<img src="https://img3.example.com/c.jpg">
```

每子域名各开 6 个连接，总并发 18 个。

但 HTTP/2 时代不需要（单连接多路复用），域名分片反而增加连接管理开销。

### 抓包示例

```bash
# HTTP/1.1 多连接
$ tcpdump -i any -n 'host example.com' | head
10:00:00 IP C.5000 > S.80: Flags [S]   # 连接 1 握手
10:00:00 IP C.5001 > S.80: Flags [S]   # 连接 2 握手
10:00:00 IP C.5002 > S.80: Flags [S]   # 连接 3 握手
...
10:00:00 IP C.5005 > S.80: Flags [S]   # 连接 6 握手
# 6 个连接同时握手

# HTTP/2 单连接
$ tcpdump -i any -n 'host example.com' | head
10:00:00 IP C.5000 > S.443: Flags [S]   # 只有 1 个连接
# 单连接复用
```

## 代码示例

服务端配置 HTTP/2（Nginx）：

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;
    ssl_certificate /etc/nginx/ssl/example.com.crt;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;

    # HTTP/2 多路复用，无需域名分片
    # 单连接可处理数百并发请求
}

# 同时支持 HTTP/3（Nginx 1.25+）
server {
    listen 443 quic reuseport;
    listen 443 ssl http2;
    server_name example.com;
    add_header Alt-Svc 'h3=":443"; ma=86400';
}
```

Java HttpClient 连接池（HTTP/1.1）：

```java
import org.apache.http.impl.client.*;
import org.apache.http.client.config.*;

CloseableHttpClient client = HttpClients.custom()
    .setMaxConnTotal(100)            // 总连接数
    .setMaxConnPerRoute(20)          // 每路由（域名）最大连接数
    .setDefaultRequestConfig(RequestConfig.custom()
        .setConnectTimeout(5000)
        .setSocketTimeout(10000)
        .build())
    .build();

// HTTP/1.1 下，每域名最多 20 个连接并发
// HTTP/2 下，连接池自动复用单连接
```

Java HttpClient HTTP/2 多请求并发：

```java
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;

HttpClient client = HttpClient.newBuilder()
    .version(HttpClient.Version.HTTP_2)
    .build();

// 10 个请求并发，复用同一 TCP 连接
List<CompletableFuture<HttpResponse<String>>> futures = uris.stream()
    .map(uri -> client.sendAsync(
        HttpRequest.newBuilder().uri(uri).GET().build(),
        HttpResponse.BodyHandlers.ofString()))
    .toList();
```

## 实战场景

| 版本 | 连接数 | 适用场景 | 注意点 |
|------|-------|---------|--------|
| HTTP/1.1 | 每域名 6 个 | 兼容老客户端 | 资源合并、域名分片 |
| HTTP/2 | 每域名 1 个 | 现代 Web | 单连接异常影响所有请求 |
| HTTP/3 | 每域名 1 个 | 移动端、弱网 | UDP 兼容性 |

## 深挖追问

**Q1：HTTP/1.1 浏览器为什么开 6 个连接？**
平衡并发和资源开销。6 是经验值，开太多拖累服务端（每连接占 sock、缓冲区、fd）。HTTP/1.1 RFC 未限定，浏览器实现不同。

**Q2：HTTP/2 单连接会不会成为瓶颈？**
不会，单连接多 Stream 并发足够。但 TCP 层队头阻塞是个问题（HTTP/3 解决）。

**Q3：HTTP/2 还需要域名分片吗？**
不需要且有害。单连接多路复用，分片增加连接管理开销。

**Q4：HTTP/3 完全替代 HTTP/2 吗？**
不完全是，会长期共存。浏览器先用 HTTP/2，服务端通过 Alt-Svc 告知支持 HTTP/3，下次尝试 HTTP/3，失败回退 HTTP/2。

**Q5：服务端连接数过多怎么排查？**
`ss -tan | grep :443 | wc -l` 看连接数，`ss -tanp` 看进程，`netstat -an | awk '/tcp/{print $NF}' | sort | uniq -c` 看状态分布。

## 易错点

- **"HTTP/1.1 默认短连接"** — 反了，默认长连接。
- **"HTTP/2 用多个 TCP 连接"** — 不，单连接多 Stream。
- **"HTTP/3 还用 TCP"** — 不，基于 QUIC over UDP。
- **"浏览器只能开 1 个连接"** — HTTP/1.1 默认 6 个，HTTP/2 单个。
- **"域名分片对 HTTP/2 有用"** — 有害，增加开销。

## 总结

HTTP 各版本连接管理演进：HTTP/1.0 短连接每请求独立 TCP；HTTP/1.1 长连接 + 浏览器 6 连接绕开 HOL；HTTP/2 单连接多 Stream 多路复用；HTTP/3 基于 QUIC 单连接 + 连接迁移。连接数从每请求 1 个、每域名 6 个、每域名 1 个逐步减少。生产推荐 HTTP/2 + TLS，移动端考虑 HTTP/3。域名分片在 HTTP/2 时代过时。

## 参考资料

- [RFC 7230 — HTTP/1.1 Connection Management](https://datatracker.ietf.org/doc/html/rfc7230#section-6)
- [RFC 7540 — HTTP/2 Multiplexing](https://datatracker.ietf.org/doc/html/rfc7540#section-5)
- [RFC 9114 — HTTP/3](https://datatracker.ietf.org/doc/html/rfc9114)
