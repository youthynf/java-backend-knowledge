# Redis 布隆过滤器如何使用

## 核心概念

布隆过滤器（Bloom Filter）是一种空间效率极高的概率数据结构，用一个位数组 + 多个哈希函数判断元素"**可能存在**"或"**一定不存在**"。它有误判率（false positive），但没有假阴性（false negative）：说"存在"可能错，说"不存在"一定对。

典型用途：缓存穿透防护、URL 去重、海量数据存在性判断、邮箱/用户名是否注册等。

一句话结论：**Redis 4.0 起通过 RedisBloom 模块原生支持布隆过滤器（`BF.ADD`/`BF.EXISTS`），也可用 Bitmap 手动实现。判断"不存在"100% 准确，判断"存在"有误判率（如 0.1%）。不支持删除元素（Counting BF 或 Cuckoo Filter 才支持）。**

## 标准回答

| 维度 | 布隆过滤器 | Set/Hash |
|------|------------|----------|
| 空间占用 | 极省（1 亿 key 约 100MB） | 大（存原值） |
| 查询复杂度 | O(k)，k 是哈希函数个数 | O(1) |
| 是否精确 | 不存在精确，存在有误判 | 精确 |
| 删除元素 | 不支持（标准 BF） | 支持 |
| 适用 | 海量数据存在性判断 | 精确去重 |

## 详细机制

### 1. 原理

布隆过滤器由两部分组成：

- **位数组（bit array）**：m 位，初始全 0；
- **k 个哈希函数**：每个把元素映射到位数组的某个位置。

**写入元素 x**：

1. 用 k 个哈希函数计算 x，得到 k 个位置；
2. 把位数组这 k 个位置都置 1。

**查询元素 y**：

1. 用 k 个哈希函数计算 y，得到 k 个位置；
2. 检查这 k 个位置：
   - 全为 1 → "可能存在"（可能其他元素也把这些位置置 1 了，造成误判）；
   - 至少一个为 0 → "一定不存在"。

```text
写入 "hello":
  hash1("hello") = 3   →  bit[3] = 1
  hash2("hello") = 7   →  bit[7] = 1
  hash3("hello") = 11  →  bit[11] = 1

查询 "world":
  hash1("world") = 5   →  bit[5] = 0  →  "一定不存在"

查询 "hello":
  bit[3]=1, bit[7]=1, bit[11]=1  →  "可能存在"
```

### 2. 误判率与参数选择

误判率 p、位数组大小 m、哈希函数个数 k、元素数量 n 满足：

```
m = -(n * ln p) / (ln 2)^2
k = (m / n) * ln 2
```

经验值：

| 元素数 n | 误判率 p | 位数组 m | 哈希数 k | 内存占用 |
|----------|----------|----------|----------|----------|
| 100 万 | 1% | 9.6 MB | 7 | 1.2 MB |
| 100 万 | 0.1% | 14.4 MB | 10 | 1.8 MB |
| 1 亿 | 1% | 960 MB | 7 | 120 MB |
| 1 亿 | 0.1% | 1.4 GB | 10 | 180 MB |

注意：实际 RedisBloom 内部还有头部开销，约多 5%~10%。

### 3. Redis 中的两种实现

#### 方式一：RedisBloom 模块（推荐）

Redis 4.0 起可通过加载 RedisBloom 模块获得原生 BF 命令。云厂商（阿里云、腾讯云）Redis 企业版通常内置。

```bash
# 创建布隆过滤器，容量 100 万，误判率 0.1%
BF.RESERVE user_filter 0.001 1000000

# 添加元素
BF.ADD user_filter "user:1001"
BF.MADD user_filter "user:1002" "user:1003" "user:1004"

# 检查存在性
BF.EXISTS user_filter "user:1001"     # 1（可能存在）
BF.EXISTS user_filter "user:9999"     # 0（一定不存在）
BF.MEXISTS user_filter "user:1001" "user:9999"
# 1) (integer) 1
# 2) (integer) 0

# 查看信息
BF.INFO user_filter
```

**优点**：原生支持，性能高，API 友好。

#### 方式二：用 Bitmap 手动实现

不支持 RedisBloom 时，用 `SETBIT`/`GETBIT` + 客户端哈希函数实现。

```bash
# 假设位数组 8388608 位（1MB）
SETBIT bf:filter 8388607 0   # 初始化最大位

# 写入元素（客户端计算 k 个哈希位置）
SETBIT bf:filter 1234567 1
SETBIT bf:filter 2345678 1
SETBIT bf:filter 3456789 1

# 查询
GETBIT bf:filter 1234567   # 1
GETBIT bf:filter 9999999   # 0
```

