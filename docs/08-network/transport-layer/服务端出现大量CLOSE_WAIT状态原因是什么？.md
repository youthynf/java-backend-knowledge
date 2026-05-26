# 服务端出现大量CLOSE_WAIT状态原因是什么？

服务端出现大量CLOSE_WAIT状态原因是什么？
CLOSE_WAIT状态是「被动关闭方」才会有的状态，而且「被动关闭方」没有调用close函数关闭连接，那么就无法发出FIN报文，从而无法是的CLOSE_WAIT状态的连接转变为LAST_ACK状态。所以，当服务器出现大量CLOSE_WAIT状态的连接时，说明服务端的程序没有调用close函数关闭连接，这通常需要排查代码。

普通TCP服务端的流程：
创建服务端socket，bind绑定端口号、listen监听端口号；
将服务端socket注册到epoll；
epoll_wait等待连接到来；
连接到来时，调用accept获取已连接的socket；
将已连接的socket注册到epoll；
epoll_wait等待事件发生；
对方连接关闭时，我方调用close。
