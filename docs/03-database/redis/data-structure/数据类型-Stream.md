# 数据类型-Stream

## 核心概念

Redis Stream 是 Redis 5.0 新增的数据类型，专门面向消息流/消息队列场景。原有要点：相比 Pub/Sub，Stream 支持消息持久化，离线消费者可以读取历史消息；相比 List，Stream 支持自动生成全局递增 ID、消费组、ACK 确认、待处理消息列表 PEL，因此更适合可靠消费。

Stream 中每条消息都有 ID，通常形如 `milliseconds-sequence`；消息内容是 field-value。常用命令包括 `XADD`、`XREAD`、`XGROUP CREATE`、`XREADGROUP`、`XACK`、`XPENDING`、`XCLAIM`、`XAUTOCLAIM`、`XTRIM`。底层实现使用 radix tree + listpack 来紧凑保存消息。

## 面试官想考什么

- 是否理解 Stream、List、Pub/Sub 的差异。
- 是否知道消费组、ACK、PEL、消息重投这些可靠消费机制。
- 是否能处理消息堆积、重复消费、幂等和裁剪策略。
- 是否知道 Redis Stream 和 Kafka/RabbitMQ 的定位差异。

## 标准回答

Stream 是 Redis 提供的持久化消息流。生产者用 `XADD` 写消息，消费者可以用 `XREAD` 读取；如果需要多个消费者协作处理同一条消息流，可以创建消费组，用 `XREADGROUP` 分发消息，处理成功后 `XACK`。未 ACK 的消息会留在 PEL 中，可以通过 `XPENDING` 查看，通过 `XCLAIM/XAUTOCLAIM` 转移给其他消费者重试。

它适合中小规模异步任务、事件通知、削峰等场景；但如果需要跨机房超大吞吐、严格顺序分区、长期日志存储和复杂生态，Kafka 通常更合适。

## 深挖追问

1. **Stream 比 Pub/Sub 可靠在哪里？** Pub/Sub 不保存历史，消费者离线会丢消息；Stream 消息会保留，消费者恢复后可继续读。
2. **Stream 比 List 强在哪里？** Stream 有消息 ID、消费组、ACK 和 PEL；List 做可靠队列需要自己实现很多机制。
3. **PEL 是什么？** Pending Entries List，记录已投递但未 ACK 的消息，用于排查堆积和失败重试。
4. **会不会重复消费？** 会。消费者超时、重试、网络异常都可能重复，因此业务必须幂等。

## 实战场景 / 代码示例

```bash
# 生产消息，* 表示 Redis 自动生成 ID
XADD stream:order * orderId 1001 status paid

# 创建消费组，从头开始消费；已存在时报错可忽略
XGROUP CREATE stream:order group:pay 0 MKSTREAM

# 消费者 c1 读取新消息
XREADGROUP GROUP group:pay c1 COUNT 10 BLOCK 5000 STREAMS stream:order >

# 处理成功后 ACK
XACK stream:order group:pay 1782260000000-0

# 查看待确认消息
XPENDING stream:order group:pay
```

生产环境要配合 `XTRIM stream:order MAXLEN ~ 100000` 控制长度，防止消息无限堆积。

## 易错点 / 总结

- Stream 不是“绝不丢、绝不重”的银弹，业务仍要做幂等和补偿。
- 消费后忘记 `XACK` 会导致 PEL 堆积。
- 不裁剪 Stream 会形成大 Key，影响内存和持久化。
- `MAXLEN ~` 是近似裁剪，性能更好但不是精确长度。
- 总结：Stream 的关键词是**消息流、消费组、ACK、PEL、可靠消费**；面试要答出它相对 Pub/Sub/List 的优势，以及和专业 MQ 的边界。
