# Redis 的 LRU 算法与 LFU 算法有什么区别

## 核心概念

LRU（Least Recently Used，最近最少使用）和 LFU（Least Frequently Used，最不经常使用）是两种经典缓存淘汰算法。Redis 4.0 起同时支持两种：`allkeys-lru`/`volatile-lru` 和 `allkeys-lfu`/`volatile-lfu`。理解它们的差异，才能为业务选对淘汰策略。

一句话结论：**LRU 淘汰"最久没访问"的 key，依据是访问时间；LFU 淘汰"访问频次最低"的 key，依据是访问频率。Redis 的 LRU 是近似实现（采样 5 个），LFU 用 8bit 对数计数器 + 时间衰减。**

## 标准回答

| 维度 | LRU | LFU |
|------|-----|-----|
| 全称 | Least Recently Used | Least Frequently Used |
| 依据 | 最后访问时间 | 访问频次（带衰减） |
| 适合场景 | 时间局部性强 | 频率局部性强 |
| 抗扫描污染 | 弱（扫描会冲掉热点） | 强 |
| 老热点淘汰 | 容易 | 难（衰减设计弥补） |
| Redis 实现 | 近似 LRU，采样 5 个 | 8bit 计数器 + 衰减 |
| Redis 引入版本 | 2.x | 4.0 |

## 详细机制

### 一、传统 LRU 实现

传统 LRU 用双向链表 + 哈希表：每次访问把节点移到链表头，淘汰时删链表尾。

**优点**：精确，O(1) 操作。
**缺点**：

1. 每个节点要维护前后指针，内存开销大；
2. 大量访问时要频繁移动节点，影响性能。

Redis 没有采用这种实现，因为对它来说开销太大（每条命令都要移动链表节点）。

### 二、Redis 的近似 LRU

Redis 在对象头 `redisObject` 中有一个 24bit 的 `lru` 字段，记录该 key 最后访问的时间戳（秒级精度，约 194 天循环一次）。

淘汰时**随机采样**若干 key，淘汰其中 `lru` 字段最旧（最久未访问）的那个。采样数量由 `maxmemory-samples` 控制，默认 5。

```conf
maxmemory-policy allkeys-lru
maxmemory-samples 5   # 默认 5，调到 10 更精确
```

Redis 3.0 之后引入了"淘汰候选池"（eviction pool）：每次采样不是直接淘汰，而是把候选 key 加入一个池子（默认 16），淘汰池中最旧的。多次采样后池子维护了近似 LRU 的全局视图，效果接近真实 LRU。

**优点**：

- 不需要维护大链表，节省内存；
- 不需要在每次访问时移动链表项。

**缺点**：

- 不精确，但实测 samples=5 时已接近真实 LRU 80% 的命中率，samples=10 时接近 95%；
- 抗扫描污染能力弱（一次大批量查询会"挤掉"真正的热点）。

### 三、传统 LFU 实现

传统 LFU 给每个 key 维护访问次数，淘汰次数最少的。问题：老热点即使不再被访问，因次数高而永不淘汰（"缓存污染"反向版本）。

### 四、Redis 的 LFU 实现

Redis 4.0 引入 LFU，复用 `redisObject` 中 24bit 的 `lru` 字段，但拆成两段：

```text
24 bit 的 lru 字段：
  高 16 bit: ldt (Last Decrement Time) - 上次衰减时间（分钟精度）
  低 8 bit:  logc (Logistic Counter)    - 对数计数器，范围 0~255
```

**logc 的特点**：

- 不是简单的访问次数，而是"访问频次"的对数；
- 新 key 初始值为 5（`LFU_INIT_VAL`）；
- 值越大表示越热，但增长越慢（对数概率增长）；
- 范围 0~255，避免溢出。

**logc 增长**（每次访问）：

- 先按"距上次访问时长"做衰减；
- 再按概率增加 1（logc 越大，增加概率越低）。

衰减公式（简化）：

```
elapsed_minutes = now - ldt
decay = elapsed_minutes / lfu-decay-time
logc = max(0, logc - decay)
```

增长公式（简化）：

```
r = random(0, 1)
p = 1.0 / (logc * lfu-log-factor + 1)
if r < p: logc += 1
```

**衰减的意义**：让老热点逐渐被遗忘。如果一个 key 之前很热但近期没访问，logc 会随时间衰减，最终被淘汰。

### 五、相关配置

```conf
# LFU 衰减时间（分钟），默认 1。N 分钟没访问，logc 衰减 1
lfu-decay-time 1

# LFU 增长因子，默认 10。越大 logc 增长越慢，区分度越高
lfu-log-factor 10
```

调优建议：

- `lfu-decay-time` 调大：衰减慢，老热点留得久；
- `lfu-log-factor` 调大：logc 增长慢，热点与冷数据区分度高，但需要更多访问才能"出人头地"。

| lfu-log-factor | 1 次访问后 logc | 100 次访问后 logc | 1000 次访问后 logc |
|----------------|----------------|-------------------|---------------------|
| 0 | 1 | 100 | 255 |
| 10（默认） | 1 | 7 | 18 |
| 100 | 1 | 2 | 5 |

### 六、查看 key 的访问信息

