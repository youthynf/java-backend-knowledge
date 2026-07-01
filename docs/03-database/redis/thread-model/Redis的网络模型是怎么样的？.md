# Redis 的网络模型是怎么样的

## 核心概念

网络模型是指服务器处理客户端连接和数据收发的架构方式。常见的网络模型有：传统阻塞 IO 模型（一连接一线程）、Reactor 模式（事件驱动）、Proactor 模式（异步 IO）。Redis 用的是 Reactor 模式——基于 IO 多路复用的事件驱动模型，单线程就能处理海量并发连接。

Reactor 模式按线程数和 Reactor 数量又分三种：单 Reactor 单线程、单 Reactor 多线程、主从 Reactor 多线程。Redis 6.0 之前是"单 Reactor 单线程"——一个线程跑事件循环，accept、read、parse、execute、write 全包揽；6.0+ 演进为"单 Reactor 多线程"——主线程仍跑事件循环和命令执行，但 IO 读写交给多个 IO 线程并行处理。

理解 Redis 网络模型的关键是抓住三层：底层 IO 多路复用（epoll）、中层事件循环（aeEventLoop）、上层 Reactor 线程模型（单/多线程）。这三层共同决定了 Redis 的并发能力和性能特征。

## 标准回答

Redis 网络模型是基于 IO 多路复用的 Reactor 模式。6.0 之前是"单 Reactor 单线程"：主线程跑 `aeEventLoop` 事件循环，通过 epoll 监听所有 socket 的连接、读、写事件，事件就绪后分发到对应的处理器（acceptTcpHandler、readQueryFromClient、sendReplyToClient）在主线程同步执行，命令串行处理。6.0+ 演进为"单 Reactor 多线程"：主线程仍负责 epoll_wait、accept、命令解析和执行，但 socket 的 read/write 交给 IO 线程并行处理，解决网络 IO 瓶颈。Redis 不用主从 Reactor（多 Reactor）模型，因为命令执行单线程已经够用，多 Reactor 增加复杂度收益不明显。

要点：

1. Reactor 三种形态：单 Reactor 单线程（Redis < 6.0）、单 Reactor 多线程（Redis 6.0+）、主从 Reactor 多线程（Netty 默认，Redis 不用）。
2. Redis 事件循环 `aeEventLoop`：文件事件（socket）+ 时间事件（serverCron）。
3. 6.0+ 多线程 IO 只并行 socket 读写，命令执行仍单线程。
4. 与 Memcached（多线程 worker 模型）、Netty（多 Reactor 多线程）的对比。
5. Redis 选择单 Reactor 是因为命令执行本身快（内存操作），瓶颈在网络 IO 而非 CPU。

## 实现原理

### Reactor 模式回顾

Reactor 模式由三个核心组件构成：

```text
1. Reactor（事件分发器）
   - 持有 IO 多路复用器（epoll）
   - 循环调用 epoll_wait 等待事件
   - 把就绪事件分发给对应的 Handler

2. Acceptor（连接处理器）
   - 处理新连接事件
   - accept 后把连接注册到 Reactor

3. Handler（事件处理器）
   - 处理读、写事件
   - 执行业务逻辑
```

Reactor 模式的核心思想是"事件驱动"——不主动调用 API 等待数据，而是注册回调，事件发生时由 Reactor 分发调用。

### Reactor 的三种形态

```text
形态 1：单 Reactor 单线程（Redis < 6.0）

  +-------------------+
  |    Reactor         |
  |  (单线程事件循环)   |
  +---------+---------+
            |
  +---------+---------+
  |  Acceptor/Handler  |
  |  accept/read/write  |
  |  parse/execute     |
  +-------------------+

  特点：所有工作一个线程完成
  优点：简单、无锁、命令原子
  缺点：IO 和执行互相阻塞，慢命令影响全局


形态 2：单 Reactor 多线程（Redis 6.0+）

  +-------------------+
  |    Reactor         |  (主线程)
  |  epoll_wait        |
  |  accept/parse      |
  |  execute           |
  +---------+---------+
            |
  +---------+---------+---------+---------+
  |  IO 线程 1 | IO 线程 2 | IO 线程 3 |
  |  read/write| read/write| read/write|
  +-----------+-----------+-----------+

  特点：IO 读写并行，命令执行仍单线程
  优点：解决网络 IO 瓶颈，保持命令原子
  缺点：命令执行仍是瓶颈


形态 3：主从 Reactor 多线程（Netty 默认，Redis 不用）

  +-------------------+
  |  Main Reactor     |  (主线程)
  |  accept           |
  +---------+---------+
            |
  +---------+---------+---------+---------+
  | Sub Reactor 1 | Sub Reactor 2 | ... |
  |  epoll_wait    |  epoll_wait   |     |
  |  read/write    |  read/write   |     |
  |  execute       |  execute      |     |
  +----------------+----------------+-----+

  特点：每个 Sub Reactor 一个线程，独立事件循环
  优点：充分利用多核，IO 和执行都并行
  缺点：复杂，需要线程间同步
```

