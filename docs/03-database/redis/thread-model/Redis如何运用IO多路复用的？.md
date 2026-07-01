# Redis 如何运用 IO 多路复用

## 核心概念

IO 多路复用（IO Multiplexing）是一种"用一个线程同时监控多个 socket"的技术。传统阻塞 IO 模型里，一个线程只能盯一个连接，连接空闲时线程也跟着阻塞，要服务上万并发就要开上万线程，上下文切换和内存开销都吃不消。IO 多路复用让线程把所有 socket 交给内核监控，哪个 socket 有数据可读/可写，内核就通知哪个，线程只处理就绪的连接。

Redis 把 IO 多路复用当作单线程高并发的基石：主线程通过 epoll 同时管理几万个客户端连接，谁有命令就处理谁，没有命令就 epoll_wait 阻塞等待。这样单线程也能扛 10 万+ QPS，不需要为每个连接开线程。

Redis 在 ae.c 里封装了一套统一的事件循环接口，底层按平台自动选择 epoll（Linux）、kqueue（macOS/BSD）或 select（兜底），Linux 生产环境几乎都用 epoll。

## 标准回答

Redis 通过 IO 多路复用让单线程同时管理大量客户端连接。Linux 上用 epoll，Redis 自己在 ae.c 里封装了 `aeEventLoop` 事件循环：注册 socket 读/写事件 → `epoll_wait` 阻塞等待就绪事件 → 分发到对应的回调函数（连接、读、写）→ 处理完回到循环。epoll 相比 select/poll 的核心优势是：基于红黑树+就绪链表，事件复杂度 O(1)，不依赖连接数 N，水平模式不会重复触发。Redis 6.0+ 把 socket 读写放到 IO 线程并行处理，但 epoll 监听和命令执行仍在主线程。

要点：

1. 三个核心 epoll API：`epoll_create` 创建实例、`epoll_ctl` 注册/删除 fd、`epoll_wait` 等待就绪事件。
2. Redis 封装：`aeEventLoop` 统一封装 epoll/kqueue/select，对外暴露 `aeCreateFileEvent`、`aeProcessEvents`。
3. 三类事件：连接事件（`acceptTcpHandler`）、读事件（`readQueryFromClient`）、写事件（`sendReplyToClient`）。
4. epoll 优势：O(1) 事件获取、支持百万连接、水平触发（LT）和边缘触发（ET）可选，Redis 默认用 LT。
5. 6.0+ 多线程 IO：IO 线程并行读写 socket，主线程仍负责 epoll_wait 和命令执行。

## 实现原理

### 为什么需要 IO 多路复用

```text
传统阻塞 IO 模型：
  线程 1 -> recv(fd1)  阻塞等待客户端 1
  线程 2 -> recv(fd2)  阻塞等待客户端 2
  ...
  线程 N -> recv(fdN)  阻塞等待客户端 N

  问题：
    - 1 万连接要 1 万线程，内存开销大（每线程默认栈 1MB）
    - 上下文切换浪费 CPU
    - 大部分线程在阻塞，实际干活的不多

IO 多路复用模型：
  主线程 -> epoll_wait([fd1, fd2, ..., fdN])
            内核返回就绪的 fd 列表
            依次处理就绪的 fd

  优势：
    - 一个线程管理所有连接
    - 只处理有事件的连接，不空转
    - 内存和 CPU 开销极低
```

### select / poll / epoll 对比

| 维度 | select | poll | epoll |
|------|--------|------|-------|
| 数据结构 | bitmap（fd 集合） | 链表 | 红黑树（注册 fd）+ 双向链表（就绪队列） |
| 最大连接数 | FD_SETSIZE 默认 1024 | 无上限 | 无上限（受系统 fd 上限） |
| 时间复杂度 | O(N) 遍历所有 fd | O(N) 遍历所有 fd | O(1) 取就绪事件，O(logN) 注册/删除 |
| fd 拷贝 | 每次调用全量拷贝 fd 集合 | 每次调用全量拷贝 | `epoll_ctl` 时拷贝一次，`epoll_wait` 不拷贝 |
| 触发方式 | 水平触发（LT） | 水平触发（LT） | 水平触发（LT）+ 边缘触发（ET） |
| 性能随连接数 | 线性下降 | 线性下降 | 几乎不随连接数变化 |
| 平台 | 跨平台 | 类 Unix | 仅 Linux |

