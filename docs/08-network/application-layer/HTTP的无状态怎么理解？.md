# HTTP 的无状态怎么理解

## 核心概念

"无状态"指 HTTP 协议本身不保存请求之间的任何上下文信息——每个请求都是独立的，服务端处理当前请求时不依赖之前的请求。这是 HTTP 设计的核心原则，让协议简单、可扩展、易缓存，但也带来"如何识别同一用户的多个请求"问题。解决方案是应用层引入状态：Cookie、Session、Token 等。

## 标准回答

HTTP 无状态的两个含义：

1. **协议层**：HTTP 服务器不保留请求间的状态，每个请求独立处理
2. **应用层**：用户登录态、购物车、浏览历史等业务状态需要应用层方案维护

无状态的好处：

- 服务器简单：不需要管理连接状态，请求处理完即可释放资源
- 可扩展：任意服务器都能处理任意请求，天然支持负载均衡
- 易缓存：相同请求的响应可缓存，因为不依赖之前的状态

无状态的代价：

- 每个请求要携带身份信息（Cookie/Token），增加流量
- 服务端要重新解析凭证，增加 CPU 开销
- 撤销登录态、续期、刷新等需要应用层方案

## 详细机制

### 为什么 HTTP 设计成无状态

1989 年 Tim Berners-Lee 设计 HTTP 时目标是为 Web 文档检索服务，每个请求独立获取一个文档，不需要连接状态。这与 TCP 的"有连接"形成对比：

- **TCP 有连接**：双方维护状态（序列号、窗口、状态机），连接内多个包共享上下文
- **HTTP 无状态**：每个请求独立，服务端不维护"会话"

无状态让 HTTP 服务器极其简单：监听端口、收请求、发响应、释放资源。同一请求可以被任意服务器处理，天然适合水平扩展。

### 无状态下的状态维持方案

| 方案 | 状态存储位置 | 标识传递方式 | 适用场景 |
|------|------------|------------|---------|
| Cookie + Session | 服务端内存/Redis | Cookie 中传 SessionId | 传统 Web |
| Token（JWT） | 客户端 | Authorization 头 | 前后端分离、API |
| URL 重写 | - | URL 中带 sessionId | Cookie 被禁用时 |
| 隐藏表单字段 | - | 表单中带 sessionId | 表单提交场景 |

### Cookie + Session 工作流程

```
1. 客户端首次请求（无 Cookie）
   GET /api/profile

2. 服务端验证账号密码后创建 Session
   Session 存储: { sessionId=abc, userId=42, ... }
   响应:
   Set-Cookie: sessionId=abc; HttpOnly; Secure; SameSite=Strict

3. 客户端后续请求自动带 Cookie
   GET /api/orders
   Cookie: sessionId=abc

4. 服务端根据 sessionId 查到 userId=42，识别用户
```

服务端持有状态（Session 数据），客户端只持有标识（SessionId）。

### Token（JWT）工作流程

```
1. 客户端登录
   POST /api/login { username, password }

2. 服务端验证后签发 Token
   响应: { token: "eyJhbGc..." }
   Token 包含 userId、过期时间等（base64 编码 + 签名）

3. 客户端存储 Token，后续请求带上
   GET /api/orders
   Authorization: Bearer eyJhbGc...

4. 服务端验证签名 + 过期时间，从 Token 取出 userId
   不需要查 Session 存储，无状态服务端
```

JWT 把状态放在客户端，服务端只验证签名，真正"无状态"。

### 无状态 vs 有连接 vs 会话

| 概念 | 含义 | 持续 |
|------|------|------|
| TCP 连接 | 传输层逻辑连接 | 连接期间 |
| HTTP 请求-响应 | 应用层一次交互 | 单次请求 |
| HTTP 会话 | 应用层用户态 | 跨多个请求（依赖 Cookie/Token） |

一个 TCP 连接上可以发多个 HTTP 请求（keep-alive），但每个请求独立处理，HTTP 协议本身不维护会话。

### REST 与无状态

REST 架构风格强调"客户端-服务器无状态"约束：

- 每个请求必须包含服务端处理所需的所有信息
- 服务端不在请求间保存状态
- 任意服务器都能处理任意请求（可水平扩展）

这是 REST API 设计中"不要在服务端 Session 里存业务状态"的根源——状态应在 URL、查询参数、请求体中显式传递。

## 代码示例

Java Servlet Session（有状态服务端）：

