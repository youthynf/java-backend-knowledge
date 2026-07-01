# Kafka 会丢消息吗

## 核心概念

Kafka 本身是高可靠消息系统，但**不代表默认配置下绝对不会丢消息**。消息从生产者到 Broker，再到消费者处理完成，链路上任何阶段配置不当或处理方式不对，都可能出现丢失。一句话结论：Kafka 可以做到很高可靠，配合幂等生产者、事务和合理副本配置，可以实现 Kafka 内部"Exactly-Once"语义；但默认或错误使用时，生产端、Broker 端、消费端都可能丢消息。

## 标准回答

Kafka 可能在三个阶段丢消息，每个阶段都有对应的可靠配置：

1. **生产者阶段**：`acks=0` 或 `acks=1` 配合 Leader 宕机可能丢；未开启重试网络抖动会丢；进程崩溃缓冲区消息丢。可靠配置是 `acks=all` + `retries` 充足 + `enable.idempotence=true`。
2. **Broker 阶段**：单副本 Broker 宕机丢；`min.insync.replicas=1` 即使 `acks=all` 也可能只 Leader 确认；unclean leader election 让落后副本当 Leader 丢已确认消息。可靠配置是三副本 + `min.insync.replicas=2` + `unclean.leader.election.enable=false`。
3. **消费者阶段**：自动提交 offset 但业务没处理完就崩溃，消息对业务"丢了"。可靠方式是关闭自动提交，业务处理成功后再手动提交。

可靠性越强越需要幂等来处理重复消费，因为高可靠系统通常选择"宁可重复，不要丢"。

## 三阶段丢消息风险与配置

### 生产者阶段

可能丢消息的典型场景：

1. `acks=0`：生产者发出去就认为成功，Broker 没收到也不知道。
2. `acks=1`：Leader 写入成功就返回，如果 Leader 宕机且 Follower 未同步，消息可能丢。
3. 未开启重试，网络抖动时发送失败。
4. 应用进程崩溃，缓冲区里的消息还没来得及发出。
5. 重试配置不当，虽然不丢但可能重复或乱序。

生产端可靠配置：

```properties
acks=all
retries=2147483647
enable.idempotence=true
delivery.timeout.ms=120000
max.in.flight.requests.per.connection=5
```

`acks=all` 表示 Leader 要等 ISR 中所有副本确认；`enable.idempotence=true` 避免生产者重试导致同一分区内重复写入；`max.in.flight.requests.per.connection=5` 是幂等开启时的上限，超过 5 会破坏幂等保证。

### Broker 阶段

可能丢消息的典型场景：

1. Topic 只有 1 个副本，Broker 宕机或磁盘损坏就无法恢复。
2. `min.insync.replicas=1`，即使 `acks=all`，也可能只有 Leader 一份写入成功（ISR 只剩 Leader 时）。
3. 允许 unclean leader election，落后副本被选成 Leader，已确认消息丢失。
4. 消息保留时间太短，消费者长时间不消费，消息被过期删除。

生产环境常见配置：

```properties
default.replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false
```

Topic 级别也可以单独设置：

```bash
kafka-topics.sh --alter --topic order-event \
  --config min.insync.replicas=2 \
  --bootstrap-server broker:9092
```

三副本 + 至少两个 ISR 确认，能在单 Broker 故障时尽量避免已确认消息丢失。`unclean.leader.election.enable=false` 是关键：当 ISR 为空时宁可分区不可用，也不让落后副本当 Leader 丢消息。

### 消费者阶段

这是业务系统里最常见的问题。Kafka 中消息还在，但消费者已经提交 offset，后续不会再消费这条消息，于是对业务来说就"丢了"。

错误示例：

```properties
enable.auto.commit=true
```

如果消费者 poll 到消息后自动提交 offset，但业务处理到一半宕机，这条消息就不会再次处理。

更可靠的方式：

1. 关闭自动提交。
2. 业务处理成功后再手动提交 offset。
3. 失败消息进入重试 Topic 或死信队列。
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

手动提交能降低丢消息风险，但可能造成重复消费，所以幂等是必须的。

## 代码示例

