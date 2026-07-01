# Redisson 和 Jedis 有什么区别

## 核心概念

Jedis 和 Redisson 都是 Java 生态的 Redis 客户端，但定位完全不同：**Jedis 是"Redis 命令的 Java 封装"**，API 贴近原生命令，轻量直接；**Redisson 是"分布式中间件"**，把 Redis 包装成 Java 数据结构服务，提供分布式锁、布隆过滤器、限流器、延迟队列等高级能力。

一句话结论：**简单 KV 操作选 Jedis（轻量、贴近原生）；分布式锁、限流、延迟队列等高级场景选 Redisson（封装完善、API 友好）。Spring Boot 默认 Lettuce 是第三选项。**

## 标准回答

| 维度 | Jedis | Redisson | Lettuce |
|------|-------|----------|---------|
| 定位 | Redis 命令的 Java 封装 | 分布式中间件 | 高性能异步客户端 |
| API 风格 | 贴近原生命令 | 面向对象 | 流式 + Reactive |
| 学习成本 | 低 | 中 | 中 |
| 功能丰富度 | 基础 | 高级（锁/限流/队列等） | 中 |
| 集群支持 | 基础 | 完善 | 完善 |
| 异步支持 | 有限 | 完整（基于 Netty） | 完整（基于 Netty） |
| 线程安全 | 否（每线程一连接） | 是 | 是（共享连接） |
| Spring Boot 默认 | 否（2.0 前） | 否 | 是（2.0+） |
| 适用场景 | 简单 CRUD | 分布式业务 | 高并发异步 |

## 详细机制

### 一、Jedis：轻量直接的命令封装

Jedis 的 API 几乎一对一映射 Redis 命令：

```java
Jedis jedis = new Jedis("127.0.0.1", 6379);
jedis.set("foo", "bar");
String val = jedis.get("foo");
jedis.lpush("list", "a", "b", "c");
jedis.close();
```

**优点**：

- API 简单直接，会 Redis 命令就会 Jedis；
- 体积小，依赖少；
- 简单场景性能略优（无额外封装）。

**缺点**：

- 集群、哨兵配置较繁琐；
- 不内置连接池（需手动配 commons-pool2）；
- 高级功能（如分布式锁）需自己用 Lua 实现；
- 多线程下非线程安全（需用连接池）。

**典型使用**：

```java
// 集群
Set<HostAndPort> nodes = new HashSet<>();
nodes.add(new HostAndPort("127.0.0.1", 7000));
nodes.add(new HostAndPort("127.0.0.1", 7001));
try (JedisCluster cluster = new JedisCluster(nodes)) {
    cluster.set("k1", "v1");
}
```

### 二、Redisson：分布式中间件

Redisson 把 Redis 包装成 Java 数据结构和服务，API 像操作本地对象一样操作分布式数据。

```java
Config config = new Config();
config.useClusterServers()
    .addNodeAddress("redis://127.0.0.1:7000");
RedissonClient redisson = Redisson.create(config);

// 分布式锁
RLock lock = redisson.getLock("myLock");
lock.lock();
try { /* ... */ } finally { lock.unlock(); }

// 分布式 Map
RMap<String, User> map = redisson.getMap("users");
map.put("u1", new User("Alice"));

// 原子计数器
RAtomicLong counter = redisson.getAtomicLong("counter");
counter.incrementAndGet();

// 布隆过滤器
RBloomFilter<String> bf = redisson.getBloomFilter("bf");
bf.tryInit(1_000_000, 0.001);
bf.add("item1");

// 延迟队列
RDelayedQueue<String> dq = redisson.getDelayedQueue(
    redisson.getQueue("tasks")
);
dq.offer("task1", 10, TimeUnit.MINUTES);
```

**优点**：

- 内置丰富分布式功能：可重入锁、公平锁、读写锁、信号量、闭锁、布隆过滤器、限流器、延迟队列等；
- API 面向对象，使用直观；
- 集群/哨兵/主从配置统一，切换方便；
- 异步 API 完整（基于 Netty）；
- 看门狗、Lua 脚本等底层细节封装好；
- 支持 Spring Data Redis 集成。

**缺点**：

