# 如何解决 Redis 热 Key 问题

## 核心概念

热 Key 指某个或某几个 key 的访问量远高于其他 key，导致对应 Redis 分片（Cluster 模式下单个节点）CPU、带宽、内存单点倾斜，最终成为整个集群的瓶颈。和"大 key"的区别：大 key 是单个 value 体积大，热 key 是访问频次高。

典型场景：秒杀商品、微博热搜、首页推荐位、明星八卦。

一句话结论：**热 Key 的发现要靠客户端埋点统计 + `--hotkeys` 命令；解决思路是"分散"——读写分离、Key 拆分副本、本地缓存、限流降级。极端热 Key 用本地缓存是终极银弹。**

## 标准回答

| 阶段 | 方案 | 说明 |
|------|------|------|
| 发现 | `redis-cli --hotkeys`（4.0+） | Redis 自带，需开 LFU |
| 发现 | 客户端埋点统计 | 精准，最常用 |
| 发现 | Monitor 命令 | 抓实时命令，高并发慎用 |
| 发现 | Proxy/网关层统计 | 全局视角 |
| 发现 | 京东 hotkey 框架 | 客户端 SDK + 中心计算 |
| 解决 | 读写分离 | 读流量分散到从节点 |
| 解决 | Key 拆分/副本 | 一个 key 复制成多份，分散到不同分片 |
| 解决 | 本地缓存 | 应用内存兜底，纳秒级 |
| 解决 | 限流降级 | 超阈值返回默认值 |

## 详细机制

### 一、什么是热 Key

判定标准是"倾斜度"而非绝对 QPS：

| 维度 | 阈值 |
|------|------|
| QPS 集中 | 单 key QPS 占总 QPS 30%+ |
| 带宽集中 | 单 key 流量占网卡带宽 50%+ |
| CPU 集中 | 单 key 处理时间占 CPU 50%+ |

例如集群总 QPS 1 万，单个 key 占 7000，即使绝对值不算极高也是热 Key。

### 二、发现热 Key

#### 方法 1：`redis-cli --hotkeys`（4.0+）

需先开启 LFU 淘汰策略：

```bash
CONFIG SET maxmemory-policy allkeys-lfu
redis-cli --hotkeys
# 输出：
# 1) "product:1001" - hits: 98765
# 2) "product:2002" - hits: 54321
```

**优点**：原生支持，无需额外开发。
**缺点**：需开启 LFU（可能影响淘汰策略）；只能发现当前实例的热点；Cluster 模式需对每个分片执行。

#### 方法 2：客户端埋点统计（推荐）

应用层用 `ConcurrentHashMap` 或 `Caffeine` 累计每个 key 的访问次数，定时聚合上报到中心节点。

```java
LoadingCache<String, AtomicLong> counter = Caffeine.newBuilder()
    .expireAfterWrite(Duration.ofSeconds(1))
    .build(k -> new AtomicLong(0));

public String get(String key) {
    counter.get(key).incrementAndGet();
    return redis.get(key);
}

@Scheduled(fixedRate = 1000)
public void report() {
    Map<String, Long> top = counter.asMap().entrySet().stream()
        .sorted((a, b) -> Long.compare(b.getValue().get(), a.getValue().get()))
        .limit(10)
        .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().get()));
    mq.send("hotkey.report", top);
}
```

**优点**：精准、可定制阈值、能识别业务维度热点。
**缺点**：需开发量；采样精度受上报周期影响。

#### 方法 3：Monitor 命令

```bash
redis-cli MONITOR
# 实时输出所有命令
```

**警告**：高并发下 MONITOR 本身会显著降低 Redis 性能（输出所有命令到客户端）。仅用于低峰期排查。

#### 方法 4：Proxy/网关层

如用 Codis、Twemproxy 或自研代理，可在代理层统计热点。云厂商 Redis（阿里云、腾讯云）通常提供热 Key 分析功能。

#### 方法 5：京东 hotkey 框架

客户端 SDK 采集访问数据上报到中心计算节点，实时下发热 key 列表给所有实例，应用本地缓存自动加载。

**优点**：毫秒级发现，自动下发，无需业务侧统计逻辑；
**缺点**：引入额外组件，运维复杂。

### 三、解决热 Key

#### 方案 1：读写分离（适合读热点）

增加从节点，读请求分散到多个从节点。

```text
应用 → 主节点（写）
应用 → 从节点1（读）
应用 → 从节点2（读）
应用 → 从节点3（读）
```

**优点**：架构简单。
**缺点**：

