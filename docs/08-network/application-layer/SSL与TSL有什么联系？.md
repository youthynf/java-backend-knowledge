# SSL 与 TLS 有什么联系

## 核心概念

SSL（Secure Sockets Layer）和 TLS（Transport Layer Security）是同一个东西的不同版本——TLS 是 SSL 的标准化继任者。SSL 由 Netscape 1994 年设计，1.0/2.0/3.0 三代都有安全漏洞，已被废弃。IETF 接管后改名 TLS，发布 1.0/1.1/1.2/1.3 四个版本。生产中常说的"SSL 证书""SSL 握手"实际指 TLS，SSL 协议本身已禁用。

## 标准回答

SSL/TLS 的演进：

| 协议 | 年份 | 状态 | 备注 |
|------|------|------|------|
| SSL 1.0 | 1994 | 未发布 | 内部测试，有严重漏洞 |
| SSL 2.0 | 1995 | 2011 年废弃 | 已知漏洞，禁用 |
| SSL 3.0 | 1996 | 2015 年废弃 | POODLE 攻击，禁用 |
| TLS 1.0 | 1999 | 2020 年废弃 | BEAST、ROBOT 等漏洞 |
| TLS 1.1 | 2006 | 2020 年废弃 | 较少使用 |
| TLS 1.2 | 2008 | 主流 | 当前广泛使用 |
| TLS 1.3 | 2018 | 推荐 | 性能和安全性大幅提升 |

命名上 SSL 和 TLS 经常混用，但实际部署的几乎都是 TLS。

## 详细机制

### SSL 的诞生

1994 年 Netscape 为 HTTPS 设计 SSL，解决 HTTP 明文传输问题。SSL 1.0 内部使用未发布；SSL 2.0 1995 年发布，存在严重漏洞（弱 MAC、可被中间人攻击）；SSL 3.0 1996 年发布，修复了 2.0 的问题，但仍被发现 POODLE 等漏洞。

### TLS 标准化

1999 年 IETF 接管 SSL，发布 RFC 2246，改名 TLS 1.0。TLS 1.0 实际是 SSL 3.1，只是改了名。后续 1.1（2006）、1.2（2008）、1.3（2018）逐步改进。

### 各版本的安全性问题

| 版本 | 主要漏洞 |
|------|---------|
| SSL 2.0 | 弱 MAC、可降级攻击、明文 MAC |
| SSL 3.0 | POODLE（CBC 漏洞）、可降级到弱加密 |
| TLS 1.0 | BEAST（CBC 预测）、ROBOT（RSA 加密漏洞） |
| TLS 1.1 | 修复 BEAST，但仍有弱算法 |
| TLS 1.2 | 修复大量漏洞，但握手慢、Cipher Suite 复杂 |
| TLS 1.3 | 移除所有不安全算法，握手简化为 1-RTT |

### TLS 1.3 的关键改进

1. **握手 1-RTT**：从 2-RTT 压到 1-RTT，会话复用支持 0-RTT
2. **移除弱算法**：移除 RSA 密钥交换（无前向安全）、RC4、DES、3DES、MD5、SHA1
3. **强制 AEAD**：只保留 AES-GCM、ChaCha20-Poly1305 等加密认证一体化算法
4. **加密更多握手**：ServerHello 之后的所有握手消息都加密，提升隐私
5. **简化 Cipher Suite**：从 300+ 减少到 5 个

### SSL/TLS 在协议栈的位置

```
+-------------------+
| HTTP/SMTP/FTP/... |  应用层
+-------------------+
| SSL/TLS           |  安全层（加密、认证、完整性）
+-------------------+
| TCP               |  传输层
+-------------------+
| IP                |  网络层
+-------------------+
```

SSL/TLS 是介于应用层和传输层之间的"安全层"，可以为 HTTP、SMTP、IMAP、MySQL 等协议提供加密通道。

### TLS 握手的核心步骤

```
1. ClientHello：客户端发送支持的 TLS 版本、Cipher Suite 列表、随机数
2. ServerHello：服务端选定 TLS 版本和 Cipher Suite、随机数
3. Certificate：服务端发送证书
4. KeyExchange：双方协商 premaster secret
5. Finished：双方用协商的密钥加密握手摘要，确认握手完整
6. 后续 HTTP 报文用对称密钥加密
```

### 抓包与版本检测

```bash
# 查看服务端支持的 TLS 版本
$ openssl s_client -connect example.com:443 -tls1_3
# 成功连接表示支持 TLS 1.3

$ openssl s_client -connect example.com:443 -tls1_1
# 失败表示不支持（已禁用）

# 查看握手细节
$ openssl s_client -connect example.com:443 -showcerts
SSL-Session:
    Protocol  : TLSv1.3
    Cipher    : TLS_AES_256_GCM_SHA384

# 用 nmap 扫描支持的协议
$ nmap --script ssl-enum-ciphers -p 443 example.com
|   TLSv1.0: ...
|   TLSv1.1: ...
|   TLSv1.2: ...
|   TLSv1.3: ...
```

### 命名习惯

虽然实际协议是 TLS，但很多术语沿用 SSL：

