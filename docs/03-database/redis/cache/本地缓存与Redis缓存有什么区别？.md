# 本地缓存与 Redis 缓存有什么区别

## 核心概念

缓存按部署位置分为两类：**本地缓存**（如 Caffeine、Guava、Ehcache）运行在应用进程内，数据存在 JVM 堆中；**分布式缓存**（如 Redis、Memcached）独立部署，应用通过网络访问。两者不是替代关系，而是互补关系，大型系统通常组合使用形成"多级缓存"。

一句话结论：**本地缓存访问最快（纳秒级），但容量受 JVM 限制、不能跨实例共享；Redis 缓存可水平扩展、可共享，但每次访问都要走网络（毫秒级）。生产实践常组合为 L1 + L2 多级缓存。**

## 标准回答

| 维度 | 本地缓存（Caffeine/Guava） | Redis 缓存 |
|------|----------------------------|------------|
| 存储位置 | JVM 堆内存 | Redis 进程内存 |
| 访问延迟 | 纳秒级（~100ns） | 毫秒级（0.1~2ms，受网络影响） |
| 容量上限 | 受 JVM 堆限制（GB 级） | 单节点数十 GB，可集群扩展 |
| 数据共享 | 不共享，每个实例独立 | 多实例共享同一份数据 |
| 一致性 | 实例间易出现数据不一致 | 集中式存储，天然一致 |
| 容灾 | 应用重启即丢失 | Redis 单独宕机不影响应用进程 |
| 序列化 | 直接存对象，无需序列化 | 需序列化（JSON/Protobuf） |
| 数据结构 | 简单（Map、List） | 丰富（String/Hash/List/Set/ZSet/Stream） |
| 过期机制 | TTL/容量上限 | TTL + 内存淘汰策略 |
| 适用场景 | 读多写少、变更不频繁、可容忍不一致 | 强一致、跨实例共享、大容量 |

## 详细机制

### 一、本地缓存的特点

**优势**：

- 访问速度极快，无需网络往返，纳秒级响应；
- 减轻 Redis 和数据库压力；
- 不需要序列化，对象直接可用。

**劣势**：

- 容量受限于 JVM 堆，过大引发 GC 压力（尤其老年代膨胀）；
- 多实例间数据不共享，更新后其他实例仍是旧值；
- 应用重启数据丢失，冷启动时压力回退到 DB；
- 内存占用影响应用本身（堆增大 GC 时间）。

**典型实现（Caffeine）**：

```java
Cache<String, User> cache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .expireAfterWrite(Duration.ofMinutes(5))
    .expireAfterAccess(Duration.ofMinutes(10))
    .recordStats()
    .build();
```

Caffeine 使用 W-TinyLFU 算法（结合 LRU 和 LFU 优点），命中率显著高于 Guava 的 LRU。

### 二、Redis 缓存的特点

**优势**：

- 集中存储，多应用实例看到同一份数据；
- 容量可独立扩展，不受应用进程影响；
- 丰富的数据结构和过期机制（TTL + 8 种淘汰策略）；
- 持久化能力（RDB/AOF），重启不丢全部数据；
- 主从、哨兵、Cluster 高可用架构成熟。

**劣势**：

- 网络往返延迟（即便同机房也有 0.1~2ms）；
- 序列化/反序列化开销（JSON/Protobuf）；
- Redis 故障会影响全部依赖方（要做好降级）；
- 内存成本相对磁盘高。

### 三、多级缓存架构

实际生产中常组合两者形成多级缓存：

```text
请求 → L1 本地缓存（Caffeine） → L2 分布式缓存（Redis） → DB
```

设计要点：

- L1 命中率不必追求太高（10%~30%），主要拦截热点；
- L2 命中率要高（95%+），是 DB 的主要屏障；
- 数据更新时，先更新 DB → 删 Redis → 发广播消息让各实例清本地缓存（通过 Redis Pub/Sub 或 MQ）；
- L1 的 TTL 要短（秒级），避免长期不一致；
- L2 的 TTL 可长（分钟到小时），降低 DB 压力。

### 四、本地缓存一致性方案

多实例本地缓存的失效广播有三种主流方案：

1. **Redis Pub/Sub 广播**：实例订阅频道，更新时发失效消息。简单但 Pub/Sub 不保证送达（订阅者掉线丢消息）。
2. **MQ 广播**：用 RabbitMQ/Kafka 发失效事件，可靠性更高。延迟稍长。
3. **短 TTL**：5~30 秒过期，容忍短时不一致。最简单。

## 代码示例

### Spring Boot 多级缓存典型写法

```java
@Service
public class UserService {
    @Autowired private Cache<String, User> localCache;     // Caffeine
    @Autowired private RedisTemplate<String, User> redis;
    @Autowired private UserMapper userMapper;

    public User getUser(Long id) {
        String key = "user:" + id;
        // L1: 本地缓存
        User u = localCache.getIfPresent(key);
        if (u != null) return u;

        // L2: Redis
        u = redis.opsForValue().get(key);
        if (u != null) {
            localCache.put(key, u);
            return u;
        }

        // L3: DB
        u = userMapper.selectById(id);
        if (u != null) {
            redis.opsForValue().set(key, u, Duration.ofMinutes(30));
            localCache.put(key, u);
        }
        return u;
    }

    public void updateUser(User u) {
        userMapper.updateById(u);
        // 1. 先删 Redis
        redis.delete("user:" + u.getId());
        // 2. 广播清本地缓存（Pub/Sub 或 MQ）
        redis.convertAndSend("cache:invalidate", "user:" + u.getId());
    }

    // 订阅失效广播
    @RedisListener(channel = "cache:invalidate")
    public void onInvalidate(String key) {
        localCache.invalidate(key);
    }
}
```

