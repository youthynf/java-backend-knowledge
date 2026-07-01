# QUIC 协议是什么

## 核心概念

QUIC（Quick UDP Internet Connections）是 Google 设计、HTTP/3 的传输层协议，基于 UDP 实现。它**不是"UDP 所以不可靠"**，而是在 UDP 之上用用户态代码重新实现了 TCP 的可靠传输、拥塞控制、流量控制，并修复了 TCP 的几个固有缺陷：握手慢、队头阻塞、连接迁移困难。

一句话总结：**QUIC = UDP + 可靠传输 + TLS 1.3 + 多路复用 + 连接迁移**，是 TCP+TLS+HTTP/2 三层功能的重新设计整合。

## 标准回答

QUIC 解决 TCP 的四个核心问题：

1. **握手慢**：TCP 三次握手（1 RTT）+ TLS 1.3 握手（1 RTT）= 2 RTT 才能发数据。QUIC 把两者合并，首次连接 1 RTT，复用连接 0 RTT。
2. **TCP 队头阻塞**：TCP 必须按序交付字节，一个包丢失阻塞所有流。QUIC 各 Stream 独立，一个流丢包不影响其他流。
3. **连接迁移**：TCP 用四元组（源 IP、源端口、目的 IP、目的端口）标识连接，IP 变了连接就断。QUIC 用 Connection ID 标识，IP 变了连接保持。
4. **协议演进难**：TCP 在内核实现，升级慢；QUIC 在用户态实现，应用层迭代快。

## 详细机制

### 1. 合并握手：1-RTT 和 0-RTT

TCP + TLS 1.3 首次连接要 2 RTT：

```
Client                              Server
  | --- TCP SYN ------------------>     |
  | <== TCP SYN+ACK =================   |  RTT 1（TCP 握手）
  | --- TCP ACK + TLS ClientHello -->   |
  | <== TLS ServerHello + Cert =======  |  RTT 2（TLS 握手）
  | --- TLS Finished + HTTP req ----->  |
  | <== HTTP response ================  |
```

QUIC 首次连接 1 RTT：传输层握手和 TLS 握手合并到同一个流程。

```
Client                              Server
  | --- QUIC Initial + TLS ClientHello -->
  | <== QUIC Initial + TLS ServerHello + Cert + FINISHED ==
  | --- QUIC + TLS Finished + HTTP req -->
  | <== HTTP response ================
```

复用连接（同服务器之前连过）0-RTT：客户端用缓存的密钥直接发 HTTP 请求，服务端验证后立即响应。

### 2. 多路复用，无 TCP 队头阻塞

HTTP/2 over TCP 的问题：

```
TCP 层：[Stream1 数据1] [Stream2 数据1] [Stream1 数据2] [Stream2 数据2]
如果 Stream1 数据1 丢失，TCP 必须等它重传后才能交付 Stream2 数据1
→ 所有 Stream 都被阻塞
```

QUIC 各 Stream 独立：

```
QUIC 层：[Stream1 数据1] [Stream2 数据1] [Stream1 数据2] [Stream2 数据2]
如果 Stream1 数据1 丢失，只阻塞 Stream1
Stream2 的数据可以正常交付给应用层
```

注意：单个 Stream 内部仍是按序的（Stream1 数据2 必须等数据1 到达），所以 QUIC 解决的是跨 Stream 的队头阻塞，不消除单 Stream 内的有序等待。

### 3. 连接迁移

TCP 用四元组标识连接，移动设备从 Wi-Fi 切到 4G 时 IP 变化，TCP 连接断开。

QUIC 用 Connection ID（CID）标识连接，CID 在握手时协商，与 IP 解耦。IP 变化时只要 CID 不变，连接保持。

```
Wi-Fi: Client(192.168.1.5:12345) → Server(1.2.3.4:443), CID=abc
切换到 4G: Client(10.0.0.5:54321) → Server(1.2.3.4:443), CID=abc
Server 看到 CID=abc，识别为同一连接，继续传输
```

### 4. 可靠传输

QUIC 自己实现 ACK、重传、拥塞控制：
- **ACK**：每个包都有单调递增的 Packet Number，ACK 能精确指出哪些包收到
- **重传**：新包和重传包 Packet Number 不同，避免 TCP 重传二义性
- **SACK**：原生支持选择确认
- **拥塞控制**：默认 CUBIC，可插拔（不像 TCP 锁死在内核）

### 5. 前向纠错（FEC，可选）

QUIC 早期版本支持 FEC，发数据时同时发冗余包，丢包时靠冗余包恢复，不用重传。但增加带宽开销，现代版本基本弃用。