客户端实现（Java）：

```java
public class SimpleBloomFilter {
    private final int size;
    private final int hashNum;
    private final BitSet bits;

    public SimpleBloomFilter(int expected, double fpp) {
        this.size = (int) (-expected * Math.log(fpp) / (Math.log(2) * Math.log(2)));
        this.hashNum = Math.max(1, (int) Math.round((double) size / expected * Math.log(2)));
        this.bits = new BitSet(size);
    }

    public void add(String value) {
        for (int i = 0; i < hashNum; i++) {
            bits.set(hash(value, i));
        }
    }

    public boolean mightContain(String value) {
        for (int i = 0; i < hashNum; i++) {
            if (!bits.get(hash(value, i))) return false;
        }
        return true;
    }

    private int hash(String value, int seed) {
        int h = 0;
        for (char c : value.toCharArray()) {
            h = h * 31 + c + seed;
        }
        return Math.abs(h) % size;
    }
}
```

### 4. 不支持删除的问题

标准布隆过滤器位数组的某一位可能被多个元素共享（都置 1）。直接把某位置 0 会影响其他元素，导致"存在"被误判为"不存在"。

**解决方案**：

- **Counting Bloom Filter**：每个位用 4bit 计数器代替，加 1/减 1。占用更多内存；
- **Cuckoo Filter**：基于布谷鸟哈希，支持删除，RedisBloom 提供 `CF.*` 命令；
- **定期重建**：业务低峰期清空 BF 重新构建。

### 5. RedisBloom 模块安装

```bash
# 1. 下载模块
git clone https://github.com/RedisBloom/RedisBloom.git
cd RedisBloom
make

# 2. redis.conf 配置加载
loadmodule /path/to/redisbloom.so

# 3. 启动 Redis
redis-server redis.conf
```

云厂商企业版 Redis 通常已预装。

### 6. RedisBloom 自动扩容

`BF.RESERVE` 时指定容量是初始容量。如果实际元素数超过容量，RedisBloom 会自动创建子过滤器（扩容），误判率会保持但内存增加。生产建议预估容量 ×2 留余量。

## 代码示例

### Redisson 用布隆过滤器

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

@Service
public class UserService {
    @Autowired private RBloomFilter<String> userBloom;
    @Autowired private RedisTemplate<String, User> redis;
    @Autowired private UserMapper userMapper;

    public void register(Long userId) {
        userMapper.insert(userId);
        userBloom.add("user:" + userId);
    }

