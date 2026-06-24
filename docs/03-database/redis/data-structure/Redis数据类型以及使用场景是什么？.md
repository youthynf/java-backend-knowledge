# Redis 数据类型以及使用场景是什么？

## 核心概念

Redis 不是简单的 key-value 字符串缓存，它提供了多种高性能数据结构。面试中说 Redis 数据类型，通常指 String、Hash、List、Set、ZSet 这五种基础类型，以及后来的 Bitmap、HyperLogLog、Geo、Stream 等扩展类型。

一句话回答：**Redis 的数据类型本质是围绕不同业务访问模式设计的内存数据结构。String 适合简单 KV 和计数，Hash 适合对象属性，List 适合队列和时间线，Set 适合去重和集合运算，ZSet 适合排行榜和按权重排序。**

## 面试官想考什么

1. 是否能把类型和真实业务场景对应起来；
2. 是否知道常用命令和时间复杂度；
3. 是否了解底层编码会随数据规模变化；
4. 是否知道不同类型的坑，比如大 key、热 key、阻塞命令；
5. 是否能根据业务选择更合适的数据结构。

## 标准回答

### 1. String：简单 KV、计数器、分布式锁

String 是最基础的数据类型，value 可以是字符串、数字、JSON、二进制内容。

常见命令：

```bash
SET user:1 "Tom"
GET user:1
INCR article:100:pv
SET lock:order:1 requestId NX PX 30000
```

典型场景：

- 缓存单个对象的 JSON；
- PV/UV 计数器；
- 分布式锁；
- 短信验证码；
- session/token 缓存。

注意：对象 JSON 太大时会形成大 key，局部字段更新也要整体序列化，不如 Hash 灵活。

### 2. Hash：对象属性缓存

Hash 适合存储对象的多个字段，例如用户资料、商品信息。

```bash
HSET user:1 name Tom age 18 city Shanghai
HGET user:1 name
HMGET user:1 name age
HINCRBY user:1 login_count 1
```

典型场景：

- 用户信息；
- 商品库存字段；
- 购物车中某个用户的商品数量；
- 配置项集合。

优点是可以按字段读写，不必每次序列化整个对象。缺点是字段过多或 value 过大也会变成大 key。

### 3. List：队列、栈、消息缓冲

List 是有序链表/列表结构，适合两端插入和弹出。

```bash
LPUSH queue:email msg1
RPOP queue:email
BRPOP queue:email 5
```

典型场景：

- 简单消息队列；
- 最新动态列表；
- 任务队列；
- 栈结构。

注意：List 不是专业 MQ，没有完善的 ack、重试、死信、消费组机制。复杂消息场景优先考虑 Redis Stream、Kafka、RocketMQ。

### 4. Set：去重、标签、共同好友

Set 是无序不重复集合。

```bash
SADD article:1:likes user1 user2
SISMEMBER article:1:likes user1
SINTER user:1:follows user:2:follows
```

典型场景：

- 点赞用户集合；
- 用户标签；
- 黑名单/白名单；
- 抽奖去重；
- 共同好友、共同关注。

注意：大集合做 `SMEMBERS`、`SINTER` 可能阻塞 Redis，应控制集合规模或用 `SSCAN` 分批扫描。

### 5. ZSet：排行榜、延迟队列、按分数排序

ZSet 是有序集合，每个 member 对应一个 score。

```bash
ZADD rank 100 user1 80 user2
ZREVRANGE rank 0 9 WITHSCORES
ZRANGEBYSCORE delay_queue 0 1710000000000
```

典型场景：

- 积分排行榜；
- 热门文章榜；
- 延迟队列；
- 按时间排序的动态流；
- TopN 查询。

注意：score 是浮点数，涉及精度时要谨慎；延迟队列要处理并发抢占和幂等。

## 扩展类型

### Bitmap

本质上是 String 的位操作，适合签到、活跃用户标记、布隆过滤器底层位图。

```bash
SETBIT sign:2026-06 userId 1
GETBIT sign:2026-06 userId
BITCOUNT sign:2026-06
```

### HyperLogLog