Redis 在 Linux 上选 epoll，macOS 上选 kqueue（性能类似 epoll），其他平台兜底用 select。源码 `ae.c` 里通过宏切换：

```c
#ifdef HAVE_EPOLL
    #include "ae_epoll.c"
#elif HAVE_KQUEUE
    #include "ae_kqueue.c"
#else
    #include "ae_select.c"
#endif
```

### epoll 的三个核心 API

```c
// 1. 创建 epoll 实例，返回 epfd
int epoll_create(int size);
// size 在旧内核是提示容量，新内核（>= 2.6.8）忽略，传 1 即可

// 2. 注册/修改/删除 fd
int epoll_ctl(int epfd, int op, int fd, struct epoll_event *event);
// op: EPOLL_CTL_ADD / EPOLL_CTL_MOD / EPOLL_CTL_DEL
// event.events: EPOLLIN（可读）、EPOLLOUT（可写）、EPOLLET（边缘触发）等

// 3. 等待就绪事件
int epoll_wait(int epfd, struct epoll_event *events, int maxevents, int timeout);
// 返回就绪事件数量，events 数组里是就绪的 fd 和事件类型
// timeout=-1 永久阻塞，0 立即返回，>0 阻塞毫秒数
```

epoll 内部维护两个数据结构：

```text
红黑树：所有注册的 fd
  - epoll_ctl ADD 时插入
  - epoll_ctl DEL 时删除
  - 查找/插入/删除 O(logN)

就绪链表：有事件发生的 fd
  - 内核在硬件中断、协议栈处理时把就绪 fd 链入
  - epoll_wait 只需把就绪链表拷贝到用户态
  - O(就绪事件数)，不依赖总 fd 数
```

### Redis 如何封装 epoll（ae.c）

Redis 不直接用 epoll API，而是在 `ae.c` 里封装了统一接口，底层按平台选 epoll/kqueue/select。

```c
// ae.c 核心结构
typedef struct aeEventLoop {
    int maxfd;                          // 当前注册的最大 fd
    int setsize;                        // 容量（maxclients + 128）
    long long timeEventNextId;          // 时间事件 ID
    aeFileEvent *events;                // 注册的事件数组，按 fd 索引
    aeFiredEvent *fired;                // 就绪事件数组
    aeTimeEvent *timeEventHead;         // 时间事件链表
    int stop;
    void *apidata;                      // 平台相关数据（epoll 是 epfd + event 数组）
    aeBeforeSleepProc *beforesleep;     // epoll_wait 前回调
    aeBeforeSleepProc *aftersleep;      // epoll_wait 后回调
} aeEventLoop;

// ae_epoll.c 里的平台数据
typedef struct aeApiState {
    int epfd;                           // epoll 实例 fd
    struct epoll_event *events;         // 就绪事件数组
} aeApiState;
```

注册事件：

```c
// aeCreateFileEvent(ae, fd, mask, proc, clientData)
//   mask: AE_READABLE / AE_WRITABLE
//   proc: 事件就绪时调用的回调
//   clientData: 传给回调的参数（通常是 client 对象）

int aeCreateFileEvent(aeEventLoop *eventLoop, int fd, int mask,
                      aeFileProc *proc, void *clientData) {
    aeFileEvent *fe = &eventLoop->events[fd];
    // 调用底层 aeApiAddEvent -> epoll_ctl(EPOLL_CTL_ADD/MOD)
    if (aeApiAddEvent(eventLoop, fd, mask) == -1) return AE_ERR;
    fe->mask |= mask;
    if (mask & AE_READABLE) fe->rfileProc = proc;
    if (mask & AE_WRITABLE) fe->wfileProc = proc;
    fe->clientData = clientData;
    if (fd > eventLoop->maxfd) eventLoop->maxfd = fd;
    return AE_OK;
}
```

