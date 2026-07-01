# Kafka 的 Exactly-Once 语义怎么保证

## 核心概念

Kafka 的 Exactly-Once 语义（精确一次）是指消息在生产、传输、消费的全链路中，最终只会被精确处理一次——既不重复，也不丢失。这是分布式消息系统中最高级别的一致性保证，尤其适用于金融交易、数据对账等对数据准确性要求极高的场景。

Kafka 的 Exactly-Once 并非天然支持，而是从 0.11.0 版本开始通过**生产者幂等性、事务机制、消费者 Offset 管理**三者协同实现的。关键认知：Kafka 的 Exactly-Once 严格适用于 Kafka 内部"消费-处理-再生产"链路；一旦涉及写数据库、Redis 或调用外部接口，就必须由业务幂等或本地事务补足。

## 标准回答

Kafka 的 Exactly-Once 由三部分协同实现：

1. **幂等生产者**：`enable.idempotence=true`，Broker 通过 PID + SequenceNumber 去重，避免生产者重试造成单分区内重复写入。
2. **事务机制**：配置稳定的 `transactional.id`，在事务中发送多分区消息，并调用 `sendOffsetsToTransaction` 提交消费位移，最后 commit 或 abort，保证跨分区写入和位移提交的原子性。
3. **消费者隔离级别**：`isolation.level=read_committed`，只读取已提交事务的消息，跳过 abort 的事务消息。

外部数据库写入仍要用唯一键、Outbox 或对账补偿。Kafka 事务适合流处理链路，普通日志采集通常没必要开启。

## 三种投递语义

理解 Exactly-Once 前先要弄清三种投递语义：

| 语义 | 行为 | 示例 |
|------|------|------|
| At-Most-Once（最多一次） | 可能丢失，不会重复 | 消费者处理前提交 offset，处理失败则消息永久丢失 |
| At-Least-Once（至少一次） | 可能重复，不会丢失 | 消费者处理后提交 offset，提交失败则重新消费 |
| Exactly-Once（精确一次） | 既不丢失也不重复 | 幂等生产者 + 事务 + read_committed |

At-Least-Once + 业务幂等是大多数业务场景的工程选择；Exactly-Only 在 Kafka 内部链路可以做到，但代价是性能和复杂度。

## 实现机制

### 幂等生产者：解决"重复生产"

幂等生产者确保同一个生产者对同一条消息的多次发送，最终只会被 Broker 持久化一次。实现依赖两个关键标识：

- **Producer ID（PID）**：每个生产者启动时由 Broker 分配，唯一标识生产者会话。重启后 PID 可能变化。
- **SequenceNumber（序列号）**：生产者向每个 Partition 发送消息时携带的单调递增序列号（从 0 开始）。

工作流程：

1. 生产者发送消息时携带 PID 和 SequenceNumber。
2. Broker 在对应 Partition 的日志中记录 `<PID, SequenceNumber>`。
3. 若 Broker 收到重复消息（PID 相同、SequenceNumber 与已记录的重复），直接丢弃，不写入日志。
4. 若 SequenceNumber 不连续（中间缺失），Broker 拒绝接收后续消息，直到生产者补全缺失消息（避免消息丢失）。

**局限性：仅保证单个生产者对单个 Partition 的幂等性，无法跨 Partition 或跨生产者。** 生产者重启后 PID 变化，幂等性失效，需依赖事务机制解决。

### 事务机制：解决"跨分区/跨操作原子性"

事务机制扩展了幂等性，支持跨多个 Partition 的原子操作（要么全部成功，要么全部失败），同时解决生产者重启后的一致性问题。

核心组件：

- **TransactionCoordinator（事务协调器）**：每个 Broker 都可能作为事务协调器，负责管理生产者的事务状态。
- **Transaction ID（TID）**：用户自定义，重启后保持不变，区别于会话级的 PID。协调器根据 TID 恢复事务状态。
- **`__transaction_state`**：内部 Topic，持久化事务状态（TID、涉及的 Partition、事务状态），确保崩溃后可恢复。

事务执行流程：