### 抓包示例

```bash
$ tcpdump -i any -n 'udp port 443'
10:00:01 IP 10.0.0.1.54321 > 10.0.0.2.443: UDP, length 1200
# QUIC 包封装在 UDP 中，端口 443
```

```bash
# 用 curl --http3 测试
$ curl --http3 -I https://www.cloudflare.com
HTTP/3 200
date: ...
content-type: text/html
...

# 浏览器 DevTools 看协议列
# Protocol: h3 = HTTP/3 over QUIC
```

## 代码示例

Java 客户端使用 HTTP/3（需 Jetty 或 Netty 的 QUIC 支持）：

```java
// Jetty 12+ 支持 HTTP/3 客户端
import org.eclipse.jetty.client.HttpClient;
import org.eclipse.jetty.http3.client.HTTP3Client;

HTTP3Client http3Client = new HTTP3Client();
HttpClient client = new HttpClient(http3Client);
client.start();

// 发起 HTTP/3 请求
ContentResponse response = client.GET("https://www.cloudflare.com");
System.out.println("Status: " + response.getStatus());
```

服务端启用 QUIC（Caddy 配置）：

```caddyfile
example.com {
    bind 0.0.0.0 {
        protocols h1 h2 h3
    }
    reverse_proxy backend:8080
}
```

## 实战场景

| 场景 | 优势 | 注意点 |
|------|------|--------|
| 移动端 App | 连接迁移，网络切换不断连 | 客户端 SDK 需支持 QUIC |
| 实时音视频 | 无 TCP 队头阻塞 | 需要应用层 FEC 或重传策略 |
| 弱网用户 | 0-RTT 减少延迟 | 0-RTT 有重放攻击风险 |
| CDN | 多路复用提升吞吐 | UDP 兼容性问题，部分网络丢 UDP |
| 微服务间调用 | 1-RTT 建连 | gRPC over HTTP/3 仍在演进 |

## 深挖追问

**Q1：QUIC 基于 UDP 不会被防火墙挡吗？**
会。部分企业网络和防火墙不放行 UDP 443。QUIC 实现通常有回退机制：连接失败时自动回退到 HTTP/2 over TCP。

**Q2：0-RTT 有什么风险？**
重放攻击。攻击者可以捕获 0-RTT 请求并重放，服务端会重复处理。所以 0-RTT 只适合幂等请求（GET），不适合非幂等请求（POST 转账）。

**Q3：QUIC 性能比 TCP 好多少？**
首包延迟减少 1 RTT，弱网下显著。但稳态吞吐两者差异不大（都受拥塞控制限制）。QUIC 的 CPU 开销略高（用户态协议栈）。

**Q4：QUIC 怎么处理 NAT？**
QUIC 用 Connection ID 而非四元组标识连接，NAT 重新绑定端口不影响。但 NAT 设备对 UDP 的处理可能不如 TCP 成熟，UDP 连接表项可能更短。

**Q5：QUIC 替代 TCP 吗？**
不完全是。QUIC 主要用于 HTTP/3 和实时应用。TCP 在文件传输、SSH 等场景仍占主导。两者会长期共存。

## 易错点

- **"QUIC 是 UDP 所以不可靠"** — 错，QUIC 在 UDP 之上自己实现可靠性。
- **"QUIC 完全消除队头阻塞"** — 只消除跨 Stream 的，单 Stream 内仍按序。
- **"0-RTT 总是好的"** — 有重放攻击风险，仅适合幂等请求。
- **"QUIC 一定比 TCP 快"** — 首包延迟有优势，稳态吞吐差异不大，CPU 开销更高。
- **"QUIC 不需要 TCP 那些算法"** — 需要的，只是搬到用户态实现，可以快速演进。

## 总结

QUIC 是基于 UDP 的现代传输协议，合并 TCP+TLS 握手、解决 TCP 队头阻塞、支持连接迁移，是 HTTP/3 的传输层。核心优势是握手快、多路复用无队头阻塞、连接迁移适合移动网络。代价是 CPU 开销、UDP 网络兼容性、负载均衡支持复杂度。生产中浏览器和 CDN 已广泛支持，企业网络常需回退到 HTTP/2。

## 参考资料

- [RFC 9000 — QUIC: A UDP-Based Multiplexed and Secure Transport](https://datatracker.ietf.org/doc/html/rfc9000)
- [RFC 9114 — HTTP/3](https://datatracker.ietf.org/doc/html/rfc9114)
- [QUIC 设计动机](https://datatracker.ietf.org/doc/html/rfc9000#name-introduction)
