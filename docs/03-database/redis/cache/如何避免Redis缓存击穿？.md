# 如何避免 Redis 缓存击穿

## 核心概念

缓存击穿指**某个热点 key 在缓存中过期的瞬间，大量并发请求同时打到数据库**，导致 DB 压力骤增。它和穿透、雪崩的区别：

- 击穿：**单个热点 key** 失效瞬间，大量请求并发打 DB；
- 穿透：查询**不存在**的数据，DB 也没有；
- 雪崩：**大量 key 同时失效**，DB 压力骤增。

典型场景：秒杀商品详情、微博热搜词条、首页推荐位。这些 key 平时 QPS 极高，缓存一旦过期，瞬间流量直接打 DB。

一句话结论：**避免击穿的两个主流方案是互斥锁重建和逻辑过期；超热点数据可永不过期 + 后台异步刷新。**

## 标准回答

| 方案 | 实现 | 一致性 | 复杂度 |
|------|------|--------|--------|
| 互斥锁 | 缓存 miss 时只允许一个线程查 DB 重建 | 强 | 中 |
| 逻辑过期 | 缓存永不过期，存逻辑过期时间，过期后异步刷新 | 弱（短时间旧值） | 中 |
| 永不过期 | 不设 TTL，更新时主动覆盖 | 强 | 低（但需主动维护） |
| 多级缓存 | 本地缓存兜底 | 弱 | 高 |
| 限流降级 | 单 key 限流，超阈值返回默认值 | N/A | 低 |

## 详细机制

### 方案一：互斥锁（推荐）

缓存 miss 时用 `SET NX PX` 加分布式锁，只有拿到锁的线程查 DB 并回填，其他线程等待或返回旧值。

```java
public Product getProduct(Long id) {
    String key = "product:" + id;
    Product p = redis.opsForValue().get(key);
    if (p != null) return p;

    String lockKey = "lock:" + key;
    // 尝试加锁，超时 10 秒
    if (redis.opsForValue().setIfAbsent(lockKey, "1", Duration.ofSeconds(10))) {
        try {
            // 双重检查：可能其他线程已重建
            p = redis.opsForValue().get(key);
            if (p != null) return p;
            p = productMapper.selectById(id);
            redis.opsForValue().set(key, p, Duration.ofMinutes(30));
            return p;
        } finally {
            redis.delete(lockKey);
        }
    }
    // 未拿到锁：短暂等待后重试，或返回降级数据
    Thread.sleep(50);
    return getProduct(id);
}
```

**关键点**：

1. 锁必须设过期时间，防止持锁线程异常导致死锁；
2. 拿锁后要二次检查缓存，避免重复重建；
3. 锁粒度按 key，避免全局锁；
4. 未拿到锁的请求要有限重试或降级，避免无限等待；
5. 锁释放用 Lua 脚本比对 value，避免误删他人锁。

### 方案二：逻辑过期

缓存不设物理 TTL，在 value 中加一个 `expireAt` 字段。请求读到 `expireAt` 已过期时，触发异步刷新，刷新期间返回旧值。

```java
public Product getProduct(Long id) {
    String key = "product:" + id;
    CacheData data = redis.opsForValue().get(key);
    if (data == null) {
        // 冷启动：理论上预热过不会发生
        return loadFromDb(id);
    }
    if (!data.isLogicalExpired()) {
        return data.getData();
    }
    // 已过期：尝试加锁异步刷新
    String lockKey = "lock:" + key;
    if (redis.opsForValue().setIfAbsent(lockKey, "1", Duration.ofSeconds(10))) {
        executor.submit(() -> {
            try {
                Product fresh = productMapper.selectById(id);
                CacheData newData = new CacheData(fresh, System.currentTimeMillis() + 5 * 60_000);
                redis.opsForValue().set(key, newData);  // 不设 TTL
            } finally {
                redis.delete(lockKey);
            }
        });
    }
    return data.getData();  // 仍返回旧值
}
```

**优点**：请求不会集中打到 DB，热点读延迟稳定。
**缺点**：短时间返回旧数据，需要后台刷新和兜底机制。适合允许短暂不一致的热点数据。

### 方案三：永不过期 + 主动更新

热点 key 不设 TTL，由业务在数据变更时主动覆盖。需要预热机制保证缓存启动时已存在。

```java
public void updateProduct(Product p) {
    productMapper.updateById(p);
    redis.opsForValue().set("product:" + p.getId(), p);  // 无 TTL，主动覆盖
}

// 启动预热
@PostConstruct
public void preload() {
    List<Product> hots = productMapper.selectTopHots(1000);
    for (Product p : hots) {
        redis.opsForValue().set("product:" + p.getId(), p);
    }
}
```

**优点**：彻底避免击穿。
**缺点**：数据变更后缓存需同步更新，否则长期是旧值；冷启动需要预热。

### 方案四：多级缓存

L1 本地缓存兜底，Redis 失效后本地缓存仍可服务几十秒，给重建留时间。详见"本地缓存与 Redis 缓存区别"。

## 代码示例

### 互斥锁完整版（含双重检查和降级）

