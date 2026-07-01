# HTTPS 握手过程是怎么样的

## 核心概念

HTTPS 握手指 TLS 握手，目的是让客户端验证服务端身份、双方协商出对称密钥用于后续加密传输。TLS 1.2 握手 2-RTT，TLS 1.3 简化为 1-RTT 并支持 0-RTT 会话恢复。握手用非对称加密（RSA/ECDHE）解决密钥分发问题，握手后用对称加密（AES/ChaCha20）保证传输效率，是"非对称换安全、对称换性能"的典型设计。

## 标准回答

TLS 1.2 握手四步（2-RTT）：

```
Client                                          Server
  | --- ClientHello ----------------------->     |  RTT 1 开始
  |     (TLS 版本、Cipher 列表、Client Random)    |
  |                                              |
  | <== ServerHello + Certificate + ServerHelloDone =
  |     (选定 Cipher、Server Random、服务端证书)   |
  |                                              |
  | --- ClientKeyExchange + ChangeCipherSpec + Finished -->
  |     (PreMaster 用服务端公钥加密)              |  RTT 2 开始
  |                                              |
  | <== ChangeCipherSpec + Finished ============ |
  |                                              |
  | --- HTTP 请求（已加密） ------------------>    |
  | <== HTTP 响应（已加密） =================    |
```

TLS 1.3 握手（1-RTT）：

```
Client                                          Server
  | --- ClientHello + KeyShare -----------------> |
  | <== ServerHello + KeyShare + Certificate + Finished =
  | --- Finished + HTTP 请求（已加密） ---------> |
  | <== HTTP 响应 =============================   |
```

## 详细机制

### ClientHello

客户端发起握手，告知服务端自己的能力：

```
ClientHello:
  - TLS 版本：1.2 或 1.3
  - Client Random：32 字节随机数
  - Cipher Suites：客户端支持的加密套件列表
  - SNI（Server Name Indication）：要访问的域名（用于虚拟主机证书选择）
  - Session ID/Ticket：用于会话复用
  - Extensions：ALPN（HTTP/2 协商）、Supported Groups 等
```

### ServerHello + Certificate

服务端回应：

```
ServerHello:
  - 选定的 TLS 版本
  - Server Random：32 字节随机数
  - 选定的 Cipher Suite
  - Session ID/Ticket

Certificate:
  - 服务端证书链（服务端证书 + 中间证书）

ServerKeyExchange（ECDHE 时）:
  - 服务端的临时公钥（用于密钥协商）

ServerHelloDone:
  - 表示服务端消息发送完毕
```

### 密钥协商（RSA vs ECDHE）

**RSA 密钥交换（已废弃于 TLS 1.3）**：

```
1. 客户端生成 PreMaster Secret（48 字节随机数）
2. 用服务端证书中的公钥加密 PreMaster
3. 发送给服务端
4. 服务端用私钥解密得到 PreMaster
5. 双方用 Client Random + Server Random + PreMaster 计算出 Master Secret
6. Master Secret 派生出对称加密密钥
```

问题：服务端私钥泄露后，所有历史流量都可被解密（无前向安全）。

**ECDHE 密钥交换（TLS 1.3 强制）**：

```
1. 双方各自生成临时椭圆曲线密钥对
2. 交换公钥（KeyShare）
3. 用自己的私钥 + 对方的公钥计算出共享密钥（ECDHE 算法）
4. 共享密钥 + Random 派生出对称密钥
```

每次握手用不同的临时密钥对，私钥泄露不影响历史流量（前向安全）。

### Finished 消息

握手最后双方互发 Finished 消息：

```
Finished:
  - 用协商的密钥加密
  - 内容是握手消息的摘要（MAC）
  - 验证握手过程未被篡改
```

如果中间人篡改了任何握手消息，Finished 校验失败，连接终止。

### TLS 1.3 的改进

| 项 | TLS 1.2 | TLS 1.3 |
|----|---------|---------|
| 握手 RTT | 2 | 1 |
| Cipher Suites | 300+ | 5 |
| 密钥交换 | RSA、DH、ECDHE | 只 ECDHE |
| 加密 | CBC、GCM 等 | 只 AEAD（GCM、Poly1305） |
| 哈希 | MD5、SHA1、SHA2 | 只 SHA2 |
| ServerHello 后是否加密 | 否 | 是 |
| 0-RTT | 不支持 | 支持 |

TLS 1.3 把 ClientHello 和 KeyShare 合并，ServerHello 和证书、Finished 合并，握手压到 1 RTT。

### 0-RTT 会话恢复

第二次连接同一服务端时，客户端用之前缓存的 PSK（Pre-Shared Key）加密早期数据：

```
Client                                          Server
  | --- ClientHello + early data (HTTP 请求) --> |
  | <== ServerHello + HTTP 响应 ===============  |
  # 0-RTT：请求和握手一起发出
```

风险：早期数据可能被重放，只适合幂等请求（GET），不适合非幂等（POST 转账）。

### 抓包示例

```bash
# TLS 1.2 握手抓包
$ tcpdump -i any -n 'tcp port 443 and host example.com' -w tls.pcap
$ tshark -r tls.pcap -Y "tls"
10:00:00 TLSv1.2 Client Hello
10:00:00 TLSv1.2 Server Hello
10:00:00 TLSv1.2 Certificate
10:00:00 TLSv1.2 Server Hello Done
10:00:00 TLSv1.2 Client Key Exchange
10:00:00 TLSv1.2 Change Cipher Spec
10:00:00 TLSv1.2 Finished
10:00:00 TLSv1.2 Change Cipher Spec
10:00:00 TLSv1.2 Finished
10:00:00 TLSv1.2 Application Data   # 加密的 HTTP 报文
```