### Caffeine 配置最佳实践

```java
@Bean
public Cache<String, User> localCache() {
    return Caffeine.newBuilder()
        .maximumSize(10_000)                      // 容量上限
        .expireAfterWrite(Duration.ofSeconds(30)) // 写后 30 秒过期
        .expireAfterAccess(Duration.ofSeconds(10)) // 访问后 10 秒过期
        .recordStats()                            // 开启统计
        .build();
}
```

### Spring Cache 多级抽象

```java
@Cacheable(cacheNames = "users", key = "#id")
public User getUser(Long id) {
    return userMapper.selectById(id);
}
```

配合 `CompositeCacheManager` 把 Caffeine 和 Redis 串联起来。

## 实战场景

| 场景 | 选型 | 原因 |
|------|------|------|
| 字典/配置类数据 | 本地缓存 | 几乎不变，访问频繁 |
| 用户基本信息 | Redis + 本地缓存 | 多实例共享，热点本地兜底 |
| 商品详情（大促） | 多级缓存 | 极端流量下 Redis 也扛不住 |
| 分布式锁、限流 | 必须用 Redis | 跨实例协调，本地无法实现 |
| 单实例小项目 | 仅 Redis | 简单，无多实例问题 |
| 秒杀库存扣减 | Redis + DB | 强一致，本地缓存不适用 |
| 验证码 | 本地缓存 | 5 分钟过期，无需共享 |
| Session 共享 | Redis | 多实例必须共享 |

## 深挖追问

### 本地缓存如何处理多实例一致性？

三种常见方案：

1. **TTL 短一点**：5~30 秒过期，容忍短时不一致；
2. **Redis Pub/Sub 广播失效**：实例订阅频道，更新时发失效消息；
3. **MQ 广播**：用 RabbitMQ/Kafka 发失效事件，可靠性更高。

### Caffeine 比 Guava Cache 强在哪？

Caffeine 是 Guava Cache 作者的下一代实现，使用 W-TinyLFU 算法（结合 LRU 和 LFU 优点），命中率显著高于 Guava 的 LRU。还支持异步加载、事件监听、统计更完善、性能高出约 30%。新项目应优先选 Caffeine，Spring Boot 5+ 默认集成。

### 什么场景不适合用本地缓存？

- 写多读少：缓存频繁失效，无意义；
- 数据强一致要求高：本地缓存难以保证多实例一致；
- 数据量极大：堆内存扛不住；
- 单实例部署的微服务：无共享需求，纯本地即可；
- 持久化要求：重启即丢，关键数据不能放本地缓存。

### 多级缓存失效顺序是怎样的？

更新时：先 DB → 删 Redis → 广播清本地缓存。读取时：L1 → L2 → DB。注意删除而非更新缓存，避免并发场景下的数据覆盖。

### 本地缓存导致 JVM OOM 怎么办？

- 必须设 `maximumSize` 或 `maximumWeight`；
- 监控 `Cache.stats()` 的 hit rate 和 eviction count；
- 用弱引用或软引用（`weakKeys()`/`softValues()`），但会影响命中率；
- 大对象不进本地缓存，只放 Redis；
- 单 key 体积上限要校验。

### Redis 故障时本地缓存能扛多久？

取决于本地缓存容量和命中率。一般能扛住 5~30 分钟，给运维抢修时间。但本地缓存命中率有限（10%~30%），不能长期替代 Redis。要做好降级策略：Redis 不可用时本地缓存兜底 + DB 限流。

## 易错点

- 把本地缓存当唯一缓存用，导致多实例数据不一致；
- 本地缓存不设上限，引发 OOM；
- 本地缓存不设 TTL，热数据冷了也不释放；
- 更新时只清本地不清 Redis，或反过来；
- 把大对象塞本地缓存，加剧 GC 压力；
- 多级缓存没做失效广播，更新后各实例数据发散；
- 本地缓存序列化对象版本不一致（如热部署后类结构变了，反序列化失败）。

## 总结

本地缓存快但不共享，Redis 共享但有网络开销。**生产实践不是二选一，而是组合使用形成多级缓存**：本地缓存作为最热数据的快速通道，Redis 作为共享数据层，DB 作为权威数据源。关键是设计好失效机制，避免多实例间的数据不一致。Caffeine 是当前 Java 生态最优秀的本地缓存实现。

## 参考资料

- [Caffeine 官方文档](https://github.com/ben-manes/caffeine)
- [Redis 官方文档：Client Side Caching](https://redis.io/docs/manual/client-side-caching/)
- [W-TinyLFU 论文](https://arxiv.org/pdf/1512.00727.pdf)

---
