# Redis 单线程模型是怎么样的

## 核心概念

Redis 6.0 之前的单线程模型可以用一句话概括：主线程跑一个事件循环，通过 epoll 监听所有 socket 的事件（连接、读、写），事件发生后调用对应的处理函数，命令按到达顺序串行执行。这就是经典的"Reactor 单线程模型"。

整个流程围绕一个 `aeEventLoop` 展开：注册事件 → epoll_wait 等待 → 分发到处理器 → 处理完继续等待。Redis 自己实现了这个事件循环库（ae.c），不依赖第三方。

单线程模型的好处是简单和无锁——所有命令都在主线程执行，天然原子，不用考虑并发问题。坏处是一个慢命令会阻塞所有后续命令，所以 Redis 对命令复杂度极其敏感。

## 标准回答

Redis 6.0 之前是"单 Reactor 单线程"模型：主线程跑 `aeEventLoop` 事件循环，通过 epoll 监听所有 socket 的连接、读、写事件，事件就绪后分发到对应的处理器（acceptTcpHandler、readQueryFromClient、sendReplyToClient）。处理器在主线程同步执行，命令按到达顺序串行处理。初始化时创建 epoll 对象、绑定监听端口、注册连接事件处理器；运行时循环 epoll_wait → 分发事件 → 处理 → 回到循环。6.0+ 引入多线程 IO，IO 读写并行化，但命令执行仍单线程，模型变成"单 Reactor 多线程"。

要点：

1. 核心结构：`aeEventLoop` 包含 epoll fd、事件表、就绪事件数组、beforesleep/sleeps 回调。
2. 三类事件处理器：连接事件、读事件、写事件。
3. 事件循环：`aeMain` 循环调用 `aeProcessEvents`。
4. 命令串行执行，天然原子。
5. 6.0+ 演进为多线程 IO，但 Reactor 主线程不变。

## 实现原理

### 事件循环初始化

```text
Redis 启动 initServer() 流程：

1. 创建事件循环
   aeEventLoop *ae = aeCreateEventLoop(server.maxclients + 128)

2. 创建监听 socket
   listen_fd = socket(AF_INET, SOCK_STREAM, 0)
   bind(listen_fd, ip, port)
   listen(listen_fd, 511)

3. 把监听 socket 注册到 epoll
   aeCreateFileEvent(ae, listen_fd, AE_READABLE, acceptTcpHandler, ...)

4. 注册时间事件（serverCron 等）
   aeCreateTimeEvent(ae, 1, serverCron, ...)

5. 进入事件循环
   aeMain(ae)
       while (ae->stop == 0) {
           aeProcessEvents(ae, AE_ALL_EVENTS)
       }
```

### 事件循环主流程

```text
aeProcessEvents(ae, flags):

  1. 处理时间事件（如果到时间）
     - 找出到期的时间事件
     - 调用对应回调（如 serverCron）

  2. 计算下次时间事件到期的时间间隔
     - 决定 epoll_wait 的最大阻塞时间

  3. 调用 beforesleep 回调
     - 处理待写客户端（flushClientsOutputBuffer）
     - AOF 刷盘
     - 解锁被解锁的 key

  4. epoll_wait(ae->epfd, ae->fired, maxfd, tvp)
     - 等待文件事件就绪
     - 返回就绪事件数量

  5. 处理就绪事件
     for (j = 0; j < numevents; j++) {
         fd = ae->fired[j].fd
         mask = ae->fired[j].mask
         if (mask & AE_READABLE) {
             fe->rfileProc(fd, fe->clientData)  // 读事件处理
         }
         if (mask & AE_WRITABLE) {
             fe->wfileProc(fd, fe->clientData)  // 写事件处理
         }
     }

  6. 返回循环，继续 aeProcessEvents
```

### 三类文件事件处理器

```text
1. acceptTcpHandler（连接事件）
   监听 socket 可读 -> 有新连接
   流程：
     accept() 获取已连接 fd
     创建 client 对象
     注册读事件处理器 readQueryFromClient
     （6.0+ 可能分配给 IO 线程）

2. readQueryFromClient（读事件）
   客户端 socket 可读 -> 有数据到达
   流程：
     read(fd, buf) 读取数据到客户端缓冲区
     解析 RESP 协议
     执行命令 processCommand()
     把响应写到客户端输出缓冲区
     注册写事件处理器 sendReplyToClient（如果缓冲区有数据）

3. sendReplyToClient（写事件）
   客户端 socket 可写 -> 可以发送响应
   流程：
     write(fd, output_buf, len) 发送响应
     如果没发完，继续注册写事件，下次 epoll_wait 后再发
     如果发完，移除写事件监听
```

