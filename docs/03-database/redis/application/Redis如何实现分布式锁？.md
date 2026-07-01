# Redis 如何实现分布式锁

## 核心概念

分布式锁用于在分布式系统中协调多个进程对共享资源的互斥访问。Redis 是共享存储，且具备 `SET NX PX` 原子加锁能力，是分布式锁最常见的实现载体。

一句话结论：**单机 Redis 用 `SET key value NX PX timeout` 加锁 + Lua 脚本安全释放；多机场景用 Redlock 算法；生产推荐 Redisson（封装了重入、看门狗、Redlock）。务必避开 SETNX + EXPIRE 非原子、误删他人锁、锁超时等经典坑。**

## 标准回答

| 维度 | 单机 Redis 锁 | Redlock | Redisson |
|------|---------------|---------|----------|
| 加锁 | `SET NX PX` | N 个节点各 `SET NX PX` | 封装 SET NX + 看门狗 |
| 释放 | Lua 脚本比对 value 后 DEL | 各节点 Lua 释放 | Lua + 自动续期 |
| 可重入 | 不支持 | 不支持 | 支持（Hash + 计数） |
| 故障容错 | 主从切换可能丢锁 | 多数节点存活即可 | 同 Redlock |
| 生产推荐 | 简单场景 | 强一致场景 | 通用 |

## 详细机制

### 1. 单机 Redis 分布式锁

#### 加锁三要素

1. **原子性加锁**：`SET key value NX PX timeout`，一条命令完成"不存在则设置 + 设过期时间"；
2. **唯一标识**：value 必须是客户端唯一 ID（如 UUID），用于安全释放；
3. **过期时间**：避免持锁客户端异常导致死锁。

```bash
SET lock:order:1001 "uuid-abc-123" NX PX 30000
```

- `NX`：key 不存在才设置；
- `PX 30000`：过期时间 30 秒（毫秒）；
- value 用 UUID 标识持锁者。

#### 释放锁：Lua 脚本保证安全

释放时要先判断 value 是否匹配自己，避免误删他人锁。这两步必须原子，用 Lua：

```lua
-- unlock.lua
-- KEYS[1] = lock key
-- ARGV[1] = unique value (UUID)
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
else
    return 0
end
```

```bash
EVAL "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end" 1 lock:order:1001 "uuid-abc-123"
```

### 2. 经典坑：SETNX + EXPIRE 非原子

错误写法：

```bash
SETNX lock:order 1       # 加锁成功
EXPIRE lock:order 30     # 设过期时间
```

如果 SETNX 成功后客户端崩溃，EXPIRE 没执行，锁永远不释放，导致死锁。**正确做法是用 `SET key value NX PX timeout` 一条命令完成**（Redis 2.6.12+ 支持）。

### 3. 经典坑：误删他人锁

错误写法：

```bash
DEL lock:order   # 直接删除
```

如果客户端 A 持锁超时（业务执行慢），锁过期后客户端 B 加锁成功，A 这时执行 `DEL` 会把 B 的锁删掉。**正确做法是 value 设唯一 ID，释放前用 Lua 比对**。

### 4. 锁超时问题：看门狗续期

业务执行时间可能超过锁过期时间，导致锁提前释放，多个客户端同时进入临界区。解决方案：

**方案 A：看门狗自动续期**

启动后台线程，定期检查锁是否仍属于自己，是则延长 TTL。Redisson 内置此机制（默认每 10 秒续期一次，将 TTL 重置为 30 秒）。

**方案 B：合理设置超时时间**

业务最长耗时 + 余量。但仍可能因网络抖动失败。

**方案 C：逻辑过期**

参考"缓存击穿"的逻辑过期方案，锁不设物理 TTL，由业务方判断逻辑有效性。

### 5. Redlock 算法

针对主从异步复制可能导致锁丢失的问题，Redis 作者提出 Redlock：基于多个独立 Redis 节点（至少 5 个），客户端向多数节点申请锁。

