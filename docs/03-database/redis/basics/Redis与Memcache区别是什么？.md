# Redis 与 Memcache 区别是什么

## 核心概念

Redis 和 Memcache（Memcached）都是基于内存的 KV 缓存系统，定位相似，但设计哲学完全不同。Memcache 出生于 2003 年 Brad Fitzpatrick 为 LiveJournal 写的缓存层，专注做一件事：把内存当缓存用，简单、极致、单机吞吐稳定。Redis 2009 年由 Salvatore Sanfilippo（antirez）开发，定位是"数据结构服务器"——除了缓存，还能做计数器、排行榜、消息队列、分布式锁、流式计算等业务逻辑。

一句话总结：**Memcache 是"纯缓存"，Redis 是"数据结构数据库 + 缓存"**。Memcache 把 value 当作一段不透明的字节流，应用层自己序列化；Redis 把 value 当作有结构的数据（List/Hash/Set/ZSet/Stream），服务端能直接操作单个字段。这一差异决定了两者的能力边界。

## 标准回答

| 维度 | Memcache | Redis |
|------|----------|-------|
| 数据类型 | 仅字符串 KV，value 是不透明字节流 | String/List/Hash/Set/Zset/Bitmap/HLL/GEO/Stream 等 |
| 持久化 | 不支持，重启即丢 | RDB + AOF + 混合持久化 |
| 集群 | 无原生集群，靠客户端一致性哈希分片 | 主从、哨兵、Cluster 原生支持 |
| 单 value 上限 | 默认 1MB（可调至最大 1MB，受 `-I` 参数控制） | String 512MB；List/Set/Hash 单元素可达 2^32-1 |
| 网络模型 | 多线程 + libevent 事件库 | 主线程单线程命令执行（6.0 起 IO 多线程，命令仍串行） |
| 过期策略 | 惰性删除 | 惰性 + 定期删除 |
| 内存淘汰 | LRU（按 slab class） | LRU/LFU/random/TTL/noeviction 等八种策略 |
| 内存管理 | slab allocation（定长 chunk） | jemalloc（按需分配，会有碎片） |
| 事务/Lua/Pub/Sub | 不支持 | MULTI/EXEC、Lua、Pub/Sub、Modules |
| CAS 乐观锁 | 原生支持（`gets`/`cas`） | WATCH/MULTI/EXEC 模拟 |
| 典型场景 | 纯 KV 高吞吐缓存、Session 共享 | 缓存 + 数据结构业务 + 简单消息队列 + 分布式锁 |

面试一句话：**Memcache 简单粗暴跑得快但只会缓存，Redis 复杂全能既能当缓存又能撑起业务逻辑**。

## 详细机制

### 1. 数据类型差异的本质

Memcache 只认 key-value，value 是一段字节流，应用层自己序列化/反序列化。存一个用户对象，每次更新单个字段都要把整个对象拉出来、反序列化、改字段、序列化、写回——这就是 read-modify-write 全量操作。

Redis 原生支持 Hash，可以用 `HSET user:1 name alice` 只改一个字段，服务端直接定位 field 修改，无需传输整个对象。Set 支持集合运算做"共同好友"，ZSet 支持排行榜，List 支持队列，Stream 支持消费组——这些都是 Memcache 无法直接完成的业务逻辑。

### 2. 持久化能力的差异

Memcache 设计上就拒绝持久化。作者认为"缓存就该是临时的"，数据丢了能从 DB 重建才是缓存正确姿势。这种纯粹在某种程度上是优点：避免持久化带来的复杂性、fork 开销、磁盘 IO。

Redis 提供 RDB（快照）和 AOF（追加日志）两种持久化，并支持混合持久化（RDB 做主体 + AOF 增量）。这让 Redis 可以承担"数据不能丢"的角色，比如订单状态、消息流、配置中心。代价是持久化会带来 fork 开销、磁盘 IO、AOF 重写等复杂问题。

### 3. 集群与高可用

