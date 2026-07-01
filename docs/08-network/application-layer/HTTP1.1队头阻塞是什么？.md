# HTTP 1.1 队头阻塞是什么

## 核心概念

HTTP/1.1 队头阻塞（Head-of-Line Blocking, HOL Blocking）指在 HTTP/1.1 长连接上，前一个请求的响应未完成时，后续请求必须等待，所有请求被"队首"阻塞。这是 HTTP/1.1 串行请求-响应模型的固有缺陷，浏览器通常开 6 个 TCP 连接绕开，但治标不治本。HTTP/2 用多路复用彻底解决应用层队头阻塞，但 TCP 层仍存在（HTTP/3 解决）。

## 标准回答

HTTP/1.1 队头阻塞的两种情况：

1. **应用层队头阻塞**：长连接上请求必须按序响应，前一个慢响应阻塞后续所有响应
2. **TCP 层队头阻塞**：TCP 字节流必须按序交付，前一个包丢失阻塞后续所有数据

HTTP/1.1 解决：浏览器开多个 TCP 连接（6-8 个）并发请求
HTTP/2 解决：单连接多路复用，应用层无队头阻塞
HTTP/3 解决：QUIC 各 Stream 独立，TCP 层也无队头阻塞

## 详细机制

### HTTP/1.1 长连接的请求-响应模型

HTTP/1.1 默认 keep-alive，复用 TCP 连接：

```
Client ──> 请求 1 ──> 响应 1 ──> 请求 2 ──> 响应 2 ──> 请求 3 ──> 响应 3
```

请求必须按序发出，响应必须按序返回。

### 应用层队头阻塞

```
Client: 请求 1（慢：服务端处理 5 秒）
Client: 请求 2（快：0.1 秒能完成）  ← 必须等请求 1 响应完才能发
Client: 请求 3                       ← 必须等请求 2 响应完才能发

Server: 响应 1（5 秒后）
Server: 响应 2（5.1 秒）
Server: 响应 3（5.2 秒）

# 即使请求 2、3 本身只需 0.1 秒，也要等请求 1 完成
```

前一个请求的处理时间影响所有后续请求的延迟。

### HTTP/1.1 管道化（Pipelining）

HTTP/1.1 引入管道化，允许客户端连续发多个请求不等响应：

```
Client: 请求 1 ──> 请求 2 ──> 请求 3 ──> 响应 1 ──> 响应 2 ──> 响应 3
```

但响应仍必须按请求顺序返回：

```
请求 1 慢响应（5 秒）
请求 2 快响应（0.1 秒）已完成，但不能先返回，必须等请求 1 响应
→ 还是队头阻塞
```

管道化的问题：

- 响应必须按序返回，前一个慢阻塞后续
- 中间代理支持不一致
- 浏览器基本默认关闭管道化
- 难以取消请求

实际生产中管道化很少用。

### 浏览器的绕开方案：多 TCP 连接

浏览器对同一域名开 6-8 个 TCP 连接（HTTP/1.1），并发请求：

```
TCP 连接 1: 请求 1 ──> 响应 1
TCP 连接 2: 请求 2 ──> 响应 2
TCP 连接 3: 请求 3 ──> 响应 3
...
TCP 连接 6: 请求 6 ──> 响应 6

# 6 个连接互不影响，6 个请求并发
```

但每个 TCP 连接内部仍队头阻塞，且 6 个连接意味着 6 次 TCP 握手 + 慢启动。

### 多连接的代价

```
6 个 TCP 连接：
- 6 次握手（6 RTT）
- 6 次慢启动爬坡
- 6 倍服务端资源（sock、缓冲区、fd）
- 6 倍客户端端口消耗
```

而且 6 个连接共享网络带宽，拥塞控制相互干扰。

### HTTP/2 多路复用解决

HTTP/2 在一个 TCP 连接上用 Stream 并发：

```
单 TCP 连接：
Stream 1: 请求 ──> 响应（慢，5 秒）
Stream 2: 请求 ──> 响应（快，0.1 秒）   ← 不等 Stream 1，独立完成
Stream 3: 请求 ──> 响应（快，0.1 秒）

响应可以乱序返回，每个 Stream 独立
```

应用层队头阻塞消除。

### TCP 层队头阻塞（HTTP/2 仍有）

HTTP/2 多 Stream 跑在一个 TCP 连接上，TCP 保证字节流有序：

```
HTTP/2 多 Stream 复用：
Stream1 数据1 ──> Stream2 数据1 ──> Stream1 数据2

Stream1 数据1 在网络中丢失
TCP 必须重传 Stream1 数据1 才能交付 Stream2 数据1 给应用层
→ 所有 Stream 都被阻塞（TCP 层队头阻塞）
```

TCP 不知道 Stream 边界，必须按字节序交付。HTTP/3 用 QUIC 各 Stream 独立解决。

### HTTP/3 彻底解决

QUIC 各 Stream 独立：

```
Stream1 数据1 丢失
Stream2 数据1 已到达 → 直接交付给应用层
只有 Stream1 等待重传
```

Stream 间无依赖，丢一个 Stream 的包不影响其他 Stream。

### 抓包示例