**加锁流程**：

1. 记录当前时间 t1；
2. 依次向 N 个节点执行 `SET NX PX`，每个节点设较短超时（如 50ms）；
3. 若成功获取 `>= N/2 + 1` 个节点的锁，且总耗时 `< TTL`，则加锁成功；
4. 锁的实际有效时间 = TTL - (t2 - t1)；
5. 失败则向所有节点发释放请求。

```text
客户端 → Node1 ✓
       → Node2 ✓
       → Node3 ✗ (超时)
       → Node4 ✓
       → Node5 ✗
成功数 = 4 >= 3 (5/2+1) → 加锁成功
```

**Redlock 争议**：Martin Kleppmann 在文章中质疑 Redlock 在时钟漂移、GC pause 等场景下仍不安全。antirez 写文反驳。生产实践通常用 Redlock + 额外业务约束（如数据库唯一约束、版本号）兜底。

### 6. Redisson 实现

Redisson 是 Java 生态最成熟的 Redis 客户端，分布式锁是它的招牌特性。

```java
RLock lock = redisson.getLock("lock:order:1001");
try {
    // 加锁，默认 30 秒 TTL，看门狗自动续期
    lock.lock();
    // 业务逻辑
} finally {
    if (lock.isHeldByCurrentThread()) {
        lock.unlock();
    }
}
```

特性：

- **可重入**：基于 Hash 结构，key 是锁名，field 是客户端 ID，value 是重入次数；
- **看门狗续期**：默认每 10 秒续期到 30 秒；
- **公平锁/非公平锁**：`getFairLock()` / `getLock()`；
- **读写锁**：`getReadWriteLock()`；
- **信号量/闭锁**：`getSemaphore()` / `getCountDownLatch()`；
- **Redlock**：`getRedissonRedLock(nodes)`。

## 代码示例

### 原生 Jedis 实现（理解原理）

```java
public class RedisLock {
    private final Jedis jedis;
    private static final String UNLOCK_SCRIPT =
        "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
        "  return redis.call('DEL', KEYS[1]) " +
        "else return 0 end";

    public boolean tryLock(String key, String value, long ttlMs) {
        String result = jedis.set(key, value, SetParams.setParams().nx().px(ttlMs));
        return "OK".equals(result);
    }

    public boolean unlock(String key, String value) {
        Object res = jedis.eval(
            UNLOCK_SCRIPT,
            Collections.singletonList(key),
            Collections.singletonList(value)
        );
        return Long.valueOf(1).equals(res);
    }
}
```

### Redisson 生产用法

```java
@Service
public class OrderService {
    @Autowired private RedissonClient redisson;

    public void createOrder(Long orderId) {
        RLock lock = redisson.getLock("lock:order:" + orderId);
        try {
            // 尝试加锁，最多等 5 秒，持锁 30 秒（看门狗续期）
            if (lock.tryLock(5, 30, TimeUnit.SECONDS)) {
                // 业务逻辑
                doBusiness(orderId);
            } else {
                throw new RuntimeException("获取锁失败");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }
}
```

### Redisson 可重入锁原理

```text
锁结构：Hash
key: lock:order:1001
field: client-uuid:thread-1
value: 2  (重入次数)

加锁：HINCRBY lock:order:1001 client-uuid:thread-1 1
释放：HINCRBY lock:order:1001 client-uuid:thread-1 -1
     若 value = 0 则 DEL lock:order:1001
```

整个流程用 Lua 脚本保证原子性。

## 实战场景

| 场景 | 方案 | 注意点 |
|------|------|--------|
| 订单防重复提交 | SETNX + 短 TTL | value 用 UUID |
| 库存扣减 | Redisson 可重入锁 | 配合数据库乐观锁兜底 |
| 定时任务防并发 | SETNX + 长业务 TTL | 看门狗续期 |
| 跨服务资源协调 | Redisson + Redlock | 强一致场景才用 |
| 限流 | 不用分布式锁 | 用 Lua + 计数器 |
| 防止账户并发操作 | Redisson + DB 乐观锁 | 双保险 |
| 分布式任务调度 | Redisson + 数据库状态 | 防止重复执行 |

