# Redis 使用的过期删除策略是什么

## 核心概念

Redis 的 key 可以设过期时间（`EXPIRE`/`SET ... EX`）。**过期删除策略**指 key 过期后，Redis 何时真正删除它。理论上有三种策略：定时删除、惰性删除、定期删除。Redis 实际采用**惰性删除 + 定期删除**组合。

一句话结论：**Redis 用"惰性删除（访问时检查）+ 定期删除（后台抽样）"组合策略，在 CPU 和内存之间取平衡。惰性删除保证过期 key 不会被读到，定期删除兜底清理长期不被访问的过期 key。**

## 标准回答

| 策略 | 时机 | 优点 | 缺点 | Redis 是否采用 |
|------|------|------|------|----------------|
| 定时删除 | 到期立即删 | 时效好 | CPU 不友好 | 否 |
| 惰性删除 | 访问时检查 | CPU 友好 | 内存浪费 | 是 |
| 定期删除 | 后台周期抽样 | 折中 | 时效一般 | 是 |

Redis 组合：**惰性删除兜底读，定期删除兜底内存**。

## 详细机制

### 1. 过期字典（expires dict）

每个 Redis 数据库有一个 `expires` 字典，key 是指向键对象的指针，value 是过期时间戳（long long，毫秒）。`TTL`/`PTTL` 命令就是查这个字典。判断 key 是否过期的时间复杂度是 O(1)。

```bash
SET user:1001 "abc" EX 60
# expires 字典记录：user:1001 -> (当前时间 + 60s)
TTL user:1001
# 返回剩余秒数
PTTL user:1001
# 返回剩余毫秒
```

### 2. 惰性删除

每次访问或修改 key 前，Redis 都会调用 `expireIfNeeded` 函数检查 key 是否过期。如果过期则删除（同步或异步，取决于 `lazyfree-lazy-expire` 配置），并返回 nil 给客户端；否则正常返回。

源码逻辑（简化）：

```c
int expireIfNeeded(redisDb *db, robj *key) {
    if (!keyIsExpired(db, key)) return 0;
    // 过期则删除
    if (server.lazyfree_lazy_expire) {
        asyncDelete(db, key);   // 异步删除（lazyfree）
    } else {
        syncDelete(db, key);    // 同步删除
    }
    return 1;
}
```

**优点**：对 CPU 友好，只在访问时检查；
**缺点**：如果一个过期 key 一直没人访问，会一直占用内存。

### 3. 定期删除

为弥补惰性删除的不足，Redis 后台周期性抽样检查过期 key 并删除。

**触发频率**：由 `hz` 参数控制，默认 10（每秒 10 次），即每 100ms 触发一次。可配置 1~500。

**抽样算法**：

1. 从过期字典随机抽 20 个 key；
2. 检查并删除已过期的；
3. 如果本轮过期比例 > 25%（即 5 个以上），重复步骤 1；
4. 为防止循环过度阻塞，单次定期删除有时间上限（默认 25ms）。

```text
hz=10  →  每 100ms 执行一次
每次抽 20 个
过期比例 > 25% 则继续抽
单次不超过 25ms
```

**优点**：限制 CPU 占用，同时清理一部分过期 key；
**缺点**：抽样有随机性，部分过期 key 可能长时间未被清理。

### 4. 内存淘汰策略兜底

如果惰性删除 + 定期删除仍不足以清理过期 key（如大量 key 同时过期但都没人访问），Redis 内存达到 `maxmemory` 上限时，会触发**内存淘汰策略**（如 `volatile-lru`、`volatile-ttl`）来强制清理。详见"Redis 内存淘汰策略"一章。

### 5. 异步删除（lazyfree）

Redis 4.0+ 引入异步删除。删除大 key 时，主线程只做"标记 + 移除引用"，实际内存释放在后台线程进行，避免阻塞主线程。

相关配置：

```conf
lazyfree-lazy-expire yes       # 惰性删除过期时是否异步
lazyfree-lazy-eviction yes     # 内存淘汰时是否异步
lazyfree-lazy-server-del yes   # 服务端隐式 del 是否异步
lazyfree-lazy-user-del yes     # 用户主动 del 是否异步（6.0+）
lazyfree-lazy-user-flush yes   # 用户 FLUSHDB/FLUSHALL 是否异步（6.0+）
replica-lazy-flush yes         # 从节点全量同步 flush 是否异步
```

生产建议全开，删除大 key 时不再阻塞主线程。

### 6. 子进程的过期键处理

RDB 持久化（BGSAVE）和 AOF 重写（BGREWRITEAOF）期间，子进程不会处理过期 key：

- RDB 子进程遍历数据库时跳过已过期 key（不写入 RDB）；
- AOF 重写子进程同样跳过已过期 key（不写入新 AOF）。

详见"Redis 持久化时对过期键如何处理"一章。

## 代码示例

观察过期行为：