- 主从复制延迟，读可能不一致；
- 不能解决写热点；
- 热点 key 仍要在某个从节点上被高频访问，只是分散到了多个从节点。

#### 方案 2：Key 拆分/副本（适合 Cluster 单片压力）

Cluster 模式下 key 按 slot 分片，单个 key 只能落在一个分片。把热 key 复制成多份，分散到不同分片。

```text
原 key: foo
副本: foo#0, foo#1, foo#2, foo#3

写入：所有副本都更新
读取：客户端随机挑一个副本读
```

```java
private static final int REPLICA_NUM = 4;

public String get(String key) {
    int idx = ThreadLocalRandom.current().nextInt(REPLICA_NUM);
    return redis.get(key + "#" + idx);
}

public void set(String key, String value) {
    for (int i = 0; i < REPLICA_NUM; i++) {
        redis.set(key + "#" + i, value);
    }
}
```

**优点**：流量分散到多个分片，单分片压力降低。
**缺点**：

- 写入要更新所有副本，写放大；
- 副本间短暂不一致；
- 业务侧需感知副本逻辑。

#### 方案 3：本地缓存（终极方案）

极端热 key（如微博热搜、秒杀商品）即使分片也扛不住。在应用本地缓存（Caffeine/Guava）兜底，热点 key 直接走本地内存。

```java
Cache<String, String> localCache = Caffeine.newBuilder()
    .maximumSize(10_000)
    .expireAfterWrite(Duration.ofSeconds(5))
    .build();

public String get(String key) {
    String val = localCache.getIfPresent(key);
    if (val != null) return val;       // 纳秒级
    val = redis.get(key);
    if (val != null) {
        localCache.put(key, val);      // 回填本地
    }
    return val;
}
```

**优点**：完全不走网络，纳秒级响应。
**缺点**：

- 多实例数据不一致（TTL 短可缓解）；
- 内存占用增加；
- 更新时需广播失效。

适合"读多写少、容忍短时不一致"的热点。

#### 方案 4：限流降级

热 key 流量超出阈值时直接拒绝或返回默认值，保护系统不被打挂。

```java
@SentinelResource(value = "hotKey", fallback = "defaultResp")
public String get(String key) {
    return redis.get(key);
}

public String defaultResp(String key) {
    return "default";   // 降级
}
```

**优点**：保命兜底。
**缺点**：影响用户体验。

#### 方案 5：组合方案（生产推荐）

实际生产通常组合使用：

```text
1. 客户端埋点发现热 key
2. 自动加入本地缓存白名单（5 秒 TTL）
3. 同时启动 key 副本（4 份分散）
4. 网关层限流兜底
```

## 代码示例

### 完整的热 Key 治理方案

```java
@Service
public class HotKeyService {
    @Autowired private RedisTemplate<String, String> redis;

    // 本地缓存
    private final Cache<String, String> localCache = Caffeine.newBuilder()
        .maximumSize(10_000)
        .expireAfterWrite(Duration.ofSeconds(5))
        .build();

    // 计数器（用于发现热 key）
    private final Cache<String, AtomicLong> counter = Caffeine.newBuilder()
        .expireAfterWrite(Duration.ofSeconds(1))
        .build();

    // 热 key 集合
    private final Set<String> hotKeys = ConcurrentHashMap.newKeySet();

    // 热 key 阈值
    private static final long HOT_THRESHOLD = 1000;

    public String get(String key) {
        // 热点走本地缓存
        if (hotKeys.contains(key)) {
            String v = localCache.getIfPresent(key);
            if (v != null) return v;
        }

        // 计数
        counter.get(key, k -> new AtomicLong(0)).incrementAndGet();

        // 正常查 Redis
        String v = redis.opsForValue().get(key);
        if (v != null && hotKeys.contains(key)) {
            localCache.put(key, v);
        }
        return v;
    }

    // 定时识别热 key
    @Scheduled(fixedRate = 1000)
    public void detectHotKeys() {
        Map<String, Long> top = counter.asMap().entrySet().stream()
            .filter(e -> e.getValue().get() > HOT_THRESHOLD)
            .sorted((a, b) -> Long.compare(b.getValue().get(), a.getValue().get()))
            .limit(10)
            .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().get()));
        hotKeys.clear();
        hotKeys.addAll(top.keySet());
        // 上报到中心节点
        if (!top.isEmpty()) {
            mq.send("hotkey.detected", top);
        }
    }

    // 数据更新时广播失效
    public void set(String key, String value) {
        redis.opsForValue().set(key, value);
        if (hotKeys.contains(key)) {
            // 广播给所有实例清本地缓存
            redis.convertAndSend("cache:invalidate", key);
        }
    }
}
```

