# 分布式锁详解

## 核心概念

分布式锁是在多进程、多节点环境下协调共享资源访问的一种互斥机制，目标是让同一时刻只有一个执行者进入关键区。它常用于库存扣减、定时任务防重、幂等控制和跨实例资源竞争。设计分布式锁时不能只关注“能不能锁住”，还要关注唯一标识、过期时间、自动续期、可重入、解锁原子性、故障恢复和锁粒度。

面试中可以先说明：单机锁只在一个 JVM 内有效；分布式锁需要依赖 Redis、ZooKeeper、数据库等外部一致性组件，把锁状态放到所有实例都能访问的位置。Redis 适合高性能场景，ZooKeeper 更偏强一致和顺序公平，数据库实现简单但吞吐较低。

## 一、为什么需要分布式锁？

### 1.1 单机锁的问题

**单机环境下：**
```java
// synchronized 或 ReentrantLock 可以保证线程安全
public synchronized void deductStock() {
    int stock = getStock();
    if (stock > 0) {
        setStock(stock - 1);
    }
}
```

**分布式环境下：**
- 多个 JVM 进程
- synchronized 只能锁住当前 JVM
- 不同服务器可能同时执行临界区代码

### 1.2 分布式锁的应用场景

| 场景 | 说明 |
|------|------|
| 库存扣减 | 防止超卖 |
| 定时任务 | 防止重复执行 |
| 秒杀抢购 | 限流、防重复 |
| 分布式事务 | 保证数据一致性 |

---

## 二、分布式锁实现方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| Redis | 性能高、实现简单 | 需要处理过期、主从切换问题 | 高并发场景 |
| ZooKeeper | 强一致性、可靠性高 | 性能较低、实现复杂 | 一致性要求高 |
| 数据库 | 实现简单、可靠性高 | 性能差、存在单点问题 | 并发量低的场景 |

---

## 三、Redis 分布式锁

### 3.1 基础实现（SET NX）

```java
// 加锁
public boolean tryLock(String key, String value, long expireTime) {
    // SET key value NX PX expireTime
    // NX: key 不存在时才设置
    // PX: 设置过期时间（毫秒）
    return redis.setnx(key, value) == 1 && redis.expire(key, expireTime);
}

// 解锁
public void unlock(String key, String value) {
    redis.del(key);
}
```

**问题：**
1. setnx 和 expire 不是原子操作
2. 解锁可能删除其他线程的锁

### 3.2 改进实现（Lua 脚本）

```java
// 加锁（原子操作）
public boolean tryLock(String key, String requestId, long expireTime) {
    String result = redis.set(key, requestId, "NX", "PX", expireTime);
    return "OK".equals(result);
}

// 解锁（Lua 脚本保证原子性）
public boolean unlock(String key, String requestId) {
    String script = 
        "if redis.call('get', KEYS[1]) == ARGV[1] then " +
        "    return redis.call('del', KEYS[1]) " +
        "else " +
        "    return 0 " +
        "end";
    return redis.eval(script, Collections.singletonList(key), 
                      Collections.singletonList(requestId)) == 1;
}
```

**requestId 的作用：**
- 标识锁的持有者
- 防止误删其他线程的锁
- 通常使用 UUID

### 3.3 Redisson 实现（推荐）

**依赖：**
```xml
<dependency>
    <groupId>org.redisson</groupId>
    <artifactId>redisson</artifactId>
    <version>3.23.0</version>
</dependency>
```

**基本使用：**
```java
// 配置
Config config = new Config();
config.useSingleServer()
      .setAddress("redis://localhost:6379")
      .setPassword("password");
RedissonClient redisson = Redisson.create(config);

// 加锁
RLock lock = redisson.getLock("myLock");
try {
    // 尝试加锁，等待 10 秒，锁自动过期时间 30 秒
    boolean locked = lock.tryLock(10, 30, TimeUnit.SECONDS);
    if (locked) {
        // 执行业务逻辑
        doSomething();
    }
} finally {
    // 只有锁的持有者才能解锁
    if (lock.isHeldByCurrentThread()) {
        lock.unlock();
    }
}
```