```bash
# 设 1 秒过期
SET foo bar EX 1
TTL foo              # 立即查：1
TTL foo              # 0.5s 后：0 或 1
TTL foo              # 1.5s 后：-2（已不存在）

# DBSIZE 观察定期删除
SET k1 v1 EX 1
SET k2 v2 EX 1
... 1000 个 key
# 等 2 秒后访问其中几个，其他可能仍占内存
DBSIZE   # 可能仍是 1000（未被抽样清理）
```

Java 客户端示例：

```java
// 设过期
redis.opsForValue().set("token:abc", "user1001", Duration.ofSeconds(1800));

// 单独设过期
redis.expire("user:1001", Duration.ofMinutes(30));

// 设过期时间戳
redis.expireAt("user:1001", Instant.parse("2026-12-31T23:59:59Z"));

// 设毫秒级过期
redis.pExpire("token:abc", Duration.ofSeconds(30).toMillis());

// 持久化（移除过期）
redis.persist("user:1001");
```

### `hz` 调优

```conf
# redis.conf
hz 10                  # 默认 10
dynamic-hz yes         # 根据客户端数量自适应（4.0+）
```

`dynamic-hz yes` 让 Redis 根据客户端数量自适应：客户端多时自动提高 `hz`，客户端少时降低，平衡 CPU 和清理及时性。

## 实战场景

| 场景 | 配置 | 关键点 |
|------|------|--------|
| 短期验证码 | `SETEX code 300 ...` | 5 分钟过期，惰性删除即可 |
| 长期配置缓存 | `EXPIRE` + `hz 10` | 定期清理 |
| 大量临时 key | 调高 `hz` 到 50 | 加快定期清理 |
| 大 key 删除 | 开启 `lazyfree-*` | 避免阻塞 |
| 强制过期 | 主动 `DEL` | 不依赖策略 |
| Session 30 分钟过期 | `SET session EX 1800` | 业务续期配合 |

## 深挖追问

### 为什么不用纯定时删除？

定时删除要为每个 key 创建定时器，海量 key 下定时器队列本身就有内存和 CPU 开销。Redis 追求简单高效，所以不采用。

### `hz` 调大有什么副作用？

`hz` 越大，定期删除触发越频繁，过期 key 清理越及时，但 CPU 占用也越高。生产环境一般 10~50，超过 100 会对吞吐有可见影响。`dynamic-hz yes` 可让 Redis 根据客户端数量自适应。

### 定期删除的 25ms 上限会不会导致清理不完？

会。极端场景下大量 key 同时过期，单次定期删除只能清理一部分。剩余的会在下次触发时继续清理，期间占用内存。配合内存淘汰策略兜底。

### 惰性删除和定期删除会冲突吗？

不会。两者都最终调用 `dbDelete`，删除是幂等的。一个 key 可能先被定期删除标记，又触发惰性删除检查时已不存在，直接返回 nil。

### 异步删除会丢数据吗？

不会。异步删除只是把"释放内存"放到后台线程，key 已从数据库字典移除，对外不可见。即使后台释放前 Redis 崩溃，也只是少释放一点内存，重启后从 RDB/AOF 加载时也按已删除处理。

### Redis 主从模式下过期 key 怎么处理？

由主节点统一删除并发 DEL 命令给从节点。从节点不主动过期删除（只执行主节点发来的 DEL）。Redis 3.2+ 从节点读时虽不主动删，但不会返回过期值。详见"主从模式过期键处理"一章。

### `EXPIRE` 命令在 key 不存在时返回什么？

返回 0（未设置成功）。可以用 `SET key value EX` 一条命令完成"创建 + 设过期"。

### `PERSIST` 命令的作用？

移除 key 的过期时间，让它变成永久 key。返回 1 表示成功，0 表示 key 不存在或本就没有过期时间。

## 易错点

- 误以为 TTL 到期 key 立刻消失，实际可能要等下次访问或定期删除；
- `hz` 调太大影响吞吐；
- 不开 lazyfree，删大 key 阻塞主线程；
- 把过期策略和内存淘汰策略混淆（前者处理"已过期 key"，后者处理"内存不足"）；
- 误以为主从模式下从节点会主动过期删除（实际由主节点 DEL 同步）；
- 用 `EXPIRE` 设过期时 key 不存在，未检查返回值。

## 总结

Redis 过期删除是**惰性 + 定期**的组合：**惰性删除保证不读到过期数据，定期删除兜底清理长期不访问的过期 key，内存淘汰策略做最后防线**。生产环境建议开启 lazyfree 异步删除避免阻塞。`hz` 参数控制定期删除频率，默认 10 适合大多数场景，热点 key 大量过期时可适度调高。

## 参考资料

- [Redis 官方文档：Key expiration](https://redis.io/docs/manual/keyspace/#how-redis-expires-keys)
- [Redis 源码：db.c - expireIfNeeded](https://github.com/redis/redis/blob/unstable/src/db.c)
- [Redis 4.0 lazyfree 特性](https://redis.io/docs/management/optimization/lazyfree/)

---
