# 如何避免 Redis 缓存穿透

## 核心概念

缓存穿透指**查询一个既不在缓存、也不在数据库中的数据**，每次请求都会打到 DB。常见诱因是恶意攻击（用不存在的 ID 大量请求）或业务 bug。与击穿、雪崩的区别：

- 穿透：数据**不存在**，DB 也没有；
- 击穿：**单个热点 key** 失效瞬间，大量请求打 DB；
- 雪崩：**大量 key 同时失效**，DB 压力骤增。

典型场景：恶意用户用 `id=-1` 或随机不存在的 ID 大量请求用户接口，每次都查 DB，可能把 DB 拖垮。

一句话结论：**避免缓存穿透的两个主流方案是缓存空值和布隆过滤器；上层再加参数校验和限流兜底。**

## 标准回答

| 方案 | 实现 | 优点 | 缺点 |
|------|------|------|------|
| 缓存空值 | 查不到的 key 也写空值入缓存，短 TTL | 简单、改动小 | 浪费内存、需定期清理 |
| 布隆过滤器 | 写 DB 时同步写入 BF，查询前先过 BF | 内存省、查询快 | 有误判率、删除困难 |
| 参数校验 | API 入口校验 ID 合法性 | 拦截非法请求 | 只能拦截明显非法 |
| 限流降级 | 对单 IP/接口限流 | 兜底防雪崩 | 不解决根本问题 |

生产实践通常**组合使用**：参数校验 + 布隆过滤器 + 缓存空值 + 限流。

## 详细机制

### 方案一：缓存空值

业务查询 DB miss 后，往 Redis 写一个空值（如 `"NULL"` 或空 JSON），设较短 TTL（如 60 秒）。

```java
public User getUser(Long id) {
    String key = "user:" + id;
    String val = redis.get(key);
    if (val != null) {
        return "NULL".equals(val) ? null : JSON.parseObject(val, User.class);
    }
    User u = userMapper.selectById(id);
    if (u == null) {
        redis.setex(key, 60, "NULL");  // 缓存空值 60 秒
    } else {
        redis.setex(key, 1800, JSON.toJSONString(u));
    }
    return u;
}
```

**优点**：实现简单，立竿见影。
**缺点**：

- 大量不存在的 key 会占内存；
- 短 TTL 后再次穿透；
- 数据新增后缓存仍是空值（直到 TTL 过期或主动删）。

适用：穿透 key 数量可控、能容忍短时不一致。

### 方案二：布隆过滤器

布隆过滤器（Bloom Filter）是位数组 + 多哈希函数的概率数据结构。**判定不存在则一定不存在，判定存在则可能存在（有误判率）**。

```text
写入流程：写 DB → 同步 SETBIT 到布隆过滤器
查询流程：BF 判断不存在 → 直接返回；BF 判断存在 → 查 Redis → 查 DB
```

Redis 4.0 起通过 `redisbloom` 模块原生支持布隆过滤器（`BF.ADD`、`BF.EXISTS`），也可用 RedisBitmap 手动实现。

```bash
# 使用 RedisBloom 模块
BF.RESERVE user_filter 0.001 1000000   # 误判率 0.1%，容量 100 万
BF.ADD user_filter "user:1001"
BF.EXISTS user_filter "user:1001"      # 返回 1
BF.EXISTS user_filter "user:9999"      # 返回 0
```

**优点**：内存极省（1 亿 key 约 100MB），查询 O(1)。
**缺点**：

- 有误判率（false positive），不能 100% 拦截；
- 标准布隆过滤器不支持删除（要靠 Counting BF）；
- 数据删除后 BF 仍认为存在，需周期重建。

适用：key 数量极大、能容忍少量误判。

### 方案三：参数校验

在 API 入口直接拦截非法请求。例如 ID 必须为正整数、UUID 格式合法等。简单粗暴但有效，能在源头挡住一部分恶意攻击。

```java
if (id == null || id <= 0) {
    throw new IllegalArgumentException("非法 ID");
}
// 短码格式校验
if (!Pattern.matches("^[a-zA-Z0-9]{6,12}$", code)) {
    throw new IllegalArgumentException("非法短码");
}
```

### 方案四：限流降级

针对单 IP、单接口、单用户的 QPS 做限流，超阈值直接拒绝或返回默认值。Sentinel、Hystrix、Guava RateLimiter 都可。

```java
@SentinelResource(value = "getUser", blockHandler = "blockHandler")
public User getUser(Long id) {
    // 业务逻辑
}

public User blockHandler(Long id, BlockException ex) {
    return User.DEFAULT;  // 降级返回默认值
}
```

## 代码示例

### 组合方案（参数校验 + 布隆过滤器 + 缓存空值）

```java
@Service
public class UserService {
    @Autowired private RedisTemplate<String, String> redis;
    @Autowired private UserMapper userMapper;
    @Autowired private RBloomFilter<String> userBloom;

    public User getUser(Long id) {
        // 1. 参数校验
        if (id == null || id <= 0) throw new IllegalArgumentException();

        String key = "user:" + id;
        // 2. 布隆过滤器
        if (!userBloom.contains(key)) {
            return null;  // 一定不存在
        }

        // 3. 查缓存
        String val = redis.opsForValue().get(key);
        if (val != null) {
            return "NULL".equals(val) ? null : JSON.parseObject(val, User.class);
        }

        // 4. 查 DB
        User u = userMapper.selectById(id);
        if (u == null) {
            redis.opsForValue().set(key, "NULL", Duration.ofSeconds(60));
        } else {
            redis.opsForValue().set(key, JSON.toJSONString(u), Duration.ofMinutes(30));
        }
        return u;
    }
}
```