**Redisson 的优势：**

1. **Watch Dog（看门狗）**
```java
// 自动续期，默认 30 秒过期，每 10 秒续期
lock.lock();
// 或指定 leaseTime
lock.lock(30, TimeUnit.SECONDS);
```

2. **可重入锁**
```java
lock.lock();
lock.lock();  // 可重入
lock.unlock();
lock.unlock();
```

3. **公平锁**
```java
RLock fairLock = redisson.getFairLock("fairLock");
```

4. **读写锁**
```java
RReadWriteLock rwLock = redisson.getReadWriteLock("rwLock");
RLock readLock = rwLock.readLock();
RLock writeLock = rwLock.writeLock();

// 读读不互斥
readLock.lock();
// 读写互斥
writeLock.lock();
```

5. **红锁（RedLock）**
```java
// 多个 Redis 节点同时加锁，解决主从切换问题
RLock lock1 = redisson1.getLock("lock");
RLock lock2 = redisson2.getLock("lock");
RLock lock3 = redisson3.getLock("lock");

RedissonRedLock redLock = new RedissonRedLock(lock1, lock2, lock3);
redLock.lock();
```

### 3.4 Redis 分布式锁的问题

| 问题 | 说明 | 解决方案 |
|------|------|----------|
| 锁过期 | 业务执行时间 > 锁过期时间 | Watch Dog 自动续期 |
| 主从切换 | 主节点宕机，锁信息丢失 | RedLock |
| 锁重入 | 同一线程多次获取锁 | Redisson 可重入锁 |
| 锁竞争 | 高并发下性能问题 | 分段锁、乐观锁 |

---

## 四、ZooKeeper 分布式锁

### 4.1 实现原理

```
/lock（持久节点）
  ├── lock-0000000001（临时顺序节点）
  ├── lock-0000000002
  └── lock-0000000003
```

**流程：**
1. 创建临时顺序节点
2. 获取 /lock 下所有子节点
3. 判断自己是否是最小节点
   - 是：获取锁成功
   - 否：监听前一个节点的删除事件
4. 前一个节点删除后，收到通知，再次判断

### 4.2 Curator 实现

**依赖：**
```xml
<dependency>
    <groupId>org.apache.curator</groupId>
    <artifactId>curator-recipes</artifactId>
    <version>5.5.0</version>
</dependency>
```

**基本使用：**
```java
// 创建客户端
CuratorFramework client = CuratorFrameworkFactory.builder()
    .connectString("localhost:2181")
    .retryPolicy(new ExponentialBackoffRetry(1000, 3))
    .build();
client.start();

// 创建可重入锁
InterProcessMutex lock = new InterProcessMutex(client, "/lock");

try {
    // 尝试获取锁
    if (lock.acquire(10, TimeUnit.SECONDS)) {
        // 执行业务逻辑
        doSomething();
    }
} finally {
    lock.release();
}
```

**Curator 提供的锁类型：**

| 锁类型 | 类名 | 说明 |
|--------|------|------|
| 可重入锁 | InterProcessMutex | 同一线程可多次获取 |
| 不可重入锁 | InterProcessSemaphoreMutex | 同一线程不能重复获取 |
| 读写锁 | InterProcessReadWriteLock | 读读共享，读写互斥 |
| 多锁 | InterProcessMultiLock | 同时获取多个锁 |
| 信号量 | InterProcessSemaphoreV2 | 限流 |

### 4.3 ZooKeeper vs Redis

| 特性 | ZooKeeper | Redis |
|------|-----------|-------|
| 一致性 | 强一致性（CP） | 最终一致性（AP） |
| 性能 | 较低 | 高 |
| 可靠性 | 高（ZAB 协议） | 依赖持久化配置 |
| 实现复杂度 | 较高 | 简单 |
| 应用场景 | 一致性要求高 | 性能要求高 |

---

## 五、数据库分布式锁

### 5.1 唯一索引实现

