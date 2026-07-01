# Redis 如何实现延迟队列

## 核心概念

延迟队列指消息发送后不立即被消费，而是等到指定时间到达后才被消费者取出。常见业务场景：订单 30 分钟未付款自动取消、用户注册后 7 天发送召回 push、定时任务调度、限时优惠结束。

Redis 本身没有原生"延迟队列"数据结构，但可以通过 **ZSet、Keyspace Notification、Stream** 三种方式实现，各有取舍。

一句话结论：**轻量场景用 ZSet（score 为执行时间戳，定时轮询）；强可靠场景用 Stream（Redis 5.0+）；生产推荐 Redisson 的 RDelayedQueue 或 RocketMQ 等专业 MQ。Keyspace Notification 不推荐用于核心业务（不可靠）。**

## 标准回答

| 方案 | 实现 | 优点 | 缺点 | 推荐度 |
|------|------|------|------|--------|
| ZSet | score = 执行时间，定时轮询 | 简单、可控 | 多消费者需协调、无 ACK | 轻量场景 |
| Keyspace Notification | 订阅 key 过期事件 | 零开发 | 不可靠、易丢消息 | 不推荐 |
| Stream + XADD/XREAD | 消息带延迟时间戳 | 可靠、有 ACK | 实现复杂 | 强可靠场景 |
| Redisson RDelayedQueue | 封装 ZSet + 队列 | API 友好 | 依赖 Redisson | 生产推荐 |

## 详细机制

### 方案一：ZSet 实现延迟队列（最常用）

**核心思路**：用 ZSet 的 score 存消息的执行时间戳，消费者定时扫描"已到期"的消息。

```text
生产者：ZADD delay_queue <unix_timestamp> <message>
消费者：ZRANGEBYSCORE delay_queue 0 <now> LIMIT 0 100 → 取出到期消息
       ZREM delay_queue <message> → 删除已处理消息
```

**关键点**：

1. `ZRANGEBYSCORE` + `ZREM` 必须原子（多消费者场景），否则消息会被多次消费；
2. 原子方案：Lua 脚本一次性"取出 + 删除"；
3. 轮询间隔影响延迟精度，通常 1 秒；
4. 消息 score 应该用毫秒级时间戳，提高精度。

#### Lua 脚本原子取消息

```lua
-- pop_expired.lua
-- KEYS[1] = ZSet key
-- ARGV[1] = current timestamp (ms)
-- ARGV[2] = max count
local items = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1], 'LIMIT', 0, ARGV[2])
if #items > 0 then
    redis.call('ZREM', KEYS[1], unpack(items))
end
return items
```

```bash
# 取出到期的最多 100 条消息
EVAL "local items = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1], 'LIMIT', 0, ARGV[2]) if #items > 0 then redis.call('ZREM', KEYS[1], unpack(items)) end return items" 1 delay_queue 1690000000000 100
```

### 方案二：Keyspace Notification（不推荐核心业务）

Redis 的键空间通知能在 key 过期、被删时发 Pub/Sub 消息。利用此机制可实现延迟队列：把消息设过期时间，订阅过期事件。

```bash
# 开启键空间通知
CONFIG SET notify-keyspace-events Ex

# 客户端订阅
SUBSCRIBE __keyevent@0__:expired

# 生产消息
SET delay:msg:1001 "task1" EX 60
# 60 秒后过期，触发通知
```

**致命缺点**：

1. **过期事件通过 Pub/Sub 传播，没有持久化**，订阅者不在线时消息丢失；
2. **过期事件不保证送达**：Redis 在惰性删除/定期删除时才产生事件，可能晚于 TTL；
3. **没有 ACK 机制**，消息消费失败无法重试；
4. **集群模式下通知只在主节点**，跨节点订阅复杂；
5. **过期 key 的 value 不可获取**：通知只发 key 名，value 已被删除。

所以 Keyspace Notification 仅适合"丢一条没关系"的辅助通知场景。

### 方案三：Redis Stream 实现延迟队列

Redis 5.0 引入 Stream，支持持久化、消费者组、ACK。配合 `XADD` 时间戳和定时调度可实现延迟队列。

```bash
# 生产消息（带执行时间）
XADD delay_stream * task '{"id":1,"executeAt":1690000060}'

# 消费者定时扫描
# 1. XRANGE 取所有消息
# 2. 业务侧判断 executeAt 是否到期
# 3. 到期则处理 + XACK
# 4. 未到期跳过
```

**优点**：持久化、消费者组、ACK 机制完备；
**缺点**：Stream 本身不支持按时间过滤，需业务侧判断，复杂度高。

更适合用 Stream + ZSet 组合：ZSet 存待执行任务的 ID，到期后从 Stream 取消息体。

