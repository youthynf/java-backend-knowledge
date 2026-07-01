# Redis 数据类型以及使用场景是什么

## 核心概念

Redis 数据类型本质是**围绕不同业务访问模式设计的内存数据结构**。每种类型对应一类典型场景：String 简单 KV、Hash 对象字段、List 队列时间线、Set 去重集合、ZSet 排序排行，扩展类型 Bitmap/HyperLogLog/GEO/Stream 各有专长。选型的核心不是"数据长什么样"，而是"读写模式是什么"。

一句话总结：**Redis 类型按访问模式选择：简单 KV 用 String、对象字段用 Hash、队列时间线用 List/Stream、去重集合用 Set、排序排行用 ZSet、布尔状态用 Bitmap、UV 估算用 HLL、附近搜索用 GEO**。

## 标准回答

### 类型对照速查

| 类型 | 核心能力 | 典型场景 | 底层编码 |
|------|----------|----------|----------|
| String | 简单 KV、整数计数 | 缓存、计数器、锁、Token | int/embstr/raw |
| Hash | field-value 映射 | 对象字段、购物车、配置 | listpack/hashtable |
| List | 有序可重复两端操作 | 队列、栈、时间线 | listpack/quicklist |
| Set | 无序去重 + 集合运算 | 标签、共同好友、抽奖 | intset/listpack/hashtable |
| ZSet | 有序去重 + score | 排行榜、延迟队列、TopN | listpack/skiplist+dict |
| Bitmap | String 位操作 | 签到、活跃标记、布隆 | String |
| HyperLogLog | 基数估算 | UV 统计 | ~12KB 稠密 / 稀疏 |
| GEO | 经纬度 + 附近搜索 | 附近门店、司机派单 | ZSet + GeoHash |
| Stream | 持久化消息流 | 异步任务、事件通知、削峰 | radix tree + listpack |

### 选型决策三步

1. **数据形态**：单值？对象字段？列表？集合？有序集合？消息流？
2. **读写模式**：整体读写 vs 局部读写；单元素 vs 范围；按 member vs 按 score；持久 vs 临时
3. **规模与限制**：元素数量、单元素大小、TTL 粒度、并发量

## 详细机制

### 1. String：简单 KV、计数器、分布式锁

```bash
SET user:1 '{"id":1,"name":"Tom"}' EX 600    # 缓存 JSON
INCR article:100:pv                            # 原子计数
SET lock:order:1 <uuid> NX PX 30000           # 分布式锁
SETBIT sign:20260624 1001 1                    # Bitmap 底层就是 String
```

适合：单值缓存、计数器、Token、验证码、分布式锁、Bitmap 位图。

不适合：局部字段频繁更新（用 Hash）、有序集合（用 ZSet）。

### 2. Hash：对象属性缓存

```bash
HSET user:1 name Tom age 18 city Shanghai
HGET user:1 name            # 单字段读取 O(1)
HINCRBY user:1 login_count 1
```

适合：用户资料、商品信息、购物车、配置项、计数器组。

不适合：嵌套结构（用 String JSON）、需要 field 级 TTL（Redis 7.4 前不支持）。

### 3. List：队列、栈、消息缓冲

```bash
LPUSH queue:email msg1
BRPOP queue:email 5              # 阻塞 5 秒
LPUSH feed:user:1 post:99
LTRIM feed:user:1 0 99           # 控制长度
```

适合：简单消息队列、最新动态列表、栈结构、有限集合。

不适合：可靠 MQ（用 Stream）、深分页（O(N)）、按时间戳排序（用 ZSet）。

### 4. Set：去重、标签、共同好友

```bash
SADD post:1:likes user:1 user:2
SISMEMBER post:1:likes user:1    # 是否点赞
SINTER user:1:follows user:2:follows  # 共同关注
SRANDMEMBER campaign:2026:users 3  # 抽奖
```

适合：点赞集合、用户标签、黑白名单、抽奖去重、共同好友。

不适合：排序（用 ZSet）、大规模交并差（O(N) 阻塞主线程）。

### 5. ZSet：排行榜、延迟队列、按分数排序

```bash
ZADD rank:game 1000 player:1 990 player:2
ZREVRANGE rank:game 0 9 WITHSCORES  # Top 10
ZRANGEBYSCORE delay:queue 0 1782260000000  # 延迟队列
```

适合：积分排行榜、热搜榜、延迟队列、TopN、按时间排序动态流。

不适合：金额精确表达（score 是 double，用分为单位）、需要 field 级 TTL。

### 6. Bitmap：签到、活跃标记、布隆过滤器

```bash
SETBIT sign:20260624 1001 1
GETBIT sign:20260624 1001
BITCOUNT sign:20260624                # 当天签到人数
BITOP AND active:both active:d1 active:d2  # 多日交集
```

适合：每日签到、活跃用户标记、布隆过滤器底层位图、状态位。

不适合：稀疏 ID（offset 大导致内存爆炸）、复杂业务信息（只 0/1）。

