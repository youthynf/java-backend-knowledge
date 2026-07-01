# Redis 为什么单线程还快

## 核心概念

单线程听起来和"快"矛盾，但 Redis 单线程能跑到 10 万+ QPS。原因是 Redis 的瓶颈不在 CPU，而在内存访问和网络 IO，单线程足够发挥硬件能力。Redis 官方基准测试单实例吞吐量可达 10 万/秒。

快的原因可以归纳为四个：完全基于内存、高效数据结构、IO 多路复用、单线程避免锁竞争。前两个让单条命令执行快，后两个让单线程能高效处理大量并发连接。

6.0 之后引入多线程 IO，是因为千兆/万兆网卡普及后，网络 IO 成了新瓶颈。但命令执行仍是单线程——这不是 Redis 不想多线程，而是多线程执行命令的复杂度和收益不匹配。

## 标准回答

Redis 单线程还快的四个原因：(1) 完全基于内存，访问纳秒级；(2) 高效数据结构（Hash 表、跳表、压缩列表等）；(3) IO 多路复用（epoll），一个线程处理大量连接；(4) 单线程避免锁竞争和上下文切换。瓶颈在内存和网络而非 CPU 多核。6.0+ 引入多线程 IO 解决网络瓶颈，但命令执行仍单线程。要用多核 CPU，单机部署多实例或用 Cluster 分片。

要点：

1. 内存操作纳秒级，比磁盘快 10 万倍。
2. 数据结构针对场景优化：String 用 SDS、Hash 用 ziplist/listpack、ZSet 用跳表。
3. epoll 让单线程监控海量 socket，事件驱动避免忙等。
4. 单线程无锁、无上下文切换，CPU 利用率高。
5. 6.0+ 多线程 IO 把 socket 读写并行化，QPS 提升 30%-100%。

## 实现原理

### 快的四大支柱

```text
1. 完全基于内存
   所有数据存内存，访问时间 ~100ns
   磁盘访问 ~10ms，差 10 万倍
   Redis 单条命令执行时间 = 内存访问 + 数据结构操作 + 命令解析
   通常 < 1 微秒

2. 高效数据结构
   每种类型用最适合的结构：
   - String: SDS（动态字符串，O(1) 取长度）
   - Hash: ziplist（小数据）/ listpack（7.0+）/ hashtable
   - List: quicklist（双向链表 + ziplist 节点）
   - Set: intset（纯整数）/ hashtable
   - ZSet: listpack（小）/ skiplist + hashtable（大）
   命令复杂度大多是 O(1) 或 O(logN)

3. IO 多路复用
   一个线程通过 epoll 同时监控多个 socket
   哪个 socket 有事件就处理哪个
   不会因为某个连接空闲而浪费 CPU
   单线程也能处理 10 万+ 并发连接

4. 单线程避免锁
   多线程操作共享数据要加锁
   锁竞争、上下文切换消耗 CPU
   单线程无锁，CPU 全用于业务
   命令天然原子，不需要事务隔离机制
```

### 单条命令的执行路径

```text
客户端发送 SET key value
  |
  v
网卡接收数据 -> 内核协议栈 -> socket 接收队列
  |
  v
epoll_wait 返回读事件
  |
  v
主线程 read(socket, buf)             <- 内存拷贝
  |
  v
解析 RESP 协议：*3\r\n$3\r\nSET\r\n...
  |
  v
查找命令表，定位 setCommand
  |
  v
执行 setCommand：
  - 查找 key 对应的 dictEntry         <- 内存访问 O(1)
  - 设置 SDS value                     <- 内存操作
  - 更新 LRU 时钟
  |
  v
写响应 +OK\r\n 到客户端发送缓冲区
  |
  v
主线程 write(socket, buf)             <- 内存拷贝
  |
  v
内核协议栈 -> 网卡发送

总耗时：约 1-10 微秒（局域网）
```

### 为什么不用多线程执行命令

```text
理论上多线程能利用多核 CPU，但实际：

1. 数据结构锁复杂度
   Redis 的 Hash 表、跳表没有细粒度锁
   多线程访问要全局锁
   锁竞争可能比单线程更慢

2. 命令本身快
   单条命令微秒级
   加锁、上下文切换开销可能比命令执行还长

3. CPU 不是瓶颈
   单核 10 万 QPS 已经够用
   网络带宽先到瓶颈（千兆 ≈ 100MB/s）

4. 实现简单
   单线程无并发问题
   命令天然原子
   调试、维护容易

5. 多核利用方式
   一台机器部署多个 Redis 实例
   每实例绑一个核
   实例间无锁干扰
   或者用 Cluster 分片
```

