# HTTPS 如何优化

## 核心概念

HTTPS 的性能损耗主要在 TLS 握手阶段：2-RTT 的网络延迟 + 非对称加密的计算开销 + 证书验证。握手后的对称加密传输在现代 CPU 上几乎无开销（AES-NI 指令）。优化方向围绕"减少握手 RTT、加速计算、复用会话、优化证书链"四个角度。TLS 1.3 + HTTP/2 + 会话复用 + OCSP Stapling 是生产推荐组合。

## 标准回答

HTTPS 性能优化六个方向：

| 方向 | 手段 | 收益 |
|------|------|------|
| 协议升级 | TLS 1.3、HTTP/2 | 握手 1-RTT、多路复用 |
| 会话复用 | Session ID/Ticket、PSK 0-RTT | 跳过握手 |
| 证书优化 | ECDSA 证书、OCSP Stapling | 减小证书、避免 OCSP 查询 |
| 算法优化 | ECDHE + AEAD、AES-NI | 计算加速 |
| 连接复用 | keep-alive、连接池 | 避免重复握手 |
| 硬件优化 | AES-NI CPU、SSL 卸载 | 计算加速 |

## 详细机制

### 1. 协议升级：TLS 1.3

TLS 1.3 把握手从 2-RTT 压到 1-RTT，会话恢复支持 0-RTT：

```
TLS 1.2: TCP 1 RTT + TLS 2 RTT = 3 RTT 才能发 HTTP 请求
TLS 1.3: TCP 1 RTT + TLS 1 RTT = 2 RTT 才能发 HTTP 请求
TLS 1.3 + 0-RTT: TCP 1 RTT + 早期数据 = 1 RTT 完成请求响应
```

### 2. 会话复用

第一次握手后双方缓存会话密钥，后续连接跳过完整握手：

**Session ID（TLS 1.2）**：

```
首次连接: 完整握手，服务端分配 Session ID，缓存密钥
后续连接: 客户端 ClientHello 带 Session ID
         服务端找到对应会话，直接用旧密钥，跳过密钥协商
```

问题：服务端要存所有会话状态，分布式部署需要共享存储。

**Session Ticket（TLS 1.2/1.3）**：

```
首次连接: 完整握手，服务端用密钥加密会话状态成 Ticket 发给客户端
后续连接: 客户端带 Ticket，服务端解密恢复会话
```

状态在客户端，服务端只需保管加密密钥。多台服务器需共享同一密钥。

**PSK 0-RTT（TLS 1.3）**：

```
后续连接: 客户端用 Ticket 派生 PSK，加密早期数据随 ClientHello 发出
服务端解密 Ticket 得到 PSK，验证后立即处理早期数据
0-RTT 完成请求响应
```

风险：早期数据可被重放，仅用于幂等请求。

### 3. 证书优化

**ECDSA 替代 RSA 证书**：

```
RSA 2048 证书: 公钥 256 字节，签名 256 字节
ECDSA 256 证书: 公钥 64 字节，签名 64 字节
```

同等安全强度下 ECDSA 证书更小，传输更快，验证更快。但老客户端可能不支持。

**OCSP Stapling**：

证书验证时客户端要查询证书是否被吊销，有两种方式：

- **CRL（证书吊销列表）**：CA 定期发布吊销列表，客户端下载检查。列表越来越大，更新慢
- **OCSP（在线证书状态协议）**：客户端实时查询 CA。慢、隐私泄露（CA 知道用户访问哪些站点）
- **OCSP Stapling**：服务端定期查 CA 拿到带签名的状态响应，TLS 握手时一并发给客户端。客户端验证签名即可，无需查询 CA

```nginx
ssl_stapling on;
ssl_stapling_verify on;
ssl_stapling_responder http://ocsp.example.com;
resolver 8.8.8.8;
```

### 4. 算法优化

**ECDHE 替代 RSA 密钥交换**：

- ECDHE 支持前向安全
- ECDHE 支持 False Start（客户端在 Finished 前就发数据）
- TLS 1.3 强制 ECDHE

**AEAD 加密模式**：

- AES-GCM、ChaCha20-Poly1305 同时加密和认证，比 CBC + HMAC 快
- TLS 1.3 强制 AEAD

**AES-NI 硬件加速**：

现代 CPU 都支持 AES-NI 指令集，AES 加密几乎免费：

```bash
# 查看 CPU 是否支持 AES-NI
$ grep -o aes /proc/cpuinfo
aes
# 有输出表示支持
```

不支持 AES-NI 的设备（如老 ARM）用 ChaCha20-Poly1305 更快。

### 5. 连接复用

**HTTP keep-alive**：复用 TCP+TLS 连接发多个请求，避免每次都握手。

**HTTP/2 多路复用**：单连接并发处理多个请求，进一步减少连接数。

**连接池**：客户端维护连接池，避免重新建连。

### 6. SSL 卸载

把 TLS 加解密卸载到专门硬件或网关：

```
Client ──HTTPS──> 网关（终结 TLS）──HTTP──> 后端服务
```

- 网关专用硬件加速 TLS（F5、HAProxy + SSL 卡）
- 后端服务无需处理 TLS，CPU 释放
- 内网 HTTP 传输，性能更高

