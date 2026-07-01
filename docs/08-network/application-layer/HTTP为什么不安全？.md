# HTTP 为什么不安全

## 核心概念

HTTP 设计于 1989 年，目标是文档检索，不考虑安全。它明文传输、不认证通信方身份、不校验数据完整性，导致三大风险：窃听、篡改、伪装。HTTPS（HTTP over TLS）通过加密、证书认证、消息认证码解决这三个问题。理解 HTTP 的不安全性是设计安全 Web 应用的起点——很多线上事故（密码泄露、订单篡改、会话劫持）根源就是用了 HTTP。

## 标准回答

HTTP 的三大不安全风险：

1. **窃听（无加密）**：数据明文传输，网络中任何节点（路由器、ISP、Wi-Fi）都能看到内容
2. **篡改（无完整性）**：数据可被中间人修改，接收方无法发现
3. **伪装（无认证）**：无法验证服务端身份，中间人可冒充服务端

HTTPS 用 TLS 解决：

- **加密**：对称加密保护数据
- **完整性**：MAC/AEAD 校验数据未被修改
- **认证**：CA 签名的证书验证服务端身份

## 详细机制

### 风险 1：窃听

HTTP 明文传输，整个链路上数据可被截获：

```
Client ──[GET /login?password=abc123]──> 路由器 ──> ISP ──> ... ──> Server
                                        ↓       ↓
                                     攻击者可截获明文
```

哪些位置可被窃听：

- **Wi-Fi**：公共 Wi-Fi 抓包可见所有 HTTP 流量
- **路由器/交换机**：网络管理员或攻击者可镜像端口抓包
- **ISP**：运营商可见所有经过的流量
- **CDN/代理**：中间节点可见明文

敏感信息一旦经过 HTTP 传输即视为已泄露：密码、SessionId、Cookie、个人隐私、支付信息。

```bash
# 抓包 HTTP 流量明文可见
$ tcpdump -i any -A 'tcp port 80'
10:00:00 IP C.5000 > S.80: GET /api/login?user=alice&password=secret123 HTTP/1.1
10:00:00 IP S.80 > C.5000: HTTP/1.1 200 OK..Set-Cookie: SESSIONID=abc123...
# 密码、SessionId 全部明文可见
```

### 风险 2：篡改

HTTP 不校验数据完整性，中间人可修改请求或响应：

```
Client → 中间人 → Server
中间人修改请求：把转账金额从 100 改成 10000
中间人修改响应：把页面中的"账户余额 1000"改成"账户余额 10000"
```

典型篡改场景：

- **运营商注入广告**：HTTP 页面被 ISP 注入 JavaScript 广告
- **页面篡改**：攻击者修改页面跳转链接，引导到钓鱼网站
- **响应内容篡改**：修改下载文件的哈希，注入后门
- **请求参数篡改**：修改订单金额、数量等

```bash
# 运营商常见注入手法：在 HTTP 响应中插入 <script>
HTTP/1.1 200 OK
Content-Type: text/html

<html>
<head>...</head>
<body>
原页面内容
<script src="http://ad.isp.com/inject.js"></script>   <!-- 注入 -->
</body>
</html>
```

### 风险 3：伪装（中间人攻击）

HTTP 无法验证服务端身份，攻击者可冒充服务端：

```
Client → 攻击者（伪装成 Server）→ 真实 Server
攻击者收到 Client 请求，自己发请求到真实 Server，把响应转回 Client
全程 Client 以为在和真实 Server 通信，实际数据被攻击者窥探和修改
```

中间人攻击的常见场景：

- **公共 Wi-Fi 钓鱼**：攻击者建一个名为 "FreeWiFi" 的热点，所有 HTTP 流量被劫持
- **DNS 劫持**：把域名解析到攻击者 IP
- **ARP 欺骗**：局域网内伪装成网关

### HTTPS 如何解决

**加密防窃听**：

```
Client ──[TLS 握手协商密钥]──> Server
Client ──[密文请求]──────────> Server
攻击者只能看到密文，无法读取
```

**完整性防篡改**：

```
每个 TLS 记录都带 MAC（消息认证码）
中间人修改任何字节，MAC 校验失败，连接断开
```

**证书防伪装**：

```
Client → Server: 请求证书
Server → Client: 证书（CA 签名）
Client: 用预装的根证书验证签名 → 确认服务端身份
# 攻击者没有合法证书，无法冒充
```

### 还有什么 HTTPS 不解决

HTTPS 只保护传输层，应用层漏洞仍存在：

- **XSS**：恶意脚本注入页面，HTTPS 不能阻止
- **CSRF**：基于 Cookie 的跨站请求伪造，HTTPS 不能阻止
- **SQL 注入**：服务端代码漏洞
- **服务端越权**：业务逻辑问题
- **客户端被入侵**：木马、键盘记录器
- **物理窃取**：设备丢失

完整安全需要传输加密 + 应用安全 + 业务安全 + 终端安全多层防护。

### 抓包对比