### 6.0 多线程 IO 的引入

```text
背景：
  Redis 5.x 单线程 IO，主线程做：
  - epoll_wait
  - accept
  - read
  - parse
  - execute
  - write

  网卡从千兆升级到万兆后
  IO 读写占主线程 50%+ 时间
  命令执行反而只占 30%
  IO 成为瓶颈

6.0 解法：
  IO 线程负责 read 和 write
  主线程负责 parse 和 execute

  时间线（4 线程）：
  T1: 主线程 epoll_wait，收到 100 个读事件
  T2: 主线程分配 100 个连接给 4 个 IO 线程
  T3: IO 线程并行 read，主线程同时 parse 已读的
  T4: 主线程 execute 命令
  T5: 主线程分配响应给 IO 线程
  T6: IO 线程并行 write

  关键：命令执行仍单线程，避免锁
        IO 并行化让网络不再瓶颈
```

### Redis 与其他存储的性能对比

| 系统 | 单机 QPS（简单读） | 瓶颈 | 原因 |
|------|---------------------|------|------|
| Redis | 10 万+ | 网络、内存 | 内存 + 单线程无锁 |
| Memcached | 10 万+ | 网络、内存 | 内存 + 多线程无锁 |
| MySQL | 1-5 万 | 磁盘、锁 | 磁盘 + 事务 + SQL 解析 |
| MongoDB | 1-3 万 | 磁盘、锁 | 磁盘 + 文档模型 |
| etcd | 1-3 万 | Raft 共识 | 强一致同步复制 |

### Redis 各版本性能演进

| 版本 | 关键改进 | QPS 提升 |
|------|----------|----------|
| 2.6 | 基础单线程 + epoll | 基准 |
| 3.0 | Cluster 分片 | 单机不变，集群 N 倍 |
| 4.0 | lazyfree 后台释放 | 大 Key 删除不阻塞 |
| 5.0 | Stream 数据结构 | 新增场景 |
| 6.0 | 多线程 IO | 30%-100% |
| 7.0 | listpack 替换 ziplist | 内存和性能提升 |
| 7.4 | 函数式脚本 | Lua 优化 |

## 代码示例

### 官方基准测试

```bash
# 标准基准测试
redis-benchmark -h 127.0.0.1 -p 6379 -t get,set -n 1000000 -c 200 -d 100 -q

# 输出示例（局域网，单核 4G 内存）：
# SET: 110236.84 requests per second
# GET: 116550.12 requests per second

# 不同 value 大小
redis-benchmark -t set -n 100000 -c 50 -d 100 -q      # 100 字节
redis-benchmark -t set -n 100000 -c 50 -d 1024 -q     # 1KB
redis-benchmark -t set -n 100000 -c 50 -d 10240 -q    # 10KB
redis-benchmark -t set -n 100000 -c 50 -d 102400 -q   # 100KB

# Pipeline 测试
redis-benchmark -t set -n 100000 -c 50 -P 16 -q       # 16 命令批处理
```

### 6.0+ 开启多线程 IO

```conf
# redis.conf
io-threads 4
io-threads-do-reads yes
```

```bash
# 对比测试
redis-cli CONFIG SET io-threads 1   # 关闭多线程 IO
redis-benchmark -t get,set -n 1000000 -c 200 -q

redis-cli CONFIG SET io-threads 4   # 开启 4 线程 IO
redis-benchmark -t get,set -n 1000000 -c 200 -q

# 通常网络密集场景 QPS 提升 30%-100%
```

### 多实例部署利用多核

```bash
# 4 核机器部署 4 个 Redis 实例
# 实例 1：端口 6379，绑核 0
redis-server --port 6379 --cpu-affinity 0x01

# 实例 2：端口 6380，绑核 1
redis-server --port 6380 --cpu-affinity 0x02

# 实例 3：端口 6381，绑核 2
redis-server --port 6381 --cpu-affinity 0x04

# 实例 4：端口 6382，绑核 3
redis-server --port 6382 --cpu-affinity 0x08

# 4 实例总 QPS 可达 40 万，远超单实例
```