等待事件：

```c
// aeApiPoll -> epoll_wait
static int aeApiPoll(aeEventLoop *eventLoop, struct timeval *tvp) {
    aeApiState *state = eventLoop->apidata;
    int retval = epoll_wait(state->epfd, state->events, eventLoop->setsize,
                            tvp ? (tvp->tv_sec*1000 + tvp->tv_usec/1000) : -1);
    int numevents = 0;
    int j;
    for (j = 0; j < retval; j++) {
        int mask = 0;
        struct epoll_event *e = state->events + j;
        if (e->events & EPOLLIN)  mask |= AE_READABLE;
        if (e->events & EPOLLOUT) mask |= AE_WRITABLE;
        if (e->events & EPOLLERR) mask |= AE_WRITABLE;
        if (e->events & EPOLLHUP) mask |= AE_WRITABLE;
        eventLoop->fired[numevents].fd = e->data.fd;
        eventLoop->fired[numevents].mask = mask;
        numevents++;
    }
    return numevents;
}
```

### Redis 事件循环全流程

```text
initServer()
  |
  v
aeCreateEventLoop(maxclients + 128)
  |
  v
listenToPort(port)  -> listen_fd
  |
  v
aeCreateFileEvent(ae, listen_fd, AE_READABLE, acceptTcpHandler)
  |
  v
aeCreateTimeEvent(ae, 1, serverCron)    // 周期任务，每 1ms 检查
  |
  v
aeMain(ae)
  |
  v
+------------------------------------------------------------------+
| while (!stop) {                                                  |
|     aeProcessEvents(ae, AE_ALL_EVENTS | AE_CALL_BEFORE_SLEEP);   |
| }                                                                |
+------------------------------------------------------------------+
       |
       v
   beforesleep 回调
     - flush 客户端输出缓冲区到 socket
     - AOF 缓冲区 write 到文件
     - 处理解锁的 key
     - 发送 Cluster gossip
       |
       v
   aeApiPoll(timeout)  -> epoll_wait
     - 返回就绪事件列表
       |
       v
   for (j = 0; j < numevents; j++) {
       fd = fired[j].fd
       mask = fired[j].mask
       if (mask & AE_READABLE)  fe->rfileProc(fd, clientData)
       if (mask & AE_WRITABLE) fe->wfileProc(fd, clientData)
   }
       |
       v
   processTimeEvents()  -> serverCron 等周期任务
```

### 三类文件事件处理器

```text
1. acceptTcpHandler（连接事件）
   触发：listen_fd 可读（有新客户端连接）
   动作：
     accept() -> 已连接 fd
     创建 client 对象
     aeCreateFileEvent(ae, fd, AE_READABLE, readQueryFromClient)

2. readQueryFromClient（读事件）
   触发：客户端 socket 可读（有命令到达）
   动作：
     connRead(fd, buf) 读取数据到 client.querybuf
     processInputBuffer(client) 解析 RESP 协议
     processCommand(client) 执行命令
     把响应写到 client.buf / client.reply（输出缓冲区）
     如果有数据要发，注册 AE_WRITABLE 事件 sendReplyToClient
   注：6.0+ 开启 io-threads-do-reads 时，read 由 IO 线程完成

3. sendReplyToClient（写事件）
   触发：客户端 socket 可写（可以发送响应）
   动作：
     connWrite(fd, output_buf, len)
     发完：移除 AE_WRITABLE 监听
     没发完：保留 AE_WRITABLE，下次 epoll_wait 后再发
```

### epoll 触发模式：Redis 用 LT 还是 ET

```text
LT（Level Triggered，水平触发）：
  只要 fd 的缓冲区有数据，epoll_wait 就会一直返回该事件
  不会漏掉事件，但可能重复通知
  Redis 默认用 LT

ET（Edge Triggered，边缘触发）：
  只在 fd 状态变化时通知一次（从无数据到有数据）
  不会重复通知，但要求应用一次性读完所有数据
  Redis 不用 ET，因为单线程下一次性读大量数据会阻塞

Redis 注册事件时不带 EPOLLET 标志，默认走 LT：
  epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &{EPOLLIN, fd})  // 不带 EPOLLET
```

