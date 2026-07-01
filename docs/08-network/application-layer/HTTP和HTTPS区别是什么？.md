# HTTP 和 HTTPS 区别是什么

## 核心概念

HTTPS 不是新的应用层协议，而是 HTTP over TLS——在 HTTP 和 TCP 之间插入 TLS 加密层。HTTP 明文传输，存在窃听、篡改、伪装三大风险；HTTPS 通过 TLS 握手协商密钥，后续 HTTP 报文全部加密。理解 HTTPS 的关键是"加密、认证、防篡改"三件事，而不是简单理解为"HTTP 加个 S"。

## 标准回答

HTTP vs HTTPS 核心差异：

| 维度 | HTTP | HTTPS |
|------|------|-------|
| 全称 | HyperText Transfer Protocol | HTTP Secure / HTTP over TLS |
| 默认端口 | 80 | 443 |
| 传输内容 | 明文 | TLS 加密 |
| 握手 | TCP 三次握手（1 RTT） | TCP + TLS 握手（2-3 RTT） |
| 证书 | 不需要 | 需要 CA 颁发的数字证书 |
| 安全性 | 无加密、无认证、无完整性 | 加密 + 身份认证 + 完整性校验 |
| 性能 | 快，无加密开销 | 略慢，但 TLS 1.3 + 会话复用优化后差异小 |
| 适用场景 | 内网、非敏感数据 | Web、API、支付、登录等 |

## 详细机制

### 协议栈对比

```
HTTP:
  +-----------+
  | HTTP      |  应用层
  +-----------+
  | TCP       |  传输层
  +-----------+
  | IP        |  网络层
  +-----------+

HTTPS:
  +-----------+
  | HTTP      |  应用层
  +-----------+
  | TLS       |  安全层（加密、认证、完整性）
  +-----------+
  | TCP       |  传输层
  +-----------+
  | IP        |  网络层
  +-----------+
```

HTTPS 在 HTTP 和 TCP 之间插入 TLS 层，HTTP 报文先经 TLS 加密成密文，再交给 TCP 传输。

### 建连流程对比

**HTTP**：

```
Client → Server: SYN
Client ← Server: SYN+ACK
Client → Server: ACK
# TCP 握手完成（1 RTT），开始传 HTTP 报文
Client → Server: GET / HTTP/1.1
Client ← Server: HTTP/1.1 200 OK ...
```

**HTTPS（TLS 1.2）**：

```
Client → Server: SYN
Client ← Server: SYN+ACK
Client → Server: ACK
# TCP 握手完成（1 RTT）
Client → Server: TLS ClientHello
Client ← Server: TLS ServerHello + Certificate + ServerHelloDone
Client → Server: ClientKeyExchange + ChangeCipherSpec + Finished
Client ← Server: ChangeCipherSpec + Finished
# TLS 握手完成（2 RTT）
Client → Server: GET / HTTP/1.1（已加密）
Client ← Server: HTTP/1.1 200 OK（已加密）
```

总耗时 3 RTT（TCP 1 + TLS 2）才能开始发 HTTP 请求。

**HTTPS（TLS 1.3）**：

```
TCP 握手（1 RTT）
Client → Server: ClientHello + KeyShare
Client ← Server: ServerHello + KeyShare + Certificate + Finished
Client → Server: Finished + HTTP 请求
# TLS 1.3 握手 1 RTT，总 2 RTT
```

TLS 1.3 把握手压到 1 RTT，配合会话复用可做到 0-RTT。

### HTTPS 提供的三大保障

1. **加密（机密性）**：对称加密（AES/ChaCha20）保护数据，密钥由握手协商
2. **认证（身份）**：服务端证书由 CA 签名，客户端校验证书链确认服务端身份
3. **完整性**：MAC（消息认证码）或 AEAD 加密模式保证数据不被篡改

### 证书与 CA

```
客户端信任的根证书（预装在 OS/浏览器）
    │
    ├─ CA 中间证书（Intermediate CA）
        │
        └─ 服务端证书（example.com）
```

服务端发送证书链（服务端证书 + 中间证书），客户端用预装的根证书验证签名链，确认服务端身份。

自签名证书不被信任因为没经过 CA，浏览器会警告。

### 性能对比

| 项 | HTTP | HTTPS |
|----|------|-------|
| 建连 RTT | 1 | 2-3（TLS 1.2）/ 2（TLS 1.3） |
| 加密开销 | 0 | 握手时非对称加密，传输时对称加密 |
| 证书验证 | 0 | OCSP 验证 + 路径构建 |
| 文件大小 | 不变 | 加密后略增（MAC 等开销） |

现代 CPU AES-NI 指令让对称加密几乎无开销，HTTPS 的主要成本在握手 RTT 和非对称加密。TLS 1.3 + 会话复用 + HTTP/2 多路复用让 HTTPS 性能接近 HTTP。

### 抓包示例

```bash
# HTTP 报文明文可见
$ tcpdump -i any -n -A 'tcp port 80 and host example.com'
10:00:00 IP C.5000 > S.80: GET / HTTP/1.1
10:00:00 IP S.80 > C.5000: HTTP/1.1 200 OK..<!doctype html>...
# 明文可见，可被嗅探

# HTTPS 报文密文
$ tcpdump -i any -n -A 'tcp port 443 and host example.com'
10:00:00 IP C.5000 > S.443: .....)...j.....&...{...
10:00:00 IP S.443 > C.5000: ......G..x.._....&.a..r...
# 看不懂，是 TLS 加密后的密文
```

测试 HTTPS 配置：

```bash
$ curl -v https://example.com/
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384
* Server certificate:
*  subject: CN=example.com
*  start date: Jan 1 00:00:00 2025 GMT
*  expire date: Mar 1 23:59:59 2025 GMT
*  issuer: C=US; O=Let's Encrypt; CN=R3
*  SSL certificate verify ok
```