Memcache 没有原生集群。一致性哈希分片靠客户端实现（如 spymemcached、XMemcache、Enyim），节点故障后那一份缓存数据就丢了，需要业务从 DB 重建。

Redis 提供：
- **主从复制**：读写分离、数据热备，主库异步复制到从库
- **哨兵 Sentinel**：监控主从健康，自动故障转移
- **Cluster**：16384 槽位分片 + 多主多从 + 自动 failover，去中心化架构

### 4. 线程模型差异

Memcache 采用多线程模型，主线程 accept 连接，工作线程处理请求，依赖 libevent 事件库。CPU 多核利用更充分，单机吞吐能到 50w+ QPS。

Redis 历史演进：
- **Redis 4.x 及之前**：纯单线程，命令解析和执行都在主线程，依赖 IO 多路复用（epoll）
- **Redis 6.0+**：引入 IO 多线程处理网络读写和协议解析，命令执行仍在主线程串行
- 这种设计简化了并发控制，避免了数据结构层面的锁，让 Redis 的数据结构实现非常简洁

> Redis 单线程不等于慢。纯内存操作 + IO 多路复用 + 数据结构精简 + 无锁，单机典型 10w QPS。但极致高吞吐（百万 QPS）场景下 Memcache 多线程仍有优势。

### 5. 内存管理

Memcache 采用 slab allocation：把内存按 chunk 大小分类（slab class），相同大小的 item 进同一个 slab。优点是几乎无碎片，缺点是定长导致空间浪费，且不能跨 slab 借用。

Redis 用 jemalloc（默认）分配内存，按需申请。会有碎片，但更灵活。`INFO memory` 中的 `mem_fragmentation_ratio` 大于 1.5 时通常需要关注。Redis 4.0+ 支持 `activedefrag yes` 主动碎片整理。

### 6. 过期与淘汰

| 机制 | Memcache | Redis |
|------|----------|-------|
| 过期删除 | 惰性删除（访问时检查）+ LRU 淘汰 | 惰性 + 定期删除（每 100ms 抽样） |
| 淘汰策略 | LRU（slab 内部 LRU 链表） | noeviction / allkeys-lru / allkeys-lfu / allkeys-random / volatile-lru / volatile-lfu / volatile-random / volatile-ttl 共 8 种 |
| 淘汰粒度 | slab class 级别 | 全局或带过期 key 范围 |

## 代码示例

Memcache 多线程下的纯 KV 缓存（Spymemcached 客户端）：

```java
MemcachedClient client = new MemcachedClient(
    AddrUtil.getAddresses("10.0.0.5:11211 10.0.0.6:11211"));

// 写入（默认 30 分钟过期）
client.set("user:1", 1800, jsonBytes);

// 读取
Object raw = client.get("user:1");
byte[] bytes = (byte[]) raw;
User user = JSON.parseObject(bytes, User.class);

// CAS 乐观锁更新
CASValue<Object> cas = client.gets("counter");
long newValue = ((Number) cas.getValue()).longValue() + 1;
client.cas("counter", cas.getCas(), newValue);
```

Redis 同等场景：

```java
// 简单 KV
redisTemplate.opsForValue().set("user:1", json, 30, TimeUnit.MINUTES);

// Hash 局部更新（Memcache 做不到）
redisTemplate.opsForHash().put("user:1", "name", "alice");

// 计数器（INCR 原子，无需 CAS）
redisTemplate.opsForValue().increment("counter");

// ZSet 排行榜（Memcache 完全不支持）
redisTemplate.opsForZSet().add("rank:game", "player:1", 1000);
```

## 实战场景

