# HTTPS 如何防范中间人攻击

## 核心概念

中间人攻击（Man-in-the-Middle, MITM）指攻击者冒充服务端与客户端通信，同时冒充客户端与服务端通信，全程双方都以为在直接对话，实际数据被攻击者窥探和篡改。HTTPS 通过 TLS 的"加密 + 证书认证 + 完整性校验"三层防护抵御 MITM：加密让攻击者读不到内容，证书让攻击者无法冒充服务端，MAC 让攻击者无法篡改。

## 标准回答

HTTPS 防 MITM 的三大机制：

1. **证书认证**：服务端证书由 CA 签名，客户端用预装的根证书验证，攻击者无法伪造合法证书
2. **密钥协商**：用 ECDHE 等算法协商对称密钥，私钥不出服务端，攻击者拿不到密钥
3. **完整性校验**：每个 TLS 记录带 MAC，攻击者篡改任何字节都会校验失败

攻击者即使能截获所有流量，也无法解密、无法冒充、无法篡改。

## 详细机制

### 中间人攻击的过程

HTTP 下的 MITM：

```
Client ──[明文请求]──> 攻击者 ──[明文请求]──> Server
Client <──[明文响应]── 攻击者 <──[明文响应]── Server
```

攻击者能看到所有内容，能修改请求和响应，双方都不知道。

### HTTPS 防 MITM：证书认证

握手时服务端发证书，客户端验证：

```
1. 服务端发送证书链
   Server → Client: Certificate (服务端证书 + 中间证书)

2. 客户端验证证书链
   - 用预装的根证书验证中间证书签名
   - 用中间证书验证服务端证书签名
   - 检查证书域名是否匹配（CN/SAN）
   - 检查证书是否过期
   - 检查证书是否被吊销（OCSP/CRL）

3. 验证通过 → 信任服务端身份
   验证失败 → 终止握手
```

攻击者想冒充服务端必须有合法证书，但 CA 不会给攻击者签发 example.com 的证书（除非攻击者控制域名）。

### HTTPS 防 MITM：密钥协商

ECDHE 密钥交换：

```
1. 双方各自生成临时椭圆曲线密钥对
   Client: (client_private, client_public)
   Server: (server_private, server_public)

2. 交换公钥（明文，但私钥不出本地）
   Client → Server: client_public
   Server → Client: server_public

3. 计算共享密钥
   Client: shared_secret = ECDH(client_private, server_public)
   Server: shared_secret = ECDH(server_private, client_public)
   # 两者相等（ECDHE 算法保证）

4. 派生对称密钥
   master_secret = PRF(shared_secret, client_random + server_random)
```

攻击者截获了 client_public 和 server_public，但 ECDHE 是离散对数难题，攻击者无法从公钥推出私钥，无法计算 shared_secret。

### HTTPS 防 MITM：完整性校验

每个 TLS 记录都带 MAC：

```
TLS Record:
  - 内容（已加密）
  - MAC（消息认证码）
```

接收方用密钥重新计算 MAC，与收到的 MAC 对比：

- 一致 → 数据未被篡改
- 不一致 → 数据被篡改，丢弃并终止连接

攻击者即使能修改密文，因为没有密钥无法生成正确的 MAC，篡改会被发现。

### 攻击者能做什么 / 不能做什么

**不能做**：

- 无法解密 HTTPS 流量（没有密钥）
- 无法冒充服务端（没有合法证书）
- 无法修改请求/响应（MAC 校验失败）
- 无法重放完整握手（每次随机数不同）

**仍能做**：

- 流量分析（看 IP、端口、包大小、时间推断行为）
- SSL Strip（把 HTTPS 降级到 HTTP，需用户配合）
- 0-RTT 重放（仅 TLS 1.3 早期数据）
- 利用客户端漏洞（如忽略证书警告）

### SSL Strip 攻击

攻击者在中间把 HTTPS 链接改成 HTTP：

```
Client ──HTTP──> 攻击者 ──HTTPS──> Server
                  ↓
        把响应中的 https://链接改成 http://
        把 Strict-Transport-Security 头去掉
```

客户端以为在用 HTTP，所有数据明文给攻击者。

防护：

- **HSTS 头**：服务端告诉浏览器"我永远用 HTTPS"，浏览器在 max-age 期间自动跳 HTTPS
- **HSTS Preload**：浏览器内置 HSTS 列表，首次访问也强制 HTTPS

### 客户端不校验证书的后果

```java
// 反例：信任所有证书（开发调试用，生产禁用！）
TrustManager[] trustAll = new TrustManager[]{
    new X509TrustManager() {
        public void checkServerTrusted(...) {}   // 啥都不检查
        public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
    }
};
SSLContext ctx = SSLContext.getInstance("TLS");
ctx.init(null, trustAll, null);
HttpsURLConnection.setDefaultSSLSocketFactory(ctx.getSocketFactory());
```

客户端不校验证书，攻击者用自签名证书就能冒充服务端，HTTPS 完全失效。生产代码必须严格校验证书。