### Reactor 模式与 IO 多路复用的关系

Reactor 模式是基于事件驱动的编程模型，核心三要素：

```text
1. 事件多路复用器（Event Demultiplexer）
   Redis 中是 epoll，负责监听所有 fd 的事件

2. 事件分发器（Event Dispatcher）
   Redis 中是 aeProcessEvents，把就绪事件分发给对应的处理器

3. 事件处理器（Event Handler）
   Redis 中是 acceptTcpHandler、readQueryFromClient、sendReplyToClient

关系：IO 多路复用是 Reactor 模式的底层实现机制
     Reactor 是基于 IO 多路复用之上抽象出的编程模型
     Redis 实现了"单 Reactor 单线程"（< 6.0）和"单 Reactor 多线程"（6.0+）
```

### Redis 6.0+ 多线程 IO 的演进

```text
6.0 之前：
  主线程一个人干所有事：
    epoll_wait -> accept -> read -> parse -> execute -> write
  瓶颈：网卡升级到万兆后，IO 读写占主线程 50%+ 时间

6.0+ 多线程 IO：
  主线程：epoll_wait、accept、parse、execute
  IO 线程：read、write（并行处理多个客户端）

  流程：
    1. 主线程 epoll_wait 收到 N 个读事件
    2. 主线程把 N 个客户端分配给 M 个 IO 线程（轮询）
    3. IO 线程并行 connRead，主线程等待
    4. 主线程依次 parse + execute（命令仍串行）
    5. 主线程把响应分配给 IO 线程
    6. IO 线程并行 connWrite
    7. 回到步骤 1

  关键约束：
    - 命令执行始终在主线程，保证原子性
    - IO 线程只做 socket 读写和协议解析，不碰数据结构
    - IO 线程之间通过轮询分配，无锁
```

### IO 多路复用相关配置

| 配置项 | 作用 | 默认值 |
|--------|------|--------|
| `io-threads` | IO 线程数（含主线程） | 1（即禁用） |
| `io-threads-do-reads` | 读是否也走 IO 线程 | no |
| `maxclients` | 最大客户端连接数 | 10000 |
| `tcp-backlog` | listen 队列长度 | 511 |
| `tcp-keepalive` | TCP keepalive 探测间隔 | 300 |

### Redis 版本演进

| 版本 | IO 模型变化 | 关键改进 |
|------|-------------|----------|
| 1.0 | select/poll 封装 | 基础事件循环 |
| 2.6 | 引入 epoll 优先 | 大幅提升连接数上限 |
| 4.0 | 同 2.6 | lazyfree 后台线程释放 |
| 5.0 | 同 2.6 | Stream 数据结构 |
| 6.0 | 引入多线程 IO | `io-threads` 配置，网络 IO 并行化 |
| 7.0 | 同 6.0 | IO 线程支持读，更稳定 |
| 7.4 | 同 6.0 | 函数式脚本，性能优化 |

## 代码示例

### 查看 Redis 用的是哪种多路复用

```bash
# 编译时选定的多路复用库
redis-server --version
# 输出示例：redis_version:7.0.5 ...
# 编译时会打印：IO multiplexing = epoll

# 运行时确认
redis-cli INFO server | grep io
# io_threads_active:0  表示多线程 IO 未启用
# io_threads_supported:1  表示支持
```

### 开启多线程 IO

```conf
# redis.conf
io-threads 4              # 主线程 + 3 个 IO 线程
io-threads-do-reads yes   # 读也走 IO 线程（高 QPS 时才开）
```

```bash
# 在线开启
redis-cli CONFIG SET io-threads 4
redis-cli CONFIG SET io-threads-do-reads yes
```

### 压测对比单线程 vs 多线程 IO

