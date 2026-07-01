# Redis 是单线程吗

## 核心概念

"Redis 是单线程"是个常见但不够准确的说法。准确的说法是：Redis 的命令执行主流程是单线程的——接受客户端请求、解析、执行命令、返回结果这一串都在主线程里完成。但 Redis 进程本身不是单线程，它有多个后台线程处理耗时任务，6.0 之后还引入了多线程 IO。

之所以"命令执行单线程"是因为 Redis 数据全在内存，命令执行本身就是微秒级，瓶颈不在 CPU 多核，而在网络 IO 和内存带宽。单线程还避免了锁竞争和上下文切换，简化了实现。要用上多核 CPU，可以一台机器部署多个 Redis 实例或用 Cluster 分片。

理解 Redis 的"单线程"要看三个层次：核心命令执行线程（单）、后台 BIO 线程（多）、6.0+ 的 IO 线程（多）。把这三层讲清楚才算真懂 Redis 线程模型。

## 标准回答

Redis 的"单线程"指命令执行主流程单线程，不是说 Redis 进程只有一个线程。Redis 启动时除了主线程，还有多个后台线程：2.6+ 的 `bio_close_file`、`bio_aof_fsync`，4.0+ 的 `bio_lazy_free`，6.0+ 的 IO 线程 `io_thd_*`。RDB 持久化和 AOF 重写用 `fork` 子进程而非线程，利用写时复制避免锁。命令执行单线程是为了避免锁竞争、简化实现，瓶颈在内存和网络而非 CPU 多核。

要点：

1. 主线程：单线程处理客户端连接、命令解析、执行、返回。
2. 后台线程：`bio_close_file`、`bio_aof_fsync`（2.6+），`bio_lazy_free`（4.0+）。
3. IO 线程：6.0+ 引入，处理 socket 读写，命令执行仍单线程。
4. 子进程：RDB 和 AOF 重写用 `fork` 子进程，不用子线程。
5. 6.0+ 启动时默认有 6 个非主线程：3 个 BIO + 3 个 IO（io-threads=4 时）。

## 实现原理

### Redis 线程全景

```text
Redis 6.0+ 进程内的线程：

主线程（redis-server）
  - 接受客户端连接
  - 解析命令
  - 执行命令（操作内存数据结构）
  - 返回结果
  - 处理过期 key、内存淘汰等

后台线程（BIO, Background IO）
  - bio_close_file：异步关闭文件描述符（AOF 重写后的旧文件）
  - bio_aof_fsync：异步 fsync AOF 文件（everysec 策略）
  - bio_lazy_free：异步释放大 Key 内存（UNLINK、lazyfree-* 配置）

IO 线程（6.0+，可选）
  - io_thd_1, io_thd_2, io_thd_3...
  - 处理 socket 读、写
  - 不执行命令，命令仍在主线程执行

子进程（不是线程）
  - bgsave 子进程：RDB 快照
  - bgrewriteaof 子进程：AOF 重写
```

### 为什么命令执行用单线程

```text
1. 瓶颈不在 CPU
   Redis 数据全在内存，单条命令微秒级
   单核 CPU 一秒能执行 10 万+ 命令
   瓶颈是网络 IO 和内存带宽，多核 CPU 帮不上忙

2. 避免锁竞争
   多线程操作共享数据结构要加锁
   锁竞争、上下文切换的开销可能比单线程还慢
   Hash 表、跳表等数据结构的细粒度锁实现复杂

3. 简化实现
   单线程模型无并发问题，代码简单
   命令天然原子，不用考虑事务隔离
   调试、排查问题容易

4. 维护性强
   多线程引入执行顺序不确定性
   并发读写、死锁等问题增加复杂度
```

### 后台线程存在的意义

主线程不能阻塞，所以耗时任务要交给后台线程：

```text
bio_close_file：
  AOF 重写完成后要关闭旧 AOF 文件
  close() 在某些情况下会触发同步刷盘，阻塞调用者
  交给后台线程避免主线程阻塞

bio_aof_fsync：
  AOF everysec 策略下每秒 fsync 一次
  fsync 是同步磁盘操作，可能耗时几十毫秒到几秒
  交给后台线程，主线程只 write() 到内核缓冲区

bio_lazy_free：
  删除大 Key（如百万元素的 List）时
  释放内存可能耗时几秒
  UNLINK 命令把释放工作交给后台线程
  主线程只清除引用，立即返回
```