```sql
CREATE TABLE distributed_lock (
    id INT PRIMARY KEY AUTO_INCREMENT,
    lock_key VARCHAR(64) NOT NULL UNIQUE,
    lock_value VARCHAR(64) NOT NULL,
    expire_time DATETIME,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**加锁：**
```sql
INSERT INTO distributed_lock (lock_key, lock_value, expire_time)
VALUES ('my_lock', 'uuid', DATE_ADD(NOW(), INTERVAL 30 SECOND));
```

**解锁：**
```sql
DELETE FROM distributed_lock 
WHERE lock_key = 'my_lock' AND lock_value = 'uuid';
```

### 5.2 乐观锁实现

```sql
-- 版本号方式
UPDATE table SET data = 'new_data', version = version + 1
WHERE id = 1 AND version = 1;

-- CAS 方式
UPDATE table SET stock = stock - 1
WHERE id = 1 AND stock > 0;
```

### 5.3 数据库锁的问题

- 性能差
- 单点故障
- 锁过期处理复杂

---

## 六、分布式锁最佳实践

### 6.1 选择建议

| 场景 | 推荐方案 |
|------|----------|
| 高并发、允许极端情况少量失败 | Redis |
| 一致性要求高、并发量中等 | ZooKeeper |
| 并发量低、已有数据库基础设施 | 数据库 |

### 6.2 Redis 分布式锁最佳实践

```java
public class DistributedLockService {
    
    @Autowired
    private RedissonClient redisson;
    
