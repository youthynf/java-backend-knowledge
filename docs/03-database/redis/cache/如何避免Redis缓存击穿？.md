# 如何避免 Redis 缓存击穿？

## 核心概念

缓存击穿指某个热点 key 过期或失效瞬间，大量并发请求同时打到数据库，导致数据库压力骤增。它和缓存穿透、缓存雪崩不同：穿透是查询不存在的数据，雪崩是大量 key 同时失效，击穿通常针对单个热点 key。

常见解决方案包括互斥锁重建缓存、逻辑过期、热点 key 永不过期、异步刷新、多级缓存和限流降级。

## 面试官想考什么

- 是否能区分击穿、穿透、雪崩；
- 是否知道互斥锁和逻辑过期的实现思路；
- 是否能考虑锁超时、双重检查、异常兜底；
- 是否理解热点 key 识别和容量治理。

## 标准回答

> 避免缓存击穿可以对热点 key 使用互斥锁：缓存未命中时只有一个线程查数据库并回填，其他线程等待或返回旧值；也可以使用逻辑过期，让缓存物理上不过期，请求发现逻辑过期后异步刷新，刷新期间继续返回旧值。对于特别核心的热点数据，可以预热缓存、设置较长 TTL 加随机抖动，并配合限流和降级。

## 深挖追问

### 互斥锁方案要注意什么？

加锁要设置过期时间，防止线程异常导致死锁；拿到锁后要二次检查缓存，避免重复重建；数据库查询失败时不要删除旧值；锁粒度应按 key 控制，避免全局锁。

### 逻辑过期有什么优缺点？

优点是请求不会集中打到数据库，热点读延迟稳定；缺点是可能短时间返回旧数据，且需要后台刷新和兜底机制，适合允许短暂不一致的热点数据。

## 实战场景 / 代码示例

```java
public Product getProduct(Long id) {
    String key = "product:" + id;
    Product p = redis.get(key, Product.class);
    if (p != null && !p.isLogicalExpired()) return p;

    String lockKey = "lock:" + key;
    if (redis.setIfAbsent(lockKey, "1", Duration.ofSeconds(10))) {
        try {
            Product again = redis.get(key, Product.class);
            if (again == null || again.isLogicalExpired()) {
                Product fresh = db.queryProduct(id);
                fresh.setExpireAt(System.currentTimeMillis() + 5 * 60_000);
                redis.set(key, fresh, Duration.ofHours(6));
                return fresh;
            }
            return again;
        } finally {
            redis.del(lockKey);
        }
    }
    return p; // 返回旧值或短暂降级
}
```

## 易错点 / 总结

- 击穿是热点 key 失效，不是不存在 key；
- 分布式锁必须有过期时间和安全释放；
- 重建缓存前要二次检查；
- 逻辑过期牺牲强一致换稳定性；
- 热点 key 要配合监控、预热、限流，而不是只靠代码。