```bash
# openssl 查看握手细节
$ openssl s_client -connect example.com:443 -tls1_3 -showcerts
SSL-Session:
    Protocol  : TLSv1.3
    Cipher    : TLS_AES_256_GCM_SHA384
    Session-ID: ABCDEF...
    TLS session ticket lifetime hint: 7200 (seconds)
```

## 代码示例

Java 服务端启用 TLS 1.3：

```java
import javax.net.ssl.*;

SSLContext ctx = SSLContext.getInstance("TLSv1.3");
ctx.init(kmf.getKeyManagers(), null, null);

SSLServerSocketFactory ssf = ctx.getServerSocketFactory();
SSLServerSocket server = (SSLServerSocket) ssf.createServerSocket(443);
server.setEnabledProtocols(new String[]{"TLSv1.2", "TLSv1.3"});
server.setEnabledCipherSuites(new String[]{
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
    "TLS_AES_128_GCM_SHA256"
});
```

Nginx 配置 TLS 1.3 + 0-RTT：

```nginx
server {
    listen 443 ssl http2;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers TLS13-AES-256-GCM-SHA384:TLS13-CHACHA20-POLY1305-SHA256:...;
    ssl_early_data on;                     # 开启 0-RTT
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets on;
    ssl_session_ticket_key /etc/nginx/ssl/ticket.key;
}

# 转发早期数据到后端
proxy_set_header Early-Data $ssl_early_data;
```

测试握手耗时：

```bash
# 用 curl 测各阶段耗时
$ curl -w "TCP: %{time_connect}\nTLS: %{time_appconnect}\nTotal: %{time_total}\n" \
    -o /dev/null -s https://example.com/
TCP: 0.025s     # TCP 握手
TLS: 0.078s     # TLS 握手
Total: 0.120s   # 总耗时

# 用 openssl 测 TLS 1.3 握手
$ openssl s_client -connect example.com:443 -tls1_3
# 看 Verify return code: 0 (ok) 表示证书验证通过
```

## 实战场景

| 场景 | 配置 | 注意点 |
|------|------|--------|
| Web 服务器 | TLS 1.3 + HTTP/2 | 兼容老客户端用 1.2 |
| 移动端 API | TLS 1.3 + 0-RTT | 0-RTT 仅用于幂等请求 |
| 内部服务 | mTLS（双向证书） | 客户端也要证书 |
| 老旧客户端 | TLS 1.2 | 评估升级成本 |
| 高安全 | 关闭 0-RTT | 防重放 |

## 深挖追问

**Q1：为什么握手用非对称加密，传输用对称加密？**
非对称加密计算慢（RSA 加密 1KB 比 AES 慢 100 倍），不适合大流量。握手用非对称解决密钥分发（安全），传输用对称保证性能。

**Q2：Master Secret 怎么算出来的？**
```
Master Secret = PRF(PreMaster, "master secret", Client Random + Server Random)
对称密钥 = PRF(Master Secret, "key expansion", Server Random + Client Random)
```
PRF 是伪随机函数，输入三个参数生成密钥。

**Q3：SNI 是什么？为什么 TLS 1.3 要加密 SNI？**
SNI（Server Name Indication）告知服务端客户端要访问的域名，服务端据此选择证书。一个 IP 多域名场景必需。SNI 明文暴露用户访问的域名，ESNI（Encrypted SNI）加密它，提升隐私。

**Q4：为什么需要前向安全？**
如果服务端私钥泄露，所有用 RSA 交换的密钥都能被解密，历史流量全部暴露。ECDHE 每次握手用临时密钥对，私钥泄露不影响历史。

**Q5：0-RTT 的重放风险怎么防？**
服务端限制 0-RTT 仅用于幂等 GET 请求，对 POST 等非幂等请求强制重新握手。应用层也可加 Nonce 防重放。

## 易错点

- **"TLS 握手用对称加密"** — 错，握手用非对称加密协商对称密钥，传输用对称。
- **"RSA 密钥交换最安全"** — 不，RSA 无前向安全，TLS 1.3 已移除。
- **"TLS 1.3 比 1.2 慢"** — 反了，1.3 握手 1-RTT 比 1.2 的 2-RTT 快一倍。
- **"0-RTT 总是好的"** — 有重放风险，仅适合幂等请求。
- **"证书加密所有数据"** — 不，证书只用于身份认证和公钥分发。

## 总结

TLS 握手目的是身份认证和密钥协商。TLS 1.2 握手 2-RTT，用非对称加密交换 PreMaster，派生对称密钥。TLS 1.3 简化为 1-RTT，强制 ECDHE 保证前向安全，支持 0-RTT 会话恢复但有重放风险。生产推荐 TLS 1.3 + HTTP/2，0-RTT 仅用于幂等请求。理解握手流程是排查 HTTPS 性能和证书问题的基础。

## 参考资料

- [RFC 5246 — TLS 1.2](https://datatracker.ietf.org/doc/html/rfc5246)
- [RFC 8446 — TLS 1.3](https://datatracker.ietf.org/doc/html/rfc8446)
- [TLS 1.3 Improvements](https://blog.cloudflare.com/rfc-8446-aka-tls-1-3/)
