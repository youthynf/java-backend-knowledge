# Redis 除了缓存还有哪些应用

## 核心概念

Redis 常被简化理解为"缓存"，但它的丰富数据结构、原子操作、过期机制、Pub/Sub 等特性让它能胜任远超缓存的场景。理解 Redis 的多元应用，能在不引入新组件的前提下解决很多工程问题。

一句话结论：**Redis 除了缓存，还可做计数器、排行榜、分布式锁、限流、消息队列、位图统计、地理位置、延迟队列、布隆过滤器、会话存储等。核心是利用其数据结构 + 原子操作 + 过期机制。**

## 标准回答

| 应用场景 | 数据结构 | 关键命令 |
|----------|----------|----------|
| 计数器 | String | `INCR`/`INCRBY`/`DECR` |
| 排行榜 | ZSet | `ZADD`/`ZREVRANGE`/`ZINCRBY` |
| 分布式锁 | String + Lua | `SET NX PX`/`EVAL` |
| 限流 | String/List + Lua | `INCR`/`EXPIRE` |
| 简单消息队列 | List | `LPUSH`/`BRPOP` |
| 发布订阅 | Pub/Sub | `PUBLISH`/`SUBSCRIBE` |
| 延迟队列 | ZSet | `ZADD`/`ZRANGEBYSCORE` |
| 位图统计 | Bitmap | `SETBIT`/`BITCOUNT`/`BITOP` |
| 基数统计 | HyperLogLog | `PFADD`/`PFCOUNT` |
| 地理位置 | GEO | `GEOADD`/`GEOSEARCH` |
| 会话存储 | String/Hash | `SET`/`HSET` + `EXPIRE` |
| 布隆过滤器 | Bitmap（或 BF 模块） | `SETBIT`/`GETBIT` |

## 详细机制

### 1. 计数器

利用 Redis 单线程原子性，`INCR`/`DECR` 天然防并发。

```bash
# 文章阅读量
INCR article:pv:1001
# 用户点赞数
INCRBY user:likes:1001 1
# 库存扣减
DECR stock:1001
```

**典型场景**：PV/UV 统计、点赞、库存、限流计数。

```java
Long pv = redis.opsForValue().increment("article:pv:" + articleId);
```

### 2. 排行榜

ZSet 天然支持按 score 排序，适合排行榜场景。

```bash
# 用户得分增加
ZINCRBY rank:game 100 "user:1001"
ZINCRBY rank:game 50 "user:1002"

# 取前 10 名
ZREVRANGE rank:game 0 9 WITHSCORES

# 查询某用户排名
ZREVRANK rank:game "user:1001"

# 分页查询 11~20 名
ZREVRANGE rank:game 10 19 WITHSCORES
```

**典型场景**：游戏排行、热搜榜、积分榜、销售榜。

### 3. 分布式锁

详见"Redis 如何实现分布式锁"。核心是 `SET NX PX` + Lua 释放。

```bash
SET lock:order:1001 "uuid" NX PX 30000
```

### 4. 限流

利用计数器 + 过期时间实现简单限流。

```bash
# 1 分钟内最多 100 次
INCR rate:user:1001
# 如果返回 1，设过期时间
EXPIRE rate:user:1001 60
# 返回值 > 100 则限流
```

更优雅的 Lua 原子方案：

```lua
-- rate_limit.lua
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = redis.call('INCR', key)
if current == 1 then
    redis.call('EXPIRE', key, window)
end
if current > limit then
    return 0
end
return 1
```

**进阶**：令牌桶（Redisson `RRateLimiter`）、滑动窗口（用 ZSet）。

### 5. 消息队列

#### List 实现简单队列

```bash
# 生产者
LPUSH queue:email "task1"
LPUSH queue:email "task2"

# 消费者（阻塞读取）
BRPOP queue:email 30   # 30 秒超时
```

**优点**：简单，FIFO。
**缺点**：无 ACK，消费失败丢消息；无消费者组。

#### Stream（5.0+）实现可靠队列

```bash
# 生产
XADD stream:order * orderId 1001 amount 99.9

# 消费者组
XGROUP CREATE stream:order order-group 0

# 消费
XREADGROUP GROUP order-group consumer-1 COUNT 10 BLOCK 5000 STREAMS stream:order >

# ACK
XACK stream:order order-group <message-id>

# 消费者崩溃后，重新分配 pending 消息
XAUTOCLAIM stream:order order-group consumer-2 60000 0
```

**优点**：持久化、消费者组、ACK、回溯。可作为轻量级 MQ。

### 6. 发布订阅

```bash
# 订阅
SUBSCRIBE news:tech

# 发布
PUBLISH news:tech "Redis 7.0 released"
```

**典型场景**：实时消息推送、集群配置同步、缓存失效广播。
**缺点**：消息不持久化，订阅者不在线则丢消息。