1. **初始化事务**：生产者调用 `initTransactions()` 向协调器注册 TID，协调器分配 PID 和 epoch（防止僵尸生产者）。
2. **开始事务**：生产者调用 `beginTransaction()`。
3. **发送消息与记录 Offset**：生产者在事务内发送消息到多个 Partition；若同时是消费者，调用 `sendOffsetsToTransaction()` 把消费位移提交纳入事务。
4. **提交/中止事务**：
   - 成功：调用 `commitTransaction()`，协调器把事务状态标记为 COMMITTED 并写入 `__transaction_state`。
   - 失败：调用 `abortTransaction()`，协调器标记为 ABORTED。
5. **Broker 与消费者处理**：
   - Broker 收到 commit 后，让事务内消息对消费者可见。
   - 若 abort，Broker 删除事务内消息（或标记为无效）。
   - 消费者设置 `isolation.level=read_committed` 时，只读取 COMMITTED 事务的消息，忽略 UNCOMMITTED 和 ABORTED 的事务消息。

### 消费者 Offset 管理：解决"重复消费"

消费者需要把"消息处理"与"Offset 提交"绑定为原子操作：

- 处理成功，Offset 才提交（避免丢失）。
- 处理失败，Offset 不提交（可重新消费，配合事务避免重复）。

在事务机制中，当消费者同时充当生产者时，消费者的 Offset 提交被纳入生产者事务（通过 `sendOffsetsToTransaction()`），实现"消息生产 + Offset 提交"的原子性。典型场景：流处理应用从 Topic A 消费，处理后写入 Topic B，把"消费 A 的 Offset"和"写入 B"放在同一事务中。

## 端到端 Exactly-Once

上述机制解决了"生产者到 Broker"和"Broker 到消费者"的一致性，但端到端（从数据源到最终处理系统）的 Exactly-Once 还需下游系统支持：

- **下游系统需支持幂等写入**：数据库通过主键去重，确保同一条消息多次写入只保留一次。
- **端到端事务绑定**：通过分布式事务（如 2PC）或事件溯源（Event Sourcing），把 Kafka 事务与下游系统操作绑定。
- **Kafka Streams**：通过"拓扑事务"原生支持端到端 Exactly-Once，把整个流处理过程（消费、转换、生产）封装在事务中，结合状态存储的幂等性实现精确一次处理。

## 代码示例

### 幂等生产者配置

```properties
enable.idempotence=true
acks=all
retries=2147483647
max.in.flight.requests.per.connection=5
```

Kafka 3.0+ 默认开启幂等生产者，无需显式配置。

### 事务生产者示例

消费 Topic A 处理后写入 Topic B，把"写 B"和"提交 A 的 offset"放在同一事务。