### Redisson 本地缓存配合

```java
RMapCache<String, String> redissonMap = redisson.getMapCache("hotKeys");
// Redisson 内置本地缓存（不适用于所有场景）
// 更推荐用 Caffeine + Redis 组合
```

## 实战场景

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 秒杀商品详情 | 本地缓存 + 副本 | 极端 QPS |
| 微博热搜 | 本地缓存 + 限流 | 突发流量 |
| 首页推荐 | 多级缓存 | 高 QPS 但可控 |
| 直播间在线人数 | 副本 + 限流 | 写多读多 |
| 商品库存 | Lua + 限流 | 强一致场景 |
| 配置类热 key | 本地缓存 | 读多写少 |
| 突发热点新闻 | 京东 hotkey 框架 | 毫秒级响应 |

## 深挖追问

### 热 Key 和大 Key 的区别？

| 维度 | 热 Key | 大 Key |
|------|--------|--------|
| 问题 | 访问频次高 | value 体积大 |
| 影响 | 单分片 CPU/带宽 | 主线程阻塞、网络打满 |
| 发现 | 客户端统计/--hotkeys | --bigkeys/MEMORY USAGE |
| 解决 | 分散访问 | 拆分 value |

两者可能叠加：一个大 key 被高频访问，危害更大。

### 本地缓存 TTL 怎么定？

短 TTL（5~30 秒）即可。本地缓存只兜底热点峰值，不追求长期一致。TTL 短则即使数据变了，本地缓存也很快过期。

### 客户端埋点会拖慢业务吗？

不会显著。`ConcurrentHashMap` 或 Caffeine 的 incrementAndGet 是 O(1) 操作，纳秒级。需注意避免对所有 key 埋点（只对疑似热点），或采样埋点（每 100 次记录 1 次）。

### Cluster 模式下副本方案如何路由？

客户端按 hash 取模选副本：

```java
int idx = key.hashCode() % REPLICA_NUM;
redis.get(key + "#" + idx);
```

副本 key 需用 hash tag 保证在期望的 slot。或让客户端直接路由到指定节点（Lettuce/Redisson 支持）。

### 热 key 自动发现工具有哪些？

- 阿里云 RedisHotKey 分析
- 腾讯云 Redis 热 Key 探测
- 京东开源 hotkey 框架（multi-tier hot key detection）
- 美团 Squirrel hotkey 检测

大厂方案多为客户端 SDK + 中心计算，实时下发热 key 列表给所有实例。

### Redis 7.0 对热 key 检测有改进吗？

- `OBJECT FREQ` 更稳定；
- `LATENCY HISTORY` 支持更细致的事件追踪；
- Cluster 模式下 `--hotkeys` 仍需逐分片执行。

### 副本方案如何保证一致性？

- 写入时同步更新所有副本（用 Lua 脚本原子）；
- 接受短暂不一致（副本间 TTL 短）；
- 用 binlog 订阅异步同步所有副本。

### 限流降级会影响业务吗？

会。限流意味着部分请求拿不到正常数据，要返回默认值或排队。降级是"丢车保帅"，避免 DB 被打挂导致全站不可用。降级策略要业务方提前评估并接受。

## 易错点

- 只看绝对 QPS，忽略"倾斜度"判定；
- MONITOR 命令在高并发期使用，把 Redis 拖垮；
- 本地缓存 TTL 设过长，多实例数据长期不一致；
- 副本方案忘了更新所有副本，数据丢失；
- 限流降级阈值未演练，真出事时不敢触发；
- 把热 key 当大 key 治理，方案选错；
- 客户端埋点对所有 key 全量统计，性能损耗大；
- 副本方案路由不一致，写到一个副本读另一个副本。

## 总结

热 Key 是**单点访问倾斜**问题。发现靠客户端埋点统计 + `--hotkeys`；解决思路是"分散"：读写分离 → key 副本拆分 → 本地缓存 → 限流降级。**极端热 key 用本地缓存是终极银弹**，但要配短 TTL 和失效广播。生产实践通常组合多种方案，并建立热 key 自动发现 + 自动治理的闭环。区分热 key（访问频次）和大 key（value 体积），对症下药。

## 参考资料

- [Redis 官方文档：Latency monitoring](https://redis.io/docs/management/optimization/latency/)
- [京东开源 hotkey 框架](https://github.com/jd-platform-organization/hotkey)
- [Caffeine 缓存](https://github.com/ben-manes/caffeine)

---