### 7. HyperLogLog：UV 估算

```bash
PFADD uv:page:1:20260624 user:1 user:2
PFCOUNT uv:page:1:20260624
PFMERGE uv:week uv:d1 uv:d2 uv:d3   # 合并多天
```

适合：海量 UV 估算、独立访客、搜索词去重数量、独立 IP 数。

不适合：精确计数、需要回查具体用户、需要删除单个元素。

### 8. GEO：附近门店、司机派单

```bash
GEOADD geo:shop:shanghai 121.4737 31.2304 shop:1
GEOSEARCH geo:shop:shanghai FROMLONLAT 121.48 31.23 BYRADIUS 3 km WITHDIST ASC COUNT 10
GEODIST geo:shop:shanghai shop:1 shop:2 km
```

适合：附近门店、附近司机、附近的人、配送范围、距离计算。

不适合：复杂 GIS（多边形、路线规划）、极地附近（纬度 > 85）。

### 9. Stream：可靠消息流

```bash
XADD stream:order * orderId 1001 status paid
XGROUP CREATE stream:order group:pay 0 MKSTREAM
XREADGROUP GROUP group:pay c1 COUNT 10 BLOCK 5000 STREAMS stream:order >
XACK stream:order group:pay 1782260000000-0
XTRIM stream:order MAXLEN ~ 100000
```

适合：异步任务、事件通知、削峰填谷、可靠消息队列。

不适合：百万级以上吞吐（用 Kafka）、跨机房严格顺序（用专业 MQ）。

## 代码示例

综合使用：电商订单系统

```java
// 1. 商品详情缓存（String JSON）
public Product getProduct(long productId) {
    String key = "product:" + productId;
    String json = redisTemplate.opsForValue().get(key);
    if (json != null) return JSON.parseObject(json, Product.class);
    Product p = productMapper.findById(productId);
    redisTemplate.opsForValue().set(key, JSON.toJSONString(p), 10, TimeUnit.MINUTES);
    return p;
}

// 2. 购物车（Hash）
public void addToCart(long userId, String skuId, int qty) {
    redisTemplate.opsForHash().put("cart:" + userId, skuId, String.valueOf(qty));
}

// 3. 库存扣减（Hash + HINCRBY 原子）
public boolean deductStock(long skuId, int qty) {
    Long remaining = redisTemplate.opsForHash().increment(
        "stock:" + skuId, "total", -qty);
    return remaining != null && remaining >= 0;
}

// 4. 限流（String INCR + EXPIRE）
public boolean rateLimit(long userId, int maxPerMinute) {
    String key = "rate:" + userId + ":" + (System.currentTimeMillis() / 60000);
    Long count = redisTemplate.opsForValue().increment(key);
    if (count == 1) redisTemplate.expire(key, Duration.ofMinutes(1));
    return count <= maxPerMinute;
}

// 5. 排行榜（ZSet）
public void updateRank(long userId, double score) {
    redisTemplate.opsForZSet().add("rank:game", String.valueOf(userId), score);
}

// 6. 签到（Bitmap）
public void sign(long userId, LocalDate date) {
    String key = "sign:" + userId + ":" + date.getYear() +
                 String.format("%02d", date.getMonthValue());
    redisTemplate.opsForValue().setBit(key, date.getDayOfMonth() - 1, true);
}

// 7. UV 统计（HyperLogLog）
public void recordUv(String page, long userId) {
    redisTemplate.opsForHyperLogLog().add("uv:" + page + ":" + today(), String.valueOf(userId));
}

// 8. 异步订单处理（Stream）
public void publishOrderEvent(Order order) {
    Map<String, String> fields = new HashMap<>();
    fields.put("orderId", String.valueOf(order.getId()));
    fields.put("userId", String.valueOf(order.getUserId()));
    fields.put("amount", String.valueOf(order.getAmount()));
    redisTemplate.opsForStream().add(
        StreamRecords.string(fields).withStreamKey("stream:order"));
}

// 9. 附近门店（GEO）
public List<String> nearbyShops(double lon, double lat, double radiusKm) {
    Circle circle = new Circle(new Point(lon, lat), new Distance(radiusKm, Metrics.KILOMETERS));
    GeoResults<String> results = redisTemplate.opsForGeo()
        .search("geo:shop", GeoSearchCommandArgs.newGeoSearchArgs()
            .sortAscending().limit(20).fromCircle(circle));
    return results.getContent().stream()
        .map(r -> r.getContent().getName())
        .collect(Collectors.toList());
}
```

## 实战场景

