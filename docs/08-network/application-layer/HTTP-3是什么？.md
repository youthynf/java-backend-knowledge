# HTTP/3 是什么

## 核心概念

HTTP/3 是 HTTP 协议的第三个主要版本，2022 年发布（RFC 9114）。与 HTTP/1.x 和 HTTP/2 基于 TCP 不同，HTTP/3 基于 QUIC 协议（RFC 9000），QUIC 跑在 UDP 之上。HTTP/3 解决了 HTTP/2 的两个核心痛点：TCP 层队头阻塞和握手慢（TCP+TLS 双重握手），并支持连接迁移，更适合移动网络。

## 标准回答

HTTP/3 的核心特性：

1. **基于 QUIC over UDP**：避开 TCP 内核僵化，应用层重新实现可靠传输
2. **无 TCP 队头阻塞**：QUIC 各 Stream 独立，一个流丢包不阻塞其他流
3. **合并握手**：传输层握手和 TLS 1.3 握手合并，1-RTT 首次连接，0-RTT 会话恢复
4. **连接迁移**：用 Connection ID 标识连接，IP 变化不断连
5. **QPACK 头部压缩**：HTTP/3 版本的 HPACK，解决动态表的队头阻塞

## 详细机制

### 1. HTTP/2 的痛点

**TCP 层队头阻塞**：

```
HTTP/2 多 Stream 跑在一个 TCP 连接上：
Stream1 数据1 ──> Stream2 数据1 ──> Stream1 数据2
Stream1 数据1 在网络中丢失
TCP 必须重传 Stream1 数据1 才能交付 Stream2 数据1 给应用层
→ 所有 Stream 都被阻塞
```

TCP 保证字节流有序，HTTP/2 多 Stream 无法绕开。

**握手慢**：

HTTP/2 over TLS：TCP 握手 1 RTT + TLS 握手 1-2 RTT = 2-3 RTT 才能发数据。

**连接迁移困难**：

TCP 用四元组标识连接，移动设备网络切换（4G → Wi-Fi）IP 变化，连接断开。

### 2. HTTP/3 的协议栈

```
HTTP/3:
+-------------------+
| HTTP/3 (语义)     |  应用层
+-------------------+
| QUIC              |  传输层（用户态）
+-------------------+
| UDP               |  传输层（内核）
+-------------------+
| IP                |
+-------------------+
```

QUIC 在 UDP 之上重新实现可靠传输、拥塞控制、流量控制，避开 TCP 内核僵化，让协议可以快速演进。

### 3. QUIC 的核心特性

#### 无队头阻塞

QUIC 各 Stream 独立：

```
Stream1 数据1 丢失
Stream2 数据1 已到达 → 直接交付给应用层
只有 Stream1 等待重传
```

每个 Stream 有自己的序号空间，丢一个 Stream 的包不影响其他 Stream。

#### 合并握手

QUIC 把传输层握手和 TLS 1.3 握手合并：

```
首次连接（1-RTT）:
Client → Server: QUIC Initial + TLS ClientHello + KeyShare
Client ← Server: QUIC Initial + TLS ServerHello + Cert + Finished
Client → Server: TLS Finished + HTTP 请求（已加密）

会话恢复（0-RTT）:
Client → Server: QUIC + TLS ClientHello + 早期数据（HTTP 请求）
Client ← Server: TLS ServerHello + HTTP 响应
```

vs HTTP/2：

```
HTTP/2 首次：TCP 1 RTT + TLS 1-2 RTT = 2-3 RTT
HTTP/3 首次：1 RTT
HTTP/3 恢复：0 RTT
```

#### 连接迁移

QUIC 用 Connection ID（CID）标识连接，与 IP 解耦：

```
Wi-Fi: Client(192.168.1.5:12345) → Server(1.2.3.4:443), CID=abc
切换到 4G: Client(10.0.0.5:54321) → Server(1.2.3.4:443), CID=abc
Server 看到 CID=abc，识别为同一连接，继续传输
```

TCP 用四元组标识，IP 变了连接就断。QUIC 用 CID，IP 变了连接保持。

#### 可靠传输

QUIC 自己实现 ACK、重传、拥塞控制：

- **Packet Number 单调递增**：新包和重传包 PN 不同，避免 TCP 重传二义性
- **ACK Delay**：接收方在 ACK 中带上自己延迟的时间，发送方精确估算 RTT
- **SACK**：原生支持选择确认
- **拥塞控制可插拔**：默认 CUBIC，可换 BBR 等，不需升级内核

#### 加密更多握手

QUIC 把大部分握手消息都加密，连包头部都加密，提升隐私：

- TCP 头部明文，QUIC 大部分头部加密
- 中间设备无法看到 QUIC 包内部细节，无法做基于 TCP 字段的 QoS

### 4. QPACK 头部压缩

HTTP/3 用 QPACK 替代 HPACK，解决动态表的队头阻塞：

**HPACK 的问题**：

```
HTTP/2 多 Stream 共享一个动态表
Stream1 的头部加入动态表，但 Stream1 包丢失
后续 Stream 用动态表索引时无法解码（依赖 Stream1 的头部先建表）
→ 阻塞
```

**QPACK 的解决**：

- 用两个特殊单向 Stream 同步动态表
- 即使原 Stream 丢包，动态表同步 Stream 可独立补齐
- 大部分情况下静态表足够，动态表更新异步进行

### 5. QUIC 握手流程