### Redisson 布隆过滤器初始化

```java
@Configuration
public class BloomConfig {
    @Bean
    public RBloomFilter<String> userBloomFilter(RedissonClient redisson) {
        RBloomFilter<String> bf = redisson.getBloomFilter("user:bloom");
        // 容量 1 亿，误判率 0.1%
        bf.tryInit(100_000_000L, 0.001);
        return bf;
    }
}

// 启动时预热
@PostConstruct
public void initBloom() {
    long total = userMapper.count();
    bloomFilter.tryInit(total * 2, 0.001);  // 容量留 2 倍余量
    int pageSize = 5000;
    for (int page = 0; ; page++) {
        List<Long> ids = userMapper.selectIds(page * pageSize, pageSize);
        if (ids.isEmpty()) break;
        for (Long id : ids) {
            bloomFilter.add("user:" + id);
        }
    }
}
```

## 实战场景

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 用户查询被恶意刷不存在的 ID | 布隆过滤器 + 缓存空值 | 双层拦截 |
| 商品详情页被爬虫遍历 ID | 布隆过滤器 + 限流 | 商品总数有限 |
| 订单查询被恶意用户刷 | 参数校验 + 限流 | 用户只能查自己的 |
| 短链跳转 | 布隆过滤器 | 短码数量可控 |
| 全文搜索不存在的关键词 | 缓存空值 | 关键词空间不可枚举 |
| 邮箱/手机号是否注册 | 布隆过滤器 | 注册量大，需快速判断 |

## 深挖追问

### 布隆过滤器的误判率怎么算？

误判率 p、位数组大小 m、哈希函数个数 k、元素数量 n 满足：

```
m = -(n * ln p) / (ln 2)^2
k = (m / n) * ln 2
```

例如 n = 1 亿、p = 0.01%，m ≈ 191 MB、k = 8。

### 布隆过滤器能删除元素吗？

标准布隆过滤器不能删除（多个元素可能共用一个 bit）。要支持删除需用：

- **Counting Bloom Filter**：每个位用 4bit 计数器代替，加 1/减 1，内存翻 4 倍；
- **Cuckoo Filter**：基于布谷鸟哈希，支持删除，RedisBloom 提供 `CF.*` 命令；
- **定期重建**：业务低峰期清空 BF 重新构建。

### 缓存空值和布隆过滤器选哪个？

| 维度 | 缓存空值 | 布隆过滤器 |
|------|----------|------------|
| 内存占用 | 高（每个不存在的 key 都要存） | 低 |
| 实现复杂度 | 低 | 中（需维护 BF） |
| 拦截率 | 100%（针对已缓存过的 key） | 高（受误判影响） |
| 数据新增 | TTL 内仍判空，需主动删 | BF 同步更新即可 |
| 数据删除 | TTL 内仍判存在 | 标准 BF 不支持删除 |

数据量小选缓存空值，数据量大选布隆过滤器，组合用最好。

### 布隆过滤器启动时如何预热？

应用启动时遍历 DB（分页查询），把所有 key 加入 BF。注意分批避免内存溢出。或者用 RedisBloom 模块的 `BF.ADD` 命令在 Redis 端构建。

### 布隆过滤器说"存在"准确吗？

不准确。"存在"可能是误判（其他元素把对应位都置 1 了）。误判率由参数控制，通常 0.1%~1%。**"不存在"100% 准确**。所以 BF 是"挡不存在"的工具，不是"挡存在"的工具。

### 数据新增时忘记写 BF 怎么办？

新数据会被 BF 判定为"不存在"，导致查询返回 null。解决：

- 写 DB 后立即 `BF.ADD`（同事务或同方法）；
- 加补偿机制：定时扫描最近新增的数据，补写到 BF；
- 用 binlog 订阅方式自动同步 BF。

## 易错点

- 只用缓存空值，未配短 TTL，导致内存膨胀；
- 布隆过滤器初始化容量太小，后期误判率激增；
- 数据删除时未同步删 BF（标准 BF 本就不支持，需重建）；
- 新增数据时忘记写入 BF，导致新数据被判定为不存在；
- 误以为布隆过滤器 100% 准确；
- 缓存空值的 value 用业务上可能的合法值（如 `"null"`），与真实数据冲突。

## 总结

缓存穿透是"查不存在的数据"。**核心方案是缓存空值（简单）和布隆过滤器（高效）**。生产实践组合使用：参数校验挡非法、布隆过滤器挡不存在、缓存空值挡漏网、限流兜底防雪崩。布隆过滤器要预估容量和误判率，并解决数据新增/删除的同步问题。

## 参考资料

- [RedisBloom 模块文档](https://redis.io/docs/stack/bloom/)
- [布隆过滤器原理 - Wikipedia](https://en.wikipedia.org/wiki/Bloom_filter)
- [Redisson Bloom Filter](https://github.com/redisson/redisson/wiki/6.-distributed-objects#67-bloom-filter)

---
