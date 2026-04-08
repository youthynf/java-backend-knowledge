# 分布式 ID

## 核心概念

### 为什么需要分布式 ID

**单机数据库自增 ID 的问题**：
- 分库分表后无法保证全局唯一
- ID 可预测，存在安全问题
- 主从切换可能导致 ID 冲突

**分布式 ID 要求**：
- **全局唯一**：任何节点生成的 ID 不重复
- **趋势递增**：有利于数据库索引性能
- **高性能**：高并发下快速生成
- **高可用**：避免单点故障

### 常见方案对比

| 方案 | 全局唯一 | 趋势递增 | 性能 | 依赖 | 适用场景 |
|------|----------|----------|------|------|----------|
| UUID | ✅ | ❌ | 高 | 无 | 非主键场景 |
| 数据库自增 | ✅ | ✅ | 低 | 数据库 | 单库 |
| 号段模式 | ✅ | ✅ | 高 | 数据库 | 高并发 |
| 雪花算法 | ✅ | ✅ | 高 | 时钟 | 大多数场景 |
| Leaf | ✅ | ✅ | 高 | 数据库/ZK | 超高并发 |

## UUID

### 格式

```
UUID = 时间戳 + 版本 + 变体 + 机器标识 + 序列号
示例：550e8400-e29b-41d4-a716-446655440000
```

### Java 生成

```java
// JDK 自带
UUID uuid = UUID.randomUUID();
String id = uuid.toString().replace("-", "");

// 32位十六进制字符串
// 示例：550e8400e29b41d4a716446655440000
```

### 优缺点

**优点**：
- 生成简单，无需依赖外部系统
- 全局唯一

**缺点**：
- **无序**：不利于 MySQL 聚簇索引
- **过长**：32 字符，存储和索引开销大
- **不可读**：无法从中获取任何业务信息

### 为什么不适合做 MySQL 主键

```sql
-- UUID 作为主键会导致：
-- 1. 页分裂频繁（无序插入）
-- 2. 索引碎片化
-- 3. 内存利用率低

-- 对比：自增 ID
-- 顺序追加，页填充率高
-- 对比：UUID
-- 随机插入，频繁页分裂
```

## 数据库自增 ID

### 单机模式

```sql
CREATE TABLE `user` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64),
    PRIMARY KEY (`id`)
);
```

### 集群模式（步长方案）

```sql
-- 节点 1
SET @@auto_increment_offset = 1;  -- 起始值
SET @@auto_increment_increment = 2;  -- 步长

-- 节点 2
SET @@auto_increment_offset = 2;
SET @@auto_increment_increment = 2;

-- 生成序列：
-- 节点1: 1, 3, 5, 7, 9...
-- 节点2: 2, 4, 6, 8, 10...
```

### 号段模式

```sql
CREATE TABLE id_segment (
    biz_tag VARCHAR(64) PRIMARY KEY,
    max_id BIGINT NOT NULL,
    step INT NOT NULL,
    version BIGINT NOT NULL
);

-- 获取号段
UPDATE id_segment 
SET max_id = max_id + step, version = version + 1
WHERE biz_tag = 'order' AND version = ?;

-- 返回 [max_id - step + 1, max_id] 这段 ID
-- 应用缓存到本地，减少数据库访问
```

**优点**：
- 趋势递增
- 性能较高（批量获取）

**缺点**：
- 数据库单点问题
- ID 不连续（但趋势递增）

## 雪花算法（Snowflake）

### 结构设计

```
0 - 0000000000 0000000000 0000000000 0000000000 0 - 00000 - 00000 - 000000000000

| 1位符号位 | 41位时间戳 | 10位机器ID | 12位序列号 |

时间戳（41位）：毫秒级，可使用 69 年
机器ID（10位）：5位数据中心ID + 5位机器ID，共 1024 台机器
序列号（12位）：同一毫秒内可生成 4096 个 ID
```

**理论性能**：每毫秒 409.6 万个 ID，单机 QPS 可达 400 万+

### Java 实现

```java
public class SnowflakeIdGenerator {
    // 起始时间戳（可自定义）
    private final long twepoch = 1640995200000L; // 2022-01-01
    
    // 位数分配
    private final long workerIdBits = 5L;
    private final long datacenterIdBits = 5L;
    private final long sequenceBits = 12L;
    
    // 最大值
    private final long maxWorkerId = -1L ^ (-1L << workerIdBits);     // 31
    private final long maxDatacenterId = -1L ^ (-1L << datacenterIdBits); // 31
    private final long sequenceMask = -1L ^ (-1L << sequenceBits);    // 4095
    
    // 位移
    private final long workerIdShift = sequenceBits;
    private final long datacenterIdShift = sequenceBits + workerIdBits;
    private final long timestampLeftShift = sequenceBits + workerIdBits + datacenterIdBits;
    
    private final long workerId;
    private final long datacenterId;
    private long sequence = 0L;
    private long lastTimestamp = -1L;
    
    public SnowflakeIdGenerator(long workerId, long datacenterId) {
        if (workerId > maxWorkerId || workerId < 0) {
            throw new IllegalArgumentException("worker Id error");
        }
        if (datacenterId > maxDatacenterId || datacenterId < 0) {
            throw new IllegalArgumentException("datacenter Id error");
        }
        this.workerId = workerId;
        this.datacenterId = datacenterId;
    }
    
    public synchronized long nextId() {
        long timestamp = System.currentTimeMillis();
        
        // 时钟回拨
        if (timestamp < lastTimestamp) {
            throw new RuntimeException("Clock moved backwards");
        }
        
        // 同一毫秒内
        if (timestamp == lastTimestamp) {
            sequence = (sequence + 1) & sequenceMask;
            if (sequence == 0) {
                // 序列号用完，等待下一毫秒
                timestamp = tilNextMillis(lastTimestamp);
            }
        } else {
            sequence = 0L;
        }
        
        lastTimestamp = timestamp;
        
        return ((timestamp - twepoch) << timestampLeftShift)
             | (datacenterId << datacenterIdShift)
             | (workerId << workerIdShift)
             | sequence;
    }
    
    private long tilNextMillis(long lastTimestamp) {
        long timestamp = System.currentTimeMillis();
        while (timestamp <= lastTimestamp) {
            timestamp = System.currentTimeMillis();
        }
        return timestamp;
    }
}
```