- 体积大，依赖 Netty、Jackson 等；
- 简单场景下封装开销略大；
- 学习曲线略陡（API 不同于原生命令）。

### 三、Lettuce：Spring Boot 默认客户端

Spring Data Redis 2.0+ 默认客户端是 Lettuce，而非 Jedis。Lettuce 基于 Netty，支持异步、连接复用，API 类似 Redisson 但更轻量。

```java
RedisClient client = RedisClient.create("redis://127.0.0.1:6379");
StatefulRedisConnection<String, String> conn = client.connect();
RedisCommands<String, String> sync = conn.sync();
sync.set("key", "value");

RedisAsyncCommands<String, String> async = conn.async();
RFuture<String> future = async.get("key");
```

**优点**：

- 基于 Netty，线程安全（单连接多路复用）；
- 支持同步、异步、Reactive API；
- 比 Redisson 轻量，比 Jedis 功能强。

**缺点**：

- 高级分布式功能不如 Redisson；
- API 学习成本略高于 Jedis。

### 四、性能对比

简单 SET/GET 场景：Jedis 略快（约 5%~10%），因封装少。

复杂场景（分布式锁、限流）：Redisson 占优，因其 Lua 脚本和看门狗优化完善，避免业务侧重复造轮子。

| 场景 | Jedis | Redisson | Lettuce |
|------|-------|----------|---------|
| 简单 KV（10 万 QPS） | 略快 | 略慢（5%~10%） | 与 Jedis 相当 |
| 分布式锁（高并发） | 需手写 Lua | 内置看门狗，性能稳定 | 需手写 Lua |
| 限流 | 需手写 | 内置 RRateLimiter | 需手写 |
| 集群故障转移 | 客户端实现 | 内置自动重试 | 内置自动重试 |
| 异步场景 | 有限 | 完整 | 完整 |

## 代码示例

### Spring Boot 集成 Jedis

```xml
<dependency>
    <groupId>redis.clients</groupId>
    <artifactId>jedis</artifactId>
    <version>4.4.3</version>
</dependency>
<dependency>
    <groupId>org.apache.commons</groupId>
    <artifactId>commons-pool2</artifactId>
</dependency>
```

```java
@Configuration
public class JedisConfig {
    @Bean
    public JedisPool jedisPool() {
        JedisPoolConfig config = new JedisPoolConfig();
        config.setMaxTotal(100);
        config.setMaxIdle(20);
        config.setMinIdle(5);
        config.setMaxWaitMillis(3000);
        config.setTestOnBorrow(true);
        return new JedisPool(config, "127.0.0.1", 6379, 2000, null);
    }
}

@Service
public class CacheService {
    @Autowired private JedisPool pool;

    public void set(String k, String v) {
        try (Jedis j = pool.getResource()) {
            j.set(k, v);
        }
    }
}
```

### Spring Boot 集成 Redisson

```xml
<dependency>
    <groupId>org.redisson</groupId>
    <artifactId>redisson-spring-boot-starter</artifactId>
    <version>3.23.1</version>
</dependency>
```

```yaml
spring:
  redis:
    redisson:
      config: |
        clusterServersConfig:
          nodeAddresses:
            - "redis://127.0.0.1:7000"
            - "redis://127.0.0.1:7001"
        singleServerConfig:
          address: "redis://127.0.0.1:6379"
```

```java
@Service
public class LockService {
    @Autowired private RedissonClient redisson;

    public void doWithLock(String key) {
        RLock lock = redisson.getLock(key);
        try {
            lock.lock(30, TimeUnit.SECONDS);
            // 业务
        } finally {
            if (lock.isHeldByCurrentThread()) lock.unlock();
        }
    }
}
```

### Spring Boot 集成 Lettuce（默认）

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
<!-- 默认包含 Lettuce，无需额外配置 -->
```

```yaml
spring:
  redis:
    host: 127.0.0.1
    port: 6379
    lettuce:
      pool:
        max-active: 100
        max-idle: 20
        min-idle: 5