```bash
# HTTP/1.1 队头阻塞
$ curl -v http://example.com/slow http://example.com/fast
> GET /slow HTTP/1.1   # 请求 1（5 秒响应）
< HTTP/1.1 200 OK
< ...（5 秒后）
> GET /fast HTTP/1.1    # 请求 2（0.1 秒能完成，但已等了 5 秒）
< HTTP/1.1 200 OK
# 即使 /fast 很快，整体延迟受 /slow 拖累

# 浏览器抓包看多连接
$ tcpdump -i any -n 'host example.com'
# 同一域名 6 个 TCP 连接并发
```

## 代码示例

浏览器优化：资源合并减少请求数：

```html
<!-- 反例：多个 CSS、JS 文件，HTTP/1.1 多请求 -->
<link rel="stylesheet" href="/a.css">
<link rel="stylesheet" href="/b.css">
<link rel="stylesheet" href="/c.css">
<script src="/a.js"></script>
<script src="/b.js"></script>

<!-- 正例：合并为一个文件 -->
<link rel="stylesheet" href="/all.css">
<script src="/all.js"></script>
```

域名分片（Domain Sharding）增加连接数：

```html
<!-- 不同域名，浏览器各自开 6 个连接 -->
<img src="https://img1.example.com/a.jpg">
<img src="https://img2.example.com/b.jpg">
<img src="https://img3.example.com/c.jpg">
```

服务端启用 HTTP/2（根本解决）：

```nginx
server {
    listen 443 ssl http2;
    # HTTP/2 多路复用，单连接并发，无需域名分片
}
```

Java HttpClient 多请求并发（HTTP/2）：

```java
import java.net.http.*;
import java.net.URI;
import java.util.*;
import java.util.concurrent.*;

HttpClient client = HttpClient.newBuilder()
    .version(HttpClient.Version.HTTP_2)
    .build();

List<URI> uris = List.of(
    URI.create("https://example.com/slow"),
    URI.create("https://example.com/fast1"),
    URI.create("https://example.com/fast2")
);

// 三个请求复用同一 TCP 连接，并发发送
List<CompletableFuture<HttpResponse<String>>> futures = uris.stream()
    .map(uri -> client.sendAsync(
        HttpRequest.newBuilder().uri(uri).GET().build(),
        HttpResponse.BodyHandlers.ofString()))
    .toList();

CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
```

## 实战场景

| 场景 | 现象 | 解决 |
|------|------|------|
| 网页多资源加载 | HTTP/1.1 串行慢 | 升级 HTTP/2 |
| API 串行调用 | 请求间相互等待 | 用 HTTP/2 或异步并发 |
| 服务端慢接口 | 拖累同连接其他请求 | 拆分连接或升 HTTP/2 |
| 移动端弱网 | TCP 丢包阻塞所有流 | HTTP/3 |
| 大量小资源 | 浏览器 6 连接不够 | 资源合并 + HTTP/2 |

## 深挖追问

**Q1：HTTP/1.1 管道化为什么不普及？**
响应必须按序返回（仍队头阻塞）、中间代理支持不一致、难以取消请求、浏览器默认关闭。

**Q2：浏览器为什么开 6 个连接？**
平衡并发和资源开销。6 是经验值（Chrome、Firefox 默认），HTTP/1.1 RFC 未限定。开太多会拖累服务端。

**Q3：HTTP/2 完全消除队头阻塞吗？**
消除应用层（多 Stream 并发），但 TCP 层仍队头阻塞（HTTP/3 用 QUIC 解决）。

**Q4：域名分片对 HTTP/2 有用吗？**
没用且有害。HTTP/2 单连接多路复用，分片反而增加连接管理开销。

**Q5：怎么判断是否队头阻塞？**
抓包看请求-响应时序：如果多个请求的响应串行返回，第一个慢响应后才开始第二个，就是队头阻塞。

## 易错点

- **"HTTP/1.1 管道化解决了队头阻塞"** — 没有，响应仍按序返回。
- **"HTTP/2 完全消除队头阻塞"** — 只消除应用层，TCP 层仍有。
- **"开更多 TCP 连接总是好的"** — 不，连接越多资源开销越大，6 是平衡值。
- **"HTTP/3 仍队头阻塞"** — 跨 Stream 不阻塞，单 Stream 内仍有序。
- **"队头阻塞只在 HTTP"** — TCP 也有，叫 TCP 队头阻塞。

## 总结

HTTP/1.1 队头阻塞源于请求-响应串行模型：前一个慢响应阻塞后续所有请求。浏览器开 6 个 TCP 连接绕开，但治标不治本。HTTP/2 用多路复用消除应用层队头阻塞，但 TCP 层仍存在。HTTP/3 用 QUIC 各 Stream 独立彻底解决。生产推荐 HTTP/2 + 资源合并，移动端考虑 HTTP/3。

## 参考资料

- [RFC 7230 — HTTP/1.1 Message Syntax and Routing, Pipelining](https://datatracker.ietf.org/doc/html/rfc7230#section-6.3.2)
- [RFC 7540 — HTTP/2](https://datatracker.ietf.org/doc/html/rfc7540)
- [RFC 9114 — HTTP/3](https://datatracker.ietf.org/doc/html/rfc9114)