### Pipeline 提升单线程吞吐

```java
// 错误：每条命令一次网络往返
Jedis jedis = new Jedis("localhost");
for (int i = 0; i < 1000; i++) {
    jedis.set("key" + i, "value" + i);  // 1000 次 RTT
}
// 耗时约 1000 * 0.5ms = 500ms

// 正确：Pipeline 批处理
Pipeline pipe = jedis.pipelined();
for (int i = 0; i < 1000; i++) {
    pipe.set("key" + i, "value" + i);
}
pipe.sync();
// 耗时约 1 次 RTT + 命令执行时间 = 几毫秒
```

## 实战场景

| 场景 | 推荐配置 | 说明 |
|------|----------|------|
| 普通缓存 | 默认单线程 | 简单可靠 |
| 高 QPS 网络 | io-threads 4 | 充分利用网卡 |
| 大 Key 频繁 | lazyfree 系列 | 删除不阻塞 |
| 多核机器 | 多实例绑核 | 不浪费 CPU |
| 极致扩展 | Cluster 分片 | 跨实例扩展 |
| 批量写入 | Pipeline | 减少网络往返 |

## 深挖追问

### 1. 单线程不会浪费多核 CPU 吗？

会，但 Redis 不试图用多线程解决。推荐做法是一台机器部署多个 Redis 实例，每实例绑一个核，互不干扰。或者用 Cluster 跨实例分片。这样既利用了多核，又保持单实例的无锁优势。

### 2. Redis 多线程 IO 后还会慢吗？

仍可能慢，瓶颈转移了。原来网络 IO 是瓶颈，6.0+ 让 IO 并行化后，瓶颈变成命令执行（仍单线程）。慢命令、大 Key、复杂 Lua 脚本仍会拖慢主线程。多线程 IO 只解决网络瓶颈。

### 3. 为什么 Redis 不直接用 Netty 这种成熟网络框架？

Redis 是 C 写的，没有直接用 Java 框架。它自己实现了简洁的事件循环 + epoll 封装，针对自身场景优化。Netty 适合 Java 生态，Redis 不需要它的复杂特性。

### 4. 单线程的 Redis 怎么处理并发请求？

通过 IO 多路复用 + 事件循环。多个客户端连接的 socket 都在 epoll 监听队列里，主线程循环 epoll_wait 等待事件，有事件就处理。所有命令按到达顺序排队执行，没有真正的"并发执行"，但因为每条命令微秒级，宏观上像并发。

### 5. Redis 6.0 多线程 IO 默认开启吗？

默认关闭。`io-threads` 默认 1（即禁用），需要手动设为 2+。`io-threads-do-reads` 默认 no，即默认只对写（发送响应）多线程化，读仍单线程。生产环境高 QPS 场景建议开启 `io-threads 4`。

## 易错点

- 以为单线程就是慢，实际 Redis 单核 10 万 QPS。
- 以为开了多线程 IO 命令就并行执行，实际只有 IO 并行。
- 在单机部署一个 Redis 实例浪费多核，应该多实例或 Cluster。
- 用 Pipeline 时忘记 sync，命令不会真正发送。
- 大量短连接让 Redis 频繁 accept，影响性能；应该用长连接 + 连接池。

## 总结

Redis 单线程还快是因为：完全基于内存（纳秒级访问）、高效数据结构（O(1)/O(logN) 居多）、IO 多路复用（一个线程处理海量连接）、单线程避免锁竞争。瓶颈在内存和网络而非 CPU 多核。6.0+ 引入多线程 IO 解决网络瓶颈，但命令执行仍单线程——多线程执行命令的复杂度和收益不匹配。要用多核 CPU，推荐单机多实例绑核或 Cluster 分片。理解 Redis 的快要从硬件、数据结构、网络、并发模型四个维度看，而不是只看"单线程"这个标签。

## 参考资料

- [Redis 性能优化官方文档](https://redis.io/docs/management/optimization/)
- [Redis Benchmark 官方数据](https://redis.io/docs/management/optimization/benchmarks/)
- [Redis 6.0 多线程 IO 发布说明](https://github.com/redis/redis/blob/6.0/00-RELEASENOTES)
