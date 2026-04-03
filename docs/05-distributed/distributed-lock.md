# 分布式锁详解

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