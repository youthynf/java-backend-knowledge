TCP快速建立连接是什么？
基于TCP连接的HTTP请求时延
客户端在向服务端发起HTTP GET请求时，一个完整的交互过程，需要2.5个RTT的时延（三次握手1.5RTT+HTTP GET1RTT）。由于第三次握手是可以携带数据的，这时如果在第三次握手发起HTTP GET请求，需要2个RTT时延即可。但是在下一次（不同的TCP连接的下一次）发起HTTP GET请求时，经历的RTT也是一样的。

TCP Fast Open功能
在Linux3.7内核版本中，提供了TCP Fast Open功能，这个功能可以减少TCP连接建立的时延。
在第一次建立连接时，服务端在第二次握手产生了一个加密的Cookie，并通过SYN+ACK包一起发送给客户端，于是客户端就会缓存这个Cookie，所以第一次发起HTTP GET请求时，至少也是需要2个RTT时延；
在下次请求的时候，客户端在SYN包上带上「请求报文」+「Cookie」发给服务端端，就提前跳过三次握手的过程，因为Cookie中维护了一些信息，服务端可以从Cookie中获取TCP相关的信息，这时发起的HTTP GET请求只需要一个RTT时延。
客户端在请求并存储了Fast Open Cookie之后，可以不断重复TCP Fast Open直到服务器认为Cookie无效，通常为Cookie过期无效。

Linux如何开启Fast Open功能？
可以通过设置net.ipv4.tcp_fastopen内核参数，来打开Fast Open功能。
0：表示关闭
1：表示作为客户端使用Fast Open功能
2：表示作为服务端使用Fast Open功能
3：无论作为客户端还是服务端，都可以使用Fast Open功能
