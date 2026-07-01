# 如何避免 Redis 缓存雪崩

## 核心概念

缓存雪崩指**大量 key 在同一时间失效**或 **Redis 整体宕机**，导致大量请求直接打到 DB，DB 不堪重负最终崩溃，进而引发整个系统连锁故障。和穿透、击穿的区别：

- 雪崩：**大面积** key 失效或 Redis 故障；
- 击穿：**单个热点** key 失效；
- 穿透：查询**不存在**的数据。

雪崩的诱因有两类：

1. **同一时间大批 key 过期**（如预热时设了相同 TTL）；
2. **Redis 节点宕机**（如主机故障、网络分区）。

一句话结论：**避免雪崩的核心是打散过期时间 + 互斥重建 + 多级缓存 + 高可用部署；Redis 故障场景要靠限流降级兜底。**

## 标准回答

| 诱因 | 解决方案 | 说明 |
|------|----------|------|
| 大批 key 同时过期 | TTL 加随机抖动 | `expire = base + random(0, 300s)` |
| 大批 key 同时过期 | 互斥锁重建 | 同一时刻只有一个线程查 DB |
| 大批 key 同时过期 | 后台异步刷新 | 快过期时后台续期 |
| 大批 key 同时过期 | 永不过期 + 主动更新 | 配合 binlog 订阅 |
| Redis 宕机 | 多级缓存 | 本地缓存兜底 |
| Redis 宕机 | 集群高可用 | 哨兵/Cluster |
| Redis 宕机 | 限流降级 | DB 接口限流，超阈值返回默认值 |

## 详细机制

### 一、大批 key 同时过期的处理

#### 1. TTL 加随机抖动（最常用）

避免所有 key 设相同过期时间。在基础 TTL 上加一个随机增量：

```java
int baseTtl = 1800;  // 30 分钟
int randomTtl = ThreadLocalRandom.current().nextInt(300);  // 0~300 秒随机
redis.setex(key, baseTtl + randomTtl, value);
```

这样即使业务同时预热，过期时间也会分散在 30~35 分钟之间。

#### 2. 互斥锁重建

缓存 miss 时只允许一个线程查 DB 重建，其他线程等待或返回旧值。和击穿方案的互斥锁一样，只是雪崩场景下要并发重建的 key 更多。

#### 3. 后台异步刷新（逻辑过期）

不设物理 TTL，value 内置逻辑过期时间。后台定时任务在快过期时刷新，请求始终命中缓存。

#### 4. 永不过期 + 主动更新

热点数据不设 TTL，由业务变更触发更新。配合 binlog 订阅保证最终一致。

### 二、Redis 整体宕机的处理

#### 1. 多级缓存

应用本地缓存（Caffeine）作为兜底，Redis 挂了仍能服务热点数据。

```text
请求 → 本地缓存 → Redis → DB
        ↑ 兜底
```

#### 2. Redis 高可用

部署哨兵或 Cluster，单节点故障自动切换。

- **主从 + 哨兵**：1 主多从，哨兵监控，主故障自动选主；
- **Cluster**：分片 + 节点间主从，每个分片都是高可用；
- **云托管 Redis**：如阿里云 Redis 企业版，自带高可用和容灾。

#### 3. 限流降级

DB 接口配限流（Sentinel、Hystrix），超阈值直接返回默认值或降级页。这是最后一道防线，避免 DB 被打挂。

```java
@SentinelResource(value = "getProduct", fallback = "getDefaultProduct")
public Product getProduct(Long id) {
    // 正常逻辑
}

public Product getDefaultProduct(Long id) {
    return Product.DEFAULT;  // 返回默认商品
}
```

#### 4. 熔断 + 快速失败

DB 接口异常率超阈值时熔断，避免雪球效应。

```java
@CircuitBreaker(fallbackMethod = "fallback")
public Product getProduct(Long id) { ... }
```

## 代码示例

### TTL 随机抖动 + 互斥锁组合

```java
@Service
public class ProductService {
    @Autowired private RedisTemplate<String, Product> redis;
    @Autowired private ProductMapper productMapper;

    public Product getProduct(Long id) {
        String key = "product:" + id;
        Product p = redis.opsForValue().get(key);
        if (p != null) return p;

        String lockKey = "lock:" + key;
        if (redis.opsForValue().setIfAbsent(lockKey, "1", Duration.ofSeconds(10))) {
            try {
                p = redis.opsForValue().get(key);  // 双重检查
                if (p != null) return p;
                p = productMapper.selectById(id);
                if (p != null) {
                    int base = 1800;
                    int rand = ThreadLocalRandom.current().nextInt(300);
                    redis.opsForValue().set(key, p, Duration.ofSeconds(base + rand));
                }
                return p;
            } finally {
                redis.delete(lockKey);
            }
        }
        try { Thread.sleep(50); } catch (InterruptedException ignored) {}
        return redis.opsForValue().get(key);  // 短暂等待后重试
    }
}
```

### 多级缓存兜底

