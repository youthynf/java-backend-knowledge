# Redis 缓存

## 核心概念

### 数据结构

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| String | 字符串，支持数值操作 | 缓存、计数器、分布式锁 |
| Hash | 哈希表 | 对象存储 |
| List | 双向链表 | 消息队列、最新列表 |
| Set | 无序集合 | 去重、交集/并集 |
| ZSet | 有序集合 | 排行榜、延时队列 |
| Bitmap | 位图 | 签到、布隆过滤器 |
| HyperLogLog | 基数估算 | UV 统计 |
| Stream | 流 | 消息队列 |

### 持久化

**RDB**：
- 定时快照
- 文件小，恢复快
- 可能丢失最后一次快照后的数据

**AOF**：
- 记录每个写命令
- 数据更安全
- 文件大，恢复慢

**混合持久化**（RDB + AOF）：
- RDB 做全量，AOF 做增量
- 推荐配置

### 过期策略

- **定时删除**：创建定时器，到期立即删除（CPU 消耗大）
- **惰性删除**：访问时检查是否过期（内存消耗大）
- **定期删除**：定期随机检查删除（折中方案）

**Redis 采用**：惰性删除 + 定期删除

### 内存淘汰策略

| 策略 | 说明 |
|------|------|
| noeviction | 不淘汰，内存满时报错 |
| allkeys-lru | 所有键 LRU 淘汰 |
| volatile-lru | 设置过期时间的键 LRU 淘汰 |
| allkeys-lfu | 所有键 LFU 淘汰 |
| volatile-lfu | 设置过期时间的键 LFU 淘汰 |
| allkeys-random | 随机淘汰 |
| volatile-random | 过期键中随机淘汰 |
| volatile-ttl | 淘汰 TTL 最短的键 |

---

## 面试高频问题

### 1. Redis 为什么快？

**回答要点**：
- 基于内存操作
- 单线程模型，避免上下文切换
- IO 多路复用（epoll）
- 高效的数据结构

### 2. 缓存穿透、击穿、雪崩如何解决？

**缓存穿透**：
- 布隆过滤器
- 空值缓存

**缓存击穿**：
- 热点数据永不过期
- 互斥锁

**缓存雪崩**：
- 过期时间随机
- 多级缓存
- 熔断降级

### 3. Redis 如何实现分布式锁？

**基础版本**：
```bash
SET lock:resource value NX PX 30000
```

**Redlock 算法**：
- 多个 Redis 实例
- 获取锁需要多数节点成功
- 有效时间 > 获取锁耗时

### 4. Redis 主从复制原理？

**回答要点**：
- 全量复制：RDB 快照 + 缓冲区
- 增量复制：复制偏移量 + 积压缓冲区
- 心跳检测

### 5. Redis Cluster 如何分片？

**回答要点**：
- 16384 个槽位
- CRC16(key) % 16384 计算槽位
- 每个节点负责部分槽位
- 支持在线扩缩容

---

## 代码示例

### 分布式锁

```java
public boolean tryLock(String key, String value, long expireMs) {
    return "OK".equals(jedis.set(key, value, "NX", "PX", expireMs));
}

public boolean releaseLock(String key, String value) {
    String script = "if redis.call('get', KEYS[1]) == ARGV[1] then " +
                    "return redis.call('del', KEYS[1]) else return 0 end";
    return 1L == jedis.eval(script, Collections.singletonList(key), 
                            Collections.singletonList(value));
}
```

### 缓存穿透防护

```java
public Object getWithBloomFilter(String key) {
    // 1. 布隆过滤器判断
    if (!bloomFilter.mightContain(key)) {
        return null;  // 一定不存在
    }
    
    // 2. 查询缓存
    Object value = redis.get(key);
    if (value != null) {
        return value;
    }
    
    // 3. 查询数据库
    value = db.query(key);
    
    // 4. 空值也缓存
    redis.setex(key, 300, value != null ? value : "NULL");
    
    return value;
}
```

---

## 实战场景

### 缓存一致性方案

**延时双删**：
```java
public void update(String key, Object value) {
    // 1. 删除缓存
    redis.del(key);
    // 2. 更新数据库
    db.update(value);
    // 3. 延时删除
    Thread.sleep(500);
    redis.del(key);
}
```

**订阅 Binlog**：
- Canal 订阅 MySQL Binlog
- 异步更新缓存
- 保证最终一致性

### 热点 Key 处理

- 本地缓存 + Redis
- 热点 Key 拆分（加后缀）
- 提前预热

---

## 延伸思考

- Redis 如何实现消息队列？
- 如何保证 Redis 高可用？
- Redis 如何做限流？
- Redis 与 Memcached 的区别？

## 参考资料

- [Redis 官方文档](https://redis.io/docs/)
- [Redis 设计与实现](https://book.douban.com/subject/25900156/)
