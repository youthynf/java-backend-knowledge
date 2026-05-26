# HTTP常见的状态码有哪些？

HTTP常见的状态码有哪些？
常见的状态码：
100：Continue服务器已经收到请求的初始部分，客户端应继续发送剩余部分；
101：Switching Protocols服务器同意切换协议，如从Http1.1切换到WebSocket；
102：Processing请求已被接受，但服务器尚未完成处理（WebDAV扩展）；
200：OK请求成功，服务器返回请求的数据；
201：Created请求成功并创建了新的资源，通常在POST或PUT请求后返回；
202：Accepted请求已接收但尚未处理，最终状态未知；
204：No Content请求成功，单服务器没有返回任何内容，通常用于DELET请求；
300：Multiple Choices用户请求了多个选项的资源，返回选项列表；
301：Moved Permanently请求的资源已永久移动到新位置，需要用新的URL访问；
302：Found请求的资源暂时移动到新的位置，客户端应继续使用原始URL；
303：See Other客户端使用GET方法访问另一个URL（通常用于POST请求后的重定向）；
304：Not Modified资源未修改，客户端可使用缓存内容；
307：Tmeporary Redirect请求暂时重定向到另一个 URL，且方法不变，严格模式；
308：Permanent Redirect请求永久重定向到新 URL，方法不变，严格模式；
400：Bad Request请求格式错误；
401：Unauthorized没有授权；
402：Payment Required请先付费；
403：Forbidden禁止访问；
404：Not Found没有找到；
405：Method Not Allowed方法不被允许；
406：Not Acceptable服务端可以提供的内容和客户端期待的不一致；
500：Internal Server Error内部服务器错误；
501：Not Implemented没有实现；
502：Bad Gateway网关错误；
503：Service Unavailable服务不可用；
504：Gateway Timeout网关超时；
505：Http Version Not Supported版本不支持。