```java
@Service
public class ProductService {
    private final Cache<String, Product> localCache = Caffeine.newBuilder()
        .maximumSize(10_000)
        .expireAfterWrite(Duration.ofSeconds(30))
        .build();

    @Autowired private RedisTemplate<String, Product> redis;
    @Autowired private ProductMapper productMapper;

    public Product getProduct(Long id) {
        String key = "product:" + id;
        Product p = localCache.getIfPresent(key);
        if (p != null) return p;  // L1 兜底

        try {
            p = redis.opsForValue().get(key);
            if (p != null) {
                localCache.put(key, p);
                return p;
            }
        } catch (Exception e) {
            // Redis 不可用，降级到 DB
            return productMapper.selectById(id);
        }

        // 双重检查后查 DB
        p = productMapper.selectById(id);
        if (p != null) {
            try {
                int ttl = 1800 + ThreadLocalRandom.current().nextInt(300);
                redis.opsForValue().set(key, p, Duration.ofSeconds(ttl));
            } catch (Exception ignored) {}
            localCache.put(key, p);
        }
        return p;
    }
}
```

## 实战场景

| 场景 | 风险 | 推荐方案 |
|------|------|----------|
| 大促前批量预热 | 同时 TTL 导致批量失效 | TTL 加随机抖动 |
| 整点活动开始 | 整点流量爆发 | 互斥锁 + 限流 |
| Redis 主节点宕机 | 全量请求打 DB | 哨兵自动切换 + 本地缓存 |
| 双 11 零点 | 极端峰值 | 多级缓存 + 限流降级 + 熔断 |
| 缓存集群网络抖动 | 短时间不可用 | 本地缓存 + 降级 |
| 重启后冷启动 | 缓存空，瞬间全打 DB | 预热脚本 + 限流保护 |

## 深挖追问

### 雪崩和击穿的区别？

| 维度 | 击穿 | 雪崩 |
|------|------|------|
| 范围 | 单个热点 key | 大量 key |
| 诱因 | 热点 key 过期 | 同时过期 / Redis 宕机 |
| 影响 | 单 key 流量打 DB | 全量流量打 DB |
| 方案 | 互斥锁 / 逻辑过期 | TTL 随机 + 多级缓存 + 高可用 |

### TTL 随机值的范围怎么定？

一般取基础 TTL 的 10%~20%。如基础 30 分钟，随机 3~6 分钟。太小则效果不明显，太大则缓存命中率下降。

### Redis 集群挂了，本地缓存能扛多久？

取决于本地缓存容量和命中率。一般能扛住 5~30 分钟，给运维抢修时间。但本地缓存命中率有限（10%~30%），不能长期替代 Redis。

### 限流降级会影响业务吗？

会。限流意味着部分请求拿不到正常数据，要返回默认值或排队。降级是"丢车保帅"，避免 DB 被打挂导致全站不可用。降级策略要业务方提前评估并接受。

### 雪崩发生时如何快速恢复？

1. 限流保护 DB（Sentinel/Hystrix 限流）；
2. 优先恢复 Redis（重启/切换）；
3. 后台批量预热热点 key（启动预热脚本）；
4. 监控缓存命中率，恢复到 90%+ 才放开限流；
5. 复盘：补全 TTL 抖动、多级缓存、降级策略。

### Redis 主从切换瞬间会丢数据吗？

会丢部分数据。主从异步复制，主节点宕机时未同步的命令丢失。Sentinel 选主时也会丢失最后一段未复制的写。生产强一致场景用 Redlock 或 Raft 模式（Redis 7.0+）。

### 大批 key 同时过期时 Redis 会有什么现象？

- 大量 `DEL` 命令在主线程执行，可能阻塞；
- 主从同步 `DEL` 风暴，从节点来不及消化；
- AOF 文件瞬间膨胀（如果开 AOF）。

解决：开 `lazyfree-lazy-expire yes` 让删除异步，TTL 抖动避免集中过期。

## 易错点

- 预热时所有 key 设相同 TTL，整点准时雪崩；
- TTL 随机值范围过小，仍集中失效；
- 只解决"同时过期"，忽略 Redis 宕机场景；
- 没有本地缓存兜底，Redis 一挂全站不可用；
- 限流降级阈值未提前演练，真出事时不敢触发；
- 大批 key 同时过期时还在用 `DEL`，加剧 Redis 压力（应用 `UNLINK` 异步删）；
- 没有熔断机制，DB 雪球效应一坏到底。

## 总结

缓存雪崩是**大面积失效**引发的连锁故障。**核心方案是 TTL 加随机抖动 + 互斥锁 + 多级缓存 + Redis 高可用 + 限流降级**。TTL 抖动防止同时过期，互斥锁防止 DB 雪崩，多级缓存兜底 Redis 故障，限流降级是最后防线。**预防优于救火**：上线前压测、预热、监控缺一不可。

## 参考资料

- [Redis 官方文档：High Availability](https://redis.io/docs/management/sentinel/)
- [Sentinel 限流降级文档](https://sentinelguard.io/zh-cn/)
- [Redis Cluster 文档](https://redis.io/docs/management/scaling/)

---
