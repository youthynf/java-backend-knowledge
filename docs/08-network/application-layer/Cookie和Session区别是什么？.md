# Cookie 和 Session 区别是什么

## 核心概念

Cookie 和 Session 都用于解决 HTTP 无状态下的用户识别问题，但存储位置和机制不同。Cookie 是浏览器端的键值存储，每次请求自动携带；Session 是服务端的会话存储，客户端只持有 SessionId（通常存在 Cookie 里）。两者配合实现"服务端有状态、客户端持标识"的传统 Web 会话方案。

## 标准回答

Cookie 和 Session 的核心差异：

| 维度 | Cookie | Session |
|------|--------|---------|
| 存储位置 | 客户端（浏览器） | 服务端（内存/Redis） |
| 存储大小 | 单 Cookie ≤ 4 KB，每域名 ≤ 50 个 | 受服务器内存限制 |
| 安全性 | 较低（可被 XSS 读取、CSRF 利用） | 较高（数据在服务端） |
| 生命周期 | 可设置过期时间，否则浏览器关闭即失效 | 默认会话级，可设超时 |
| 自动携带 | 浏览器自动随请求发到同域 | 不直接发，靠 Cookie 传 SessionId |
| 跨域支持 | 受同源策略限制，需 SameSite 配置 | 同 Cookie |
| 适用场景 | 用户偏好、跟踪、SessionId | 登录态、敏感会话数据 |

## 详细机制

### Cookie 工作机制

```
1. 服务端响应带 Set-Cookie
   HTTP/1.1 200 OK
   Set-Cookie: sessionId=abc123; HttpOnly; Secure; SameSite=Strict; Max-Age=3600

2. 浏览器存储 Cookie

3. 后续请求自动携带
   GET /api/orders HTTP/1.1
   Cookie: sessionId=abc123; theme=dark
```

Cookie 属性：

| 属性 | 用途 |
|------|------|
| Name=Value | 键值对 |
| Domain | 适用域名（默认当前域） |
| Path | 适用路径（默认 /） |
| Expires/Max-Age | 过期时间（不设则浏览器关闭即失效） |
| Secure | 仅 HTTPS 传输 |
| HttpOnly | JavaScript 不可访问（防 XSS） |
| SameSite | 跨站控制（Strict/Lax/None，防 CSRF） |

### Session 工作机制

```
1. 客户端首次请求（无 Cookie）
   POST /login { username, password }

2. 服务端验证后创建 Session
   Session 存储: { sessionId=abc123, userId=42, loginTime=... }
   响应: Set-Cookie: sessionId=abc123; HttpOnly; Secure

3. 客户端后续请求带 Cookie
   GET /api/orders
   Cookie: sessionId=abc123

4. 服务端根据 sessionId 查 Session 数据
   userId = session.get("sessionId=abc123").userId   # 42
```

### Cookie vs Session 的关系

Cookie 和 Session 不是替代关系，而是配合：

```
服务端 Session 数据  ←→  SessionId  ←→  Cookie
（用户态、敏感数据）   （标识）        （客户端存储 SessionId）
```

服务端用 Session 存敏感数据，用 Cookie 传 SessionId。

### 安全风险对比

**Cookie 风险**：

- **XSS**：恶意 JavaScript 可读 Cookie（无 HttpOnly 时）窃取身份
- **CSRF**：浏览器自动带 Cookie，攻击者诱导用户访问恶意站点发请求
- **窃听**：HTTP 明文传输 Cookie 可被截获

防护：

- HttpOnly 防 XSS
- SameSite=Strict/Lax 防 CSRF
- Secure + HTTPS 防窃听

**Session 风险**：

- **Session 劫持**：攻击者拿到 SessionId 冒充用户
- **Session 固定**：攻击者诱导用户用指定 SessionId 登录，登录后 SessionId 不变，攻击者可继续使用
- **会话劫持**：服务端 Session 存储故障导致用户被踢出

防护：

- 登录后重新生成 SessionId（防固定）
- SessionId 用安全随机数生成
- 设置合理超时

### 分布式 Session

单机 Session 在集群部署下有问题：

```
用户登录 → 请求到 Server1，Session 存在 Server1 内存
后续请求 → 负载均衡到 Server2，Server2 没有 Session → 用户被踢出
```

解决方案：

| 方案 | 做法 | 优缺点 |
|------|------|--------|
| Session 粘滞 | 负载均衡按用户 IP/SessionId 路由到同一服务器 | 简单但服务器宕机用户被踢出 |
| Session 复制 | 服务器间同步 Session | 网络开销大，延迟高 |
| Session 外置 | Session 存 Redis 等共享存储 | 推荐，性能好，扩展性强 |
| JWT | 状态放客户端，无需服务端 Session | 无状态但撤销难 |

