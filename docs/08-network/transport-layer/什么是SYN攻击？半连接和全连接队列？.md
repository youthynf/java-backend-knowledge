# 什么是SYN攻击？半连接和全连接队列？

什么是SYN攻击？半连接和全连接队列？
什么是TCP半连接和全连接队列？
在TCP三次握手的时候，Linux内核会维护两个队列，分别是：
半连接队列，也称为「SYN队列」
全连接队列，也称为「Accept队列」

两个队列的工作流程：
服务端收到客户端的SYN报文时，会创建一个半连接的对象，然后将其加入内核的「SYN队列」；
接着发送SYN+ACK给客户端，等待客户端回应ACK报文；
服务端接收到ACK报文后，从「SYN队列」中取出一个半连接对象，然后创建一个新的连接对象放入到「Accept队列」；
应用通过调用accept()函数，从「Accept队列」中取出连接对象。
不管是半连接队列还是全连接队列，都有最大长度限制，超出限制时，默认情况都是内核直接丢弃报文，或返回RST包（tcp_abort_on_overflow=0-丢掉ack，1-返回RST）。

两个队列的底层实现：
全连接队列：是一个链表，线性结构，里面存放的是已经建立完成的连接，获取连接的时间复杂度是O(1)；
半连接队列：是一个哈希表，存放的都是不完整的连接，等待第三次握手的到来，如果到来了，就需要从队列中取出对应IP端口的连接，如果不使用哈希表，替代遍历链表，时间复杂度从O(n)变成O(1)；

调大TCP全连接队列：
TCP全连接队列发生溢出的时候，我们需要增大队列的大小。TCP全连接队列的最大值取决于somaxconn和backlog之间的最小值，也就是min(somaxconn, backlog)。
somxconn是Linux内核的参数，默认是128，可以通过/proc/sys/net/core/somaxconn来设置其值；
backlog则是listen(int sockfd, int backlog)函数中的入参，Nginx默认值是511，可以通过修改配置文件设置其长度。

调大TCP半连接队列：
半连接队列最大值不是单单有max_syn_backlog决定，还跟somaxconn和backlog有关系：
当max_syn_backlog > min(somaxconn, backlog)时，半连接队列最大值max_qlen_log=min(somaxconn, backlog)*2；
当max_syn_backlog < min(somaxconn, backlog)时，半连接队列最大值max_qlen_log=max_syn_backlog*2；
半连接队列最大值max_qlen_log就表示服务端处于SYN_RECV状态的最大个数吗？
答案：不是。

什么是SYN攻击？
SYN攻击方式最直接的表现就是把TCP的半连接队列打满，这样当TCP半连接队列满了，后续再收到SYN报文就会丢弃，导致客户端无法和服务端建立连接。

如何避免SYN攻击？
避免 SYN 攻击方式，可以有以下四种方法：
调大netdev_max backlog；
增大TCP半连接队列；
开启tcp_syncookies；
减少SYN+ACK 重传次数；

方式一：调大netdev_max_backlog
当网卡接收数据包的速度大于内核处理的速度时，会有一个队列保存这些数据包。调大该内核队列的最大值，默认值是 1000，具体参数：

net.core.netdev max backlog=10000

方式二：增大TCP半连接队列
增大 TCP 半连接队列，要同时增大下面这三个参数：
增大net.ipv4.tcp_max_syn_backlog；
增大listen() 函数中的backlog；
增大net.core.somaxconn；

方式三：开启net.ipv4.tcp_syncookies
开启syncookies功能就可以在不使用SYN半连接队列的情况下成功建立连接，相当于绕过了SYN半连接来建立连接，原理过程：
当「SYN 队列」满之后，后续服务端收到SYN包，不会丢弃，而是根据算法，计算出一个 cookie值；
将cookie值放到第二次握手报文的「序列号」里，然后服务端回第二次握手给客户端；
服务端接收到客户端的应答报文时，服务端会检査这个ACK包的合法性。如果合法，将该连接对象放入到「Accept 队列」；
最后应用程序通过调用accpet()接口，从「Accept队列」取出的连接；

可以看到，当开启了tcp_syncookies了，即使受到SYN攻击而导致SYN队列满时，也能保证正常的连接成功建立.。��中net.ipv4.tcp_syncookies参数主要有以下三个值：
0值，表示关闭该功能；
1值，表示仅当 SYN 半连接队列放不下时，再启用它；
2值，表示无条件开启功能；
那么在应对 SYN 攻击时，只需要设置为 1即可：

echo 1>/proc/sys/net/ipv4/tcp syncookies

方式四：减少 SYN+ACK 重传次数
当服务端受到SYN攻击时，就会有大量处于SYN_REVC状态的TCP连接，处于这个状态的TCP会重传SYN+ACK。当重传超过次数达到上限后，就会断开连接。
那么针对SYN攻击的场景，我们可以减少SYN-ACK的重传次数，以加快处于SYN REVC状态的TCP连接断开。SYN-ACK 报文的最大重传次数由tcp_synack_retries内核参数决定（默认5次），比如将tcp_synack_retries减少到2次：

echo 2>/proc/sys/net/ipv4/tcp synack retries

<!-- 面试复习补充 -->

## 面试复习补充

### 核心概念

传输层负责端到端通信。TCP 面向连接、可靠、有序、字节流，依靠三次握手、序列号、确认、重传、滑动窗口、流量控制和拥塞控制；UDP 无连接、开销小、不保证可靠。

### 面试官想考什么

面试官高频考 TCP 三次握手/四次挥手、TIME_WAIT/CLOSE_WAIT、可靠传输、粘包、拥塞控制、连接异常和性能调优。

### 标准回答

TCP 建连通过 SYN、SYN+ACK、ACK 确认双方收发能力；断连通常四次挥手，因为双方方向的数据流要分别关闭。可靠性来自序列号、ACK、超时/快速重传、滑动窗口和校验。TIME_WAIT 保护旧报文消失并保证对端收到最后 ACK；CLOSE_WAIT 多通常是应用未主动关闭连接。UDP 适合实时音视频、DNS、QUIC 等可自定义可靠性或容忍丢包的场景。

### 深挖追问

- 如果线上出现超时/失败，如何验证是不是这个环节？
- 它和相邻层协议的职责边界是什么？
- 有哪些参数或默认行为会影响生产表现？

### 实战场景/示例

Java 服务大量 CLOSE_WAIT，优先检查代码是否未关闭 socket/HTTP 响应流，或连接池释放逻辑异常；大量 TIME_WAIT 则看短连接、主动关闭方和连接复用。

### 易错点/总结

TCP 是字节流没有消息边界，所以会有粘包/拆包；应用层必须用长度字段、分隔符或固定长度等协议解决。

