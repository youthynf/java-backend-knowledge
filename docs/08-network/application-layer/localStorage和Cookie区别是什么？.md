# localStorage和Cookie区别是什么？

localStorage和Cookie区别是什么？
localStorage和Cookie区别：
存储容量：Cookie 的存储容量通常较小，每个 Cookie 的大小限制在几 KB 左右。而 LocalStorage 的存储容量通常较大，一般限制在几 MB 左右。因此,如果需要存储大量数据，LocalStorage 通常更适合；
数据发送：Cookie 在每次 HTTP 请求中都会自动发送到服务器，这使得 Cookie 适合用于在客户端和服务器之间传递数据；而localStorage 的数据不会自动发送到服务器,它仅在浏览器端存储数据，因此 LocalStorage 适合用于在同一域名下的不同页面之间共享数据；
生命周期：Cookie 可以设置一个过期时间，使得数据在指定时间后自动过期。而 LocalStorage 的数据将永久存储在浏览器中，除非通过 JavaScript 代码手动删除；
安全性：Cookie 的安全性较低，因为 Cookie 在每次 HTTP 请求中都会自动发送到服务器，存在被窃取或篡改的风,险。而 LocalStorage 的数据仅在浏览器端存储,不会自动发送到服务器，相对而言更安全一些。

什么数据应该存在到cookie，什么数据存放到 Localstorage：
Cookie 适合用于在客户端和服务器之间传递数据、跨域访问和设置过期时间，而 LocalStorage 适合用于在同一域名下的不同页面之间共享数据、存储大量数据和永久存储数据。
