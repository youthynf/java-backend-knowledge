# TCP 三次握手和 accept 是什么关系

## 核心概念

三次握手由**内核协议栈**完成，与应用层的 `accept()` 是两个独立步骤。客户端发 SYN，服务端内核自动回 SYN+ACK 并把半成品连接放入半连接队列；第三次握手 ACK 到达后，内核把连接从半连接队列移到全连接队列，状态变为 `ESTABLISHED`。应用层调 `accept()` 时只是从全连接队列取出一个已建立的连接，不参与握手本身。

## 标准回答

握手和 accept 的关系：

```
Client                     Server 内核                      Server 应用
  |                           |                                |
  | --- SYN ----------------> |  半连接队列                     |
  | <== SYN+ACK ============ |  (SYN_RCVD)                    |
  | --- ACK ----------------> |  移到全连接队列                 |
  |                           |  (ESTABLISHED)                 |
  |                           |                                |
  |                           |  <-- accept() 取出连接 -------- |
  |                           |                                |
```

- **三次握手**：内核完成，不依赖应用层
- **半连接队列（SYN Queue）**：保存收到 SYN 但未收到第三次 ACK 的连接，状态 `SYN_RCVD`
- **全连接队列（Accept Queue）**：保存握手完成待应用 accept 的连接，状态 `ESTABLISHED`
- **accept()**：从全连接队列取出一个连接，返回新 socket fd

## 详细机制

### 内核的两个队列

**半连接队列（SYN Queue）**：

- 收到 SYN 时加入，状态 `SYN_RCVD`
- 收到第三次 ACK 时移出，转入全连接队列
- 大小受 `tcp_max_syn_backlog` 控制

**全连接队列（Accept Queue）**：

- 三次握手完成后加入，状态 `ESTABLISHED`
- 应用 accept() 时取出
- 大小 = `min(somaxconn, listen backlog)`

```bash
# 半连接队列当前占用
$ ss -tan state syn-recv | wc -l
12

# 全连接队列状态（ss -tln 的 Recv-Q 是当前积压，Send-Q 是上限）
$ ss -tln
State  Recv-Q Send-Q Local Address:Port
LISTEN 0      511    0.0.0.0:8080
# Recv-Q=0 表示无积压，上限 511
```

### accept() 的工作

```java
// Java 调用 accept() 时，内核从全连接队列取一个连接返回
ServerSocket server = new ServerSocket(8080);
while (true) {
    Socket socket = server.accept();  // 阻塞直到队列非空
    // 此时三次握手早已完成，socket 是 ESTABLISHED 状态
    handle(socket);
}
```

`accept()` 的行为：

- 全连接队列非空：立即返回新 socket fd
- 全连接队列为空：阻塞（默认）或返回 EAGAIN（非阻塞）

### 队列满时的行为

**半连接队列满**：默认丢弃新 SYN；开启 SYN Cookies 后改用 Cookie 模式不丢包。

**全连接队列满**：

- 第三次 ACK 到达时无法加入队列
- 默认丢弃 ACK（`tcp_abort_on_overflow=0`）
- 客户端不知道，会重传 ACK 或开始发数据（数据包自带 ACK 完成握手）
- `tcp_abort_on_overflow=1` 时回 RST，客户端立即收到 ECONNREFUSED

### 关键认识：accept() 之前握手已完成

```c
// 服务端代码
int listen_fd = socket(...);
bind(listen_fd, ...);
listen(listen_fd, 511);   // 内核开始监听，等待 SYN

// 客户端此时 connect()，内核完成三次握手
// 服务端应用还没调 accept()，但连接已在全连接队列里 ESTABLISHED

int conn_fd = accept(listen_fd, ...);
// accept 只是取出，不触发握手
```

这就是为什么"服务端应用卡住但客户端能建连"——握手是内核完成的，不依赖应用。

### 抓包验证