```bash
# HTTP 流量明文
$ tcpdump -i any -A 'tcp port 80'
10:00:00 IP C.5000 > S.80: GET /api/users/1 HTTP/1.1
10:00:00 IP S.80 > C.5000: HTTP/1.1 200 OK..{"id":1,"name":"Alice","ssn":"123-45-6789"}
# SSN 等敏感信息明文可见

# HTTPS 流量密文
$ tcpdump -i any -A 'tcp port 443'
10:00:00 IP C.5000 > S.443: .........x..j....{...........Q....
10:00:00 IP S.443 > C.5000: ......G..x.._....&.a..r...........
# 看不懂，TLS 加密
```

## 代码示例

服务端强制 HTTPS（HTTP 跳转 HTTPS）：

```java
import javax.servlet.*;
import javax.servlet.http.*;
import java.io.IOException;

@WebFilter("/*")
public class HttpsRedirectFilter implements Filter {
    @Override
    public void doFilter(ServletRequest req, ServletResponse resp, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpReq = (HttpServletRequest) req;
        HttpServletResponse httpResp = (HttpServletResponse) resp;

        // 检测是否 HTTPS（直接或经代理）
        String scheme = httpReq.getHeader("X-Forwarded-Proto");
        if (scheme == null) scheme = httpReq.getScheme();

        if (!"https".equals(scheme)) {
            String host = httpReq.getServerName();
            String uri = httpReq.getRequestURI();
            String query = httpReq.getQueryString();
            String httpsUrl = "https://" + host + uri + (query != null ? "?" + query : "");
            httpResp.sendRedirect(httpsUrl);   // 301 跳转
            return;
        }
        chain.doFilter(req, resp);
    }
}
```

设置安全 Cookie：

```java
// Cookie 只在 HTTPS 下传输，防止被窃听
Cookie session = new Cookie("SESSIONID", sessionId);
session.setSecure(true);        // 仅 HTTPS 传输
session.setHttpOnly(true);      // JavaScript 不可访问，防 XSS
session.setPath("/");
session.setMaxAge(3600);
response.addCookie(session);

// HSTS 头：强制浏览器后续都用 HTTPS
response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
```

Nginx 强制 HTTPS：

```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;
    ssl_certificate /etc/nginx/ssl/example.com.crt;
    ssl_certificate_key /etc/nginx/ssl/example.com.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
}
```

## 实战场景

| 风险 | 场景 | 防护 |
|------|------|------|
| 窃听 | 公共 Wi-Fi 抓密码 | 全站 HTTPS |
| 篡改 | 运营商注入广告 | HTTPS + 完整性校验 |
| 伪装 | 中间人钓鱼 | HTTPS + 证书钉扎（HPKP） |
| Cookie 劫持 | HTTP 传 Cookie 被截获 | Secure Cookie + HTTPS |
| 混合内容 | HTTPS 页面加载 HTTP 资源 | 浏览器拦截混合内容 |
| 重放 | 请求被截获重发 | HTTPS + Nonce + Timestamp |

## 深挖追问

**Q1：HTTPS 能完全防中间人吗？**
能防未授权的中间人（没有合法证书），但不能防客户端主动信任攻击者证书（用户忽略警告、企业 MITM 设备）。

**Q2：内网调用还需要 HTTPS 吗？**
建议用 mTLS。零信任架构下"内网可信"假设不成立，服务间调用也应加密。

**Q3：HTTPS 能防止 CSRF 吗？**
不能直接防。CSRF 是基于 Cookie 自动携带的攻击，HTTPS 不影响 Cookie 行为。要防 CSRF 需要 SameSite Cookie + CSRF Token。

**Q4：HTTPS 能防止重放攻击吗？**
TLS 层防重放：每个连接有独立密钥，且序列号递增。但应用层重放（如截获合法请求重新发送）需要业务层 Nonce/Timestamp 防护。

**Q5：HSTS 是什么？**
HTTP Strict Transport Security，服务端告诉浏览器"我永远用 HTTPS"，浏览器在 max-age 时间内自动把 HTTP 跳 HTTPS，防 SSL Strip 攻击。

## 易错点

- **"HTTPS 一定安全"** — 不，只防传输层攻击，不防应用层。
- **"内网用 HTTP 没事"** — 不，零信任下内网也不可信。
- **"HTTPS 防止 CSRF"** — 不防，CSRF 是基于 Cookie 的。
- **"用了 HTTPS 就不用业务幂等"** — 不，HTTPS 不防应用层重放。
- **"HTTPS 性能差很多"** — 现代 TLS 1.3 + HTTP/2 下差异很小。

## 总结

HTTP 不安全是因为明文传输（窃听风险）、无完整性校验（篡改风险）、无身份认证（伪装风险）。HTTPS 通过 TLS 加密、MAC/AEAD 完整性、CA 证书认证解决这三大风险。但 HTTPS 只保护传输层，应用层漏洞（XSS、CSRF、SQL 注入）仍需业务层防护。生产中强制 HTTPS + HSTS + Secure Cookie 是基本安全要求。

## 参考资料

- [RFC 7230 — HTTP/1.1 Message Syntax and Routing](https://datatracker.ietf.org/doc/html/rfc7230)
- [RFC 2818 — HTTP Over TLS](https://datatracker.ietf.org/doc/html/rfc2818)
- [RFC 6797 — HTTP Strict Transport Security (HSTS)](https://datatracker.ietf.org/doc/html/rfc6797)