### 7. 延迟队列

详见"Redis 如何实现延迟队列"。核心是 ZSet + 定时扫描。

### 8. 位图统计（Bitmap）

Bitmap 适合"用户是否做过某事"的二值统计，1 亿用户只占 12 MB。

```bash
# 用户 1001 在 2026-06-29 签到
SETBIT sign:20260629 1001 1

# 统计当日签到人数
BITCOUNT sign:20260629

# 统计用户 1001 一周签到次数（用 BITOP AND 合并 7 天）
BITOP AND sign:week:1001 sign:20260629 sign:20260628 ...
BITCOUNT sign:week:1001

# 统计连续签到天数
BITCOUNT sign:20260629 & getbit 倒序检查
```

**典型场景**：签到、活跃用户统计、用户标签、权限位、在线状态。

### 9. 基数统计（HyperLogLog）

HyperLogLog 用于去重计数，1 亿 UV 仅占 12 KB（标准误差 0.81%）。

```bash
# 记录 UV
PFADD page:uv:index user:1001 user:1002 user:1003

# 获取 UV 数
PFCOUNT page:uv:index

# 合并多个 HyperLogLog
PFMERGE page:uv:total page:uv:202606 page:uv:202607
```

**典型场景**：网站 UV、搜索关键词独立数、APP DAU。

### 10. 地理位置（GEO）

基于 ZSet 实现，存储经纬度并支持范围查询。

```bash
# 添加位置
GEOADD shops 116.404 39.915 "shop:1"
GEOADD shops 116.408 39.920 "shop:2"

# 查找附近 1 公里
GEOSEARCH shops FROMLONLAT 116.405 39.917 BYRADIUS 1 km ASC

# 两点距离
GEODIST shops "shop:1" "shop:2" km

# 获取经纬度
GEOPOS shops "shop:1"
```

**典型场景**：附近的人/店、打车匹配、地理围栏。

### 11. 会话存储

Redis 是分布式 Session 的最佳载体。

```bash
# 登录后写 session
SET session:abc123 "{\"userId\":1001}" EX 1800

# 验证 session
GET session:abc123

# 续期
EXPIRE session:abc123 1800
```

Spring Session Redis 自动实现。

### 12. 布隆过滤器

详见"Redis 布隆过滤器如何使用"。缓存穿透防护、URL 去重。

## 代码示例

### 计数器 + 排行榜组合（点赞）

```java
@Service
public class LikeService {
    @Autowired private RedisTemplate<String, String> redis;

    public void like(Long userId, Long articleId) {
        // 防重复点赞（Set）
        Long added = redis.opsForSet().add("like:user:" + userId, String.valueOf(articleId));
        if (added == 1) {
            // 文章点赞数 +1
            redis.opsForValue().increment("like:count:" + articleId);
            // 作者总赞数 +1（用于排行）
            Long authorId = getAuthorId(articleId);
            redis.opsForZSet().incrementScore("rank:author", String.valueOf(authorId), 1);
        }
    }

    public List<String> topAuthors(int n) {
        Set<ZSetOperations.TypedTuple<String>> set =
            redis.opsForZSet().reverseRangeWithScores("rank:author", 0, n - 1);
        // 转换并返回
        return set.stream()
            .map(t -> t.getValue() + ":" + t.getScore())
            .collect(Collectors.toList());
    }
}
```

### 限流器（Lua 滑动窗口）

```java
private static final String LUA =
    "local key = KEYS[1] " +
    "local now = tonumber(ARGV[1]) " +
    "local window = tonumber(ARGV[2]) " +
    "local limit = tonumber(ARGV[3]) " +
    "redis.call('ZREMRANGEBYSCORE', key, 0, now - window) " +
    "if redis.call('ZCARD', key) >= limit then return 0 end " +
    "redis.call('ZADD', key, now, now) " +
    "redis.call('EXPIRE', key, window / 1000) " +
    "return 1";

public boolean allow(String key, long windowMs, int limit) {
    Long r = redis.execute(
        new DefaultRedisScript<>(LUA, Long.class),
        Collections.singletonList("rate:" + key),
        String.valueOf(System.currentTimeMillis()),
        String.valueOf(windowMs),
        String.valueOf(limit)
    );
    return Long.valueOf(1).equals(r);
}
```

### 签到（Bitmap）

```java
@Service
public class SignService {
    @Autowired private RedisTemplate<String, ?> redis;

    public void sign(long userId) {
        String key = "sign:" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        redis.opsForValue().setBit(key, userId, true);
    }

    public long countToday() {
        String key = "sign:" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        return redis.opsForValue().bitCount(key);
    }

    public boolean hasSigned(long userId) {
        String key = "sign:" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        return redis.opsForValue().getBit(key, userId);
    }
}
```

### UV 统计（HyperLogLog）