完整的可靠消费示例，手动提交 + 幂等 + 失败重试。

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class ReliableOrderConsumer {

    private final OrderService orderService;
    private final KafkaConsumer<String, String> consumer;

    @PostConstruct
    public void start() {
        new Thread(this::consume).start();
    }

    private void consume() {
        while (true) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(1000));
            for (ConsumerRecord<String, String> record : records) {
                try {
                    // 业务处理，必须幂等（数据库唯一索引 / Redis SETNX / 状态机）
                    orderService.process(record.value());
                } catch (BusinessRetryableException e) {
                    // 可重试异常：不提交 offset，下次重新消费
                    log.warn("retryable error, offset={}, will retry", record.offset(), e);
                    throw e; // 触发 rebalance，offset 未提交
                } catch (BusinessUnrecoverableException e) {
                    // 不可恢复异常：写入死信队列后提交 offset，避免阻塞分区
                    sendToDlq(record, e);
                }
            }
            consumer.commitSync();
        }
    }
}
```

## 实战场景

| 场景 | 风险点 | 配置方案 |
|------|--------|----------|
| 订单创建消息 | 生产端宕机丢缓冲 | `acks=all` + 幂等 + 本地消息表 |
| 支付回调消息 | Broker 宕机丢单副本 | 三副本 + `min.insync.replicas=2` |
| 库存扣减消息 | 消费端自动提交丢业务 | 手动提交 + 业务成功后再 ack |
| 风控事件流 | unclean leader 选举丢已确认 | `unclean.leader.election.enable=false` |
| 大促埋点日志 | 允许少量丢失换吞吐 | `acks=1` 或 `acks=0`，可接受 |

## 深挖追问

### `acks=all` 就一定不丢吗？

不一定。还要看 `min.insync.replicas`。如果它是 1，ISR 只剩 Leader 时 `acks=all` 也只确认 Leader 一份。生产环境通常使用 3 副本 + `min.insync.replicas=2`，保证至少 2 个副本确认。此外磁盘损坏、运维误删、整个机房故障仍可能丢，需要异地副本和备份兜底。

### Kafka 的 Exactly-Once 能解决所有问题吗？

Kafka 的 Exactly-Once 主要解决 Kafka 内部"消费一个 Topic、处理后写入另一个 Topic"的一致性问题，可以把输出消息和 offset 放在同一个事务里提交。但如果处理结果写到 MySQL、Redis、第三方接口，仍然要靠业务幂等、本地事务消息、Outbox 或最终一致方案，不能只靠 Kafka 事务。

### 不丢消息和不重复消费是一回事吗？

不是。高可靠系统通常选择"宁可重复，不要丢"。比如业务处理成功但提交 offset 前宕机，重启后会重复消费。重复消费要靠幂等解决，而不是通过提前提交 offset 来规避。两者是正交问题：不丢靠多副本 + 手动提交 + 处理后提交，不重复靠幂等。

### 如何验证有没有丢消息？

通过生产流水、消费结果表、消息 ID 对账和端到端监控。生产端记录本地消息表（消息 ID + 状态），消费端处理完成后更新业务结果表，定时任务扫描发送成功但长时间未确认的消息，进行重投或告警。

### 同步刷盘和异步刷盘有区别吗？

Kafka 默认依赖操作系统异步刷盘（PageCache → 磁盘），不提供同步刷盘选项。这是为了高吞吐设计的，代价是机器断电瞬间 PageCache 中未刷盘的消息可能丢。Kafka 通过多副本保证可靠性：单机断电丢的消息在副本上仍有。如果只追求单机不丢，可以用 `flush.messages` 和 `flush.ms` 强制刷盘，但会大幅降低吞吐，不推荐。

## 易错点

- **`acks=all` 但 `min.insync.replicas=1`**：ISR 收缩到只剩 Leader 时仍可能丢，必须同时设 `min.insync.replicas>=2`。
- **开启 `enable.idempotence` 但 `max.in.flight.requests.per.connection>5`**：会破坏幂等保证，导致重试后乱序或重复。
- **自动提交 offset 应对核心业务**：自动提交间隔（默认 5 秒）内崩溃会丢未处理完的业务，核心业务必须手动提交。
- **先提交 offset 后处理业务**：处理失败后无法重新消费，形成业务丢失；正确顺序是处理成功后再提交。
- **忽略 `delivery.timeout.ms`**：默认 2 分钟，重试到该时间仍失败会抛异常，调用方必须捕获并处理（写本地消息表或告警）。

## 总结

Kafka 会不会丢消息，取决于整条链路。生产端防止发送丢（`acks=all` + 幂等 + 重试），Broker 端靠多副本和 ISR 防止存储丢（三副本 + `min.insync.replicas=2` + 关闭 unclean leader election），消费端避免 offset 提交过早造成业务丢（手动提交 + 处理后提交）。可靠性越强，越需要幂等来处理重复消费。MQ 自身可靠不等于业务最终一致，仍要补偿和对账。

## 参考资料

- [Kafka Producer Reliability](https://kafka.apache.org/documentation/#producerconfigs)
- [Kafka Broker Configurations](https://kafka.apache.org/documentation/#brokerconfigs)
- [Kafka Consumer Configurations](https://kafka.apache.org/documentation/#consumerconfigs)
- [Kafka Replication](https://kafka.apache.org/documentation/#replication)