```
Client                                          Server
  | --- Initial Packet ---------------->          |
  |     - Connection ID (CID)                    |
  |     - TLS 1.3 ClientHello                    |
  |     - 加密套件、KeyShare                       |
  |                                              |
  | <== Initial + Handshake Packet ===========   |
  |     - TLS ServerHello                        |
  |     - 证书                                    |
  |     - TLS Finished                           |
  |     - 传输参数（流控窗口等）                    |
  |                                              |
  | --- Handshake Packet (Finished) --------->   |
  | --- 0-RTT / 1-RTT 应用数据 -------------->   |
  | <== 应用数据（HTTP 响应）=================   |
```

首次连接 1-RTT，会话恢复 0-RTT。

### 抓包与测试

```bash
# 用 curl --http3 测试
$ curl --http3 -I https://www.cloudflare.com
HTTP/3 200
date: ...
content-type: text/html

# 浏览器 DevTools 看协议
# Network → Protocol 列：h3 = HTTP/3

# 抓包
$ tcpdump -i any -n 'udp port 443'
10:00:00 IP C.5000 > S.443: UDP, length 1200
# QUIC 包封装在 UDP 中

# 用 quiche 或 nghttp3 测试
$ quiche-client https://example.com/
```

## 代码示例

Java 客户端用 HTTP/3（Jetty 12+）：

```java
import org.eclipse.jetty.client.*;
import org.eclipse.jetty.http3.client.HTTP3Client;

HTTP3Client http3Client = new HTTP3Client();
HttpClient client = new HttpClient(http3Client);
client.start();

// 发起 HTTP/3 请求
ContentResponse response = client.GET("https://www.cloudflare.com");
System.out.println("Status: " + response.getStatus());
```

服务端启用 HTTP/3（Caddy）：

```caddyfile
example.com {
    bind 0.0.0.0 {
        protocols h1 h2 h3
    }
    reverse_proxy backend:8080
}
```

Nginx 1.25+ 支持 HTTP/3：

```nginx
server {
    listen 443 quic reuseport;       # HTTP/3 over QUIC
    listen 443 ssl http2;            # 同时支持 HTTP/2
    server_name example.com;
    ssl_certificate /etc/nginx/ssl/example.com.crt;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;

    add_header Alt-Svc 'h3=":443"; ma=86400';   # 告知客户端支持 HTTP/3
}
```

## 实战场景

| 场景 | 优势 | 注意点 |
|------|------|--------|
| 移动端 App | 连接迁移、0-RTT | 客户端 SDK 需支持 QUIC |
| 弱网用户 | 无 TCP 队头阻塞 | UDP 可能被防火墙丢 |
| CDN | 多路复用提升吞吐 | 部分 ISP 不放行 UDP 443 |
| 实时音视频 | 低延迟 | 需应用层 FEC 或重传策略 |
| 微服务 | 1-RTT 建连 | gRPC over HTTP/3 仍在演进 |

## 深挖追问

**Q1：HTTP/3 基于 UDP 会不会被防火墙挡？**
会。部分企业网络和防火墙不放行 UDP 443。HTTP/3 实现有回退机制：连接失败时回退到 HTTP/2 over TCP。

**Q2：0-RTT 有什么风险？**
重放攻击。攻击者可截获 0-RTT 早期数据重发，服务端会重复处理。仅用于幂等请求（GET）。

**Q3：HTTP/3 比 HTTP/2 快多少？**
首包延迟减少 1 RTT，弱网下显著。稳态吞吐差异不大（都受拥塞控制限制）。HTTP/3 CPU 开销略高（用户态协议栈）。

**Q4：QUIC 怎么处理 NAT？**
用 Connection ID 标识连接，NAT 重新绑定端口不影响。但 NAT 设备对 UDP 的处理可能不如 TCP 成熟，UDP 连接表项可能更短。

**Q5：HTTP/3 替代 HTTP/2 吗？**
不完全是。两者会长期共存，浏览器先用 HTTP/2，服务端通过 Alt-Svc 头告知支持 HTTP/3，下次连接浏览器尝试 HTTP/3，失败回退 HTTP/2。

## 易错点

- **"HTTP/3 基于 TCP"** — 错，基于 QUIC over UDP。
- **"QUIC 不可靠"** — 错，QUIC 在 UDP 之上自己实现可靠性。
- **"HTTP/3 完全消除队头阻塞"** — 跨 Stream 消除，单 Stream 内仍有序。
- **"0-RTT 总是好的"** — 有重放风险，仅用于幂等请求。
- **"HTTP/3 一定比 HTTP/2 快"** — 首包延迟有优势，稳态差异不大，CPU 开销更高。

## 总结

HTTP/3 基于 QUIC over UDP，解决了 HTTP/2 的 TCP 层队头阻塞和握手慢问题，支持连接迁移适合移动网络。QUIC 把传输层握手和 TLS 1.3 握手合并，1-RTT 首次连接，0-RTT 会话恢复。QPACK 替代 HPACK 解决动态表队头阻塞。代价是 CPU 开销、UDP 网络兼容性、负载均衡支持复杂度。生产中浏览器和 CDN 已广泛支持，企业网络常需回退到 HTTP/2。

## 参考资料

- [RFC 9114 — HTTP/3](https://datatracker.ietf.org/doc/html/rfc9114)
- [RFC 9000 — QUIC](https://datatracker.ietf.org/doc/html/rfc9000)
- [HTTP/3 介绍](https://blog.cloudflare.com/http-3-from-root-to-tip/)
