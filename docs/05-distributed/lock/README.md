# 分布式锁

## 核心概念

### 为什么需要分布式锁？

在分布式系统中，多个进程/机器同时访问共享资源，本地锁（synchronized、ReentrantLock）无法保证互斥。

**典型场景**：
- 秒杀扣库存
- 订单防重复
- 定时任务防并发执行
- 分布式限流

### 分布式锁的基本要求

1. **互斥性**：任意时刻只有一个客户端持有锁
2. **防死锁**：锁必须有超时机制，避免持有者崩溃导致死锁
3. **可重入**：同一线程可多次获取同一把锁
4. **高可用**：锁服务要高可用
5. **正确释放**：只能释放自己持有的锁

---

## 实现方案对比

| 方案 | 实现原理 | 优点 | 缺点 |
|------|----------|------|------|
| Redis SETNX | SET key value NX PX ttl | 简单、性能高 | 主从切换可能丢锁 |
| Redis Redlock | 多节点加锁 | 更可靠 | 实现复杂、性能低 |
| ZooKeeper | 临时顺序节点 | 可靠、公平锁 | 性能低、复杂 |
| 数据库 | 唯一索引/乐观锁 | 简单、无依赖 | 性能低 |

---

## Redis 分布式锁

### 基础实现

```java
public class RedisLock {
    private final Jedis jedis;
    private static final String LOCK_SUCCESS = "OK";
    private static final String SET_IF_NOT_EXIST = "NX";
    private static final String SET_WITH_EXPIRE_TIME = "PX";
    
    /**
     * 加锁
     * @param key 锁的 key
     * @param value 锁的值（用于标识持有者，通常是 UUID）
     * @param expireTime 过期时间（毫秒）
     */
    public boolean lock(String key, String value, long expireTime) {
        String result = jedis.set(key, value, SET_IF_NOT_EXIST, SET_WITH_EXPIRE_TIME, expireTime);
        return LOCK_SUCCESS.equals(result);
    }
    
    /**
     * 解锁（Lua 脚本保证原子性）
     */
    public boolean unlock(String key, String value) {
        String luaScript = 
            "if redis.call('get', KEYS[1]) == ARGV[1] then " +
            "    return redis.call('del', KEYS[1]) " +
            "else " +
            "    return 0 " +
            "end";
        
        Object result = jedis.eval(luaScript, Collections.singletonList(key), Collections.singletonList(value));
        return Long.valueOf(1).equals(result);
    }
}
```

**为什么用 Lua 脚本？**
- 保证 "判断 + 删除" 的原子性
- 避免 A 释放了 B 的锁

### Redisson 框架

```java
// 引入依赖
// <dependency>
//     <groupId>org.redisson</groupId>
//     <artifactId>redisson</artifactId>
//     <version>3.23.4</version>
// </dependency>

public class RedissonLockDemo {
    public static void main(String[] args) {
        Config config = new Config();
        config.useSingleServer()
              .setAddress("redis://127.0.0.1:6379")
              .setPassword("password");
        
        RedissonClient redisson = Redisson.create(config);
        RLock lock = redisson.getLock("my-lock");
        
        try {
            // 尝试加锁，最多等待 100 秒，锁自动过期时间 10 秒
            boolean acquired = lock.tryLock(100, 10, TimeUnit.SECONDS);
            if (acquired) {
                // 执行业务逻辑
                doSomething();
            } else {
                // 获取锁失败
                handleLockFailure();
            }
        } finally {
            // 只释放自己持有的锁
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }
}
```

**Redisson 优势**：
- **Watch Dog 自动续期**：后台线程自动续期，业务执行时间可超过过期时间
- **可重入锁**：同一线程可多次获取
- **公平锁**：按请求顺序获取
- **读写锁**：支持共享锁和排他锁
- **联锁**：同时锁定多个资源

### Redis 主从切换问题

**问题场景**：
1. 客户端 A 在 Master 加锁成功
2. Master 还没同步到 Slave 就宕机
3. Slave 升级为新 Master
4. 客户端 B 在新 Master 加锁成功
5. A 和 B 同时持有锁！

**解决方案**：Redlock 算法

---

## Redlock 算法

### 核心思想

在多个独立的 Redis 节点上加锁，只有超过半数节点加锁成功才算成功。

```
┌─────────────┐
│   Redis 1   │ ← 锁成功
└─────────────┘
┌─────────────┐
│   Redis 2   │ ← 锁成功
└─────────────┘
┌─────────────┐
│   Redis 3   │ ← 锁失败
└─────────────┘
┌─────────────┐
│   Redis 4   │ ← 锁成功
└─────────────┘
┌─────────────┐
│   Redis 5   │ ← 锁成功
└─────────────┘

4/5 成功 > 半数，加锁成功
```