### Session 外置 Redis 示例

```
1. 用户登录
   Server → Redis: SET session:abc123 {userId:42, ...} EX 3600
   Server → Client: Set-Cookie: sessionId=abc123

2. 后续请求
   Client → Server: Cookie: sessionId=abc123
   Server → Redis: GET session:abc123 → {userId:42, ...}
   Server: 识别用户，处理请求
```

Spring Boot 配置：

```yaml
spring:
  session:
    store-type: redis
  redis:
    host: redis.example.com
    port: 6379
```

## 代码示例

Java Servlet 使用 Session：

```java
import javax.servlet.http.*;

@WebServlet("/login")
public class LoginServlet extends HttpServlet {
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) {
        String user = req.getParameter("user");
        String pass = req.getParameter("pass");
        if (authService.check(user, pass)) {
            HttpSession session = req.getSession(true);
            session.setAttribute("userId", user.getId());
            session.setMaxInactiveInterval(3600);   // 1 小时超时
            // 响应自动带 Set-Cookie: JSESSIONID=...
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
        // ...
    }
}
```

Spring Boot 配置 Cookie 安全属性：

```java
import org.springframework.session.web.http.*;

@Bean
public CookieSerializer cookieSerializer() {
    DefaultCookieSerializer serializer = new DefaultCookieSerializer();
    serializer.setCookieName("SESSIONID");
    serializer.setDomainName("example.com");
    serializer.setCookiePath("/");
    serializer.setUseHttpOnlyCookie(true);     // HttpOnly
    serializer.setUseSecureCookie(true);        // Secure（仅 HTTPS）
    serializer.setSameSite("Strict");            // SameSite
    return serializer;
}
```

## 实战场景

| 场景 | 选择 | 原因 |
|------|------|------|
| 传统 Web 登录 | Session + Cookie | 服务端可控，撤销容易 |
| 前后端分离 API | Token/JWT | 无状态，跨域友好 |
| 分布式部署 | Session 外置 Redis | 共享会话 |
| 用户偏好 | Cookie | 客户端存储，无需服务端 |
| 第三方跟踪 | Cookie（SameSite=None） | 跨站跟踪 |

## 深挖追问

**Q1：Cookie 一定不安全吗？**
配置好 HttpOnly + Secure + SameSite + HTTPS 后，Cookie 是相对安全的。XSS、CSRF 仍有风险但可缓解。

**Q2：Session 一定比 Cookie 安全吗？**
不一定。Session 数据在服务端确实安全，但 SessionId 仍要靠 Cookie 传，SessionId 泄露等同身份泄露。

**Q3：Session 存内存还是 Redis？**
单机用内存（快但重启丢失），集群用 Redis（共享且持久）。生产推荐 Redis。

**Q4：Cookie 大小限制是多少？**
RFC 6265 规定单 Cookie ≤ 4 KB（含名称和值），每域名 ≤ 50 个（浏览器实现不同）。所以 Cookie 不适合存大数据。

**Q5：SameSite 三个值什么区别？**
- Strict：完全不带 Cookie 跨站请求（最严，影响用户体验）
- Lax：顶级导航 GET 请求带 Cookie，其他不带（默认值，平衡）
- None：所有跨站都带（需配合 Secure，第三方跟踪用）

## 易错点

- **"Cookie 和 Session 是替代关系"** — 不是，是配合关系，Cookie 传 SessionId。
- **"Session 比 Cookie 完全安全"** — 不，SessionId 泄露同样危险。
- **"Cookie 一定 4 KB"** — 是上限，实际应远小于此。
- **"Session 必须用 Cookie 传"** — 不，可用 URL 重写（不推荐）。
- **"HttpOnly 完全防 XSS"** — 不，只防读取 Cookie，不能防其他 XSS 攻击。

## 总结

Cookie 是客户端存储，每次请求自动携带；Session 是服务端会话存储，客户端只持 SessionId（通常在 Cookie 中）。两者配合实现传统 Web 会话。Cookie 配置 HttpOnly + Secure + SameSite 提升安全，Session 外置 Redis 支持分布式。生产中传统 Web 用 Session+Cookie，前后端分离用 Token/JWT。

## 参考资料

- [RFC 6265 — HTTP State Management Mechanism (Cookie)](https://datatracker.ietf.org/doc/html/rfc6265)
- [RFC 6265bis — Cookie SameSite](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis)
- [OWASP — Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