```bash
# 关闭多线程 IO
redis-cli CONFIG SET io-threads 1
redis-benchmark -t get,set -n 1000000 -c 200 -q
# 典型输出（千兆网络，4 核）：
# SET: 110000 requests per second
# GET: 130000 requests per second

# 开启 4 线程 IO
redis-cli CONFIG SET io-threads 4
redis-cli CONFIG SET io-threads-do-reads yes
redis-benchmark -t get,set -n 1000000 -c 200 -q
# 典型输出（网络密集场景）：
# SET: 180000 requests per second  (+60%)
# GET: 200000 requests per second  (+50%)
```

### 模拟 epoll 事件循环（Java NIO）

```java
import java.nio.channels.*;
import java.nio.ByteBuffer;
import java.net.InetSocketAddress;
import java.util.Iterator;

public class EpollLikeServer {
    public static void main(String[] args) throws Exception {
        Selector selector = Selector.open();  // 类似 epoll_create
        ServerSocketChannel server = ServerSocketChannel.open();
        server.bind(new InetSocketAddress(6379));
        server.configureBlocking(false);
        server.register(selector, SelectionKey.OP_ACCEPT);  // 类似 epoll_ctl ADD

        System.out.println("Server started on 6379");

        while (true) {
            selector.select();  // 类似 epoll_wait
            Iterator<SelectionKey> keys = selector.selectedKeys().iterator();
            while (keys.hasNext()) {
                SelectionKey key = keys.next();
                keys.remove();
                if (key.isAcceptable()) {
                    // 连接事件 -> acceptTcpHandler
                    SocketChannel client = server.accept();
                    client.configureBlocking(false);
                    client.register(selector, SelectionKey.OP_READ);
                } else if (key.isReadable()) {
                    // 读事件 -> readQueryFromClient
                    SocketChannel client = (SocketChannel) key.channel();
                    ByteBuffer buf = ByteBuffer.allocate(1024);
                    int n = client.read(buf);
                    if (n == -1) {
                        client.close();
                        continue;
                    }
                    String cmd = new String(buf.array(), 0, n).trim();
                    // 命令执行（串行）
                    String resp = execute(cmd);
                    client.write(ByteBuffer.wrap(resp.getBytes()));
                }
            }
        }
    }

    static String execute(String cmd) {
        if (cmd.startsWith("PING")) return "+PONG\r\n";
        if (cmd.startsWith("SET")) return "+OK\r\n";
        return "-ERR unknown command\r\n";
    }
}
```

### 监控事件循环健康度

```bash
# 事件循环延迟（核心指标，> 100ms 要警惕）
redis-cli --latency
redis-cli --latency-history -i 1

# 内部延迟事件
redis-cli LATENCY HISTORY event-loop
redis-cli LATENCY DOCTOR

# 慢命令（会阻塞事件循环）
redis-cli SLOWLOG GET 10

# 客户端连接数
redis-cli INFO clients | grep -E "connected_clients|blocked_clients"

# 网络流量
redis-cli INFO stats | grep -E "net_input|net_output|instantaneous_ops"
```

## 实战场景

| 场景 | 配置 | 注意点 |
|------|------|--------|
| 默认缓存服务 | 单线程 IO（默认） | 简单可靠，QPS < 10 万够用 |
| 高 QPS 网络 | `io-threads 4` | 网络密集场景提升 30%-100% |
| 长连接多 | 调大 `maxclients` 和 `tcp-backlog` | 注意系统 `ulimit -n` 也要调大 |
| 慢命令排查 | `SLOWLOG` + `LATENCY` | 找出阻塞事件循环的命令 |
| 大量短连接 | 用连接池减少 accept 开销 | 短连接频繁注册/删除事件 |

## 深挖追问

### 1. epoll 为什么比 select 快？

select 每次调用要把全部 fd 集合拷贝到内核，内核线性扫描所有 fd 检查就绪，返回后用户态还要再线性扫描一遍找出就绪的 fd，复杂度 O(N)，且最大连接数受限（FD_SETSIZE 默认 1024）。epoll 用红黑树管理注册的 fd，注册/删除是 O(logN)；就绪事件通过回调自动加入就绪链表，`epoll_wait` 只需把就绪链表拷贝出来，复杂度 O(就绪事件数)，不依赖总连接数。