- "SSL 证书"实际是 TLS 证书
- "SSL 握手"实际是 TLS 握手
- Nginx 配置指令 `ssl_` 开头（如 `ssl_protocols`）
- Java 类名 `SSLSocket`、`SSLContext`

这是历史遗留，不必纠结名称。

### 配置建议

```nginx
# Nginx 安全配置
ssl_protocols TLSv1.2 TLSv1.3;     # 只允许 1.2 和 1.3
ssl_prefer_server_ciphers on;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:...;
ssl_ecdh_curve X25519:secp384r1;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1h;
ssl_session_tickets off;            # 关闭 Session Ticket（如需前向安全）
```

```bash
# 用 Mozilla SSL Configuration Generator 生成安全配置
# https://ssl-config.mozilla.org/
```

## 代码示例

Java 服务端指定 TLS 版本：

```java
import javax.net.ssl.*;

SSLContext ctx = SSLContext.getInstance("TLSv1.3");
ctx.init(kmf.getKeyManagers(), null, null);

SSLServerSocketFactory ssf = ctx.getServerSocketFactory();
try (SSLServerSocket server = (SSLServerSocket) ssf.createServerSocket(443)) {
    server.setEnabledProtocols(new String[]{"TLSv1.2", "TLSv1.3"});   // 禁用旧版本
    server.setEnabledCipherSuites(new String[]{
        "TLS_AES_256_GCM_SHA384",
        "TLS_CHACHA20_POLY1305_SHA256",
        "TLS_AES_128_GCM_SHA256"
    });
    // ...
}
```

Java 客户端校验证书：

```java
import javax.net.ssl.*;

SSLContext ctx = SSLContext.getInstance("TLS");
ctx.init(null, null, null);   // 用默认 TrustManager（校验 CA）

HttpsURLConnection conn = (HttpsURLConnection) new URL("https://example.com/").openConnection();
conn.setSSLSocketFactory(ctx.getSocketFactory());
// 默认 HostnameVerifier 校验证书域名
// 证书无效会抛 SSLHandshakeException
```

## 实战场景

| 场景 | 配置 | 注意点 |
|------|------|--------|
| Web 服务器 | TLS 1.2 + 1.3 | 禁用 1.0/1.1，避免 POODLE 等 |
| 移动端 API | TLS 1.3 | 兼容老 Android/iOS 用 1.2 |
| 内部服务 | mTLS（双向证书） | 用自签名 + 客户端预置 |
| 老旧客户端 | TLS 1.0（不推荐） | 评估升级成本 |
| 邮件 | STARTTLS | SMTP/IMAP over TLS |

## 深挖追问

**Q1：为什么 SSL 3.0 不能用了？**
POODLE 攻击利用 SSL 3.0 的 CBC 填充漏洞，可以解密部分加密数据。RFC 7568 正式废弃 SSL 3.0。

**Q2：TLS 1.0/1.1 为什么废弃？**
存在 BEAST、CRIME、Lucky13 等攻击，且强制 SHA-1（已不安全）。PCI DSS 要求 2018 年起禁用，主流浏览器 2020 年起停止支持。

**Q3：TLS 1.3 为什么移除 RSA 密钥交换？**
RSA 密钥交换不支持前向安全（forward secrecy）——如果服务端私钥泄露，所有历史流量都可被解密。ECDHE 每次握手生成临时密钥对，私钥泄露不影响历史流量。

**Q4：TLS 1.3 的 0-RTT 安全吗？**
有重放风险。攻击者可截获 0-RTT 请求重新发送，服务端会重复处理。所以 0-RTT 只适合幂等请求（GET），不适合非幂等（POST 转账）。

**Q5：自签名证书能用吗？**
内网可以（配合客户端预置证书），公网不行（浏览器警告）。生产中 Web 服务必须用 CA 签名的证书，Let's Encrypt 提供免费证书。

## 易错点

- **"SSL 和 TLS 是两个不同协议"** — 是同一协议的不同版本，TLS 是 SSL 的继任者。
- **"现在还用 SSL"** — 不，SSL 已废弃，实际都是 TLS。
- **"TLS 1.2 和 1.3 差不多"** — 1.3 握手快一倍、移除大量弱算法、强制 AEAD，差异大。
- **"证书加密所有数据"** — 不，证书只用于身份认证和公钥分发，大流量数据用对称密钥加密。
- **"自签名证书更安全"** — 不，自签名不被信任，浏览器警告，用户可能忽略。

## 总结

SSL 和 TLS 是同一协议的演进：SSL 1.0/2.0/3.0 已废弃（POODLE 等漏洞），TLS 1.0/1.1 已废弃（2020 年起），生产中只用 TLS 1.2 和 1.3。TLS 1.3 是当前推荐版本，握手 1-RTT、移除弱算法、强制前向安全。命名上"SSL 证书""SSL 握手"是历史遗留，实际指 TLS。配置时禁用所有旧版本，使用 ECDHE 套件保证前向安全。

## 参考资料

- [RFC 8446 — TLS 1.3](https://datatracker.ietf.org/doc/html/rfc8446)
- [RFC 7568 — Deprecating SSLv3](https://datatracker.ietf.org/doc/html/rfc7568)
- [RFC 8996 — Deprecating TLS 1.0 and TLS 1.1](https://datatracker.ietf.org/doc/html/rfc8996)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