| 场景 | 类型 | 关键命令 |
|------|------|----------|
| 用户资料缓存 | String 或 Hash | `SET`/`HSET` |
| 商品详情缓存 | String | `SET key json EX 600` |
| 点赞计数 | String | `INCR` |
| 购物车 | Hash | `HSET`/`HINCRBY` |
| 关注关系 | Set | `SADD`/`SINTER` |
| 排行榜 | ZSet | `ZADD`/`ZREVRANGE` |
| 延迟队列 | ZSet | `ZADD`/`ZRANGEBYSCORE` |
| 简单消息队列 | List | `LPUSH`/`BRPOP` |
| 可靠消息队列 | Stream | `XADD`/`XREADGROUP`/`XACK` |
| 每日签到 | Bitmap | `SETBIT`/`BITCOUNT` |
| 活跃用户统计 | Bitmap | `SETBIT`/`BITOP` |
| UV 统计 | HyperLogLog | `PFADD`/`PFCOUNT` |
| 附近门店 | GEO | `GEOADD`/`GEOSEARCH` |
| 分布式锁 | String | `SET NX EX` + Lua |
| 限流 | String 或 ZSet | `INCR` 或 `ZADD` |
| 配置中心 | Hash | `HSET`/`HGETALL` |
| 实时位置 | GEO | `GEOADD`/`GEOSEARCH` |

## 深挖追问

### 缓存对象用 String 还是 Hash？

整体读写频繁用 String JSON，简单；局部字段频繁更新用 Hash，避免 read-modify-write 全量操作。字段多、对象大时两者都要注意大 Key。

### 排行榜为什么用 ZSet？

ZSet 同时支持 member 去重和按 score 排序，能高效做 TopN、排名、分数更新。底层 skiplist + dict，`ZREVRANGE` 复杂度 O(logN + M)，`ZSCORE` O(1)。

### Redis 数据类型和底层编码是一回事吗？

不是。数据类型是对外 API（Hash/List/Set/ZSet）；底层编码是内部实现（listpack/hashtable/skiplist 等）。Redis 会根据元素数量和大小自动选择编码。

### List 和 Stream 怎么选？

简单队列用 List，可靠投递用 Stream。List 没有 ACK、消费组、历史回放；Stream 都有。List 适合"消费即丢"，Stream 适合"持久 + 多消费者协作"。

### Set 和 Bitmap 怎么选？

稀疏集合、需要保存具体成员用 Set；连续 ID 的布尔状态用 Bitmap。1 亿用户签到用 Set 约 1GB+，用 Bitmap 仅 12.5MB。

### HyperLogLog 和 Set 怎么选？

精确去重且需要回查成员用 Set；近似 UV 估算、不需要回查用 HLL。1 亿 UV 用 Set 几 GB，HLL 仅 12KB。

### GEO 和数据库空间索引怎么选？

Redis GEO 适合高频读的缓存/实时位置；数据库空间索引适合权威存储和复杂查询。生产架构常是 Redis 做实时位置缓存 + MySQL/PostGIS 做权威存储。

### 限流用 String 还是 ZSet？

简单计数限流用 String `INCR` + `EXPIRE`（固定窗口）。滑动窗口限流用 ZSet（score 为时间戳，`ZRANGEBYSCORE` 计数）。Token Bucket 用 Hash + Lua 脚本。

### 延迟队列用 ZSet 还是 Stream？

ZSet 简单：score 为执行时间，轮询取到期任务，Lua 原子取出。Stream 不直接支持延迟（消息按 ID 顺序消费），需要业务层延迟投递或用 RedisBloom 模块。中小规模用 ZSet 足够，大规模用专业 MQ 的延迟队列。

## 易错点

- 不要对大 Set/ZSet/List 直接执行全量返回命令（`SMEMBERS`、`ZRANGE 0 -1`、`LRANGE 0 -1`）。
- 不要把 Redis List 当完整 MQ 使用，可靠投递选 Stream。
- 不要无限堆积大对象，容易造成内存和网络瓶颈。
- 缓存对象要考虑过期时间、穿透、击穿、雪崩。
- Redis 类型选择要看访问模式，不是只看数据长什么样。
- score 是 double，金额场景要用分（cent）作为 long 表达。
- HLL 不能取成员、Bitmap 不能存复杂状态，混淆会导致业务实现复杂化。
- Bitmap 的 offset 必须可控，稀疏大 ID 会内存爆炸。
- GEO 经度在前纬度在后，写反会查不到。
- Stream 不裁剪会形成大 Key，必须配合 `XTRIM`。

## 总结

Redis 数据类型的面试回答不能只背五种类型。要点是：每种类型的核心能力、典型业务场景、常用命令、复杂度、底层编码、版本演进、大 Key 风险。实际选型时看访问模式：简单 KV 用 String、对象字段用 Hash、队列用 List/Stream、去重集合用 Set、排序排行用 ZSet、布尔状态用 Bitmap、UV 估算用 HLL、附近搜索用 GEO。关键词是**访问模式决定选型、类型 vs 编码、版本演进、大 Key 风险**。

## 参考资料

- [Redis 数据类型文档](https://redis.io/docs/data-types/)
- [JavaGuide - Redis 数据类型](https://javaguide.cn/database/redis/redis-data-types-01.html)
- [Redis 命令参考](https://redis.io/commands/)

---