### 方案四：Redisson RDelayedQueue（生产推荐）

Redisson 封装了基于 ZSet 和 List 的延迟队列，API 友好。

```java
RBlockingQueue<String> queue = redisson.getBlockingQueue("tasks");
RDelayedQueue<String> delayedQueue = redisson.getDelayedQueue(queue);

// 投递延迟消息，10 分钟后进入 queue
delayedQueue.offer("task1", 10, TimeUnit.MINUTES);

// 消费者从 queue 取（阻塞）
String task = queue.take();
process(task);
```

Redisson 内部：

1. 投递时把消息存入 ZSet（key = `redisson_delay_queue_timeout:{queueName}`），score = 当前时间 + 延迟；
2. 客户端启动后台线程定期把到期消息从 ZSet 移到目标队列；
3. 消费者从目标队列（key = `redisson_delay_queue:{queueName}`）消费。

**优点**：API 简单，可靠，支持阻塞消费；
**缺点**：依赖 Redisson 客户端。

## 代码示例

### ZSet + Lua 延迟队列（轻量自实现）

```java
@Service
public class DelayQueueService {
    @Autowired private RedisTemplate<String, String> redis;

    private static final String POP_LUA =
        "local items = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1], 'LIMIT', 0, ARGV[2]) " +
        "if #items > 0 then redis.call('ZREM', KEYS[1], unpack(items)) end " +
        "return items";

    // 投递延迟消息
    public void offer(String queue, String message, long delaySec) {
        long execAt = System.currentTimeMillis() + delaySec * 1000;
        redis.opsForZSet().add(queue, message, execAt);
    }

    // 消费者定时拉取
    @Scheduled(fixedRate = 1000)
    public void consume() {
        long now = System.currentTimeMillis();
        DefaultRedisScript<List> script = new DefaultRedisScript<>(POP_LUA, List.class);
        List<String> items = redis.execute(
            script,
            Collections.singletonList("delay:order"),
            String.valueOf(now),
            "100"
        );
        for (String item : items) {
            try {
                process(item);
            } catch (Exception e) {
                // 处理失败，重新入队
                redis.opsForZSet().add("delay:order", item, now + 60_000);
            }
        }
    }

    private void process(String item) {
        // 业务处理
    }
}
```

### Redisson 延迟队列（生产推荐）

```java
@Service
public class OrderCancelService {
    @Autowired private RedissonClient redisson;

    public void scheduleCancel(Long orderId) {
        RBlockingQueue<Long> queue = redisson.getBlockingQueue("order:cancel");
        RDelayedQueue<Long> delayed = redisson.getDelayedQueue(queue);
        // 30 分钟后 orderId 进入 queue
        delayed.offer(orderId, 30, TimeUnit.MINUTES);
    }

    // 消费者独立线程
    @PostConstruct
    public void startConsumer() {
        new Thread(() -> {
            RBlockingQueue<Long> queue = redisson.getBlockingQueue("order:cancel");
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    Long orderId = queue.take();  // 阻塞等待
                    cancelOrderIfUnpaid(orderId);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } catch (Exception e) {
                    // 异常重试
                }
            }
        }).start();
    }

    private void cancelOrderIfUnpaid(Long orderId) {
        // 业务逻辑
    }
}
```

### Stream + ZSet 组合（强可靠）

```java
@Service
public class StreamDelayQueue {
    @Autowired private RedisTemplate<String, ?> redis;

    private static final String STREAM = "delay:stream";
    private static final String ZSET = "delay:zset";

    // 投递：消息体存 Stream，ID 存 ZSet
    public String offer(String payload, long delayMs) {
        String recordId = redis.opsForStream().add(
            StreamRecords.objectBacked(payload).withStreamKey(STREAM)
        ).getValue();
        long execAt = System.currentTimeMillis() + delayMs;
        redis.opsForZSet().add(ZSET, recordId, execAt);
        return recordId;
    }

    // 消费：扫描 ZSet，到期则从 Stream 取并 ACK
    @Scheduled(fixedRate = 1000)
    public void consume() {
        long now = System.currentTimeMillis();
        Set<String> ids = redis.opsForZSet().rangeByScore(ZSET, 0, now);
        if (ids == null || ids.isEmpty()) return;

        for (String id : ids) {
            List<MapRecord<String, Object, Object>> records = redis.opsForStream()
                .range(STREAM, Range.range(id, id));
            if (records != null && !records.isEmpty()) {
                process(records.get(0));
            }
            redis.opsForStream().delete(STREAM, id);
            redis.opsForZSet().remove(ZSET, id);
        }
    }
}
```

## 实战场景