### Redisson Redlock 实现

```java
public class RedissonRedlockDemo {
    public static void main(String[] args) {
        Config config1 = new Config();
        config1.useSingleServer().setAddress("redis://redis1:6379");
        
        Config config2 = new Config();
        config2.useSingleServer().setAddress("redis://redis2:6379");
        
        Config config3 = new Config();
        config3.useSingleServer().setAddress("redis://redis3:6379");
        
        RedissonClient client1 = Redisson.create(config1);
        RedissonClient client2 = Redisson.create(config2);
        RedissonClient client3 = Redisson.create(config3);
        
        RLock lock1 = client1.getLock("my-lock");
        RLock lock2 = client2.getLock("my-lock");
        RLock lock3 = client3.getLock("my-lock");
        
        RedissonRedLock redLock = new RedissonRedLock(lock1, lock2, lock3);
        
        try {
            boolean acquired = redLock.tryLock(10, 30, TimeUnit.SECONDS);
            if (acquired) {
                doSomething();
            }
        } finally {
            redLock.unlock();
        }
    }
}
```

---

## ZooKeeper 分布式锁

### 实现原理

```
/locks
  ├── lock-00000001  ← 临时顺序节点
  ├── lock-00000002
  ├── lock-00000003
  └── lock-00000004
```

**加锁流程**：
1. 在 `/locks` 下创建临时顺序节点
2. 判断自己是否是最小节点
   - 是：获取锁成功
   - 否：监听前一个节点的删除事件
3. 前一个节点删除后，收到通知，再次判断是否最小

**解锁流程**：
1. 删除自己创建的节点
2. 后一个节点收到通知，获取锁

### 实现代码（Curator）

```java
// 引入依赖
// <dependency>
//     <groupId>org.apache.curator</groupId>
//     <artifactId>curator-recipes</artifactId>
//     <version>5.5.0</version>
// </dependency>

public class ZookeeperLockDemo {
    public static void main(String[] args) throws Exception {
        CuratorFramework client = CuratorFrameworkFactory.builder()
            .connectString("localhost:2181")
            .retryPolicy(new ExponentialBackoffRetry(1000, 3))
            .build();
        client.start();
        
        // 可重入锁
        InterProcessMutex lock = new InterProcessMutex(client, "/locks/my-lock");
        
        try {
            // 尝试获取锁
            boolean acquired = lock.acquire(10, TimeUnit.SECONDS);
            if (acquired) {
                System.out.println("获取锁成功");
                doSomething();
            } else {
                System.out.println("获取锁失败");
            }
        } finally {
            if (lock.isAcquiredInThisProcess()) {
                lock.release();
            }
        }
    }
}
```

### ZooKeeper 锁的优势

| 特性 | Redis | ZooKeeper |
|------|-------|-----------|
| 公平锁 | 需额外实现 | 天然支持（顺序节点）|
| 可重入 | 需额外实现 | 天然支持 |
| 锁释放 | 依赖过期时间 | 客户端断开自动删除 |
| 主从切换 | 可能丢锁 | 无影响 |
| 性能 | 高 | 较低 |
| 复杂度 | 简单 | 复杂 |

---

## 面试高频问题

### 1. Redis 分布式锁过期时间如何设置？

**设置太短**：业务还没执行完，锁就过期了
**设置太长**：持有者崩溃后，锁长时间无法释放

**解决方案**：
1. **合理预估**：根据业务执行时间设置
2. **Watch Dog 续期**：Redisson 自动续期
3. **动态调整**：根据历史执行时间调整

```java
// Redisson 自动续期（默认 30 秒，每 10 秒续期一次）
RLock lock = redisson.getLock("my-lock");
lock.lock();  // 自动续期
// 或手动设置
lock.lock(10, TimeUnit.SECONDS);  // 不自动续期
```

---

### 2. 如何实现可重入锁？

**核心思想**：记录持有者线程和重入次数

