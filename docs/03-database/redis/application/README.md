# Redis 应用场景

本目录覆盖 Redis 除了基础缓存之外的工程应用：分布式锁、客户端选型、延迟队列、布隆过滤器、Pipeline、大 key/热 key 治理、综合应用。

## 目录

### 分布式锁与客户端

- [Redis 如何实现分布式锁](Redis如何实现分布式锁？.md) — SET NX PX + Lua 释放、看门狗续期、Redlock 争议、Redisson 实现
- [Redisson 和 Jedis 有什么区别](Redisson和Jedis有什么区别？.md) — 轻量客户端 vs 分布式中间件，含 Lettuce 对比

### 队列与过滤

- [Redis 如何实现延迟队列](Redis如何实现延迟队列？.md) — ZSet / Keyspace Notification / Stream / Redisson 对比
- [Redis 布隆过滤器如何使用](Redis布隆过滤器如何使用？.md) — 原理、误判率、RedisBloom 模块、Redisson 用法、Cuckoo Filter

### 性能优化

- [Redis 管道有什么作用](Redis管道有什么作用？.md) — 减少 RTT，与 MULTI/EXEC/Lua 的区别、Cluster 自动分组
- [Redis 的大 key 问题如何处理](Redis的大key问题如何处理？.md) — 发现/拆分/异步删除，lazyfree 配置、rdb-tools 分析
- [如何解决 Redis 热 Key 问题](如何解决Redis热Key问题？.md) — 读写分离/副本拆分/本地缓存/限流、京东 hotkey 框架

### 综合应用

- [Redis 除了缓存还有哪些应用](Redis除了缓存还有哪些应用？.md) — 计数器/排行榜/限流/消息队列/位图/HyperLogLog/GEO

## 阅读建议

1. 分布式锁是面试高频，必读"Redis 如何实现分布式锁"，注意 SETNX+EXPIRE 非原子坑；
2. Redisson 是生产首选客户端，理解它和 Jedis、Lettuce 的区别；
3. 延迟队列、布隆过滤器是 Redis 多元应用的代表，体现"用对数据结构"的工程思维；
4. 大 key/热 key 是生产事故的两大根源，掌握发现与治理方案；
5. Pipeline 是性能优化利器，但要清楚它不保证原子性。

## 核心结论

Redis 是多面手，远不止缓存。**关键在于用对数据结构**：String 做计数、ZSet 做排行、Bitmap 做签到、HyperLogLog 做 UV、GEO 做位置、Stream 做队列。生产实践注意避开 SETNX+EXPIRE 非原子、误删他人锁、大 key 阻塞、热 key 倾斜等经典坑。