但网关到后端是明文，需要内网可信。零信任架构下应用 mTLS。

### 抓包与监控

```bash
# 测试 HTTPS 各阶段耗时
$ curl -w "DNS: %{time_namelookup}\nTCP: %{time_connect}\nTLS: %{time_appconnect}\nHTTP: %{time_starttransfer}\nTotal: %{time_total}\n" \
    -o /dev/null -s https://example.com/
DNS: 0.005s
TCP: 0.025s      # TCP 握手
TLS: 0.078s      # TLS 握手
HTTP: 0.120s     # 首字节响应
Total: 0.150s

# 查看 TLS 会话复用率
$ openssl s_client -connect example.com:443 -reconnect
# 看 "Reused, TLSv1.3" 表示复用成功

# Nginx 状态监控
$ curl http://localhost/nginx_status
SSL handshakes: 12345
SSL handshakes failed: 5
SSL session reuses: 9876   # 会话复用次数
```

## 代码示例

Nginx 综合优化配置：

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    # 协议
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;

    # 证书（ECDSA）
    ssl_certificate /etc/nginx/ssl/example.com.ecdsa.crt;
    ssl_certificate_key /etc/nginx/ssl/example.com.ecdsa.key;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 valid=300s;

    # 会话复用
    ssl_session_cache shared:SSL:50m;
    ssl_session_timeout 1h;
    ssl_session_tickets on;
    ssl_session_ticket_key /etc/nginx/ssl/ticket.key;

    # TLS 1.3 0-RTT
    ssl_early_data on;

    # HTTP/2
    http2_push_preload on;

    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

Java HttpClient 复用连接：

```java
import java.net.http.*;
import java.time.*;

HttpClient client = HttpClient.newBuilder()
    .version(HttpClient.Version.HTTP_2)
    .connectTimeout(Duration.ofSeconds(5))
    .build();

// 复用 client 实例（底层连接池复用）
// 不要每次请求都 new HttpClient
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users"))
    .header("Accept-Encoding", "gzip")
    .GET()
    .build();
```

## 实战场景

| 场景 | 优化 | 收益 |
|------|------|------|
| 高并发 API | TLS 1.3 + HTTP/2 | 握手减半，多路复用 |
| 移动端 | TLS 1.3 + 0-RTT | 弱网首包延迟降低 |
| CDN 静态资源 | OCSP Stapling + 长连接 | 避免客户端 OCSP 查询 |
| 微服务调用 | mTLS + 连接池 | 复用 TLS 连接 |
| 大文件传输 | SSL 卸载到网关 | 后端 CPU 释放 |
| 老 Android | TLS 1.2 + ChaCha20 | 无 AES-NI 设备更快 |

## 深挖追问

**Q1：TLS 1.3 一定比 1.2 快吗？**
首次连接快 1 RTT，但稳态传输两者差异很小（都用对称加密）。会话复用后 0-RTT 才显著领先。

**Q2：Session Ticket 的密钥怎么管理？**
多台服务器共享同一密钥才能复用。Nginx 用 `ssl_session_ticket_key` 文件指定，定期轮换密钥增强安全。

**Q3：OCSP Stapling 失败会怎样？**
退回不 Stapling，客户端自己查 OCSP，握手变慢但不失败。生产要监控 Stapling 状态。

**Q4：False Start 是什么？**
TLS 1.2 中，客户端发 Finished 后不等服务端 Finished，直接发应用数据，省 1 RTT。需要 ECDHE 等前向安全算法 + 客户端支持。TLS 1.3 不需要 False Start（已天然 1-RTT）。

**Q5：SSL 卸载到网关安全吗？**
网关到后端是 HTTP 明文，需要内网可信。零信任架构下应保持端到端 TLS 或 mTLS。

## 易错点

- **"HTTPS 一定比 HTTP 慢很多"** — 现代 TLS 1.3 + AES-NI 下差异极小。
- **"会话复用没风险"** — 有重放风险（特别是 0-RTT），需限制为幂等请求。
- **"OCSP Stapling 让服务端变慢"** — 服务端定期查 CA，不影响握手性能。
- **"RSA 证书最安全"** — ECDSA 同等安全且更快。
- **"开了 0-RTT 就万事大吉"** — 重放风险，仅用于 GET 等幂等请求。

## 总结

HTTPS 优化六招：TLS 1.3 减少握手 RTT、会话复用跳过握手、ECDSA 证书减小体积、OCSP Stapling 避免 OCSP 查询、ECDHE+AEAD 加速计算、HTTP/2 + 连接池复用连接。生产推荐 TLS 1.3 + HTTP/2 + OCSP Stapling + 会话复用 + ECDSA 证书。0-RTT 仅用于幂等请求防重放。SSL 卸载到网关可释放后端 CPU，但需评估内网安全。

## 参考资料

- [RFC 8446 — TLS 1.3](https://datatracker.ietf.org/doc/html/rfc8446)
- [RFC 7301 — ALPN](https://datatracker.ietf.org/doc/html/rfc7301)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
- [Cloudflare — TLS 1.3 Performance](https://blog.cloudflare.com/rfc-8446-aka-tls-1-3/)