```bash
# 服务端启动但应用不调 accept()
$ python3 -c "import socket; s = socket.socket(); s.bind(('',8080)); s.listen(511); import time; time.sleep(60)" &

# 客户端连接
$ nc 127.0.0.1 8080 -v
Connection to 127.0.0.1 8080 port [tcp/http-alt] succeeded!
# 连接成功，但服务端应用没 accept

# 抓包看握手正常完成
$ tcpdump -i lo -n 'tcp port 8080'
10:00:01 IP 127.0.0.1.5000 > 127.0.0.1.8080: Flags [S], seq 1000
10:00:01 IP 127.0.0.1.8080 > 127.0.0.1.5000: Flags [S.], seq 2000, ack 1001
10:00:01 IP 127.0.0.1.5000 > 127.0.0.1.8080: Flags [.], ack 2001
# 三次握手完成，连接进入全连接队列

# 全连接队列积压
$ ss -tln
State  Recv-Q Send-Q Local Address:Port
LISTEN 1      511    0.0.0.0:8080
# Recv-Q=1 表示有 1 个连接等 accept
```

## 代码示例

观察 accept 与握手的分离：

```java
import java.net.*;
import java.io.*;

public class AcceptDemo {
    public static void main(String[] args) throws Exception {
        ServerSocket server = new ServerSocket(8080, 511);

        // 故意延迟 30 秒再 accept
        System.out.println("Listen, but not accept for 30s");
        Thread.sleep(30000);

        // 期间客户端连接会进入全连接队列
        // 此时 accept 立即返回已建立的连接
        Socket socket = server.accept();
        System.out.println("Accepted: " + socket.getRemoteSocketAddress());
    }
}
```

调整 backlog（影响全连接队列大小）：

```java
// backlog = 511，全连接队列上限
ServerSocket server = new ServerSocket(8080, 511);
```

非阻塞 accept（NIO）：

```java
import java.nio.channels.*;

ServerSocketChannel ssc = ServerSocketChannel.open();
ssc.configureBlocking(false);  // 非阻塞
ssc.bind(new InetSocketAddress(8080), 511);

// accept 立即返回，无连接时返回 null
SocketChannel sc = ssc.accept();
if (sc == null) {
    // 队列空，下次再试
}
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 应用 accept 慢 | 全连接队列积压，`ss -tln` Recv-Q 高 | 加大应用线程池，或用 NIO/Netty |
| 突发流量 | 全连接队列满，connect 失败 | 调大 backlog 和 somaxconn |
| 应用启动慢 | 客户端连接成功但请求无响应 | 启动顺序：先 listen 再做其他初始化 |
| 短连接压测 | 连接被拒 | 调大 backlog + 加速 accept |
| SYN Flood | 半连接队列满 | 开启 SYN Cookies |

## 深挖追问

**Q1：accept() 会触发三次握手吗？**
不会。accept 只是从全连接队列取连接，握手由内核完成。即使应用不调 accept，握手照样进行。

**Q2：accept() 时连接是什么状态？**
`ESTABLISHED`。握手在 accept 之前就完成了。

**Q3：全连接队列满时新 SYN 怎么处理？**
SYN 仍能进半连接队列（如果半连接队列未满），但第三次 ACK 到达时无法进全连接队列，被丢弃。

**Q4：listen 的 backlog 必须和 somaxconn 一致吗？**
不必须，但实际生效的是 `min(somaxconn, backlog)`。任一较小者限制队列大小。建议两者都调大。

**Q5：accept 返回的 socket fd 和 listen fd 是同一个吗？**
不是。listen fd 是监听 socket，accept 返回的是新连接的 socket fd，每个连接一个独立 fd。

## 易错点

- **"accept() 触发握手"** — 错，握手由内核完成，accept 只取连接。
- **"backlog 是半连接队列大小"** — 错，backlog 控制全连接队列；半连接队列由 `tcp_max_syn_backlog` 控制。
- **"应用挂了客户端立刻连不上"** — 不，如果应用挂但内核 listen 还在，握手仍能完成，只是连接堆在全连接队列。
- **"accept 阻塞就是握手慢"** — 不，是全连接队列为空。

## 总结

三次握手由内核完成，应用层的 `accept()` 只是从全连接队列取出已建立的连接。两个队列（半连接、全连接）分别对应握手的不同阶段，满了会导致 SYN 或 ACK 被丢弃。生产中要同时调大 `somaxconn`、`tcp_max_syn_backlog`、应用 listen backlog 三个参数，并保证应用 accept 速度跟得上。

## 参考资料

- [RFC 793 — TCP, Section 3.4](https://datatracker.ietf.org/doc/html/rfc793#section-3.4)
- [Linux listen(2) 文档](https://man7.org/linux/man-pages/man2/listen.2.html)
- [Linux TCP backlog 文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