### 命令执行的串行性

```text
时间 T1：客户端 A 发送 SET k1 v1
时间 T2：客户端 B 发送 SET k2 v2
时间 T3：客户端 C 发送 GET k1

事件循环按到达顺序处理：
  Step 1: epoll_wait 返回 A 的读事件
          readQueryFromClient(A) -> 解析 SET k1 v1 -> 执行 -> 写响应到 A 缓冲区
  Step 2: epoll_wait 返回 B 的读事件
          readQueryFromClient(B) -> 解析 SET k2 v2 -> 执行 -> 写响应到 B 缓冲区
  Step 3: epoll_wait 返回 C 的读事件
          readQueryFromClient(C) -> 解析 GET k1 -> 执行（读到 v1）-> 写响应到 C 缓冲区

  Step 4: beforesleep 阶段统一 flush 输出缓冲区到 socket

整个过程中命令按到达顺序串行执行，不会出现 A 和 B 的命令交错执行
所以 SET k1 v1 完成后 GET k1 才执行，必然读到 v1
```

### 单 Reactor 单线程模型

```text
                +-------------------+
                |   主线程 (Reactor)  |
                |                   |
                |  +-------------+  |
                |  | 事件循环     |  |
                |  | aeProcess-  |  |
                |  |  Events     |  |
                |  +-------------+  |
                |         |         |
                |  +-------------+  |
                |  | epoll_wait  |  |
                |  +-------------+  |
                |         |         |
                |    分发到处理器    |
                |   +------+------+  |
                |   |      |      |  |
                v   v      v      v  v
            acceptTcp readQuery  sendReply  timeEvent
            Handler   FromClient ToClient   (serverCron)

特点：
  - 单线程完成 accept、read、parse、execute、write
  - 所有命令串行执行
  - 一次只能处理一个事件
  - 慢命令会阻塞整个循环
```

### 单线程模型的局限

```text
1. 慢命令阻塞
   KEYS * 在百万 key 上耗时几秒
   期间所有其他客户端请求排队等待
   解决：用 SCAN 替代 KEYS，避免阻塞命令

2. 大 Key 阻塞
   DEL 百万元素 List 同步释放内存耗时
   解决：UNLINK 异步释放

3. fork 阻塞
   BGSAVE 时 fork 复制页表
   大实例 fork 耗时百毫秒
   解决：单实例内存控制 10GB 内

4. AOF fsync 阻塞
   always 策略每次写都 fsync
   解决：用 everysec

5. 网络瓶颈（6.0 前）
   单线程读写 socket，千兆网卡打满就到瓶颈
   解决：6.0+ 多线程 IO
```

### 6.0+ 演进：单 Reactor 多线程

```text
                +-------------------+
                |   主线程 (Reactor)  |
                |                   |
                |  +-------------+  |
                |  | 事件循环     |  |
                |  | accept, parse| |
                |  | execute      |  |
                |  +-------------+  |
                |         |         |
                |   分配 IO 任务    |
                |   +------+------+  |
                v   v      v      v  v
            IO 线程 1 IO 线程 2 IO 线程 3
            read       read       read
            write      write      write

变化：
  - IO 线程负责 socket 读写
  - 主线程仍负责 accept、parse、execute
  - 命令执行仍单线程
  - 网络瓶颈解决
```

### 单线程模型版本演进

| Redis 版本 | 模型 | 关键变化 | QPS 影响 |
|------------|------|----------|----------|
| 1.0 | 单 Reactor 单线程 | 基础事件循环 + select | 基准 |
| 2.6 | 同 1.0 | epoll 优先；2 个 BIO 线程（close_file, aof_fsync） | 连接数上限提升 |
| 4.0 | 同 1.0 | 第 3 个 BIO 线程（lazy_free）；UNLINK 异步删除 | 大 Key 删除不阻塞 |
| 5.0 | 同 1.0 | Stream 数据结构 | 新场景 |
| 6.0 | 单 Reactor 多线程 | `io-threads` 多线程 IO | 网络 QPS +30%-100% |
| 6.2 | 同 6.0 | IO 线程支持读 | 读场景提升 |
| 7.0 | 同 6.0 | listpack 替换 ziplist；lazyfree 增强 | 内存和性能提升 |
| 7.2 | 同 6.0 | Function 持久化 | Lua 替代方案 |
| 7.4 | 同 6.0 | 多线程 IO 增强 | 网络层优化 |

6.0 是分水岭：之前是纯单线程模型，之后是"单 Reactor + 多线程 IO"混合模型。命令执行始终单线程，这是 Redis 的核心设计。

### 事件循环时序

