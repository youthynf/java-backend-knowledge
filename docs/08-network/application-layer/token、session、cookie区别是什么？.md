# Token、Session、Cookie 区别是什么

## 核心概念

Token、Session、Cookie 是三个不同维度的概念，常被放在一起比较但实际不在一个层次。Cookie 是浏览器端的存储机制（自动随请求携带）；Session 是服务端的会话存储（客户端持 SessionId）；Token 是自包含的凭证（载荷中携带身份信息，服务端验签即用）。理解三者区别和适用场景是设计认证方案的基础。

## 标准回答

三者对比：

| 维度 | Cookie | Session | Token（含 JWT） |
|------|--------|---------|----------------|
| 本质 | 客户端存储机制 | 服务端会话存储 | 自包含凭证 |
| 状态位置 | 客户端 | 服务端 | 客户端（载荷中） |
| 服务端存储 | 不需要 | 需要（内存/Redis） | 不需要 |
| 携带方式 | 浏览器自动带 | Cookie 传 SessionId | Authorization 头 |
| 大小 | ≤ 4 KB | SessionId 几十字节 | 数百字节到几 KB |
| 撤销 | 删 Cookie 即可 | 删 Session 即可 | 难（需黑名单） |
| 跨域 | 受同源策略 | 受 Cookie 同源 | 跨域友好 |
| 分布式 | 天然支持 | 需共享存储 | 天然支持 |

## 详细机制

### Cookie

浏览器端的键值存储，每次请求自动携带到同域：

```
1. 服务端响应 Set-Cookie: name=value; HttpOnly; Secure
2. 浏览器存储
3. 后续请求自动带 Cookie: name=value
```

特点：

- 自动携带（浏览器行为）
- 受同源策略限制
- 大小受限（4 KB）
- 可配置 HttpOnly、Secure、SameSite

适合：SessionId 传递、用户偏好、跟踪标识。

### Session

服务端会话存储，客户端持 SessionId：

```
1. 服务端创建 Session，存用户信息
   Session[abc123] = { userId: 42, ... }
2. 响应 Set-Cookie: sessionId=abc123
3. 后续请求带 Cookie: sessionId=abc123
4. 服务端按 sessionId 查 Session 数据
```

特点：

- 数据在服务端（安全）
- 客户端只持 SessionId
- 撤销容易（删 Session 即可）
- 分布式需共享存储（Redis）

适合：传统 Web 登录、敏感会话数据。

### Token

自包含的凭证，载荷中携带身份信息，服务端验签即用：

```
1. 服务端签发 Token（含 userId、过期等，签名）
   Token = base64(header).base64(payload).signature
2. 客户端存储 Token
3. 后续请求带 Authorization: Bearer <token>
4. 服务端验签 + 检查过期，从载荷取 userId
```

特点：

- 自包含（无需查服务端存储）
- 无状态（服务端不存会话）
- 跨域友好（Authorization 头）
- 撤销难（需黑名单）

适合：前后端分离、微服务、跨域 API。

### 三者关系

```
Cookie + Session:
  Cookie 传 SessionId
  Session 数据在服务端
  → 传统 Web 登录

Token:
  客户端持完整 Token
  服务端验签即用
  → 无状态认证

Cookie 也可以传 Token:
  Token 存 Cookie
  → Cookie 自动携带 + Token 无状态
  → 但 Cookie 受同源限制
```

Cookie、Session、Token 不是互斥的，可以组合使用：

- Cookie + Session：传统 Web
- Authorization + Token：API
- Cookie + Token：Token 存 Cookie，浏览器自动带

### 选型决策

```
传统 Web（同域、服务端可控）→ Session + Cookie
前后端分离（跨域、API） → Token
分布式微服务 → Token（无状态）或 Session 外置 Redis
需要主动撤销 → Session
跨多个服务 → Token + RS256（公钥分发）
移动端 → Token
```

### 安全风险对比

| 风险 | Cookie | Session | Token |
|------|--------|---------|-------|
| XSS | 可读 Cookie（无 HttpOnly） | 不直接受影响 | localStorage 可读 |
| CSRF | 浏览器自动带 Cookie | 同 Cookie | 不受影响（手动带） |
| 窃听 | HTTP 明文 | SessionId 泄露 | Token 泄露 |
| 重放 | 可重放 | 可重放 | 加 Nonce 防重放 |
| 撤销 | 删 Cookie | 删 Session | 黑名单 |

防护：

- Cookie：HttpOnly + Secure + SameSite
- Session：登录后重新生成 SessionId、短超时
- Token：HTTPS、短有效期、Refresh Token、不在 localStorage 存（用 HttpOnly Cookie）

## 代码示例

传统 Web 用 Session + Cookie：