```java
public class TransactionalProcessor {

    public static void main(String[] args) {
        Properties producerProps = buildProducerProps();
        Properties consumerProps = buildConsumerProps();

        KafkaProducer<String, String> producer = new KafkaProducer<>(producerProps);
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(consumerProps);

        // 初始化事务，注册 transactional.id
        producer.initTransactions();

        consumer.subscribe(Collections.singletonList("topic-a"));

        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
                if (records.isEmpty()) continue;

                // 开启事务
                producer.beginTransaction();
                try {
                    // 处理后写入 topic-b
                    for (ConsumerRecord<String, String> record : records) {
                        String processed = process(record.value());
                        producer.send(new ProducerRecord<>("topic-b", record.key(), processed));
                    }
                    // 把消费 offset 提交纳入事务
                    Map<TopicPartition, OffsetAndMetadata> offsets = new HashMap<>();
                    for (TopicPartition partition : records.partitions()) {
                        long offset = records.records(partition)
                                .stream()
                                .mapToLong(ConsumerRecord::offset)
                                .max().getAsLong();
                        offsets.put(partition, new OffsetAndMetadata(offset + 1));
                    }
                    producer.sendOffsetsToTransaction(offsets, consumer.groupMetadata());
                    // 提交事务：写 topic-b 和提交 offset 原子完成
                    producer.commitTransaction();
                } catch (Exception e) {
                    // 中止事务：topic-b 的消息和 offset 提交都作废
                    producer.abortTransaction();
                }
            }
        } finally {
            producer.close();
            consumer.close();
        }
    }

    private static Properties buildProducerProps() {
        Properties props = new Properties();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "tx-processor-1"); // 稳定的 TID
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        return props;
    }

    private static Properties buildConsumerProps() {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "tx-processor-group");
        props.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed"); // 只读已提交
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false); // 关闭自动提交
        return props;
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 流处理（消费 A 写 B） | 事务绑定"写 B"和"提交 A 的 offset" | 消费者 `isolation.level=read_committed` |
| 实时风控 | 消费 `order_events` 计算风险写入 `risk_events`，事务保证一致 | 写 MySQL 风控表仍需唯一键 |
| 跨分区原子写入 | 多个 Partition 的消息要么全部可见要么全部不可见 | 必须用同一 `transactional.id` |
| 订单状态机 | 订单状态变更和事件发送绑定为原子 | 下游消费仍要幂等 |
| 金融对账 | 配合数据库唯一键、对账任务兜底 | 不能只依赖 Kafka 事务 |

## 深挖追问

### 幂等生产者能跨会话去重吗？

仅靠 PID 不够，PID 是会话级的，生产者重启后 PID 变化，去重失效。跨会话需要事务机制，配置稳定的 `transactional.id`，由事务协调器维护跨会话状态。协调器会用新 epoch 拒绝旧 epoch 的生产者（防止僵尸生产者）。

### 为什么 EOS 会影响性能？

多了事务协调、状态日志、提交标记和更多网络交互。事务机制会增加与协调器的通信（initTransactions、sendOffsetsToTransaction、commitTransaction）和存储开销（`__transaction_state`），吞吐量可能下降 10%-20%。日志采集等普通场景没必要开启。

### 读未提交会怎样？

`isolation.level=read_uncommitted`（默认）可能读到最终 abort 的事务消息，破坏精确处理语义。开启事务的场景必须设为 `read_committed`。注意 `read_committed` 也会影响吞吐，因为消费者要等待事务提交才能读到消息。

### transactional.id 怎么设计？

`transactional.id` 必须在应用重启后保持不变，且在整个集群中唯一。通常用"应用名 + 实例标识"形式，如 `order-processor-1`。多实例部署时每个实例用不同 TID。TID 用于跨会话恢复事务状态和防止僵尸生产者。

### Kafka Streams 如何实现 EOS？

Kafka Streams 通过 `processing.guarantee=exactly_once_v2`（2.5+）开启 EOS。它把整个拓扑（消费、转换、生产、状态存储更新）封装在事务中，状态存储用幂等写入。EOS v2 比 v1 性能更好，减少了事务边界。

## 易错点

- **认为 EOS 能保证所有外部副作用只执行一次**：Kafka EOS 只保证 Kafka 内部链路精确一次；写数据库、调用 HTTP 接口仍要业务幂等。
- **`transactional.id` 不稳定**：重启后 TID 变化会导致协调器无法恢复事务状态，可能产生僵尸生产者。
- **消费者不设 `read_committed`**：开启事务但消费端读未提交，会读到 abort 的消息，破坏 EOS 语义。
- **事务超时配置不当**：`transaction.timeout.ms` 默认 60 秒，处理时间超过会被协调器中止；设置过大又会延迟 abort 消息的清理。
- **普通场景滥用事务**：日志采集等允许 At-Least-Once 的场景开事务得不偿失，性能损失换不来业务价值。

## 总结

Kafka 的 Exactly-Once 由幂等生产者 + 事务机制 + `read_committed` 消费者协同实现。幂等生产者解决单分区内重试重复，事务解决跨分区原子性和 offset 提交绑定，`read_committed` 让消费者只读已提交事务。EOS 严格适用于 Kafka 内部"消费-处理-再生产"链路，外部数据库/接口仍需业务幂等、本地事务、Outbox 或对账补偿。事务会增加 10%-20% 性能开销，仅建议在对一致性要求极高的金融/对账场景使用。普通日志采集用 At-Least-Once + 消费幂等即可。

## 参考资料

- [KIP-98: Exactly Once Delivery and Transactional Messaging](https://cwiki.apache.org/confluence/display/KAFKA/KIP-98+-+Exactly+Once+Delivery+and+Transactional+Messaging)
- [Kafka Producer Transactions](https://kafka.apache.org/documentation/#transactions)
- [Kafka Consumer Isolation Level](https://kafka.apache.org/documentation/#consumerconfigs_isolation.level)
- [Kafka Streams Exactly Once](https://kafka.apache.org/documentation/streams/developer-guide/config-streams.html)