## 深挖追问

### SETNX + EXPIRE 为什么不安全？

非原子，中间崩溃会导致锁永远不释放。必须用 `SET key value NX PX timeout`（Redis 2.6.12+）。

### 释放锁为什么要用 Lua？

GET + DEL 两步非原子，中间可能锁过期被他人拿走，DEL 就误删。Lua 脚本保证"判断 + 删除"原子。

### 主从切换时锁会丢吗？

会。主节点加锁后异步复制到从节点，主节点宕机切换时，从节点还没收到锁信息，新主允许其他客户端加锁。Redlock 算法是为解决此问题提出，但有争议。

### Redlock 真的安全吗？

存在争议。Martin Kleppmann 指出：时钟漂移、GC pause 可能导致客户端以为还持锁，实际已过期。antirez 反驳：合理配置时钟同步 + 业务侧兜底（如 DB 唯一约束）足够。生产推荐 Redlock + 业务兜底。

### Redisson 看门狗的默认行为？

- `lock.lock()`：默认 30 秒 TTL，看门狗每 10 秒续期一次；
- `lock.lock(30, TimeUnit.SECONDS)`：显式指定 TTL 时**不启动**看门狗；
- `lock.tryLock(waitTime, leaseTime, unit)`：leaseTime > 0 时不启动看门狗；
- `lock.tryLock(waitTime, -1, unit)`：leaseTime = -1 启动看门狗。

### 分布式锁和数据库乐观锁怎么选？

| 维度 | Redis 分布式锁 | DB 乐观锁 |
|------|----------------|-----------|
| 性能 | 高 | 中 |
| 强一致 | 弱（异步复制） | 强 |
| 复杂度 | 中 | 低（version 字段） |
| 适用 | 高并发、可容忍极端不一致 | 强一致业务 |

关键金融场景建议 DB 乐观锁为主，Redis 锁为辅。

### Redisson 公平锁和非公平锁区别？

- **非公平锁**（默认）：新请求直接尝试加锁，成功就抢，不管等待队列。吞吐高；
- **公平锁**：按请求顺序加锁，避免饥饿。吞吐略低。

`redisson.getFairLock("lock")` 获取公平锁。

### 锁的粒度怎么定？

- 太粗（如全局锁）：吞吐骤降；
- 太细（如每行一个锁）：管理复杂，Redis 内存压力；
- 经验：按业务实体粒度（如 `lock:order:{orderId}`）。

## 易错点

- 用 SETNX + EXPIRE 两步加锁，崩溃导致死锁；
- 释放锁不比对 value，误删他人锁；
- 业务超时未做续期，锁提前释放；
- 用 `DEL` 释放未持有的锁；
- 主从切换场景仍用单机锁，导致锁失效；
- 把 Redis 分布式锁当强一致用，金融场景出问题；
- 锁粒度过大（如全局锁），吞吐骤降；
- Redisson 锁不释放（看门狗续期导致锁被长期持有）；
- 不设置最大等待时间，请求堆积。

## 总结

Redis 分布式锁的核心是 **`SET NX PX` + Lua 释放**，单机场景已经够用。**生产推荐 Redisson**，它封装了看门狗续期、可重入、Redlock 等能力。极端强一致场景需结合 DB 乐观锁或唯一约束兜底。**关键坑**：SETNX + EXPIRE 非原子、误删他人锁、锁超时未续期、主从切换锁丢失。

## 参考资料

- [Redis 官方文档：Distributed locks with Redis](https://redis.io/docs/manual/patterns/distributed-locks/)
- [Martin Kleppmann: How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)
- [Redisson 文档：Distributed locks and synchronizers](https://github.com/redisson/redisson/wiki/8.-distributed-locks-and-synchronizers)

---