```text
主线程事件循环（aeProcessEvents 一次完整迭代）：

  T1: beforesleep 回调
        - flush 客户端输出缓冲区到 socket
        - AOF 缓冲区 write 到文件
        - 处理解锁的 key
        - 发送 Cluster gossip

  T2: 计算 epoll_wait 的 timeout
        = 距离下一个时间事件到期的毫秒数
        确保 serverCron 等周期任务能按时执行

  T3: epoll_wait(epfd, fired, setsize, timeout)
        - 阻塞等待 socket 事件就绪
        - 返回就绪事件数量 N

  T4: 遍历就绪事件（串行处理）
        for (j = 0; j < N; j++) {
            fd = fired[j].fd
            if (mask & AE_READABLE) rfileProc(fd, clientData)
            if (mask & AE_WRITABLE) wfileProc(fd, clientData)
        }

  T5: processTimeEvents
        - 检查时间事件是否到期
        - 到期则调用回调（如 serverCron）

  T6: 回到 T1，继续下一轮循环

6.0+ 多线程 IO 时序：
  T3': 主线程把就绪的读事件客户端分配给 IO 线程
  T4': IO 线程并行 read，主线程忙等
  T5': 主线程串行 parse + execute
  T6': 主线程把响应分配给 IO 线程
  T7': IO 线程并行 write，主线程忙等
  T8': 回到 T1
```

## 代码示例

### Redis ae.c 事件循环核心代码

```c
// ae.c 中的事件循环主函数
void aeMain(aeEventLoop *eventLoop) {
    eventLoop->stop = 0;
    while (!eventLoop->stop) {
        aeProcessEvents(eventLoop, AE_ALL_EVENTS | AE_CALL_BEFORE_SLEEP);
    }
}

// 处理事件
int aeProcessEvents(aeEventLoop *eventLoop, int flags) {
    int processed = 0, numevents;

    // 处理时间事件
    if (flags & AE_TIME_EVENTS) {
        processed += processTimeEvents(eventLoop);
    }

    // 计算下次时间事件到期时间
    struct timeval *tvp = aeApiPollTimeout(eventLoop);

    // beforesleep 回调
    if (eventLoop->beforesleep != NULL && flags & AE_CALL_BEFORE_SLEEP) {
        eventLoop->beforesleep(eventLoop);
    }

    // epoll_wait 等待文件事件
    numevents = aeApiPoll(eventLoop, tvp);

    // 分发到处理器
    for (int j = 0; j < numevents; j++) {
        aeFileEvent *fe = &eventLoop->events[eventLoop->fired[j].fd];
        int mask = eventLoop->fired[j].mask;
        int fd = eventLoop->fired[j].fd;

        if (fe->mask & mask & AE_READABLE) {
            fe->rfileProc(eventLoop, fd, fe->clientData, mask);
        }
        if (fe->mask & mask & AE_WRITABLE) {
            fe->wfileProc(eventLoop, fd, fe->clientData, mask);
        }
        processed++;
    }
    return processed;
}
```

### 模拟 Redis 单线程模型（Java 示例）

```java
import java.nio.channels.*;
import java.nio.ByteBuffer;
import java.net.InetSocketAddress;
import java.util.Iterator;

public class SingleThreadReactor {
    public static void main(String[] args) throws Exception {
        Selector selector = Selector.open();
        ServerSocketChannel server = ServerSocketChannel.open();
        server.bind(new InetSocketAddress(6379));
        server.configureBlocking(false);
        server.register(selector, SelectionKey.OP_ACCEPT);

        System.out.println("Redis-like server started on port 6379");

        // 事件循环
        while (true) {
            selector.select();  // 等待事件
            Iterator<SelectionKey> keys = selector.selectedKeys().iterator();
            while (keys.hasNext()) {
                SelectionKey key = keys.next();
                keys.remove();
                if (key.isAcceptable()) {
                    acceptHandler(selector, server);
                } else if (key.isReadable()) {
                    readHandler(key);
                }
            }
        }
    }

    static void acceptHandler(Selector selector, ServerSocketChannel server) throws Exception {
        SocketChannel client = server.accept();
        client.configureBlocking(false);
        client.register(selector, SelectionKey.OP_READ);
        System.out.println("Client connected: " + client.getRemoteAddress());
    }

    static void readHandler(SelectionKey key) throws Exception {
        SocketChannel client = (SocketChannel) key.channel();
        ByteBuffer buf = ByteBuffer.allocate(1024);
        int n = client.read(buf);
        if (n == -1) {
            client.close();
            return;
        }
        String cmd = new String(buf.array(), 0, n).trim();
        System.out.println("Received: " + cmd);

        // 命令执行（单线程串行）
        String response = executeCommand(cmd);

        // 写响应
        client.write(ByteBuffer.wrap(response.getBytes()));
    }

    static String executeCommand(String cmd) {
        if (cmd.startsWith("GET")) {
            return "value\r\n";
        } else if (cmd.startsWith("SET")) {
            return "+OK\r\n";
        }
        return "-ERR unknown command\r\n";
    }
}
```

