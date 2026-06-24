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

---

## 面试版详细讲解

### 核心概念

这道题属于 **Redis 数据结构** 的高频考点，核心要抓住：redisObject、dict、SDS、listpack、quicklist、intset、skiplist。Redis 会根据数据规模选择紧凑或高性能编码。回答时按类型语义、底层结构、复杂度、应用场景、风险治理展开。

### 面试官想考什么

面试官通常不是只想听定义，而是想确认你能否说明：类型语义、底层编码、复杂度、场景选择和 big key 风险；还能否把它和真实业务里的性能、可靠性、可维护性联系起来。

### 标准回答

Redis 会根据数据规模选择紧凑或高性能编码。回答时按类型语义、底层结构、复杂度、应用场景、风险治理展开。

答题时建议用“三段式”：

1. 先给结论，明确适用前提；
2. 再解释底层机制或执行过程；
3. 最后补充业务取舍、风险点和排查手段。

### 深挖追问

- 这个结论在高并发或大数据量下是否仍然成立？
- 它依赖哪些版本、配置、索引/编码或业务一致性要求？
- 线上异常时应该看哪些命令、日志、指标或执行计划？

### 示例 / 实战场景

用户资料整体读写用 String，字段更新用 Hash，去重用 Set，排行榜用 Zset，签到用 Bitmap，消息流用 Stream。

```bash
# 先小范围验证命令复杂度和返回量，避免线上直接扫大 key
redis-cli --scan --pattern 'biz:*' | head
redis-cli --bigkeys
```

### 易错点

- 只背概念，不说明适用场景、代价和边界。
- 忽略数据量、并发量、版本差异和线上配置，给出绝对化结论。
- 没有把问题落到可观测手段：执行计划、慢日志、监控指标、客户端超时或错误日志。

### 一句话总结

这类题的面试核心不是“知道名词”，而是能说清 **机制 + 取舍 + 落地排查**。先给稳定结论，再讲底层原因，最后结合业务场景说明如何使用和如何避免坑。

