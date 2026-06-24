# Kafka 会丢消息吗？

## 核心概念

Kafka 本身是高可靠消息系统，但**不代表默认配置下绝对不会丢消息**。消息从生产者到 Broker，再到消费者处理完成，链路上任何阶段配置不当或处理方式不对，都可能出现丢失。

面试结论：**Kafka 可以做到很高可靠，配合幂等生产者、事务和合理副本配置，可以实现 Kafka 内部的 Exactly-Once 语义；但默认或错误使用时，生产端、Broker 端、消费端都可能丢消息。**

## 面试官想考什么

- 能否按 producer、broker、consumer 三阶段拆解风险；
- 是否理解 `acks`、ISR、副本、`min.insync.replicas`；
- 是否知道 offset 提交过早会造成“业务意义上的丢消息”；
- 是否能区分“不丢消息”“不重复消费”“端到端事务”。

## 标准回答

### 1. 生产者阶段：消息没有可靠写入 Broker

可能丢消息的典型场景：

1. `acks=0`：生产者发出去就认为成功，Broker 没收到也不知道；
2. `acks=1`：leader 写入成功就返回，如果 leader 宕机且 follower 未同步，消息可能丢；
3. 未开启重试，网络抖动时发送失败；
4. 应用进程崩溃，缓冲区里的消息还没来得及发出；
5. 重试配置不当，虽然不丢但可能重复或乱序。

生产端可靠配置通常是：

```properties
acks=all
retries=2147483647
enable.idempotence=true
delivery.timeout.ms=120000
max.in.flight.requests.per.connection=5
```

其中 `acks=all` 表示 leader 要等 ISR 中副本确认；`enable.idempotence=true` 可以避免生产者重试导致同一分区内重复写入。

### 2. Broker 阶段：副本和选主配置不合理

可能丢消息的典型场景：

1. Topic 只有 1 个副本，Broker 宕机或磁盘损坏就无法恢复；
2. `min.insync.replicas=1`，即使 `acks=all`，也可能只有 leader 一份写入成功；
3. 允许 unclean leader election，落后副本被选成 leader，已确认消息丢失；
4. 消息保留时间太短，消费者长时间不消费，消息被过期删除。

生产环境常见配置：

```properties
default.replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false
```

Topic 级别也可以设置：

```bash
kafka-topics.sh --alter --topic order-event \
  --config min.insync.replicas=2 \
  --bootstrap-server broker:9092
```

三副本 + 至少两个 ISR 确认，能在单 Broker 故障时尽量避免已确认消息丢失。

### 3. 消费者阶段：业务没处理完 offset 已提交

这是业务系统里最常见的问题。Kafka 中消息还在，但消费者已经提交 offset，后续不会再消费这条消息，于是对业务来说就“丢了”。

错误示例：

```properties
enable.auto.commit=true
```

如果消费者 poll 到消息后自动提交 offset，但业务处理到一半宕机，这条消息就不会再次处理。

更可靠的方式：

1. 关闭自动提交；
2. 业务处理成功后再手动提交 offset；
3. 失败消息进入重试 Topic 或死信队列；
4. 消费逻辑必须做幂等。

```java
props.put("enable.auto.commit", "false");

while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
    for (ConsumerRecord<String, String> record : records) {
        handle(record); // 业务处理成功
    }
    consumer.commitSync(); // 成功后再提交 offset
}
```

注意：手动提交能降低丢消息风险，但可能造成重复消费，所以幂等是必须的。

## 深挖追问

### `acks=all` 就一定不丢吗？

不一定。还要看 `min.insync.replicas`。如果它是 1，`acks=all` 也可能只有 leader 确认。生产环境通常使用 3 副本 + `min.insync.replicas=2`。

### Kafka 的 Exactly-Once 能解决所有问题吗？

Kafka 的 Exactly-Once 主要解决 Kafka 内部“消费一个 Topic、处理后写入另一个 Topic”的一致性问题，可以把输出消息和 offset 放在同一个事务里提交。

但如果处理结果写到 MySQL、Redis、第三方接口，仍然要靠业务幂等、本地事务消息、Outbox 或最终一致方案，不能只靠 Kafka 事务。

### 不丢消息和不重复消费是一回事吗？

不是。高可靠系统通常选择“宁可重复，不要丢”。比如业务处理成功但提交 offset 前宕机，重启后会重复消费。重复消费要靠幂等解决，而不是通过提前提交 offset 来规避。

## 实战建议

订单、支付、库存等核心消息建议：

- Topic 三副本；
- 生产者 `acks=all`、开启幂等和重试；
- Broker 设置 `min.insync.replicas=2`，禁用 unclean leader election；
- 消费者关闭自动提交，处理成功后提交 offset；
- 失败消息进入重试/死信；
- 下游按业务唯一键、消息 ID 或状态机版本号做幂等。

## 总结

Kafka 会不会丢消息，取决于整条链路。面试时按三段回答：生产端防止发送丢，Broker 端靠多副本和 ISR 防止存储丢，消费端避免 offset 提交过早造成业务丢。最后补一句：可靠性越强，越需要幂等来处理重复消费。

## 面试总结
### 核心概念

Kafka 可能在生产者、Broker、消费者三个阶段丢消息。可靠性不是单个参数决定的，而是生产确认、副本同步、刷盘策略、offset 提交和业务处理共同决定。

### 面试官想考什么

- 是否能分阶段定位丢消息风险。
- 是否知道 `acks`、`retries`、`min.insync.replicas`、副本数、手动提交 offset 的作用。
- 是否能说明“不丢”和“低延迟高吞吐”的权衡。

### 标准回答

生产端使用 `acks=all`、开启重试、设置合适的 `delivery.timeout.ms` 和幂等生产者，确保消息被 ISR 多副本确认。Broker 端设置副本因子至少 3、`min.insync.replicas>=2`，避免 `unclean.leader.election`，监控 ISR 收缩和磁盘。消费端关闭自动提交或谨慎使用自动提交，业务处理成功后再提交 offset；失败允许重试或进入死信/补偿队列。

### 深挖追问

- **acks=all 是否绝对不丢？** 不是。如果 ISR 只剩 1 个、磁盘损坏或运维误删，仍可能丢，需要副本和监控配合。
- **消费者先提交 offset 后处理会怎样？** 处理失败后无法重新消费，形成业务丢失。
- **如何验证有没有丢？** 通过生产流水、消费结果表、消息 ID 对账和端到端监控。

### 示例/实战场景

订单创建后发送消息到 Kafka，生产端记录本地消息表，发送成功后标记；消费者处理后写业务结果表并提交 offset。定时任务扫描发送失败或长时间未确认的消息，进行重投或人工告警。

### 易错点/总结

- 可靠配置会牺牲部分吞吐和延迟，需要按业务等级区分。
- 消费失败重试可能带来重复消费，所以必须同时设计幂等。
- MQ 自身可靠不等于业务最终一致，仍要补偿和对账。
