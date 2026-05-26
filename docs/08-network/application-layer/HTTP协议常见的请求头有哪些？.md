# HTTP协议常见的请求头有哪些？

HTTP协议常见的请求头有哪些？
HTTP协议常见的请求头：
Host：主机和端口号，如www.baidu.com；
Connection：链接类型，决定HTTP请求是否在当前事务完成后关闭，Http1.0默认是close，Http1.1后默认是keep-alive；
Upgrade-Insecure-Requests：升级为HTTPS请求，值为1或0；
User-Agent：表示客户端使用了什么浏览器、操作系统等；
Content-Type：请求时，告知服务器数据的媒体类型，如text/plain;charset=UTF-8；
Accept：请求传输文件类型，如text/html、application/json等；
Referer：请求的来源页面；
Accept-Encoding：当前请求支持的文件编码解码格式；
Cookie：Cookie提供了一种机制是的万维网服务能够记住用户，而无需用户主动提供标识信息，Cookie是一种对无状态的HTTP进行状态化的技术；
x-requested-with：XMLHttpRequest表示Ajax异步请求；