    public Object executeWithLock(String lockKey, long waitTime, long leaseTime, 
                                   Supplier<Object> supplier) {
        RLock lock = redisson.getLock(lockKey);
        try {
            if (lock.tryLock(waitTime, leaseTime, TimeUnit.SECONDS)) {
                return supplier.get();
            } else {
                throw new RuntimeException("获取锁失败");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("获取锁被中断", e);
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }
}

// 使用
Object result = lockService.executeWithLock("order:123", 10, 30, () -> {
    return processOrder();
});
```

### 6.3 注意事项

1. **设置合理的过期时间**
   - 过短：业务未执行完锁就释放
   - 过长：异常情况下锁释放慢

2. **正确处理异常**
   ```java
   try {
       // 业务逻辑
   } catch (Exception e) {
       // 记录日志
       throw e;
   } finally {
       // 确保释放锁
       if (lock.isHeldByCurrentThread()) {
           lock.unlock();
       }
   }
   ```

3. **避免死锁**
   - 设置过期时间
   - 使用 tryLock 超时
   - 正确释放锁

4. **锁的粒度**
   - 粒度越细，并发越高
   - 但管理复杂度增加

---

## 七、常见面试题

### Q1: Redis 分布式锁如何实现可重入？

Redisson 使用 Hash 结构存储锁信息：

```
key: lock_key
value: {
    "thread_id": reentrant_count
}
```

每次加锁，计数器 +1；解锁时计数器 -1，为 0 时删除 key。

### Q2: Redis 主从切换时锁丢失怎么办？

**RedLock 方案：**
1. 向多个 Redis 节点（通常是 5 个）依次请求加锁
2. 计算获取锁成功的节点数
3. 如果超过半数节点加锁成功，则认为加锁成功
4. 否则向所有节点发起解锁请求

### Q3: ZooKeeper 和 Redis 分布式锁的区别？

| 对比项 | ZooKeeper | Redis |
|--------|-----------|-------|
| 一致性 | 强一致性（CP） | 最终一致性（AP） |
| 性能 | 较低 | 高 |
| 实现原理 | 临时顺序节点 + Watch | SET NX + Lua |
| 锁释放 | 会话结束自动删除 | 超时自动删除 |
| 适用场景 | 一致性要求高 | 性能要求高 |

---

## 参考资料

- [Redis 官方文档 - 分布式锁](https://redis.io/docs/manual/patterns/distributed-locks/)
- [Redisson 官方文档](https://github.com/redisson/redisson/wiki)
- [Curator 官方文档](https://curator.apache.org/)
- [JavaGuide - 分布式锁详解](https://javaguide.cn/distributed-system/distributed-lock.html)

## 面试官想考什么

- 是否理解分布式锁解决的是跨进程/跨节点互斥问题；
- 是否知道 Redis、ZooKeeper、数据库锁的差异；
- 是否考虑锁超时、误删、可重入、续期、主从切换等异常；
- 是否能说明分布式锁不能替代业务幂等和数据库约束。

## 标准回答

> 分布式锁用于在多实例部署时控制同一资源同一时间只被一个执行者操作。常见实现有 Redis、ZooKeeper 和数据库。Redis 实现性能高，通常用 `SET key value NX PX` 加唯一 value，并用 Lua 脚本校验 value 后释放；ZooKeeper 基于临时顺序节点，可靠性较好但性能相对低；数据库唯一索引或行锁实现简单但性能和扩展性有限。生产中还要考虑锁超时、续期、误删和业务幂等兜底。

## 深挖追问

### 为什么释放 Redis 锁要校验 value？

如果线程 A 的锁过期后线程 B 获得了同一个 key，线程 A 再执行删除就会误删 B 的锁。因此加锁时写入唯一 value，释放时用 Lua 原子判断 value 一致再删除。

### 有了分布式锁还需要幂等吗？

需要。锁只能降低并发冲突，不能覆盖锁过期、网络抖动、服务宕机、重试等异常。最终正确性应由业务状态机、唯一约束、幂等记录等兜底。

## 易错点/总结

- 不设置过期时间可能死锁；
- 过期时间过短可能业务未执行完锁已释放；
- Redis 主从异步复制下可能存在极端一致性风险；
- 分布式锁要尽量缩小锁粒度和持锁时间。

<!-- interview-renovation:2026-06-24 -->

## 面试复习强化

### 核心概念

从面试角度看，**分布式锁详解** 可以放在“分布式系统”这一类知识中理解。复习时不要只背定义，要能说清：它解决什么问题、依赖哪些前提、正常流程是什么、异常情况下系统会怎样退化或恢复。

### 面试官想考什么

- 是否理解概念背后的设计目标，而不是只记住名词；
- 是否能把机制和真实工程场景联系起来；
- 是否能分析边界条件、失败场景、性能与安全取舍；
- 是否能给出可落地的排查、实现或优化步骤。

### 标准回答

> 先定位它解决的一致性、可用性、容错或协作问题，再说明失败场景下如何恢复。 追问常围绕网络分区、节点宕机、重复请求、消息乱序、数据回滚和监控告警。 对于“分布式锁详解”，回答时建议先给一句话定义，再按“工作流程/关键机制 → 典型场景 → 风险与优化”展开，最后补充一两个线上实践点。

### 深挖追问

- 如果该机制失效，会出现什么现象？如何定位是配置、代码、资源还是外部依赖导致？
- 它和相邻概念有什么区别？例如语义、适用场景、性能成本、可靠性保证分别是什么？
- 在高并发、网络抖动、服务重启、数据不一致或权限受限时，需要补充哪些保护措施？
- 有哪些指标可以证明方案有效？例如延迟、吞吐、错误率、资源使用率、重试次数或业务成功率。

### 示例 / 实战场景

- 设计方案时：先明确业务目标和约束，再选择对应机制，不要为了使用某个技术而引入复杂度。
- 排查问题时：先确认现象和影响面，再查看日志、监控、配置、版本变更和上下游依赖，最后小步验证修复。
- 复盘沉淀时：补充自动化测试、容量评估、告警阈值、降级预案和文档，避免同类问题再次发生。

### 本题高频补充

- 分布式锁必须说明互斥、过期、防误删、可重入/续期、锁粒度、锁失败与业务补偿。

### 易错点 / 总结

- 只背结论、不讲原因，是面试扣分点；要主动解释“为什么这样设计”。
- 只讲正常路径、不讲异常路径，会显得缺少生产经验；至少补充超时、重试、降级、回滚或兜底。
- 不要把理论保证无限放大，工程实现通常还受网络、资源、配置、版本和业务语义约束。
- 总结一句：落地要补充超时、重试、幂等、限流、降级、补偿任务和人工兜底。