用于基数统计，比如 UV 估算。优点是内存极省，缺点是有误差，不能拿回具体元素。

```bash
PFADD uv:article:1 user1 user2
PFCOUNT uv:article:1
```

### Geo

用于地理位置查询，本质基于 ZSet。

```bash
GEOADD shop 121.47 31.23 shop1
GEOSEARCH shop FROMLONLAT 121.47 31.23 BYRADIUS 5 km
```

### Stream

Redis 5.0 引入的日志型消息结构，支持消费组、ack、pending list，适合轻量消息队列。

```bash
XADD order-stream * orderId 1 status paid
XREADGROUP GROUP g1 c1 COUNT 10 STREAMS order-stream >
XACK order-stream g1 messageId
```

## 深挖追问

### 缓存对象用 String 还是 Hash？

如果对象整体读写，String 存 JSON 简单；如果经常更新某些字段，Hash 更合适。字段很多、对象很大时，两者都要注意大 key。

### 排行榜为什么用 ZSet？

因为 ZSet 同时支持 member 去重和按 score 排序，能高效做 TopN、排名、分数更新。常用命令复杂度通常是 `O(logN)` 或 `O(logN + M)`。

### Redis 数据类型和底层编码是一回事吗？

不是。数据类型是对外 API，比如 Hash、List；底层编码是内部实现，比如 listpack、quicklist、skiplist。Redis 会根据元素数量和大小自动选择编码。

## 易错点

- 不要对大 Set/ZSet/List 直接执行全量返回命令；
- 不要把 Redis List 当完整 MQ 使用；
- 不要无限堆积大对象，容易造成内存和网络瓶颈；
- 缓存对象要考虑过期时间、穿透、击穿、雪崩；
- Redis 类型选择要看访问模式，不是只看数据长什么样。

## 总结

Redis 数据类型的面试回答不能只背五种类型。更好的回答是：先说明每种类型的核心能力，再结合业务场景、常用命令、复杂度和风险点。实际选型时重点看访问模式：简单 KV 用 String，对象字段用 Hash，队列用 List/Stream，去重集合用 Set，排序和排行榜用 ZSet。

---

## 面试版详细讲解

### 核心概念

这道题属于 **Redis 数据结构** 的高频考点，核心要抓住：redisObject、dict、SDS、listpack、quicklist、intset、skiplist。Redis 会根据数据规模选择紧凑或高性能编码。回答时按类型语义、底层结构、复杂度、应用场景、风险治理展开。

### 面试官想考什么

面试官通常不是只想听定义，而是想确认你能否说明：类型语义、底层编码、复杂度、场景选择和 big key 风险；还能否把它和真实业务里的性能、可靠性、可维护性联系起来。

### 标准回答

Redis 会根据数据规模选择紧凑或高性能编码。回答时按类型语义、底层结构、复杂度、应用场景、风险治理展开。

答题时建议用“三段式”：

1. 先给结论，明确适用前提；
2. 再解释底层机制或执行过程；
3. 最后补充业务取舍、风险点和排查手段。

### 深挖追问

- 这个结论在高并发或大数据量下是否仍然成立？
- 它依赖哪些版本、配置、索引/编码或业务一致性要求？
- 线上异常时应该看哪些命令、日志、指标或执行计划？

### 示例 / 实战场景

用户资料整体读写用 String，字段更新用 Hash，去重用 Set，排行榜用 Zset，签到用 Bitmap，消息流用 Stream。

```bash
# 先小范围验证命令复杂度和返回量，避免线上直接扫大 key
redis-cli --scan --pattern 'biz:*' | head
redis-cli --bigkeys
```

### 易错点

- 只背概念，不说明适用场景、代价和边界。
- 忽略数据量、并发量、版本差异和线上配置，给出绝对化结论。
- 没有把问题落到可观测手段：执行计划、慢日志、监控指标、客户端超时或错误日志。

### 一句话总结

这类题的面试核心不是“知道名词”，而是能说清 **机制 + 取舍 + 落地排查**。先给稳定结论，再讲底层原因，最后结合业务场景说明如何使用和如何避免坑。