| 场景 | 选 Memcache 还是 Redis | 理由 |
|------|------------------------|------|
| 用户会话缓存 | 都可以，看团队栈 | Memcache 多线程更省心；Redis 有过期事件可联动 |
| 商品详情缓存 | Redis | Hash 局部更新比 JSON 整存整取更高效 |
| 排行榜/热搜 | Redis | ZSet 原生支持排序 |
| 分布式锁 | Redis | `SET NX EX` + Lua，Memcache CAS 不便 |
| 简单消息队列 | Redis Stream | Memcache 完全不支持 |
| 共同好友 | Redis | Set 集合运算 |
| 纯 KV 巨大吞吐缓存 | Memcache | 多线程 + slab 在简单场景下吞吐更稳 |
| 计数器/限流 | Redis | INCR 原子、支持 Expire |
| Bitmap 签到 | Redis | Memcache 不支持位操作 |

## 深挖追问

1. **为什么 Redis 单线程还能比 Memcache 快？** 单线程不等于慢。Redis 快在纯内存操作 + IO 多路复用（epoll）+ 数据结构精简 + 无锁竞争。Memcache 多线程会有锁竞争和上下文切换成本。简单 KV 高并发场景下 Memcache 多线程可能更稳，但 Redis 在数据结构业务下整体效率更高。
2. **Memcache 的 CAS 是什么？** Compare-And-Swap，乐观锁。`gets` 拿到 token，`cas` 提交时带 token，token 不匹配说明被别人改过，需要重试。Redis 用 `WATCH/MULTI/EXEC` 实现类似能力，但更常用 `SET NX EX` 或 Lua 脚本。
3. **Redis 能完全替代 Memcache 吗？** 不能。极致简单纯 KV 场景下，Memcache 多线程更稳，运维更省心，且无持久化开销。大厂常两者共存：Memcache 挡热点 KV，Redis 做数据结构业务。
4. **Memcache 重启数据丢失怎么办？** 接受这个事实。缓存层要做"DB 兜底"设计，任何缓存 miss 都能从 DB 重建，这才是缓存的正确姿势。冷启动时用预热脚本批量加载热点 key。
5. **为什么 Memcache 限制 value 1MB？** 大 value 会拖慢单线程网络 IO 和 slab 分配，1MB 是经验阈值。可通过 `-I` 参数调整（最大 1MB），但不建议。Redis String 上限 512MB，但生产也不应存超大 value。
6. **Redis 6.0 IO 多线程会取代 Memcache 多线程吗？** 不会完全取代。Redis IO 多线程只处理网络读写和协议解析，命令执行仍串行，目的在于解决网络 IO 瓶颈而非并行计算。极端 KV 吞吐场景 Memcache 多线程模型仍有优势。

## 易错点

- 不要拿 Redis 单线程劣势去对比 Memcache 多线程优势，而忽略 Redis 数据结构和持久化带来的业务价值。
- 不要认为 Redis 一定比 Memcache 快。简单 KV 高并发场景 Memcache 可能更稳。
- Memcache 不支持持久化是设计选择，不是缺陷。生产环境要看业务能不能接受丢数据。
- Memcache 不支持复杂数据类型，强行用 JSON 序列化会失去局部更新能力，每次写都要全量回写。
- Memcache 的 LRU 是 slab 内部的，不是全局 LRU。某个 slab 满了不会从其他 slab 借空间。
- Redis 6.0 IO 多线程不是"全部多线程"，命令执行仍单线程。

## 总结

Memcache 和 Redis 不是简单的"谁更好"关系。Memcache 是"做一件事并做好"的典型——纯内存 KV 缓存，多线程，简单稳定。Redis 是"数据结构服务器"——能缓存、能算、能锁、能流、能持久化。面试回答的关键是讲清两者设计哲学的差异，而不是背一张对比表。生产选型上，简单 KV 高吞吐选 Memcache，复杂业务逻辑选 Redis，二者并存也是常见架构。

## 参考资料

- [Redis 官方文档](https://redis.io/docs/)
- [Memcached 官方文档](https://memcached.org/)
- [Redis 设计与实现](http://redisbook.com/)
- [Redis 6.0 IO 多线程](https://redis.io/docs/management/optimization/io-threading/)

---