    public User getUser(Long userId) {
        String key = "user:" + userId;
        // 1. 布隆过滤器拦截
        if (!userBloom.contains(key)) {
            return null;  // 一定不存在
        }
        // 2. 查缓存
        User u = redis.opsForValue().get(key);
        if (u != null) return u;
        // 3. 查 DB
        u = userMapper.selectById(userId);
        if (u != null) {
            redis.opsForValue().set(key, u, Duration.ofMinutes(30));
        }
        return u;
    }
}
```

### 启动时预热

```java
@PostConstruct
public void initBloom() {
    long total = userMapper.count();
    bloomFilter.tryInit(total * 2, 0.001);  // 容量留 2 倍余量
    // 分页加载
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

### Spring Data Redis + Lua 批量插入

```java
private static final String BULK_ADD_LUA =
    "for i = 1, #ARGV do " +
    "  redis.call('BF.ADD', KEYS[1], ARGV[i]) " +
    "end " +
    "return 1";

public void bulkAdd(String filterName, List<String> items) {
    redis.execute(
        new DefaultRedisScript<>(BULK_ADD_LUA, Long.class),
        Collections.singletonList(filterName),
        items.toArray()
    );
}
```

## 实战场景

| 场景 | 用法 | 容量/误判率 |
|------|------|-------------|
| 缓存穿透防护 | 写 DB 时 add，查询前 contains | 1 亿 / 0.1% |
| URL 爬虫去重 | 抓取前检查 | 1 亿 / 1% |
| 邮箱/手机号是否注册 | 注册前检查 | 千万 / 0.01% |
| 海量黑名单 | IP/用户黑名单 | 千万 / 0.1% |
| 推荐系统曝光去重 | 用户已看过哪些内容 | 1 亿 / 1% |
| 唯一约束辅助 | DB 唯一索引前的快速判断 | 千万 / 0.01% |
| 增量爬虫 | URL 是否已爬过 | 1 亿 / 1% |

## 深挖追问

### 布隆过滤器说"存在"准确吗？

不准确。"存在"可能是误判（其他元素把对应位都置 1 了）。误判率由参数控制，通常 0.1%~1%。**"不存在"100% 准确**。

### 容量预估错了怎么办？

如果实际元素数超过初始化容量，误判率会急剧上升。RedisBloom 支持自动扩容（创建时容量是初始子过滤器，满了之后追加新子过滤器），但内存占用也会增长。生产建议预估容量 ×2 留余量。

### 布隆过滤器能删除元素吗？

标准 BF 不能。要支持删除用：

- **Counting BF**：每个位用 4bit 计数器代替，加 1/减 1，内存翻 4 倍；
- **Cuckoo Filter**：基于布谷鸟哈希，支持删除，RedisBloom 提供 `CF.*` 命令；
- **定期重建**：业务低峰期清空 BF 重新构建。

```bash
# Cuckoo Filter（支持删除）
CF.RESERVE my_cf 1000000
CF.ADD my_cf "item1"
CF.EXISTS my_cf "item1"   # 1
CF.DEL my_cf "item1"      # 删除
CF.EXISTS my_cf "item1"   # 0
```

### 布隆过滤器和 Bitmap 有什么区别？

| 维度 | 布隆过滤器 | Bitmap |
|------|------------|--------|
| 用途 | 集合存在性判断 | 单值标记 |
| 哈希 | 多哈希 | 直接索引 |
| 误判 | 有 | 无 |
| 删除 | 不支持 | 支持 |

Bitmap 适合"键值域小且连续"（如用户 ID 1~1 亿），布隆过滤器适合"键值域大或字符串"。

### RedisBloom 模块如何安装？

```bash
# 1. 下载模块
git clone https://github.com/RedisBloom/RedisBloom.git
cd RedisBloom
make

# 2. redis.conf 配置加载
loadmodule /path/to/redisbloom.so

# 3. 启动 Redis
redis-server redis.conf
```

云厂商企业版 Redis 通常已预装。

### 数据新增时忘记写 BF 怎么办？

新数据会被 BF 判定为"不存在"，导致查询返回 null。解决：

- 写 DB 后立即 `BF.ADD`（同事务或同方法）；
- 加补偿机制：定时扫描最近新增的数据，补写到 BF；
- 用 binlog 订阅方式自动同步 BF。

### BF 容量满了误判率会怎样？

RedisBloom 自动扩容时新建子过滤器，新元素进入子过滤器。查询时所有子过滤器都检查。误判率会从初始 p 变为 `1 - (1-p1)(1-p2)...`，但每次扩容 RedisBloom 会按指数缩因子过滤器容量，保持整体误判率不超过设计值。

### Redisson RBloomFilter 与 RedisBloom 模块一致吗？

基本一致。Redisson 通过 Lua 脚本实现 BF，不依赖 RedisBloom 模块，所以普通 Redis 也能用。但 RedisBloom 模块性能更高（C 实现），且支持 `CF.*`、`TopK.*` 等更多结构。

## 易错点

- 容量预估过小，误判率飙升；
- 用标准 BF 期望删除元素；
- 误以为"存在"判断 100% 准确；
- 数据新增时不写入 BF，导致新数据被判定为不存在；
- 启动时不预热 BF，全部走 DB；
- 误判率调到极低（如 0.0001%），内存占用爆炸；
- 缓存空值的 value 用业务上可能的合法值（如 `"null"`），与真实数据冲突；
- 用 Bitmap 实现 BF 时位数组太小，哈希冲突严重。

## 总结

布隆过滤器是**空间极省的存在性判断结构**：判断"不存在"100% 准确，判断"存在"有误判率。Redis 4.0+ 用 RedisBloom 模块原生支持（`BF.ADD`/`BF.EXISTS`），生产推荐 Redisson 的 `RBloomFilter`。**核心场景是缓存穿透防护**：写 DB 时同步写入 BF，查询前先过 BF。注意预估容量留余量、不支持删除元素、误判率与内存占用的权衡。

## 参考资料

- [RedisBloom 官方文档](https://redis.io/docs/stack/bloom/)
- [布隆过滤器原理 - Wikipedia](https://en.wikipedia.org/wiki/Bloom_filter)
- [Redisson Bloom Filter](https://github.com/redisson/redisson/wiki/6.-distributed-objects#67-bloom-filter)

---