### Redis 6.0 之前的单 Reactor 单线程

```text
主线程事件循环（aeProcessEvents）：

  while (!stop) {
      1. beforesleep 回调
         - flush 客户端输出缓冲区
         - AOF write
         - Cluster gossip

      2. epoll_wait(epfd, fired, setsize, timeout)
         - 等待 socket 事件就绪
         - 同时计算下一个时间事件的到期时间作为 timeout

      3. 遍历就绪事件
         for (j = 0; j < numevents; j++) {
             fd = fired[j].fd
             if (mask & AE_READABLE) rfileProc(fd, clientData)
             if (mask & AE_WRITABLE) wfileProc(fd, clientData)
         }

      4. 处理时间事件
         - serverCron（默认每 100ms）
         - 其他周期任务
  }

处理器职责：
  acceptTcpHandler    -> accept 新连接
  readQueryFromClient -> read + parse + execute
  sendReplyToClient   -> write 响应

所有处理器在主线程同步执行，命令按到达顺序串行处理。
```

### Redis 6.0+ 的单 Reactor 多线程

```text
主线程 + IO 线程协作流程：

  阶段 1：等待事件
    主线程 epoll_wait 收到 N 个读事件
    把 N 个客户端放入 clients_pending_read 列表

  阶段 2：分配 IO 线程读
    主线程把列表里的客户端轮询分配给 M 个 IO 线程
      IO 线程 1: read(client_1), read(client_M+1), ...
      IO 线程 2: read(client_2), read(client_M+2), ...
      ...
    主线程自己也会处理一部分（不浪费）
    主线程忙等所有 IO 线程完成（busy_loop）

  阶段 3：主线程串行执行命令
    遍历 clients_pending_read 列表
    对每个 client：parse + execute
    把响应写到 client.buf / client.reply
    把 client 加入 clients_pending_write 列表

  阶段 4：分配 IO 线程写
    主线程把 clients_pending_write 轮询分配给 IO 线程
      IO 线程 1: write(client_1), write(client_M+1), ...
      ...
    主线程忙等所有 IO 线程完成

  阶段 5：回到阶段 1

关键约束：
  - IO 线程只做 read/write/parse，不执行命令
  - 命令执行始终在主线程，保证原子性
  - IO 线程之间无共享数据，无锁
  - 主线程忙等 IO 线程（不用条件变量，避免上下文切换开销）
```

### Redis 事件循环源码结构

```c
// server.c 中初始化
void initServer(void) {
    server.el = aeCreateEventLoop(server.maxclients + CONFIG_FDSET_INCR);
    // 注册监听 socket 的连接事件
    for (j = 0; j < server.ipfd_count; j++) {
        aeCreateFileEvent(server.el, server.ipfd[j],
                          AE_READABLE, acceptTcpHandler, NULL);
    }
    // 注册周期任务
    aeCreateTimeEvent(server.el, 1, serverCron, NULL, NULL);
}

// ae.c 主循环
void aeMain(aeEventLoop *eventLoop) {
    eventLoop->stop = 0;
    while (!eventLoop->stop) {
        aeProcessEvents(eventLoop, AE_ALL_EVENTS | AE_CALL_BEFORE_SLEEP | AE_CALL_AFTER_SLEEP);
    }
}

// networking.c 中 IO 线程入口
void IOThreadMain(void *myid) {
    long id = (unsigned long)myid;
    while (1) {
        // 等待主线程分配任务
        for (int j = 0; j < 1000000; j++) {
            if (getIOPendingCount(id) != 0) break;
        }
        // 处理分配的客户端列表
        listIter li;
        listNode *ln;
        listRewind(io_threads_list[id], &li);
        while ((ln = listNext(&li))) {
            client *c = listNodeValue(ln);
            if (io_threads_op == IO_THREADS_OP_WRITE) {
                writeToClient(c, 0);
            } else if (io_threads_op == IO_THREADS_OP_READ) {
                readQueryFromClient(c->conn);
            }
        }
        listEmpty(io_threads_list[id]);
    }
}
```

### Redis 与其他系统网络模型对比