后台线程工作机制：

```text
主线程把任务投递到对应类型的队列
后台线程循环检查队列
有任务就取出执行
无任务就等待（pthread_cond_wait）

3 种队列：
  bio_jobs[BIO_NUM_OPS]  // 每种类型一个队列
  bio_mutex[BIO_NUM_OPS] // 每种类型一个锁
  bio_step_cond          // 等待条件变量
```

### 6.0+ 多线程 IO

```text
背景：
  Redis 5.x 单线程 IO，主线程同时处理：
  - accept 连接
  - read socket
  - parse 命令
  - execute 命令
  - write socket
  网络硬件升级后，IO 成为瓶颈

6.0+ 引入多线程 IO：
  主线程：accept 连接、parse 命令、execute 命令
  IO 线程：read socket、write socket

  数据流：
  1. 主线程 epoll_wait 收到读事件
  2. 主线程把客户端分配给 IO 线程
  3. IO 线程 read socket 到客户端缓冲区
  4. 主线程 parse + execute 命令
  5. 主线程把响应分配给 IO 线程
  6. IO 线程 write socket 发送响应

  关键约束：命令执行仍单线程，保证原子性和无锁
```

### 为什么持久化用子进程不用子线程

```text
1. 写时复制
   fork() 子进程时，父子进程共享物理内存（只读）
   父进程修改时内核才复制对应页
   子进程相当于拥有 fork 瞬间的数据快照
   天然适合"拍快照"

   子线程共享内存，要修改就得加锁
   锁竞争会拖慢主线程

2. 隔离性
   子进程崩溃不影响主进程
   子线程崩溃可能拖垮整个 Redis 进程

3. 数据一致性
   子进程持有快照，写到 RDB 文件
   主进程继续接收写入
   互不干扰

4. CPU 不争用
   子进程是独立调度单位
   可以被调度到不同 CPU 核
```

### Redis 版本线程演进

| 版本 | 线程模型 | 后台线程 | IO 模型 |
|------|----------|----------|---------|
| 2.6 | 主线程单 + 2 BIO | close_file, aof_fsync | 单线程 IO |
| 4.0 | 主线程单 + 3 BIO | + lazy_free | 单线程 IO |
| 6.0 | 主线程单 + 3 BIO + N IO | 同上 | 多线程 IO（可选） |
| 7.0 | 同 6.0 | 同上 | 多线程 IO 更稳定 |

### 6.0 默认线程数

```text
io-threads 4 (默认 1，即禁用)
  - 主线程 + 3 个 IO 线程
  - 仅对写生效（发送响应）
  - io-threads-do-reads yes 才对读生效

启动后线程列表（io-threads=4 时）：
  redis-server          主线程
  bio_close_file        关闭文件
  bio_aof_fsync         AOF fsync
  bio_lazy_free         释放内存
  io_thd_1              IO 线程 1
  io_thd_2              IO 线程 2
  io_thd_3              IO 线程 3
  共 1 主 + 3 BIO + 3 IO = 7 个线程
```

## 代码示例

### 查看线程

```bash
# 查看 Redis 进程的所有线程
ps -T -p $(pgrep redis-server)

# 输出示例（6.0+ 开启 io-threads=4）：
#   PID  SPID TTY      TIME CMD
#  1234  1234 ?      00:00:01 redis-server
#  1234  1235 ?      00:00:00 bio_close_file
#  1234  1236 ?      00:00:00 bio_aof_fsync
#  1234  1237 ?      00:00:00 bio_lazy_free
#  1234  1238 ?      00:00:00 io_thd_1
#  1234  1239 ?      00:00:00 io_thd_2
#  1234  1240 ?      00:00:00 io_thd_3

# 查看主线程 CPU 使用
top -H -p $(pgrep redis-server)
```

### 开启多线程 IO

```conf
# redis.conf
io-threads 4
io-threads-do-reads yes
```

```bash
# 在线开启
redis-cli CONFIG SET io-threads 4
redis-cli CONFIG SET io-threads-do-reads yes
```

### 验证 UNLINK 异步释放