### 2. Redis 为什么不用 ET（边缘触发）？

ET 模式下事件只通知一次，应用必须一次性读完所有数据，否则下次不会再通知。Redis 是单线程，一次性读大量数据会阻塞事件循环，影响其他客户端。LT 模式下只要缓冲区有数据就一直通知，Redis 可以分多次读，每次读固定字节数，保证事件循环不被卡住。Netty 默认也是 LT。

### 3. 一个客户端的命令是并发执行还是串行？

串行。Redis 主线程从某个客户端 socket 读到命令后，在 `processCommand` 中执行完才处理下一个事件。不同客户端的命令也按事件到达顺序串行执行，所以 Redis 命令天然原子，不需要加锁。

### 4. epoll_wait 阻塞期间，新来的命令怎么办？

`epoll_wait` 不会真正无限阻塞。Redis 计算下一个时间事件的到期时间作为 timeout，确保 `serverCron` 等周期任务能按时执行（默认每 100ms 一次）。新命令到达时，网卡中断把数据放到 socket 接收队列，内核把 fd 加入就绪链表，`epoll_wait` 立即返回。所以新命令的延迟约等于一次 epoll_wait 的唤醒时间，通常微秒级。

### 5. 多线程 IO 开启后，命令执行为什么还是单线程？

如果命令也多线程执行，操作共享数据结构（Hash 表、跳表）要加锁，锁竞争可能比单线程还慢。Redis 的数据结构没有设计细粒度锁，改成多线程执行要重写核心代码，收益不明确。6.0 的多线程 IO 只是把网络 IO 并行化（read/write 不操作数据结构），命令执行仍单线程保证原子性。

### 6. Redis 单线程能扛多少连接？

理论上 epoll 支持百万连接，Redis `maxclients` 默认 10000，受系统 `ulimit -n` 限制。但实际上 QPS 才是瓶颈——单核 CPU 一秒最多处理 10 万+ 简单命令，连接数再多也受这个上限。大量空闲连接不会拖慢 Redis（epoll 不遍历空闲 fd），但占内存（每个 client 对象几 KB）。

## 易错点

- 把 IO 多路复用等同于 epoll——Redis 在不同平台用不同的库，Linux 才是 epoll。
- 以为开了 `io-threads` 命令就多线程执行——只有 IO 读写多线程，命令仍单线程。
- `io-threads` 设太大反而变慢——IO 线程和主线程争抢 CPU，4 核机器设 4 即可。
- `io-threads-do-reads` 默认 no，只对写多线程化——读多线程要显式开启，且只在 QPS 很高时才有收益。
- 以为 epoll 是 Redis 发明的——epoll 是 Linux 内核机制，Redis 只是封装使用。

## 总结

Redis 通过 IO 多路复用让单线程同时管理大量连接，Linux 上用 epoll（红黑树+就绪链表，O(1) 取事件），Redis 在 ae.c 里封装成统一的 `aeEventLoop` 事件循环：注册事件 → `epoll_wait` 等待 → 分发到回调。三类回调（连接、读、写）覆盖了网络交互的全流程。epoll 相比 select/poll 的核心优势是不依赖连接数、支持百万连接。Redis 6.0+ 把 socket 读写放到 IO 线程并行化，但 epoll 监听和命令执行仍在主线程，保证命令原子性。理解 IO 多路复用是搞懂 Redis 单线程高并发的关键。

## 参考资料

- [Redis 事件循环源码 ae.c](https://github.com/redis/redis/blob/unstable/src/ae.c)
- [Redis ae_epoll.c 封装](https://github.com/redis/redis/blob/unstable/src/ae_epoll.c)
- [Linux epoll man page](https://man7.org/linux/man-pages/man7/epoll.7.html)
- [Redis 6.0 多线程 IO 发布说明](https://github.com/redis/redis/blob/6.0/00-RELEASENOTES)