### 检查 Redis 主线程状态

```bash
# 查看 Redis 进程 CPU
top -p $(pgrep redis-server)

# 查看 Redis 内部事件循环统计
redis-cli INFO stats | grep -E "total_commands_processed|instantaneous_ops_per_sec"

# 查看延迟
redis-cli --latency
redis-cli --latency-history -i 5

# 慢命令日志
redis-cli SLOWLOG GET 10

# 延迟事件
redis-cli LATENCY HISTORY event-loop
redis-cli LATENCY DOCTOR
```

## 实战场景

| 场景 | 模型选择 | 注意点 |
|------|----------|--------|
| 默认部署 | 单线程模型 | 6.0 前的标准模型 |
| 高 QPS 网络 | 6.0+ 多线程 IO | io-threads 4 |
| 慢命令排查 | SLOWLOG + LATENCY | 找出阻塞点 |
| 大 Key 治理 | UNLINK + lazyfree | 避免主线程阻塞 |
| 多核利用 | 多实例 | 单实例一个核 |

## 深挖追问

### 1. Redis 的事件循环和 Netty 的事件循环一样吗？

思路一致，实现不同。Redis 的 `aeEventLoop` 是 C 实现的轻量事件循环，封装 epoll/select/kqueue。Netty 的 NioEventLoop 是 Java 实现的，多了 ByteBuf、Pipeline、ChannelHandler 等抽象。底层都是 Reactor 模式 + IO 多路复用。

### 2. 单线程模型下命令是真正串行吗？

是的。所有命令都在主线程的 `processCommand` 中执行，前一个命令执行完才会执行下一个。所以 Redis 命令天然原子，不需要事务隔离机制。`MULTI/EXEC` 只保证命令连续执行不被打断，不解决并发问题。

### 3. serverCron 是怎么执行的？

通过时间事件机制。`initServer` 注册 `serverCron` 时间事件，事件循环每次 `aeProcessEvents` 检查时间事件是否到期，到期就调用 `serverCron`。它负责过期 key 删除、统计信息更新、客户端超时检查、集群心跳等周期任务，默认每 100ms 一次。

### 4. beforesleep 是做什么的？

`aeMain` 每次 `epoll_wait` 前调用 `beforesleep`。它负责：把客户端输出缓冲区的数据 flush 到 socket、AOF 缓冲区写到磁盘、处理解锁的 key、Cluster 节点的 gossip 发送等。这样主线程在 epoll_wait 阻塞期间，客户端的响应已经发出去了。

### 5. 单线程模型为什么不会被一个慢连接拖垮？

`epoll_wait` 是非阻塞的——只返回就绪事件。如果某个客户端 socket 没数据，epoll_wait 不会等它。但一旦某个客户端的数据就绪，处理它的命令时如果命令很慢（比如 KEYS *），其他客户端就要等。所以慢命令是真正的瓶颈，不是慢连接。

## 易错点

- 把"单线程"理解为 Redis 进程只有一个线程，忽略 BIO 和 IO 线程。
- 以为 Redis 命令是并行执行的，实际是串行。
- 用 `KEYS *` 等阻塞命令在生产环境，会卡住所有客户端。
- 6.0+ 开了 io-threads 就以为命令也多线程了，实际只有 IO 多线程。
- 忘记 `beforesleep` 的作用，以为响应是命令执行后立即发送的。

## 总结

Redis 6.0 之前的单线程模型是"单 Reactor 单线程"：主线程跑 `aeEventLoop` 事件循环，epoll 监听所有 socket 事件，分发到 acceptTcpHandler、readQueryFromClient、sendReplyToClient 三个处理器。命令在主线程串行执行，天然原子。简单和无锁是优点，慢命令阻塞是缺点。6.0+ 演进为"单 Reactor 多线程"，IO 读写并行化，但命令执行仍单线程。理解 Redis 单线程模型要抓住事件循环、文件事件处理器、命令串行执行三个核心点。

## 参考资料

- [Redis 事件循环源码 ae.c](https://github.com/redis/redis/blob/unstable/src/ae.c)
- [Redis Internals 官方文档](https://redis.io/docs/reference/internals/)
- 《Redis 设计与实现》黄健宏