```bash
# 准备一个百万元素的 List
redis-cli DEBUG POPULATE 1000000 testlist list

# 错误：DEL 同步删除，阻塞主线程几秒
time redis-cli DEL testlist

# 正确：UNLINK 异步删除，立即返回
time redis-cli UNLINK testlist

# 查看 lazyfree 队列
redis-cli INFO lazyfree
# lazyfree_pending_objects: 0  (等待后台线程释放的对象数)
```

### 配置 lazyfree 自动异步

```conf
# 内存淘汰时异步释放
lazyfree-lazy-eviction yes

# 过期 key 删除时异步释放
lazyfree-lazy-expire yes

# DEL 命令等同于 UNLINK
lazyfree-lazy-server-del yes

# 主从同步时异步释放旧数据
replica-lazy-flush yes
```

## 实战场景

| 场景 | 配置 | 说明 |
|------|------|------|
| 默认部署 | 主线程单 + 3 BIO | 适用大多数场景 |
| 网络密集型 | + io-threads 4 | QPS 提升 30%-100% |
| 大 Key 频繁 | + lazyfree 系列 | 避免删除阻塞 |
| 多核利用 | 单机多实例 | 每实例绑核，无锁干扰 |
| 大规模扩展 | Cluster 分片 | 跨实例扩展写能力 |

## 深挖追问

### 1. 单线程为什么还快？

四个原因：数据全在内存（纳秒级访问）、IO 多路复用（一个线程处理大量连接）、单线程避免锁竞争和上下文切换、高效数据结构（Hash 表、跳表、压缩列表）。瓶颈在内存和网络，不在 CPU 多核。

### 2. 6.0 多线程 IO 后还要注意什么？

命令执行仍单线程，慢命令仍会阻塞。`KEYS *`、`LRANGE bigkey 0 -1`、复杂 Lua 脚本等仍会让主线程卡住。多线程 IO 只解决 socket 读写瓶颈，不解决命令执行瓶颈。

### 3. io-threads 设多少合适？

CPU 核数的 1/2 到 3/4。4 核机器设 2-3，8 核设 4-6。设太多会和主线程争抢 CPU，反而变慢。`io-threads-do-reads` 在 QPS 不是特别高时不建议开启，读多线程会增加同步开销。

### 4. UNLINK 比 DEL 好在哪？

`DEL` 同步释放内存，主线程负责整个释放过程，大 Key 释放几秒到几十秒。`UNLINK` 主线程只做引用清零和从字典移除（O(1)），实际释放交给 `bio_lazy_free` 后台线程。代价是内存实际释放有延迟。

### 5. 为什么不用多线程执行命令？

主要是数据结构锁的复杂度。Redis 的核心数据结构（Hash、List、ZSet）没有设计细粒度锁，多线程访问要全局锁或重写数据结构。命令执行本身是微秒级，加锁开销可能比单线程还慢。Redis 选择了"单线程执行 + 多核用多实例/Cluster 扩展"的方案。

## 易错点

- 把"单线程"理解为 Redis 没有后台线程，实际有 3 个 BIO + N 个 IO 线程。
- 以为开了 io-threads 命令就多线程执行，实际只有 IO 多线程，命令仍单线程。
- 用 `DEL` 删大 Key 阻塞主线程几秒，应该用 `UNLINK`。
- 以为单线程就是性能差，实际 Redis 单核 10 万 QPS 远超多数数据库。
- 在单机部署一个 Redis 实例浪费多核 CPU，应该多实例或 Cluster 利用多核。

## 总结

Redis 的"单线程"特指命令执行主流程单线程，进程本身有 3 个 BIO 后台线程（close_file、aof_fsync、lazy_free）和 6.0+ 的 IO 线程。命令执行单线程是为了避免锁竞争、简化实现，瓶颈在内存和网络而非 CPU 多核。RDB 和 AOF 重写用 fork 子进程而非线程，利用写时复制实现快照。理解 Redis 线程模型要分清三层：核心命令主线程（单）、BIO 后台线程（多）、6.0+ IO 线程（多）。要用多核 CPU，单机部署多实例或用 Cluster 分片。

## 参考资料

- [Redis 内部机制官方文档](https://redis.io/docs/management/optimization/latency/)
- [Redis 6.0 多线程 IO 发布说明](https://github.com/redis/redis/blob/6.0/00-RELEASENOTES)
- [Redis 线程模型 FAQ](https://redis.io/docs/get-started/faq/)