### 时钟回拨问题

**问题**：服务器时钟回拨可能导致 ID 重复

**解决方案**：

```java
// 方案1：直接抛异常（简单但不优雅）
if (timestamp < lastTimestamp) {
    throw new RuntimeException("Clock moved backwards");
}

// 方案2：等待时钟追上（适合小幅度回拨）
if (timestamp < lastTimestamp) {
    long offset = lastTimestamp - timestamp;
    if (offset <= 5) { // 5ms 内等待
        Thread.sleep(offset << 1);
        timestamp = System.currentTimeMillis();
    } else {
        throw new RuntimeException("Clock moved backwards too much");
    }
}

// 方案3：使用备用 workerId
// 给每台机器分配多个 workerId，回拨时切换

// 方案4：存储历史时间戳到外部存储（Redis/ZK）
// 启动时检查时钟是否回拨
```

## Leaf 分布式 ID

### 两种模式

**Leaf Segment（号段模式）**：
```
                    +----------------+
                    |   Database     |
                    | id_segment表   |
                    +-------+--------+
                            |
                    批量获取号段
                            |
                    +-------v--------+
                    |   Leaf Server  |
                    |   (双Buffer)   |
                    +-------+--------+
                            |
                    内存分配ID
                            |
                    +-------v--------+
                    |    业务应用    |
                    +----------------+
```

**双 Buffer 优化**：
```java
// 准备两个号段
Segment current;  // 当前使用
Segment next;     // 下一个准备

// 当 current 使用到 10% 时，异步加载 next
if (current.getId() >= current.getMax() - current.getStep() * 0.1) {
    asyncLoadNext();
}

// current 用完，切换到 next
if (current.getId() > current.getMax()) {
    synchronized (this) {
        current = next;
        next = null;
    }
}
```

**Leaf Snowflake（雪花模式）**：
- 使用 ZooKeeper 管理工作机器 ID
- 解决时钟回拨问题（记录时间戳到 ZK）

## 面试高频问题

### 1. 雪花算法 ID 会重复吗？

**参考回答**：
在以下条件下不会重复：
1. workerId 和 datacenterId 组合唯一
2. 时钟不回拨

但实际可能重复的场景：
- 服务器时钟回拨
- workerId 配置错误
- 多机房未协调好 workerId

### 2. 如何解决时钟回拨问题？

**参考回答**：
1. **等待时钟追上**：小幅度回拨（<5ms）直接等待
2. **拒绝服务**：大幅度回拨抛异常，运维介入
3. **备用 workerId**：每个实例预留多个 workerId
4. **外部存储时间戳**：启动时检查 Redis/ZK 中记录的上次时间戳

### 3. UUID 为什么不适合做 MySQL 主键？

**参考回答**：
1. **页分裂**：UUID 无序，导致聚簇索引频繁页分裂
2. **索引性能差**：页分裂产生碎片，查询性能下降
3. **存储开销大**：36 字符 vs BIGINT 的 8 字节
4. **内存利用率低**：B+ 树节点能存的键更少

### 4. Leaf 号段模式如何保证高可用？

**参考回答**：
1. **双 Buffer**：一个使用，一个预加载，无缝切换
2. **数据库高可用**：主从部署，故障自动切换
3. **降级策略**：数据库不可用时，可使用预分配的本地号段

## 实战场景

### 场景1：订单 ID 设计

**需求**：
- 全局唯一
- 趋势递增
- 可读性（包含业务信息）

**方案**：业务规则 + 雪花算法

```
订单ID = 日期(8位) + 业务类型(2位) + 雪花ID后10位
示例：20240408 01 1234567890
       ↑       ↑  ↑
     日期    订单 雪花算法
```

### 场景2：分库分表主键

**需求**：
- 支持 10 亿+ 数据
- 分 16 库，每库 64 表
- ID 包含路由信息

**方案**：改良雪花算法

```
ID = 时间戳(41) | 分库位(4) | 分表位(6) | 序列号(12)

// 根据 ID 路由
long dbIndex = (id >> 18) & 0xF;   // 取分库位
long tableIndex = (id >> 12) & 0x3F; // 取分表位
```

## 延伸思考

1. **分布式 ID 和分布式锁的区别？**
   - ID：全局唯一标识，无竞争
   - 锁：资源互斥访问，有竞争

2. **Redis 如何生成分布式 ID？**
   ```bash
   # INCR 原子自增
   INCR order:id
   # 返回：1, 2, 3, 4...
   
   # INCRBY 批量获取
   INCRBY order:id 1000
   # 返回 1000，表示 [1-1000] 可用
   ```

3. **分布式 ID 服务如何设计？**
   - 高可用：多机房部署
   - 高性能：本地缓存号段
   - 可观测：监控 ID 生成速率、延迟

## 参考资料

- [Twitter Snowflake 论文](https://github.com/twitter-archive/snowflake)
- [Leaf 美团分布式ID](https://tech.meituan.com/2017/04/21/mt-leaf.html)
- [分布式ID生成方案总结](https://segmentfault.com/a/1190000040980366)