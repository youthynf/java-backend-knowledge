# CSRF 跨站请求伪造攻击是什么？

## 核心概念

CSRF（Cross-Site Request Forgery，跨站请求伪造）是攻击者诱导已登录用户访问恶意页面，借用户浏览器自动携带的 Cookie，以用户身份向目标网站发起非本意的请求。本质是“借用你的登录态发请求”，攻击者自始至终拿不到你的 Cookie，但能让服务器以为是你本人操作。

CSRF 之所以能成立，是因为 HTTP Cookie 的发送机制：浏览器只要访问目标域，无论是用户主动操作还是攻击者页面里的 `<img src="...">` `fetch(...)`，都会自动带上该域的所有 Cookie（除非显式设置 SameSite）。服务器只看 Cookie 鉴权，分不清请求来源是用户点按钮还是攻击者诱导。

CSRF 与 XSS 的关键区别：XSS 是攻击者在目标站执行脚本（拿到一切），CSRF 是攻击者在外站借你的登录态发请求（拿不到 Cookie，但能借权限）。所以 XSS 防御靠编码，CSRF 防御靠请求来源校验和 Token。

## 标准回答

一句话结论：**CSRF 是借用户登录态伪造请求，浏览器自动带 Cookie 是根因；防护核心是 SameSite Cookie + CSRF Token + 校验 Origin/Referer，三选一不够，要叠加**。

要点展开：

- **触发条件**：用户已登录目标站、访问攻击者页面、目标站接口只靠 Cookie 鉴权且无来源校验。
- **典型载体**：`<img src="https://bank.com/transfer?to=hacker&amount=1000">`、隐藏表单自动提交、`fetch` 带 `credentials: 'include'`。
- **SameSite Cookie**：`Strict` 完全禁止跨站带，`Lax`（Chrome 默认）只允许顶级导航 GET 带，POST/PUT/DELETE 都被拦。
- **CSRF Token**：服务端为每个会话生成不可预测 Token，表单/请求头必须带回，攻击者在外站读不到。
- **Origin/Referer 校验**：服务端校验请求头来源域名，不匹配直接拒绝。

## 实现原理

### CSRF 攻击流程

```
1. 用户登录 bank.com，浏览器存下 SESSIONID Cookie
2. 用户访问 attacker.com（攻击者控制的网站）
3. attacker.com 页面里有:
   <img src="https://bank.com/transfer?to=hacker&amount=10000" />
4. 浏览器请求 bank.com/transfer，自动带上 SESSIONID Cookie
5. bank.com 服务器看到 SESSIONID，以为是用户本人，执行转账
```

注意第 4 步：跨域请求的 Cookie 是浏览器自动加的，不是攻击者读出来的。攻击者看不到 Cookie 内容，但请求带着 Cookie 一样有效。

### 三种典型 Payload

**1. 图片标签（GET 型 CSRF）**

```html
<img src="https://bank.com/transfer?to=hacker&amount=10000" style="display:none" />
```

加载图片就会发 GET 请求，浏览器自动带 Cookie。所以重要操作绝对不能用 GET。

**2. 隐藏表单自动提交（POST 型 CSRF）**

```html
<body onload="document.forms[0].submit()">
  <form action="https://bank.com/transfer" method="POST">
    <input type="hidden" name="to" value="hacker">
    <input type="hidden" name="amount" value="10000">
  </form>
</body>
```

跨域表单 POST 是允许的（同源策略不限制表单提交），浏览器会带 Cookie。

**3. CORS 下的 fetch（需服务端开 `credentials: 'include'` 且 CORS 允许）**

```javascript
fetch('https://bank.com/transfer', {
  method: 'POST',
  credentials: 'include',
  body: 'to=hacker&amount=10000'
});
```

这种需要 bank.com 的 CORS 配置允许 attacker.com 且开 `Access-Control-Allow-Credentials: true`，是配置失误才会出现的口子。

### 防御机制对比

| 防御手段 | 原理 | 优点 | 局限 |
|---------|------|------|------|
| SameSite=Strict | 跨站一律不带 Cookie | 简单、浏览器层挡 | 顶级导航也不带，影响从外链跳转登录态 |
| SameSite=Lax | 顶级 GET 导航带，跨站 POST/PUT 不带 | 平衡体验与安全，Chrome 默认 | 旧浏览器不支持 |
| CSRF Token | 请求必须带回服务端下发的 Token | 防御彻底，与登录态解耦 | 实现成本高，要管理 Token 生命周期 |
| Origin/Referer 校验 | 校验请求来源域名 | 零状态、实现简单 | Referer 可被代理剥掉；隐私设置可能不发 Referer |
| 双重 Cookie | Cookie 里存随机值，请求参数回带相同值 | 不需要服务端存 Token | 依赖 Cookie 设置正确；可能被 XSS 绕过 |

## 代码示例

### Spring Security 默认启用 CSRF Token

Spring Security 默认开启 CSRF 防护，对 POST/PUT/DELETE/PATCH 请求要求带 `_csrf` Token：

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf
            .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
            // 对无状态 API 可禁用，但要确保用了其他防护（如 Bearer Token）
            // .ignoringRequestMatchers("/api/**")
        );
        return http.build();
    }
}
```

前端从 Cookie 读 `XSRF-TOKEN`，回写到请求头 `X-XSRF-TOKEN`：

```javascript
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return m ? m[2] : null;
}