### 企业 MITM 设备

某些企业部署 MITM 设备监控员工流量：

```
Client ──HTTPS──> 企业网关（用自签证书，员工机器预装根证书）──HTTPS──> Server
```

客户端预装了企业的根证书，所以企业网关的自签证书能通过验证。这种场景下 HTTPS 实际被破解，企业能看到所有流量。这通常用于合规审计，但用户应知情。

### 抓包验证

```bash
# 用 mitmproxy 测试 MITM（仅自有设备，否则违法）
$ mitmproxy --mode transparent

# 客户端配置代理后，mitmproxy 会生成自签证书
# 浏览器会警告证书不受信任
# 如果用户忽略警告，攻击成功
# 如果用户拒绝，HTTPS 防护成功

# 检测证书是否被 MITM
$ openssl s_client -connect example.com:443 -showcerts
# 看证书链是否合理，issuer 是否是已知 CA
```

## 代码示例

Java 严格校验证书（默认行为）：

```java
import javax.net.ssl.*;
import java.net.*;

// 默认 HttpsURLConnection 会校验证书
// 证书无效会抛 SSLHandshakeException
URL url = new URL("https://example.com/");
HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
conn.setConnectTimeout(5000);
try {
    conn.getInputStream();   // 触发握手和证书校验
} catch (SSLHandshakeException e) {
    // 证书无效（过期、域名不匹配、CA 不信任）
    System.err.println("Certificate invalid: " + e.getMessage());
}
```

Nginx 启用 HSTS：

```nginx
server {
    listen 443 ssl http2;
    # 强制浏览器在 max-age 内只用 HTTPS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
}

server {
    listen 80;
    server_name example.com;
    # HTTP 直接 301 到 HTTPS
    return 301 https://$server_name$request_uri;
}
```

提交域名到 HSTS Preload 列表：

```
1. 配置 HSTS 头（max-age 至少 1 年，includeSubDomains，preload）
2. 访问 https://hstspreload.org/ 提交域名
3. 浏览器内置后，首次访问也强制 HTTPS
```

## 实战场景

| 场景 | 风险 | 防护 |
|------|------|------|
| 公共 Wi-Fi | 中间人嗅探 | 全站 HTTPS + HSTS |
| 钓鱼网站 | 仿冒域名 | EV 证书 + 用户教育 |
| 客户端代码漏洞 | 信任所有证书 | 代码审计禁用 trustAll |
| 企业 MITM 设备 | 员工流量被监控 | 用户知情 + 工作账户分离 |
| 内部服务调用 | 服务间冒充 | mTLS 双向证书认证 |
| 证书泄露 | 私钥被偷 | OCSP 吊销 + 紧急换证 |

## 深挖追问

**Q1：HTTPS 能完全防 MITM 吗？**
能防未授权的中间人（没有合法证书）。但如果客户端主动信任攻击者证书（用户忽略警告、企业 MITM 设备），HTTPS 会被绕过。

**Q2：自签名证书为什么不安全？**
自签名证书没有 CA 背书，客户端无法确认证书归属。攻击者可以自签名一个 example.com 证书冒充。生产用 CA 签名证书，内网用 mTLS（双向预置证书）。

**Q3：HSTS 完全防 SSL Strip 吗？**
首次访问不能防（浏览器还没收到 HSTS 头）。HSTS Preload 列表解决首次访问问题，但需主动申请。

**Q4：0-RTT 为什么有重放风险？**
0-RTT 早期数据随 ClientHello 发出，攻击者可截获重发，服务端无法区分新旧。需限制 0-RTT 仅用于幂等请求。

**Q5：证书吊销后还能用吗？**
能。已建立的连接不受影响，但新连接握手时客户端通过 OCSP/CRL 检查到吊销会拒绝。所以重要场景要短证书有效期 + 强制 OCSP Stapling。

## 易错点

- **"HTTPS 完全防 MITM"** — 客户端不校验证书或用户忽略警告时仍会被 MITM。
- **"自签名证书够用"** — 公网不行，浏览器警告用户会忽略或离开。
- **"HSTS 首次访问也防 SSL Strip"** — 不，需 HSTS Preload。
- **"0-RTT 完全安全"** — 有重放风险，仅用于幂等请求。
- **"证书加密所有数据"** — 不，证书只用于身份认证。

## 总结

HTTPS 防 MITM 三层机制：证书认证让攻击者无法冒充服务端，ECDHE 密钥协商让攻击者拿不到密钥，MAC 完整性校验让攻击者无法篡改。但客户端必须严格校验证书，用户不能忽略警告，否则 HTTPS 会被绕过。HSTS + Preload 防 SSL Strip，mTLS 防内部服务冒充，OCSP Stapling 保证吊销检查实时性。

## 参考资料

- [RFC 8446 — TLS 1.3](https://datatracker.ietf.org/doc/html/rfc8446)
- [RFC 6797 — HTTP Strict Transport Security (HSTS)](https://datatracker.ietf.org/doc/html/rfc6797)
- [OWASP — TLS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html)