```java
@Service
public class ProductService {
    @Autowired private RedisTemplate<String, Product> redis;
    @Autowired private ProductMapper productMapper;

    public Product getProductWithFallback(Long id) {
        String key = "product:" + id;
        Product p = redis.opsForValue().get(key);
        if (p != null) return p;

        String lockKey = "lock:" + key;
        try {
            boolean locked = redis.opsForValue()
                .setIfAbsent(lockKey, "1", Duration.ofSeconds(10));
            if (locked) {
                try {
                    p = redis.opsForValue().get(key);  // 双重检查
                    if (p != null) return p;
                    p = productMapper.selectById(id);
                    if (p != null) {
                        long ttl = 1800 + ThreadLocalRandom.current().nextInt(300);
                        redis.opsForValue().set(key, p, Duration.ofSeconds(ttl));
                    }
                    return p;
                } finally {
                    redis.delete(lockKey);
                }
            } else {
                // 等待 50ms 后重试一次
                Thread.sleep(50);
                p = redis.opsForValue().get(key);
                if (p != null) return p;
                return getDefaultProduct();  // 降级
            }
        } catch (Exception e) {
            return getDefaultProduct();
        }
    }

    private Product getDefaultProduct() {
        return Product.DEFAULT;
    }
}
```

### Redisson 互斥锁（生产推荐）

```java
@Service
public class ProductService {
    @Autowired private RedissonClient redisson;
    @Autowired private RedisTemplate<String, Product> redis;
    @Autowired private ProductMapper productMapper;

    public Product getProduct(Long id) {
        String key = "product:" + id;
        Product p = redis.opsForValue().get(key);
        if (p != null) return p;

        RLock lock = redisson.getLock("lock:" + key);
        try {
            // 最多等 5 秒，持锁 10 秒
            if (lock.tryLock(5, 10, TimeUnit.SECONDS)) {
                try {
                    p = redis.opsForValue().get(key);  // 双重检查
                    if (p != null) return p;
                    p = productMapper.selectById(id);
                    if (p != null) {
                        redis.opsForValue().set(key, p, Duration.ofMinutes(30));
                    }
                    return p;
                } finally {
                    if (lock.isHeldByCurrentThread()) lock.unlock();
                }
            }
            // 等待后重试
            Thread.sleep(50);
            return redis.opsForValue().get(key);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return getDefaultProduct();
        }
    }
}
```

## 实战场景

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 秒杀商品详情 | 互斥锁 + 预热 | 强一致，避免超卖 |
| 微博热搜 | 逻辑过期 | 允许短时旧数据 |
| 首页推荐位 | 永不过期 + 主动更新 | 数据可控，更新有触发点 |
| 直播间在线人数 | 多级缓存 | 容忍短时不一致 |
| 配置类数据 | 永不过期 + 后台刷新 | 几乎不变 |
| 限时活动结束 | 互斥锁 | 强一致，过期即下线 |

## 深挖追问

### 互斥锁和逻辑过期怎么选？

| 维度 | 互斥锁 | 逻辑过期 |
|------|--------|----------|
| 一致性 | 强 | 弱（短时间旧值） |
| 用户体验 | 部分请求等待 | 无等待 |
| 实现复杂度 | 中 | 中 |
| 超高并发 | 可能锁竞争激烈 | 平滑 |
| 容忍旧数据 | 否 | 是 |

强一致选互斥锁，超高峰值选逻辑过期。

### 互斥锁的锁超时怎么设？

- 太短：业务还没查完 DB，锁就过期了，其他线程提前进入；
- 太长：持锁线程异常时，其他线程等太久。

经验值：略大于 DB 查询耗时，通常 5~10 秒。可结合看门狗续期（Redisson 的 `watchdog` 默认 30 秒续期）。

### 锁持有者异常退出怎么办？

必须设过期时间 + 业务异常 try-finally 释放锁。更稳妥的方式是用 Redisson，它内置看门狗自动续期，避免业务执行时间超过锁 TTL。

### 逻辑过期如何保证最终一致？

后台刷新失败时会一直返回旧值。需要：

1. 异步刷新失败重试（限次）；
2. 设最大旧值返回时间（如 10 分钟），超时强制同步加载；
3. 监控逻辑过期时长，超阈值告警；
4. 配合 binlog 订阅主动更新。

### 击穿和穿透、雪崩的区别？

- 击穿：单热点 key 失效，针对"个别高 QPS key"；
- 穿透：查不存在的数据，针对"恶意攻击或 bug"；
- 雪崩：大面积 key 同时失效，针对"批量预热或 Redis 宕机"。

方案完全不同：击穿用互斥锁/逻辑过期；穿透用布隆过滤器/缓存空值；雪崩用 TTL 随机化/多级缓存。

### 互斥锁会不会死锁？

不会，前提：

1. 锁必须设过期时间（避免持锁者崩溃导致永久锁）；
2. 释放锁用 Lua 比对 value（避免误删他人锁）；
3. 业务用 try-finally 保证释放；
4. 锁粒度按 key，避免嵌套锁。

## 易错点

- 把击穿和穿透混为一谈，方案选错；
- 互斥锁不设过期时间，死锁风险；
- 拿锁后不二次检查缓存，重复查 DB；
- 锁粒度过大（如全局锁），吞吐骤降；
- 逻辑过期没有兜底，长期返回旧值；
- 未拿到锁的请求无限重试，加剧雪崩；
- 锁释放时直接 `DEL`，没比对 value，误删他人锁。

## 总结

缓存击穿是**单热点 key 失效瞬间**的并发穿透问题。**互斥锁**适合强一致场景，**逻辑过期**适合超高并发且容忍短时旧值的场景。生产实践还会配合预热、永不过期、多级缓存、限流降级。**关键是识别热点 key 并提前规划**，而不是等线上挂了再救火。

## 参考资料

- [Redis 官方文档：Distributed locks](https://redis.io/docs/manual/patterns/distributed-locks/)
- [Redisson 看门狗机制](https://github.com/redisson/redisson/wiki/8.-distributed-locks-and-synchronizers)

---