## 代码示例

Java 启用 HTTPS 服务端：

```java
import javax.net.ssl.*;
import java.io.*;

public class HttpsServer {
    public static void main(String[] args) throws Exception {
        // 加载 keystore（含证书和私钥）
        char[] password = "changeit".toCharArray();
        KeyStore ks = KeyStore.getInstance("JKS");
        try (var in = new FileInputStream("server.jks")) {
            ks.load(in, password);
        }

        KeyManagerFactory kmf = KeyManagerFactory.getInstance("SunX509");
        kmf.init(ks, password);

        SSLContext ctx = SSLContext.getInstance("TLSv1.3");
        ctx.init(kmf.getKeyManagers(), null, null);

        SSLServerSocketFactory ssf = ctx.getServerSocketFactory();
        try (SSLServerSocket server = (SSLServerSocket) ssf.createServerSocket(443)) {
            // 只允许 TLS 1.2 和 1.3
            server.setEnabledProtocols(new String[]{"TLSv1.2", "TLSv1.3"});
            SSLSocket socket = (SSLSocket) server.accept();
            // 读取 HTTPS 请求...
        }
    }
}
```

Java 客户端跳过证书校验（仅测试用）：

```java
import javax.net.ssl.*;
import java.net.*;
import java.io.*;

public class TrustAllClient {
    public static void main(String[] args) throws Exception {
        // 创建信任所有证书的 TrustManager（仅测试，生产禁用！）
        TrustManager[] trustAll = new TrustManager[]{
            new X509TrustManager() {
                public void checkClientTrusted(java.security.cert.X509Certificate[] c, String a) {}
                public void checkServerTrusted(java.security.cert.X509Certificate[] c, String a) {}
                public java.security.cert.X509Certificate[] getAcceptedIssuers() { return new java.security.cert.X509Certificate[0]; }
            }
        };
        SSLContext ctx = SSLContext.getInstance("TLS");
        ctx.init(null, trustAll, new java.security.SecureRandom());

        HttpsURLConnection.setDefaultSSLSocketFactory(ctx.getSocketFactory());
        HttpsURLConnection.setDefaultHostnameVerifier((h, s) -> true);

        URL url = new URL("https://example.com/");
        try (BufferedReader in = new BufferedReader(
                new InputStreamReader(url.openStream()))) {
            String line;
            while ((line = in.readLine()) != null) System.out.println(line);
        }
    }
}
```

## 实战场景

| 场景 | 选择 | 注意点 |
|------|------|--------|
| Web 网站 | HTTPS | 启用 HSTS 强制 HTTPS |
| API 接口 | HTTPS | 双向 TLS（mTLS）适用高安全场景 |
| 内部服务调用 | mTLS 或 HTTP | 服务网格统一处理证书 |
| 静态资源 | HTTPS | 配合 HTTP/2 提升性能 |
| 支付/登录 | 必须 HTTPS | 证书有效性、HSTS、Secure Cookie |

## 深挖追问

**Q1：HTTPS 能防止 XSS 和 CSRF 吗？**
不能。HTTPS 只保护传输链路，XSS 是应用层注入攻击，CSRF 是基于 Cookie 的请求伪造，与传输加密无关。

**Q2：HTTPS 能防止 DNS 劫持吗？**
部分能。DNS 劫持把域名解析到错误 IP，但攻击者没有合法证书，HTTPS 握手会因证书不匹配失败，浏览器警告。但如果用户忽略警告继续访问，仍会被攻击。

**Q3：为什么 HTTPS 不只用非对称加密？**
非对称加密（RSA/ECC）计算慢，不适合大流量。握手用非对称协商出对称密钥，传输用对称加密，是性能与安全的平衡。

**Q4：HTTPS 一定安全吗？**
不一定。证书过期、私钥泄露、弱 TLS 配置、客户端不校验证书、混合内容（HTTPS 页面加载 HTTP 资源）、应用层漏洞都会让 HTTPS 安全收益打折。

**Q5：HTTPS 性能差多少？**
TLS 1.3 + HTTP/2 + 现代硬件下，HTTPS 性能接近 HTTP。AES-NI 指令让对称加密几乎免费，主要成本在握手 RTT，会话复用和 0-RTT 能消除。

## 易错点

- **"HTTPS = HTTP + SSL"** — 严格说是 HTTP over TLS，SSL 已废弃。
- **"HTTPS 比 HTTP 慢很多"** — 现代 TLS 1.3 + HTTP/2 下差异很小。
- **"自签名证书能用"** — 浏览器会警告，生产不能用。
- **"HTTPS 防止所有攻击"** — 只防传输层攻击，不防应用层（XSS、SQL 注入）。
- **"HTTPS 一定要 CA 证书"** — 内网可用自签名 + 客户端预置证书（mTLS）。

## 总结

HTTPS 是 HTTP over TLS，在 TCP 之上插入 TLS 加密层，提供加密、认证、完整性三大保障。建连比 HTTP 多 1-2 RTT（TLS 1.3 仅 1 RTT），证书和加密带来少量开销但现代硬件下可忽略。HTTPS 不解决应用层漏洞，但配合 HSTS、Secure Cookie、HTTP/2 能提供安全且高性能的 Web 服务。生产中强制 HTTPS 是基本要求。

## 参考资料

- [RFC 2818 — HTTP Over TLS](https://datatracker.ietf.org/doc/html/rfc2818)
- [RFC 8446 — TLS 1.3](https://datatracker.ietf.org/doc/html/rfc8446)
- [MDN — HTTPS](https://developer.mozilla.org/en-US/docs/Glossary/HTTPS)