| 系统 | 网络模型 | 命令执行 | 线程数 | 特点 |
|------|----------|----------|--------|------|
| Redis < 6.0 | 单 Reactor 单线程 | 单线程 | 1（+BIO） | 简单无锁，IO 是瓶颈 |
| Redis 6.0+ | 单 Reactor 多线程 | 单线程 | 1+M（IO） | IO 并行，命令仍单线程 |
| Memcached | 多线程 worker | 多线程 | N | 多线程加锁，命令也并行 |
| Netty | 主从 Reactor 多线程 | 多线程 | 1+N | 每个 Sub Reactor 独立循环 |
| Nginx | 多进程 | 单线程/进程 | N | 每进程一个 Reactor |
| Kafka | 主从 Reactor 多线程 | 多线程 | 1+N | 网络层和业务层分离 |

### Redis 为什么不用主从 Reactor

```text
1. 命令执行单线程已经够快
   单条命令微秒级，单核 10 万+ QPS
   多 Reactor 多线程执行的收益不明显

2. 数据结构锁复杂度
   Redis 的 Hash 表、跳表没有细粒度锁
   多线程执行要全局锁或重写数据结构
   锁竞争可能比单线程还慢

3. 单线程的原子性优势
   命令天然原子，不用事务隔离
   调试简单，无并发问题

4. 多核利用的替代方案
   单机部署多实例，每实例绑核
   或用 Cluster 分片跨实例扩展
   比改造网络模型更简单

5. 6.0 的折中
   只把 IO 读写并行化（不碰数据结构）
   命令执行保持单线程
   既解决网络瓶颈，又不引入锁
```

### Redis 网络模型版本演进

| 版本 | 模型 | 关键变化 | 性能影响 |
|------|------|----------|----------|
| 1.0 | 单 Reactor 单线程 | 基础事件循环 | 基准 |
| 2.6 | 同 1.0 | epoll 优先，连接数上限提升 | 连接数提升 |
| 4.0 | 同 1.0 | lazyfree 后台线程 | 大 Key 删除不阻塞 |
| 5.0 | 同 1.0 | Stream 数据结构 | 新场景 |
| 6.0 | 单 Reactor 多线程 | `io-threads` 多线程 IO | 网络 QPS +30%-100% |
| 7.0 | 同 6.0 | IO 线程支持读，listpack | 内存和性能提升 |
| 7.4 | 同 6.0 | 函数式脚本 | Lua 优化 |

## 代码示例

### 查看 Redis 网络模型状态

```bash
# 编译时选定的 IO 多路复用库
redis-server --version
# 输出包含：IO multiplexing = epoll

# 查看线程
ps -T -p $(pgrep redis-server)
# 6.0+ 开启 io-threads=4 时：
#   PID  SPID TTY      TIME CMD
#  1234  1234 ?      00:00:01 redis-server
#  1234  1235 ?      00:00:00 bio_close_file
#  1234  1236 ?      00:00:00 bio_aof_fsync
#  1234  1237 ?      00:00:00 bio_lazy_free
#  1234  1238 ?      00:00:00 io_thd_1
#  1234  1239 ?      00:00:00 io_thd_2
#  1234  1240 ?      00:00:00 io_thd_3

# 查看 IO 线程状态
redis-cli INFO threads
# io_threads_active:0  未启用
# io_threads_supported:1  支持
```

### 配置单 Reactor 单线程（6.0+ 也适用）

```conf
# redis.conf
io-threads 1              # 默认，即单线程 IO
io-threads-do-reads no    # 单线程时无效
```

### 配置单 Reactor 多线程

```conf
# redis.conf
io-threads 4              # 主线程 + 3 IO 线程
io-threads-do-reads yes   # 读也走 IO 线程
```

### 压测不同模型的 QPS

```bash
# 场景 1：单 Reactor 单线程
redis-cli CONFIG SET io-threads 1
redis-benchmark -t get,set -n 1000000 -c 200 -q
# 典型输出（4 核，千兆网络）：
# SET: 110000 requests per second
# GET: 130000 requests per second

# 场景 2：单 Reactor 多线程（只写多线程）
redis-cli CONFIG SET io-threads 4
redis-cli CONFIG SET io-threads-do-reads no
redis-benchmark -t get,set -n 1000000 -c 200 -q
# SET: 170000 requests per second
# GET: 130000 requests per second  （读未多线程，提升不明显）

# 场景 3：单 Reactor 多线程（读写都多线程）
redis-cli CONFIG SET io-threads-do-reads yes
redis-benchmark -t get,set -n 1000000 -c 200 -q
# SET: 180000 requests per second
# GET: 200000 requests per second  （读多线程提升明显）
```