```java
import javax.servlet.http.*;

@WebServlet("/login")
public class LoginServlet extends HttpServlet {
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) {
        String user = req.getParameter("user");
        String pass = req.getParameter("pass");
        if (authService.check(user, pass)) {
            HttpSession session = req.getSession(true);  // 创建 Session
            session.setAttribute("userId", user.getId());
            // 服务端存了 userId，响应会自动带 Set-Cookie: JSESSIONID=...
        }
    }
}

@WebServlet("/profile")
public class ProfileServlet extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) {
        HttpSession session = req.getSession(false);
        if (session == null || session.getAttribute("userId") == null) {
            resp.setStatus(401);
            return;
        }
        Long userId = (Long) session.getAttribute("userId");
        // 根据 userId 查询并返回用户信息
    }
}
```

JWT 方案（无状态服务端）：

```java
import io.jsonwebtoken.*;
import java.util.*;

public class JwtUtil {
    private static final String SECRET = "my-secret-key";

    public static String generate(Long userId) {
        return Jwts.builder()
            .setSubject(userId.toString())
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + 86400000))
            .signWith(SignatureAlgorithm.HS256, SECRET)
            .compact();
    }

    public static Long verify(String token) {
        Claims claims = Jwts.parser()
            .setSigningKey(SECRET)
            .parseClaimsJws(token)
            .getBody();
        return Long.parseLong(claims.getSubject());
    }
}

// 拦截器
public class JwtInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse resp, Object h) {
        String auth = req.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            resp.setStatus(401);
            return false;
        }
        try {
            Long userId = JwtUtil.verify(auth.substring(7));
            req.setAttribute("userId", userId);
            return true;
        } catch (Exception e) {
            resp.setStatus(401);
            return false;
        }
    }
}
```

## 实战场景

| 场景 | 方案 | 注意点 |
|------|------|--------|
| 传统 Web 登录 | Cookie + Session | Session 外置 Redis 支持分布式 |
| 前后端分离 API | JWT | 注意 Token 过期、刷新机制 |
| 微服务调用 | mTLS 或 Service Token | 不依赖用户态 |
| 移动端 App | Token | 安全存储 Token，防泄露 |
| 单点登录（SSO） | OAuth 2.0 / OIDC | 集中认证 + 各应用校验 |

## 深挖追问

**Q1：Session 是无状态还是有状态？**
服务端 Session 是有状态方案——服务端保存了用户态，违反了 HTTP 无状态约束。但因为状态集中存服务端（如 Redis），仍可水平扩展。

**Q2：JWT 真正无状态吗？**
签名验证无状态，但撤销机制（如登出后立即失效）通常需要黑名单，又变回有状态。完全无状态的 JWT 无法主动撤销。

**Q3：无状态怎么处理"用户上次访问的页面"？**
通过 URL 参数或 Cookie 携带，让客户端显式传递，而不是服务端记。

**Q4：TCP keep-alive 让 HTTP 有状态了吗？**
没有。keep-alive 只是复用 TCP 连接，HTTP 协议层仍无状态。同一连接上的多个请求独立处理。

**Q5：WebSocket 是有状态吗？**
是。WebSocket 建连后是长连接，服务端持有连接状态（如用户身份），适合实时双向通信。

## 易错点

- **"HTTP 无状态 = 服务端不能存任何东西"** — 不，业务数据可以存（数据库、缓存），存的是"会话状态"才违反约束。
- **"Session 是无状态的"** — 不是，Session 是有状态方案。
- **"JWT 完全无状态"** — 签名验证无状态，但撤销机制通常需要状态。
- **"无状态 = 不可识别用户"** — 不，通过 Cookie/Token 携带身份即可识别。
- **"REST 必须无状态"** — 是的，REST 风格要求无状态，违反就不是严格 REST。

## 总结

HTTP 无状态指协议不维护请求间状态，每个请求独立处理。这让 HTTP 简单、可扩展、易缓存，但需要应用层方案维持用户会话：Cookie+Session（服务端有状态）或 Token/JWT（客户端持有状态）。REST 风格强调无状态约束，状态应在请求中显式传递而非服务端维护。生产中按场景选方案：传统 Web 用 Session，API 用 JWT，实时通信用 WebSocket。

## 参考资料

- [RFC 7230 — HTTP/1.1 Message Syntax and Routing](https://datatracker.ietf.org/doc/html/rfc7230)
- [RFC 7519 — JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [REST Architectural Constraints](https://www.ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm)