```java
public class ReentrantRedisLock {
    private final Jedis jedis;
    private final ThreadLocal<Integer> holdCount = new ThreadLocal<>();
    private final ThreadLocal<String> lockValue = new ThreadLocal<>();
    
    public boolean lock(String key, long ttl) {
        // 同一线程重入
        if (holdCount.get() != null && holdCount.get() > 0) {
            holdCount.set(holdCount.get() + 1);
            return true;
        }
        
        // 首次加锁
        String value = UUID.randomUUID().toString();
        String result = jedis.set(key, value, "NX", "PX", ttl);
        if ("OK".equals(result)) {
            holdCount.set(1);
            lockValue.set(value);
            return true;
        }
        return false;
    }
    
    public void unlock(String key) {
        if (holdCount.get() == null || holdCount.get() == 0) {
            throw new IllegalMonitorStateException();
        }
        
        holdCount.set(holdCount.get() - 1);
        
        // 完全释放
        if (holdCount.get() == 0) {
            String luaScript = 
                "if redis.call('get', KEYS[1]) == ARGV[1] then " +
                "    return redis.call('del', KEYS[1]) " +
                "end";
            jedis.eval(luaScript, Collections.singletonList(key), 
                       Collections.singletonList(lockValue.get()));
            holdCount.remove();
            lockValue.remove();
        }
    }
}
```

---

### 3. 锁续期如何实现？

```java
public class LockWatchdog {
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);
    private final Map<String, ScheduledFuture<?>> tasks = new ConcurrentHashMap<>();
    
    public void startWatchdog(String key, String value, long ttl) {
        // 每 ttl/3 时间续期一次
        ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(() -> {
            try {
                String luaScript = 
                    "if redis.call('get', KEYS[1]) == ARGV[1] then " +
                    "    return redis.call('pexpire', KEYS[1], ARGV[2]) " +
                    "end";
                jedis.eval(luaScript, Arrays.asList(key, String.valueOf(ttl)), 
                          Arrays.asList(value, String.valueOf(ttl)));
            } catch (Exception e) {
                // 续期失败
            }
        }, ttl / 3, ttl / 3, TimeUnit.MILLISECONDS);
        
        tasks.put(key, future);
    }
    
    public void stopWatchdog(String key) {
        ScheduledFuture<?> future = tasks.remove(key);
        if (future != null) {
            future.cancel(false);
        }
    }
}
```

---

## 实战场景

### 场景 1：秒杀扣库存

```java
@Service
public class SeckillService {
    @Autowired
    private RedissonClient redisson;
    
    @Autowired
    private StockService stockService;
    
    public boolean seckill(String productId, String userId) {
        RLock lock = redisson.getLock("seckill:" + productId);
        
        try {
            // 尝试加锁，等待时间短，业务执行时间长
            if (lock.tryLock(1, 10, TimeUnit.SECONDS)) {
                // 检查库存
                int stock = stockService.getStock(productId);
                if (stock <= 0) {
                    return false;
                }
                
                // 扣库存
                stockService.deductStock(productId);
                
                // 创建订单
                createOrder(productId, userId);
                
                return true;
            }
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }
}
```

### 场景 2：定时任务防并发

```java
@Scheduled(cron = "0 0 2 * * ?")  // 每天凌晨 2 点
public void dailyTask() {
    RLock lock = redisson.getLock("daily-task");
    
    try {
        // 尝试加锁，等待 0 秒（不等待），锁 1 小时自动过期
        if (lock.tryLock(0, 1, TimeUnit.HOURS)) {
            // 执行任务
            processTask();
        } else {
            log.info("其他实例正在执行任务");
        }
    } finally {
        if (lock.isHeldByCurrentThread()) {
            lock.unlock();
        }
    }
}
```

---

## 延伸思考

### 1. 分布式锁 vs 数据库锁？

| 场景 | 推荐方案 |
|------|----------|
| 高并发、短时间锁定 | Redis 分布式锁 |
| 强一致性要求 | ZooKeeper 分布式锁 |
| 已有数据库事务 | 数据库乐观锁/悲观锁 |
| 需要公平排队 | ZooKeeper 公平锁 |

### 2. Redlock 是否必要？

**争议点**：
- Martin Kleppmann 认为 Redlock 在极端情况下仍可能出问题
- Redis 作者 antirez 认为问题场景过于理论化

**建议**：
- 绝大多数场景：Redis 单节点 + Redisson 足够
- 极端高可靠性：ZooKeeper
- 金融级：数据库事务或分布式事务框架

---

## 参考资料

- [Redis 分布式锁的正确实现方式](https://redis.io/topics/distlock)
- [Redisson 官方文档](https://github.com/redisson/redisson/wiki)
- [ZooKeeper Recipes and Solutions](https://zookeeper.apache.org/doc/current/recipes.html)
- [How to do distributed locking - Martin Kleppmann](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)

---

*最后更新: 2026-04-08*