### 模拟 Redis 网络模型（Java）

```java
import java.nio.channels.*;
import java.nio.ByteBuffer;
import java.net.InetSocketAddress;
import java.util.Iterator;
import java.util.concurrent.*;

public class RedisLikeReactor {
    // 模拟单 Reactor 单线程
    public static void singleReactor() throws Exception {
        Selector selector = Selector.open();
        ServerSocketChannel server = ServerSocketChannel.open();
        server.bind(new InetSocketAddress(6379));
        server.configureBlocking(false);
        server.register(selector, SelectionKey.OP_ACCEPT);

        while (true) {
            selector.select();
            Iterator<SelectionKey> keys = selector.selectedKeys().iterator();
            while (keys.hasNext()) {
                SelectionKey key = keys.next();
                keys.remove();
                if (key.isAcceptable()) {
                    SocketChannel client = server.accept();
                    client.configureBlocking(false);
                    client.register(selector, SelectionKey.OP_READ);
                } else if (key.isReadable()) {
                    SocketChannel client = (SocketChannel) key.channel();
                    ByteBuffer buf = ByteBuffer.allocate(1024);
                    int n = client.read(buf);
                    if (n == -1) { client.close(); continue; }
                    // 命令执行（单线程串行）
                    String cmd = new String(buf.array(), 0, n).trim();
                    String resp = execute(cmd);
                    client.write(ByteBuffer.wrap(resp.getBytes()));
                }
            }
        }
    }

    // 模拟单 Reactor 多线程（IO 交给线程池）
    public static void singleReactorMultiIO() throws Exception {
        Selector selector = Selector.open();
        ServerSocketChannel server = ServerSocketChannel.open();
        server.bind(new InetSocketAddress(6380));
        server.configureBlocking(false);
        server.register(selector, SelectionKey.OP_ACCEPT);

        ExecutorService ioPool = Executors.newFixedThreadPool(3);

        while (true) {
            selector.select();
            Iterator<SelectionKey> keys = selector.selectedKeys().iterator();
            while (keys.hasNext()) {
                SelectionKey key = keys.next();
                keys.remove();
                if (key.isAcceptable()) {
                    SocketChannel client = server.accept();
                    client.configureBlocking(false);
                    client.register(selector, SelectionKey.OP_READ);
                } else if (key.isReadable()) {
                    SocketChannel client = (SocketChannel) key.channel();
                    key.cancel();  // 暂时取消监听
                    client.configureBlocking(true);
                    // IO 读写交给线程池
                    ioPool.submit(() -> {
                        try {
                            ByteBuffer buf = ByteBuffer.allocate(1024);
                            int n = client.read(buf);
                            String cmd = new String(buf.array(), 0, n).trim();
                            // 命令执行仍在主线程（这里简化了）
                            String resp = execute(cmd);
                            client.write(ByteBuffer.wrap(resp.getBytes()));
                            client.configureBlocking(false);
                            client.register(selector, SelectionKey.OP_READ);
                        } catch (Exception e) { /* ignore */ }
                    });
                }
            }
        }
    }

    static String execute(String cmd) {
        if (cmd.startsWith("PING")) return "+PONG\r\n";
        if (cmd.startsWith("SET")) return "+OK\r\n";
        return "-ERR\r\n";
    }
}
```

### 监控网络模型健康度

```bash
# 事件循环延迟
redis-cli --latency
redis-cli --latency-history -i 1

# 慢命令（阻塞事件循环的元凶）
redis-cli SLOWLOG GET 10

# 网络流量统计
redis-cli INFO stats | grep -E "net_input_bytes|net_output_bytes|instantaneous_ops_per_sec|rejected_connections"

# 客户端连接
redis-cli INFO clients | grep -E "connected_clients|blocked_clients|tracking_clients"

# CPU 使用
redis-cli INFO cpu
# used_cpu_sys / used_cpu_user / used_cpu_sys_children / used_cpu_user_children
```

## 实战场景

| 场景 | 模型选择 | 配置 |
|------|----------|------|
| 默认缓存（QPS < 10 万） | 单 Reactor 单线程 | `io-threads 1` |
| 高 QPS 网络密集 | 单 Reactor 多线程 | `io-threads 4` |
| 多核利用 | 单机多实例 | 每实例绑核 |
| 大规模扩展 | Cluster 分片 | 跨实例 |
| 极致延迟敏感 | 单 Reactor 单线程 | 避免多线程同步开销 |