fetch('/api/transfer', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'Content-Type': 'application/json',
    'X-XSRF-TOKEN': getCookie('XSRF-TOKEN')
  },
  body: JSON.stringify({ to: 'alice', amount: 100 })
});
```

### 服务端校验 Origin/Referer

```java
@Component
public class CsrfOriginFilter extends OncePerRequestFilter {
    private static final Set<String> ALLOWED = Set.of("https://bank.com", "https://www.bank.com");

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse resp,
                                    FilterChain chain) throws IOException, ServletException {
        if (!"GET".equals(req.getMethod()) && !isSafeOrigin(req)) {
            resp.sendError(403, "CSRF check failed");
            return;
        }
        chain.doFilter(req, resp);
    }

    private boolean isSafeOrigin(HttpServletRequest req) {
        String origin = req.getHeader("Origin");
        if (origin == null) origin = req.getHeader("Referer");
        if (origin == null) return false;
        return ALLOWED.contains(origin.substring(0, Math.min(origin.length(), 30))
                                  .replaceAll("(/.*)$", "").replaceFirst("^(https?://[^/]+).*$", "$1"));
    }
}
```

实际项目用 Spring 的 `CsrfFilter` 即可，不要手撸。

### Cookie 设 SameSite

```java
Cookie c = new Cookie("SESSIONID", sid);
c.setHttpOnly(true);
c.setSecure(true);
c.setPath("/");
// Servlet 6 / Tomcat 10+ 直接支持
response.setHeader("Set-Cookie",
    "SESSIONID=" + sid + "; Path=/; HttpOnly; Secure; SameSite=Lax");
```

## 实战场景

| 场景 | 风险点 | 推荐方案 |
|------|--------|----------|
| 传统表单提交的 Web 应用 | 跨站表单 POST | SameSite=Lax + CSRF Token |
| 前后端分离 SPA + Cookie 鉴权 | 跨站 fetch 带 Cookie | SameSite + Token 头校验 |
| 纯 Bearer Token 鉴权的 API | 不带 Cookie，天然无 CSRF | 无需 CSRF Token（但 JWT 要防 XSS 窃取） |
| 第三方回调接口 | 来源不固定 | 用签名（HMAC）而非 Cookie 鉴权 |
| 文件上传接口 | 跨站构造 multipart 表单 | 校验 Origin + Token |
| 关键操作（支付、改密码） | 单一防护可能被绕 | Token + 二次验证（短信/动态码） |

## 深挖追问

**Q1：用 Bearer Token（如 JWT）还需要 CSRF Token 吗？**

不需要。CSRF 成立的前提是浏览器自动带 Cookie。如果用 `Authorization: Bearer xxx` 头部携带 Token，攻击者在外站既读不到 Token 也设不了自定义头（CORS 限制），就构不成 CSRF。但要确保 Token 不放 Cookie、不被 XSS 窃取。

**Q2：SameSite=Lax 是不是就够了？**

不够。Lax 允许顶级 GET 导航带 Cookie，如果接口是 GET 且有副作用（如 `?action=delete`），仍可被 `<a>` `<link>` 触发。最佳实践是 SameSite=Lax 兜底 + 关键接口加 Token + GET 接口只读不改。

**Q3：CSRF Token 放哪？生命周期怎么管？**

放 Cookie（`CookieCsrfTokenRepository`）方便 SPA 读取，放 Session 更安全但要同步渲染表单。Token 应该：每次会话生成新的、足够随机（≥128 bit）、不与服务端业务 Token 混用、登出后立即失效。不要每个请求换新 Token，会导致多标签页冲突。

**Q4：CSRF Token 被 XSS 偷了怎么办？**

那就不是 CSRF 了，是 XSS。XSS 拿到 Token 后可以伪造合法请求，所以**XSS 是 CSRF 防护的前提**——必须先防住 XSS，CSRF Token 才有意义。

**Q5：JSON 请求是不是天然防 CSRF？**

不是。早期有人认为 `Content-Type: application/json` 攻击者无法跨站构造，但实际上：

- 简单请求（`text/plain`、`application/x-www-form-urlencoded`、`multipart/form-data`）可被表单跨站发，如果服务端不严格校验 Content-Type，能注入 JSON。
- 即便要 `application/json`（触发预检），如果 CORS 配置失误允许任意 Origin + Credentials，仍可被 fetch 攻击。

正确做法还是 SameSite + Token，别依赖 Content-Type。

## 易错点

- **GET 接口做修改操作**：图片标签就能打，绝对禁止 GET 改数据。
- **只校验 Referer**：Referer 可被代理/隐私设置剥掉，要兼容无 Referer 场景（要么放行要么用 Origin）。
- **CSRF Token 写死或可预测**：必须用 `SecureRandom` 生成，不能基于时间或用户 ID 哈希。
- **Token 放 localStorage**：被 XSS 读取后失效，且 SPA 多标签同步麻烦。放 HttpOnly Cookie + JS 可读的 `XSRF-TOKEN` 双 Cookie 模式更稳。
- **以为 CORS 能防 CSRF**：CORS 是浏览器对响应读取的限制，请求本身已经发出去了。CSRF 不需要读响应。
- **登出后 Token 没失效**：复用旧 Token 可继续攻击，要清理 Session 同步销毁 CSRF Token。
- **API 网关全放开 CSRF**：内部接口也要防，避免被诱导访问外网时反向利用。

## 总结

CSRF 的根因是浏览器自动带 Cookie 的机制，攻击者借登录态发请求。防御优先级：关键操作用 SameSite=Lax Cookie + CSRF Token + Origin 校验三层叠加；纯 Bearer Token 的 API 天然免疫 CSRF 但要防 XSS。SameSite 是浏览器层基础防护，Token 是应用层彻底防护，两者互补。CSRF 防护以“请求来源可信”为核心，与 XSS 防护（“输出不可信”）思路相反。

## 参考资料

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN: Set-Cookie SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)
- [Spring Security CSRF](https://docs.spring.io/spring-security/reference/features/exploits/csrf.html)
- [RFC 6265bis: Cookie SameSite Attribute](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis)

---