```java
import javax.servlet.http.*;

@PostMapping("/login")
public void login(HttpServletRequest req, ...) {
    HttpSession session = req.getSession(true);
    session.setAttribute("userId", user.getId());
    // 响应自动带 Set-Cookie: JSESSIONID=...
}

@GetMapping("/profile")
public User profile(HttpServletRequest req) {
    HttpSession session = req.getSession(false);
    Long userId = (Long) session.getAttribute("userId");
    return userService.findById(userId);
}
```

前后端分离用 Token（JWT）：

```java
import io.jsonwebtoken.*;

@PostMapping("/login")
public TokenResponse login(@RequestBody LoginRequest req) {
    User user = authService.login(req);
    String token = Jwts.builder()
        .setSubject(user.getId().toString())
        .setExpiration(new Date(System.currentTimeMillis() + 900000))
        .signWith(SignatureAlgorithm.HS256, SECRET)
        .compact();
    return new TokenResponse(token);
}

// 拦截器验证
public class JwtInterceptor implements HandlerInterceptor {
    public boolean preHandle(HttpServletRequest req, ...) {
        String auth = req.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            resp.setStatus(401);
            return false;
        }
        Claims claims = Jwts.parser().setSigningKey(SECRET)
            .parseClaimsJws(auth.substring(7)).getBody();
        req.setAttribute("userId", Long.parseLong(claims.getSubject()));
        return true;
    }
}
```

Token 存 HttpOnly Cookie（防 XSS 读取）：

```java
// 服务端登录后把 Token 写入 HttpOnly Cookie
@PostMapping("/login")
public void login(HttpServletRequest req, HttpServletResponse resp, ...) {
    String token = jwtUtil.generate(user.getId());
    Cookie cookie = new Cookie("token", token);
    cookie.setHttpOnly(true);    // JavaScript 不可读
    cookie.setSecure(true);       // 仅 HTTPS
    cookie.setPath("/");
    cookie.setMaxAge(900);
    resp.addCookie(cookie);
}

// 后续请求浏览器自动带 Cookie，拦截器从 Cookie 取 Token
public boolean preHandle(HttpServletRequest req, ...) {
    Cookie[] cookies = req.getCookies();
    for (Cookie c : cookies) {
        if ("token".equals(c.getName())) {
            Claims claims = jwtUtil.verify(c.getValue());
            req.setAttribute("userId", Long.parseLong(claims.getSubject()));
            return true;
        }
    }
    resp.setStatus(401);
    return false;
}
```

## 实战场景

| 场景 | 推荐方案 | 原因 |
|------|---------|------|
| 传统 Web 登录 | Session + Cookie | 撤销容易，服务端可控 |
| 前后端分离 API | Token in Authorization | 跨域友好，无状态 |
| 移动端 App | Token | 不依赖 Cookie |
| 微服务间调用 | mTLS 或 Service Token | 不依赖用户态 |
| 单点登录 | OAuth 2.0 + JWT | 集中认证 |
| 内部管理后台 | Session + Cookie | 安全可控 |

## 深挖追问

**Q1：Token 一定比 Session 好吗？**
不一定。Session 撤销容易、载荷不暴露、载荷小。需要主动撤销的场景 Session 更合适。Token 适合无状态、跨域、分布式场景。

**Q2：Cookie 一定不安全吗？**
配置好 HttpOnly + Secure + SameSite + HTTPS 后，Cookie 是相对安全的。XSS、CSRF 仍有风险但可缓解。

**Q3：Token 存 localStorage 还是 Cookie？**
- localStorage：跨域友好，但 XSS 可读
- HttpOnly Cookie：XSS 不可读，但 CSRF 风险（需 SameSite）

生产推荐 HttpOnly Cookie + SameSite=Strict。

**Q4：Session 能跨域吗？**
Cookie 受同源策略，但可通过设置 Domain 实现父子域共享（如 `.example.com`）。完全跨域需用 Token。

**Q5：Token 撤销怎么做？**
- 黑名单：Redis 存被撤销的 Token，验证时检查
- Refresh Token：Access Token 短期，Refresh Token 长期可撤销
- 版本号：用户表加 tokenVersion，改密码时 +1

## 易错点

- **"Token 一定比 Session 安全"** — 不，载荷暴露是风险。
- **"Cookie 不能存 Token"** — 可以，组合使用。
- **"Session 一定在服务端内存"** — 不，可外置 Redis。
- **"Token 一定在 Authorization 头"** — 不，可在 Cookie、URL、Body。
- **"Cookie 不能跨域"** — 父子域可共享 Domain，完全跨域不行。

## 总结

Cookie 是客户端存储机制，Session 是服务端会话存储，Token 是自包含凭证。Cookie+Session 适合传统 Web（撤销容易），Token 适合前后端分离和分布式（无状态、跨域友好）。三者不互斥，可组合：Token 存 HttpOnly Cookie 兼顾安全和便利。选型看场景：撤销需求、跨域需求、安全需求。

## 参考资料

- [RFC 6265 — HTTP State Management (Cookie)](https://datatracker.ietf.org/doc/html/rfc6265)
- [RFC 7519 — JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [OWASP — Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