| 场景 | 推荐方案 | 延迟精度 |
|------|----------|----------|
| 订单超时取消 | Redisson RDelayedQueue | 分钟级 |
| 用户召回 push | RocketMQ 延迟消息 | 分钟级 |
| 定时任务调度 | ZSet | 秒级 |
| 限时优惠结束 | Redisson | 分钟级 |
| 实时延迟（秒级） | ZSet + 短轮询 | 秒级 |
| 强可靠（金融场景） | RocketMQ / Pulsar | 分钟级 |
| 异步通知 | ZSet | 秒级 |

## 深挖追问

### ZSet 延迟队列如何避免消息丢失？

1. 消费者取出消息后立即 ZREM（Lua 原子）；
2. 业务处理失败时把消息重新 ZADD 回去（带新 score）；
3. 处理成功后才确认；失败重试有上限；
4. Redis 开 AOF 持久化，避免宕机丢消息。

### ZSet 队列消息量大时性能怎么样？

ZSet 的 `ZRANGEBYSCORE` 是 O(log(N) + M)，N 是元素总数，M 是返回数。百万级消息下毫秒级。但 ZSet 内存占用较高（每个元素约 60 字节），亿级消息不适合。

### 多消费者如何分配消息？

用 Lua 原子"取出 + 删除"，保证一条消息只被一个消费者拿到。或按业务 key 分桶到多个 ZSet，提升并行度。

### 延迟精度受什么影响？

- 轮询间隔：1 秒轮询则精度 1 秒；
- Redis 负载：高负载下命令排队，影响精度；
- 消费者处理速度：处理慢则消息堆积；
- 客户端与 Redis 的时间差：建议用 Redis 的 `TIME` 命令同步。

### Redisson RDelayedQueue 内部如何工作？

1. `offer` 时把消息存入 ZSet（key = `redisson_delay_queue_timeout:{queueName}`），score = 执行时间；
2. 客户端启动后台线程定期把到期消息从 ZSet 移到目标队列（key = `redisson_delay_queue:{queueName}`）；
3. 消费者 `take()` 从目标队列阻塞读取。

### Redis 延迟队列 vs 专业 MQ 怎么选？

| 维度 | Redis 延迟队列 | RocketMQ 等 |
|------|----------------|-------------|
| 可靠性 | 中（依赖 Redis 持久化） | 高（多副本+ACK） |
| 吞吐 | 高 | 高 |
| 延迟精度 | 秒级 | 秒级（固定延迟级别） |
| 运维 | 已有 Redis 则简单 | 独立部署 |
| 生态 | Redis 内 | 完善监控 |
| 延迟级别 | 任意 | RocketMQ 开源版仅 18 个固定级别 |

中小项目用 Redis 足够；金融级业务用专业 MQ。

### Keyspace Notification 的过期时间精度如何？

不保证。Redis 过期键的处理依赖惰性删除（访问时）和定期删除（每 100ms 抽样）。一个 TTL=60s 的 key 可能在 60s 时被读触发删除，也可能 65s 时才被定期删除抽到。所以通知可能晚到几秒。

### Redis 7.0 的 Stream 有什么新特性？

- `XAUTOCLAIM`：自动认领超时未 ACK 的消息（类似 RocketMQ 的回溯）；
- `XADD` 支持 `NOMKSTREAM` 选项（不存在则不创建）；
- 性能优化：单 Stream 支持更高吞吐。

对延迟队列实现帮助不大，但可靠性提升。

## 易错点

- 用 ZRANGEBYSCORE + ZREM 两步非原子，多消费者消息重复；
- Keyspace Notification 用于核心业务，丢消息；
- 轮询间隔过长导致延迟精度差；
- 消息失败不重试，丢任务；
- ZSet 无限增长，内存撑爆；
- 把延迟精度要求秒级的业务放到分钟级轮询；
- 消费者宕机时未处理的消息丢失（ZSet 已删除但业务未完成）；
- Redisson RDelayedQueue 客户端不启动消费，消息堆积在 ZSet。

## 总结

Redis 实现延迟队列的主流方案是 **ZSet（轻量自实现）和 Redisson RDelayedQueue（生产推荐）**。ZSet 思路：score 存执行时间，Lua 原子取出 + 删除。Keyspace Notification 不可靠，不推荐核心业务。Stream 适合强可靠但复杂。**生产实践优先选 Redisson 或专业 MQ（RocketMQ）**，自研 ZSet 方案适合中小项目。

## 参考资料

- [Redis 官方文档：Sorted Sets](https://redis.io/docs/data-types/sorted-sets/)
- [Redisson 文档：Distributed collections](https://github.com/redisson/redisson/wiki/7.-distributed-collections)
- [Redis 键空间通知](https://redis.io/docs/manual/keyspace-notifications/)
- [Redis Stream 文档](https://redis.io/docs/data-types/streams/)

---