```

## 实战场景

| 场景 | 推荐 | 原因 |
|------|------|------|
| 简单缓存读写 | Jedis 或 Lettuce | 轻量 |
| 分布式锁 | Redisson | 内置看门狗、可重入 |
| 限流 | Redisson | 内置 RRateLimiter |
| 延迟队列 | Redisson | 内置 RDelayedQueue |
| 布隆过滤器 | Redisson | 内置 RBloomFilter |
| 高并发异步 | Lettuce / Redisson | 基于 Netty |
| 老项目维护 | Jedis | 兼容性 |
| Spring Boot 新项目 | Lettuce + Redisson | 默认 + 锁/限流 |

## 深挖追问

### Spring Data Redis 默认用哪个客户端？

Spring Boot 2.0+ 默认 Lettuce。如要用 Jedis 需排除 Lettuce 依赖并引入 Jedis。Redisson 通过 `redisson-spring-boot-starter` 替换默认客户端。

### Jedis 和 Redisson 能一起用吗？

可以。在 Spring Boot 中可以同时配置 JedisPool（用于简单 KV）和 RedissonClient（用于分布式锁）。但通常没必要，选其一即可。Redisson 也能做简单 KV 操作。

### Jedis 为什么不是线程安全的？

Jedis 实例直接持有 Socket，多线程共享会出错（读写交错）。生产用 JedisPool（连接池）每次借一个连接，用完归还。Lettuce 基于 Netty 单连接多路复用，天然线程安全。

### Redisson 性能比 Jedis 差多少？

简单 SET/GET 场景 Redisson 约慢 5%~10%，主要来自封装开销。但分布式锁等复杂场景，Redisson 的 Lua 脚本和看门狗优化使得整体表现优于手写 Jedis 实现。

### Redisson 的看门狗机制是什么？

`lock.lock()` 不传 leaseTime 时启动看门狗：每 10 秒检查持锁状态，若仍持锁则把 TTL 重置为 30 秒。这样业务执行时间不固定时也能避免锁提前释放。传 leaseTime 则不启动看门狗。

### Lettuce 的共享连接是什么意思？

Lettuce 单个连接可以被多个线程共享（基于 Netty 多路复用），不需要像 Jedis 那样维护连接池。但在高并发场景下，单连接吞吐有上限，所以生产仍建议配置 `lettuce.pool` 启用连接池。

### Redisson 的连接池配置？

```yaml
clusterServersConfig:
  idleConnectionTimeout: 10000
  connectTimeout: 10000
  timeout: 3000
  retryAttempts: 3
  retryInterval: 1500
  masterConnectionPoolSize: 64
  slaveConnectionPoolSize: 64
  idleConnectionPoolSize: 24
```

### 三者对 Redis Cluster 的支持？

- Jedis：基础支持，按 slot 路由，需手动处理 MOVED/ASK；
- Lettuce：完善支持，自动处理 MOVED/ASK，支持读从库；
- Redisson：完善支持，自动处理 MOVED/ASK，支持读从库，支持故障转移。

## 易错点

- 把 Jedis 当 Redisson 用，所有高级功能自己手写 Lua，维护成本高；
- 把 Redisson 当 Jedis 用，简单 CRUD 也走 Redisson 对象封装，浪费性能；
- 忽略 Spring Boot 默认是 Lettuce，混用客户端导致冲突；
- Jedis 不用连接池，每次 new Jedis() 导致连接数膨胀；
- Redisson 锁不释放（看门狗续期导致锁被长期持有）；
- Lettuce 不配连接池，高并发下单连接打满；
- 用了 Redisson 但仍手写 Lua 脚本，重复造轮子。

## 总结

Jedis、Redisson、Lettuce 是三种定位的 Redis 客户端：**Jedis 轻量、贴近原生命令，适合简单场景；Redisson 重封装、提供分布式服务，适合复杂业务；Lettuce 是 Spring Boot 默认，异步高性能**。生产实践按需选择：简单 CRUD 用 Jedis/Lettuce，分布式锁/限流/延迟队列用 Redisson。三者可在同项目共存，但通常没必要混用。

## 参考资料

- [Jedis GitHub](https://github.com/redis/jedis)
- [Redisson GitHub](https://github.com/redisson/redisson)
- [Lettuce GitHub](https://github.com/lettuce-io/lettuce-core)
- [Spring Data Redis Reference](https://docs.spring.io/spring-data/redis/reference/)

---
