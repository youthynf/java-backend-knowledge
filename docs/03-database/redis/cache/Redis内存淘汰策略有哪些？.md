# Redis 内存淘汰策略有哪些

## 核心概念

当 Redis 内存使用达到 `maxmemory` 限制时，需要根据策略淘汰部分 key 以腾出空间。**这是和过期删除不同的机制**：过期删除处理"已过期的 key"（主动设过 TTL 的），内存淘汰处理"内存不足时选谁删"（所有 key 都是候选）。

一句话结论：**Redis 4.0 起共 8 种策略：1 种不淘汰（noeviction）+ 3 种所有 key 范围（allkeys-*）+ 4 种仅过期 key 范围（volatile-*）**。生产缓存场景常用 `allkeys-lru` 或 `allkeys-lfu`。

## 标准回答

8 种策略一览：

| 策略 | 范围 | 算法 | 适用场景 |
|------|------|------|----------|
| `noeviction` | 不淘汰 | 抛错拒绝写 | 数据不能丢，如分布式锁 |
| `allkeys-lru` | 所有 key | 近似 LRU | 通用缓存（默认推荐） |
| `allkeys-lfu` | 所有 key | LFU | 热点明显的缓存（4.0+） |
| `allkeys-random` | 所有 key | 随机 | 无明显访问模式 |
| `volatile-lru` | 设了 TTL 的 key | 近似 LRU | 缓存 + 持久数据混合 |
| `volatile-lfu` | 设了 TTL 的 key | LFU | 同上（4.0+） |
| `volatile-random` | 设了 TTL 的 key | 随机 | 同上 |
| `volatile-ttl` | 设了 TTL 的 key | 优先 TTL 短的 | 优先删快过期的 |

**默认值**：Redis 3.0 之后默认 `noeviction`，需手动改为 `allkeys-lru` 等策略。

## 详细机制

### 1. maxmemory 配置

```conf
maxmemory 4gb                  # 最大内存
maxmemory-policy allkeys-lru   # 淘汰策略
maxmemory-samples 5            # LRU/LFU 采样数量
```

- 64 位系统默认 `maxmemory 0`（不限制），可能撑爆内存导致 OOM；
- 32 位系统默认 3GB；
- 生产必须显式配置。

### 2. noeviction（不淘汰）

内存满时拒绝所有写命令（返回 `OOM command not allowed`），读和删正常。适合作为分布式锁、消息队列等不能丢数据的场景。但容易导致写入失败级联。

典型报错：

```text
(error) OOM command not allowed when used memory > 'maxmemory'.
```

### 3. allkeys-* 系列

在所有 key 范围内淘汰。适合纯缓存场景（所有数据都可重建）。

- **`allkeys-lru`**：淘汰最久未访问的。Redis 用近似 LRU，默认采样 5 个，淘汰其中最久未访问的；
- **`allkeys-lfu`**（4.0+）：淘汰访问频次最低的；
- **`allkeys-random`**：随机淘汰。

### 4. volatile-* 系列

只在设了过期时间的 key 范围内淘汰。适合"缓存 + 持久数据"混合场景：缓存 key 设 TTL，持久 key 不设 TTL，淘汰时只动缓存。

- **`volatile-lru`**：在过期 key 中 LRU；
- **`volatile-lfu`**（4.0+）：在过期 key 中 LFU；
- **`volatile-random`**：在过期 key 中随机；
- **`volatile-ttl`**：优先淘汰 TTL 最短的（最快要过期的）。

如果没有设 TTL 的 key，`volatile-*` 等同于 `noeviction`，会拒绝写入。

### 5. 查看与修改策略

```bash
# 查看
CONFIG GET maxmemory
CONFIG GET maxmemory-policy
CONFIG GET maxmemory-samples

# 临时修改（重启失效）
CONFIG SET maxmemory 4gb
CONFIG SET maxmemory-policy allkeys-lru

# 永久修改：在 redis.conf 中设置
maxmemory 4gb
maxmemory-policy allkeys-lru
```

### 6. 采样数量 maxmemory-samples

近似 LRU/LFU 的精度由 `maxmemory-samples` 控制：

- 默认 5：每次随机抽 5 个，淘汰其中"最老/最不常用"的；
- 调大到 10：精度提升，CPU 开销略增；
- Redis 官方测试：samples=5 时效果已接近真实 LRU 的 80%；samples=10 时接近 95%。

```conf
maxmemory-samples 10  # 更精确，但稍慢
```

### 7. 淘汰触发时机

Redis 在每次执行命令前检查 `used_memory > maxmemory`，如果超过则按策略淘汰一批 key 直到内存低于阈值。所以淘汰是同步发生的，可能阻塞主线程几毫秒到几十毫秒（取决于淘汰数量）。

开启 `lazyfree-lazy-eviction yes` 让淘汰异步进行，避免阻塞。

### 8. LFU 配置参数

```conf
lfu-log-factor 10    # logc 增长因子，越大增长越慢
lfu-decay-time 1     # 衰减时间，N 分钟没访问 logc 衰减 1
```

详见"LRU vs LFU"一章。

## 代码示例

### Spring Boot 配置

```yaml
spring:
  redis:
    host: 127.0.0.1
    port: 6379
```