## 深挖追问

### 1. Redis 网络模型和 Netty 的区别？

Redis 6.0+ 是"单 Reactor 多线程"：一个主线程跑事件循环，IO 线程只负责读写。Netty 默认是"主从 Reactor 多线程"：一个 Boss Reactor 处理连接，多个 Worker Reactor 各自跑独立事件循环处理 IO 和业务。Netty 的设计适合 Java 生态的复杂业务，Redis 的设计追求简单和无锁命令执行。

### 2. 为什么 Redis 不用多线程执行命令？

主要是数据结构锁的复杂度。Redis 的核心数据结构（Hash 表 dict、跳表 zskiplist、quicklist）没有细粒度锁，多线程访问要全局锁，锁竞争可能比单线程还慢。命令执行本身微秒级，加锁开销可能比执行还长。Redis 选择"单线程执行 + 多核用多实例/Cluster 扩展"的方案。

### 3. 单 Reactor 单线程下，一个慢命令会阻塞所有客户端吗？

会。所有命令在主线程串行执行，`KEYS *` 在百万 key 上跑几秒，期间所有其他客户端的命令都要排队等待。所以 Redis 对命令复杂度极其敏感，生产环境禁用 `KEYS`、大范围 `LRANGE`、复杂 Lua 脚本等。用 `SCAN` 替代 `KEYS`，用 `UNLINK` 替代 `DEL` 大 key。

### 4. 多线程 IO 后还会阻塞吗？

会，瓶颈转移了。原来网络 IO 是瓶颈，6.0+ 让 IO 并行化后，瓶颈变成命令执行（仍单线程）。慢命令、大 Key、复杂 Lua 脚本仍会阻塞主线程。多线程 IO 只解决网络瓶颈，不解决命令执行瓶颈。

### 5. Redis 未来会引入多 Reactor 或多线程命令执行吗？

短期内不太可能。Redis 作者多次表态：单线程命令执行是 Redis 的核心设计，简单和无锁的优势大于多线程的收益。如果要利用多核，推荐多实例或 Cluster。多线程执行命令需要重写数据结构和锁机制，复杂度高、收益不确定。6.0 的多线程 IO 是在不破坏单线程命令执行前提下的优化。

### 6. Redis 的事件循环和 Node.js 的事件循环一样吗？

思路类似，都是基于 IO 多路复用的事件驱动模型。区别：Redis 的事件循环更简单，只有文件事件和时间事件两类，且命令同步执行不 yield。Node.js 的事件循环有多个阶段（timers、pending callbacks、poll、check、close），且基于 Promise/async 异步执行，会有回调嵌套。两者底层都是 epoll（Linux）。

## 易错点

- 把"单 Reactor 单线程"理解为 Redis 没有后台线程——实际有 3 个 BIO 线程。
- 以为 6.0+ 是"多 Reactor"——实际仍是单 Reactor，只是 IO 多线程。
- 以为开了 `io-threads` 命令就多线程执行——只有 IO 读写多线程，命令仍单线程。
- 拿 Redis 网络模型和 Netty 直接对比——Netty 是多 Reactor，Redis 是单 Reactor。
- 以为 Redis 会演进到多线程命令执行——作者明确表态不会。

## 总结

Redis 网络模型是基于 IO 多路复用的 Reactor 模式。6.0 之前是"单 Reactor 单线程"：主线程跑 `aeEventLoop` 事件循环，epoll 监听所有 socket，事件分发到 acceptTcpHandler、readQueryFromClient、sendReplyToClient 三个处理器同步执行，命令串行。6.0+ 演进为"单 Reactor 多线程"：主线程仍负责 epoll_wait 和命令执行，IO 读写交给 IO 线程并行化。Redis 不用主从 Reactor 模型，因为命令执行单线程已经够快，多 Reactor 增加复杂度收益不明显。与 Memcached（多线程 worker）、Netty（主从 Reactor）相比，Redis 的设计追求简单和无锁命令执行。理解 Redis 网络模型要抓住"单 Reactor + 多线程 IO + 单线程命令执行"三个核心点。

## 参考资料

- [Redis 事件循环源码 ae.c](https://github.com/redis/redis/blob/unstable/src/ae.c)
- [Redis 6.0 多线程 IO 发布说明](https://github.com/redis/redis/blob/6.0/00-RELEASENOTES)
- [Reactor 模式论文](http://www.dre.vanderbilt.edu/~schmidt/PDF/Reactor2-sfb.pdf)
- [Redis Internals 官方文档](https://redis.io/docs/reference/internals/)