```java
@Service
public class UvService {
    @Autowired private RedisTemplate<String, String> redis;

    public void recordVisit(String page, String userId) {
        redis.opsForHyperLogLog().add("uv:" + page, userId);
    }

    public long getUv(String page) {
        return redis.opsForHyperLogLog().size("uv:" + page);
    }
}
```

## 实战场景

| 场景 | Redis 应用 | 替代方案 |
|------|------------|----------|
| 文章点赞数 | INCR | DB update |
| 游戏排行榜 | ZSet | DB ORDER BY |
| 限时秒杀 | Lua + 分布式锁 | DB 乐观锁 |
| 接口限流 | Lua + INCR | Sentinel |
| 订单异步处理 | Stream | RabbitMQ |
| 网站 UV | HyperLogLog | DB distinct |
| 用户签到 | Bitmap | DB 表 |
| 附近的人 | GEO | PostGIS |
| 分布式 Session | String + EXPIRE | 粘性会话 |
| 缓存穿透 | Bloom Filter | N/A |
| 实时消息推送 | Pub/Sub | WebSocket |
| 防重复提交 | SET NX | DB 唯一索引 |

## 深挖追问

### Redis 做消息队列靠谱吗？

轻量场景靠谱，强可靠场景不推荐：

- **Stream** 持久化 + ACK + 消费者组，适合中小项目；
- **List** 简单队列无 ACK，丢消息风险；
- **Pub/Sub** 不持久化，仅推送场景。

强一致、高吞吐、复杂路由用 RocketMQ/Kafka。

### Redis 计数器和 DB 计数器怎么同步？

Redis 实时累加，定时（如每分钟）批量同步到 DB。或用 binlog 订阅反向同步。注意 Redis 宕机可能丢部分计数（AOF `everysec` 模式丢 1 秒）。

### 限流用 Redis 还是网关（如 Sentinel）？

| 维度 | Redis 限流 | Sentinel |
|------|------------|----------|
| 部署 | 集中式 | 客户端单机 |
| 跨实例 | 是 | 否 |
| 性能 | 网络开销 | 本地内存 |
| 复杂度 | 中 | 低 |

分布式限流用 Redis，单机限流用 Sentinel，组合最佳。

### HyperLogLog 误差 0.81% 能接受吗？

UV 类统计通常能接受。精确去重用 Set（但内存爆炸）。生产中常两者结合：HyperLogLog 看趋势，定时用 Set 精确对账。

### Bitmap 适合什么场景？

二值状态统计：用户是否签到、是否活跃、是否有权限。1 亿用户 Bitmap 仅 12 MB。不适合"用户做了几次"这种计数场景。

### Redis GEO 的精度如何？

Redis GEO 用 GeoHash 编码经纬度，精度约 1 米。`GEODIST` 返回的距离有 0.5% 误差。对大多数 LBS 场景足够。

### Stream 和 Kafka 怎么选？

| 维度 | Redis Stream | Kafka |
|------|--------------|-------|
| 吞吐 | 万级 QPS | 百万级 QPS |
| 持久化 | AOF/RDB | 强持久化 |
| 消费者组 | 支持 | 完善 |
| 生态 | Redis 内 | 完善监控 |
| 运维 | 简单 | 复杂 |

中小项目用 Stream 足够，大数据流用 Kafka。

### INCR 会溢出吗？

会。Redis 的 INCR 是 64 位有符号整数，最大 `2^63 - 1`（约 9.2 × 10^18）。理论上不会溢出，但 INCRBY 大数时要注意。

## 易错点

- 把 Redis 当主数据库用，宕机丢数据；
- 用 List 做可靠队列，无 ACK 丢消息；
- Pub/Sub 做核心消息传递，订阅者掉线丢消息；
- INCR 不设上限，理论上无限增长；
- 把 Redis 限流当精确限流，AOF everysec 模式可能多放过几个请求；
- HyperLogLog 当精确统计用，结果偏差超预期；
- ZSet 排行榜 score 浮点数精度问题；
- Bitmap 用错用户 ID 类型（必须 long，不能负数）。

## 总结

Redis 是**多面手**，远不止缓存。**计数器、排行榜、分布式锁、限流、消息队列、Bitmap、HyperLogLog、GEO、会话存储**都是它的经典应用。选型关键是利用 Redis 的数据结构 + 原子操作 + 过期机制，在不引入新组件的前提下解决工程问题。**但要注意 Redis 不是数据库**，强一致和持久化要求高的场景仍需 MySQL/MQ 配合。

## 参考资料

- [Redis 官方文档：Data types](https://redis.io/docs/data-types/)
- [Redis 应用场景](https://redis.io/docs/manual/patterns/)
- [Redis Stream 文档](https://redis.io/docs/data-types/streams/)
- [Redis GEO 文档](https://redis.io/docs/data-types/geospatial/)

---