```bash
# redis.conf 关键配置
maxmemory 4gb
maxmemory-policy allkeys-lru
maxmemory-samples 10

# 启用 lazyfree 配合淘汰，避免阻塞
lazyfree-lazy-eviction yes
lazyfree-lazy-expire yes
lazyfree-lazy-server-del yes
```

### 观察淘汰情况

```bash
INFO memory              # 查看 used_memory、maxmemory
INFO stats               # 查看 evicted_keys（已淘汰数量）
CONFIG GET maxmemory-policy

# 持续监控
redis-cli INFO stats | grep evicted_keys
```

### 主动控制内存的 Java 示例

```java
@Component
public class RedisMemoryMonitor {
    @Autowired private RedisTemplate<String, ?> redis;

    @Scheduled(fixedRate = 60_000)
    public void checkMemory() {
        Properties info = redis.getConnectionFactory()
            .getConnection().info("memory");
        long used = Long.parseLong(info.getProperty("used_memory"));
        long max = Long.parseLong(info.getProperty("maxmemory"));
        if (max > 0 && used > max * 0.8) {
            // 内存使用率超 80%，告警
            alertService.notify("Redis 内存使用率超 80%");
        }
    }
}
```

## 实战场景

| 场景 | 策略 | 原因 |
|------|------|------|
| 纯缓存（商品/用户） | `allkeys-lru` | 通用，所有数据可重建 |
| 热点明显的缓存 | `allkeys-lfu` | LRU 对扫描型访问不友好 |
| 缓存 + 持久数据混合 | `volatile-lru` | 持久数据不设 TTL，不被淘汰 |
| 分布式锁 / 消息队列 | `noeviction` | 数据不能丢 |
| 临时会话存储 | `volatile-ttl` | 优先删快过期的 |
| 简单 key-value 缓存 | `allkeys-random` | 访问无明显规律 |
| 计数器（带 TTL） | `volatile-lru` | 持久数据保留 |

## 深挖追问

### LRU 和 LFU 怎么选？

| 维度 | LRU | LFU |
|------|-----|-----|
| 依据 | 最后访问时间 | 访问频次（带衰减） |
| 适合 | 时间局部性强（最近访问还会再访问） | 频率局部性强（高频访问更值得留） |
| 缺点 | 扫描型访问会"污染"缓存 | 老热点难淘汰 |
| Redis 实现 | 近似 LRU（采样） | 8bit 计数器 + 衰减 |

通用缓存选 LRU，热点明显选 LFU。

### 为什么 Redis 不用真实 LRU？

真实 LRU 要维护双向链表，每次访问都要移动节点到头部，内存和 CPU 开销大。Redis 用近似 LRU（采样 + 时间戳），效果接近但开销小。详见"LRU vs LFU"一章。

### volatile-* 范围内没有 key 时会怎样？

`volatile-*` 策略下如果没有任何设了 TTL 的 key，淘汰无对象可挑，等同 `noeviction`，写入被拒绝。生产上要确保有过期 key。

### maxmemory 设多大合适？

经验值：物理内存的 60%~70%。留出空间给操作系统、RDB/AOF fork（写时复制）、复制缓冲区等。例如 16GB 机器，maxmemory 设 10GB。

### 内存到达 maxmemory 后，写命令具体怎么报错？

返回错误：`(error) OOM command not allowed when used memory > 'maxmemory'`。客户端需捕获并降级。但 `DEL` 和读命令仍可执行。

### 淘汰策略会阻塞主线程吗？

会。淘汰是同步发生的，单次淘汰多个 key 可能阻塞几毫秒到几十毫秒。开启 `lazyfree-lazy-eviction yes` 让淘汰异步进行。

### Cluster 模式下淘汰策略在每个节点独立生效吗？

是。每个分片独立维护自己的 maxmemory 和淘汰策略。配置时要全节点统一，避免个别分片策略不一致。

### 如何观察 LFU 模式下 key 的访问频次？

```bash
OBJECT FREQ key   # 返回 logc 值（0~255）
```

注意：只有 LFU 策略下才能用，LRU 模式会报错。

## 易错点

- 64 位系统不设 `maxmemory`，跑爆内存导致 OOM；
- `noeviction` 用在缓存场景，写入频繁失败；
- `volatile-*` 用在缓存场景但所有 key 都设了 TTL，效果等同 `allkeys-*`；
- `maxmemory-samples` 调太大（如 50）拖慢淘汰；
- 不开 `lazyfree-lazy-eviction`，淘汰大 key 时阻塞主线程；
- 把淘汰策略和过期策略混淆；
- 切换策略时不清空旧数据，导致行为异常。

## 总结

8 种策略分三类：**不淘汰（noeviction）、所有 key 范围（allkeys-*）、仅过期 key 范围（volatile-*）**。纯缓存用 `allkeys-lru`，热点明显用 `allkeys-lfu`，混合场景用 `volatile-lru`，不能丢数据用 `noeviction`。生产配置务必显式设 `maxmemory` 和 `maxmemory-policy`，并开启 `lazyfree-lazy-eviction` 避免淘汰大 key 阻塞。

## 参考资料

- [Redis 官方文档：Eviction policies](https://redis.io/docs/reference/eviction/)
- [Redis 配置：maxmemory](https://redis.io/docs/management/config/)
- [Redis 4.0 LFU 实现](https://redis.io/docs/reference/eviction/)

---