```bash
OBJECT FREQ key      # LFU 模式下查看 logc（仅 4.0+）
OBJECT IDLETIME key  # LRU 模式下查看空闲时间
```

注意：

- `OBJECT FREQ` 仅在 LFU 策略下可用，LRU 模式会报错；
- `OBJECT IDLETIME` 仅在 LRU 策略下可用；
- 这两个命令本身不会更新 key 的访问时间（不会重置 lru 字段）。

## 代码示例

切换策略并观察：

```bash
# 切到 LFU
CONFIG SET maxmemory-policy allkeys-lfu

# 写入并访问
SET user:1 a
GET user:1
GET user:1
GET user:1

# 查看频次
OBJECT FREQ user:1   # 返回 6 或 7（初始 5 + 增长）

# 等几分钟后再查
OBJECT FREQ user:1   # 数值会衰减
```

Java 客户端查询：

```java
@Autowired private RedisTemplate<String, ?> redis;

public void printKeyInfo(String key) {
    RedisConnection conn = redis.getConnectionFactory().getConnection();
    // LRU 模式
    Long idle = conn.objectIdletime(key.getBytes());
    System.out.println("空闲时间：" + idle + " 秒");
    // LFU 模式
    // Long freq = conn.objectFreq(key.getBytes());  // 4.0+
}
```

## 实战场景

| 场景 | 策略 | 原因 |
|------|------|------|
| 商品/用户信息缓存 | LRU | 时间局部性强 |
| 热搜/排行榜缓存 | LFU | 频率局部性强 |
| 扫描型业务（如离线统计） | LFU | 防 LRU 污染 |
| 配置类数据 | 任意（差别不大） | 访问均匀 |
| 历史数据归档 | LRU | 旧数据不再访问 |
| 突发热点（微博热搜） | LFU | 高频访问需要保留 |

## 深挖追问

### 为什么 Redis LRU 是近似的？

精确 LRU 要维护双向链表，每次访问都要移动节点。Redis 是单线程，频繁的链表操作会拖慢所有命令。采样近似虽然不精确，但实测 samples=10 时命中率已接近真实 LRU。

### LFU 的 logc 为什么用对数？

线性计数会很快溢出（8bit 最多 255）。对数让低频区域敏感（0~10 区分明显），高频区域迟钝（200 和 255 都算很热），符合"区分冷热"的需求。

### LFU 一定比 LRU 好吗？

不一定。如果业务访问模式本身就是"最近访问还会再访问"（强时间局部性），LRU 更合适。LFU 在"访问频率差异大"的场景才占优。生产实践可压测对比两者命中率。

### 怎么观察当前实例用的是什么算法？

```bash
CONFIG GET maxmemory-policy   # 看策略
OBJECT IDLETIME key            # LRU 模式：返回空闲秒数
OBJECT FREQ key                # LFU 模式：返回 logc
```

### 主从模式下淘汰策略在从节点生效吗？

不生效。从节点不主动淘汰，由主节点决定后通过 DEL 命令同步给从节点。

### 切换 LRU 到 LFU 时旧 key 的 lru 字段怎么处理？

旧 key 的 24bit 字段原本存的是时间戳（LRU 语义），切换到 LFU 后会被解读为 ldt + logc。第一次访问时按 LFU 逻辑处理（衰减 + 增长），所以切换瞬间表现可能不准，但很快会收敛。

### maxmemory-samples 调到 100 一定更好吗？

不一定。samples 越大每次淘汰 CPU 开销越大。Redis 官方测试显示 samples 从 5 到 10 命中率提升明显，从 10 到 50 提升微弱但 CPU 开销线性增长。生产建议 5~10。

### 为什么 LFU 用 8bit 而不是 16bit？

8bit = 255 上限配合对数增长，已足够区分冷热。16bit 会浪费内存（每个 key 多 1 字节，亿级 key 多 100MB）。8bit 是性能与精度的折中。

## 易错点

- 把 Redis LRU 当精确 LRU（实际是近似）；
- 误以为 LFU 是简单访问次数（实际是带衰减的对数计数）；
- `maxmemory-samples` 调太大影响性能；
- `lfu-log-factor` 调太小导致所有 key 都很快达到 255，无区分度；
- 扫描型业务用 LRU，缓存被一次性访问的冷数据占满；
- LRU 模式下用 `OBJECT FREQ` 报错；
- 误以为切换策略后所有 key 立即按新策略表现（实际有过渡）。

## 总结

LRU 看时间，LFU 看频率。Redis 都是近似实现：**LRU 用 24bit 时间戳 + 随机采样，LFU 用 8bit 对数计数器 + 时间衰减**。生产选型：通用缓存用 LRU，热点明显或抗扫描污染用 LFU。`maxmemory-samples` 控制 LRU 精度，`lfu-log-factor` 和 `lfu-decay-time` 控制 LFU 灵敏度。

## 参考资料

- [Redis 官方文档：Using Redis as an LRU cache](https://redis.io/docs/manual/eviction/)
- [Redis LFU implementation - antirez blog](http://antirez.com/news/109)
- [Redis 源码：evict.c](https://github.com/redis/redis/blob/unstable/src/evict.c)

---
