# RocketMQ 与 Kafka 有什么区别

## 核心概念

RocketMQ 是阿里自研的国产消息队列，目前是 Apache 顶级项目。它接受生产者消息，按 Topic 分类，消费者按需订阅 Topic 获取消息。RocketMQ 的架构参考了 Kafka 的设计思想，同时又在 Kafka 基础上做了调整。一句话总结：**"和 Kafka 相比，RocketMQ 在架构上做了减法，在功能上做了加法。"** 架构减法让它更轻、更易运维；功能加法让它更贴近业务消息场景。

## 标准回答

RocketMQ 和 Kafka 都能做分布式消息，但设计侧重点不同。Kafka 更偏日志流和高吞吐流处理，RocketMQ 更贴近业务消息，常见能力包括延迟消息、事务消息和 Tag 过滤。选型应综合吞吐、可靠性、顺序性、延迟消息、生态、团队运维经验：

- **日志采集、埋点、流计算、大吞吐顺序写场景** → Kafka。
- **订单、交易、延迟任务、事务消息等业务消息场景** → RocketMQ。

两者都需要消费幂等、监控告警和补偿机制。

## 架构减法

### 简化协调节点：NameServer 替代 ZooKeeper

Kafka 历史上用 ZooKeeper 维护集群信息（Broker、Topic、分区、Controller 选举）。ZooKeeper 是通用分布式协调服务，功能强大但对 Kafka 来说"杀鸡用牛刀"，运维成本高。RocketMQ 直接去掉 ZooKeeper，换成 **NameServer**——一个更轻量的路由注册中心。

NameServer 特点：

- **无状态**：每个 NameServer 节点独立，互不通信，不依赖一致性协议。
- **Broker 注册**：Broker 启动后向所有 NameServer 注册，每隔 30 秒心跳；NameServer 90 秒未收到心跳则剔除 Broker。
- **客户端发现**：生产者/消费者从任一 NameServer 拉取路由信息（Topic → Broker → Queue），本地缓存 30 秒刷新。

Kafka 后来也意识到 ZooKeeper 过重，从 2.8.0 引入 KRaft 模式（Raft 共识）逐步移除 ZooKeeper，3.3+ 标记生产可用。这一点上 RocketMQ 走得更早。

### 简化分区：Queue 只存偏移，消息统一写 CommitLog

Kafka 把 Topic 拆成多个 Partition，每个 Partition 是独立的日志文件（由多个 segment 组成），消息直接写到对应 Partition 的 segment 文件。这样单 Partition 顺序写性能很好，但 **Topic 变多后，同时写多个 Partition 文件会让磁盘从顺序写退化为随机写**。

RocketMQ 的解决方案：

- **Queue（队列）**：相当于 Kafka 的 Partition，是并发和顺序的基本单位。但 Queue 上只存简要信息（消息偏移 offset、size、tag hashcode），不存消息体。
- **CommitLog**：单个 Broker 上所有 Topic 的消息体统一写入"一个"逻辑文件 CommitLog（物理上由多个 1GB 文件组成）。所有写操作都变成对 CommitLog 的顺序追加，消除多 Topic 随机写问题。
- **ConsumeQueue**：每个 Queue 对应一个 ConsumeQueue 文件，存 CommitLog 中的偏移、消息大小、Tag hashcode，作为消费索引。

代价是消费时需要两次读：先读 ConsumeQueue 拿到 offset，再读 CommitLog 拿到消息体。Kafka 只需读一次 Partition 文件。这是 RocketMQ 在多 Topic 场景用读放大换写性能的设计取舍。

### 简化备份模型：以 Broker 为单位主从同步

Kafka 给每个 Partition 单独建副本，主从 Partition 间同步 segment 文件。RocketMQ 所有 Topic 数据都写到 CommitLog，如果像 Kafka 那样按分区同步就得把 CommitLog 拆开，退化为随机读。于是 RocketMQ **以 Broker 为单位区分主从**，主从间直接同步 CommitLog 文件，保持高可用的同时大大简化备份模型。

## 功能加法

### 消息过滤（Tag）

Kafka 只能通过 Topic 一级分类。RocketMQ 支持 Tag 二级分类：消息打上 Tag（如 `vip6`），消费者按 Tag 过滤订阅。Broker 端先按 Tag hashcode 过滤 ConsumeQueue，消费端再做精确 Tag 过滤，省下消费者过滤资源。

### 事务消息

Kafka 事务解决的是"多条消息要么同时发送成功要么同时失败"。RocketMQ 事务消息解决的是**"执行本地事务"和"发送消息"两件事的原子性**——要么本地事务成功且消息发送成功，要么本地事务失败且消息不发送。流程是：先发送半消息（对消费者不可见）→ 执行本地事务 → 根据本地事务结果 commit 或 rollback 半消息 → 若半消息状态未知，Broker 主动回查生产者。

### 延迟消息

消息发送后不能立即消费，要等一定时间后才能被消费。RocketMQ 4.x 内置 18 个延迟级别（1s/5s/10s/30s/1m/2m/3m/4m/5m/6m/7m/8m/9m/10m/20m/30m/1h/2h），5.x 支持任意延迟。Kafka 要实现延迟消息比较费劲，需自建延迟队列或用时间轮。

### 死信队列

消费失败重试多次（默认 16 次）后，消息进入死信队列（DLQ），方便后续单独处理。Kafka 原生不支持，需自己实现。

### 消息回溯

Kafka 支持调整 offset 从某位置消费。RocketMQ 除了调整 offset，还支持按时间回溯（Kafka 0.10.1+ 也支持按时间）。

### 消费重试

RocketMQ 消费失败自动重试，重试间隔递增（10s/30s/1m/2m...），达到最大次数后进入死信队列。Kafka 没有原生重试机制，需自己实现重试 Topic。

## 选型对比

| 维度 | Kafka | RocketMQ |
|------|-------|----------|
| 定位 | 日志流平台 | 业务消息中间件 |
| 协调节点 | ZooKeeper（旧）/ KRaft（新） | NameServer（无状态） |
| 存储模型 | 每 Partition 独立日志 | 全 Topic 统一 CommitLog + ConsumeQueue 索引 |
| 副本模型 | Partition 级副本 | Broker 级主从 |
| 事务消息 | 多消息原子性 | 本地事务 + 消息原子性 |
| 延迟消息 | 不原生支持 | 18 级（4.x）/ 任意延迟（5.x） |
| 顺序消息 | 单分区内有序 | 单 Queue 内有序 |
| 消息过滤 | Topic 级 | Topic + Tag 二级 |
| 死信队列 | 不原生支持 | 原生支持 |
| 消费重试 | 不原生支持 | 原生支持（递增退避） |
| 吞吐量 | 极高（顺序写 + sendfile 零拷贝） | 高（10w 级 TPS，约为 Kafka 的 60%-70%） |
| 适用场景 | 日志、埋点、流计算、数据管道 | 订单、交易、延迟任务、事务消息 |

## 代码示例

### RocketMQ 事务消息

订单创建后发送事务消息，本地事务（扣库存）成功则消息提交，失败则回滚。

```java
public class OrderTransactionProducer {

    public static void main(String[] args) throws Exception {
        TransactionMQProducer producer = new TransactionMQProducer("order-tx-group");
        producer.setNamesrvAddr("localhost:9876");
        // 事务回查监听器：Broker 主动询问本地事务状态
        producer.setTransactionListener(new TransactionListener() {
            @Override
            public LocalTransactionState executeLocalTransaction(Message msg, Object arg) {
                try {
                    // 执行本地事务：扣库存、写订单
                    orderService.createOrder((OrderInfo) arg);
                    return LocalTransactionState.COMMIT_MESSAGE;
                } catch (Exception e) {
                    return LocalTransactionState.ROLLBACK_MESSAGE;
                }
            }

            @Override
            public LocalTransactionState checkLocalTransaction(MessageExt msg) {
                // Broker 回查：根据消息体查订单是否已创建
                String orderId = msg.getKeys();
                return orderService.exists(orderId)
                        ? LocalTransactionState.COMMIT_MESSAGE
                        : LocalTransactionState.ROLLBACK_MESSAGE;
            }
        });
        producer.start();

        Message msg = new Message("order-topic", "create",
                orderInfo.getOrderId(), JSON.toJSONBytes(orderInfo));
        // 发送半消息，触发本地事务
        producer.sendMessageInTransaction(msg, orderInfo);
    }
}
```

### 延迟消息

订单创建后 30 分钟未支付自动取消。

```java
DefaultMQProducer producer = new DefaultMQProducer("delay-producer-group");
producer.setNamesrvAddr("localhost:9876");
producer.start();

Message msg = new Message("order-timeout-topic",
        "cancel", orderId, "cancel order".getBytes(StandardCharsets.UTF_8));
// 4.x：设置延迟级别（18 对应 30m）
msg.setDelayTimeLevel(16); // 30m
// 5.x：设置任意延迟时间
// msg.setDeliverTimeMs(System.currentTimeMillis() + 30 * 60 * 1000);
producer.send(msg);
```

## 实战场景

| 场景 | 推荐方案 | 理由 |
|------|----------|------|
| 用户行为日志进实时计算 | Kafka | 大吞吐、流处理生态成熟 |
| 订单超时未支付自动取消 | RocketMQ 延迟消息 | 原生支持，无需自建 |
| 支付本地事务后发通知 | RocketMQ 事务消息 | 本地事务与消息原子性 |
| 多团队按 Tag 订阅业务事件 | RocketMQ Tag 过滤 | 二级分类，省消费端资源 |
| 海量埋点写入数据湖 | Kafka | 吞吐优势明显 |
| 交易状态机顺序消费 | RocketMQ 顺序消息 | 单 Queue 内有序 |

## 深挖追问

### RocketMQ 事务消息流程？

先发送半消息（对消费者不可见，存入 `RMQ_SYS_TRANS_HALF_TOPIC`）→ 执行本地事务 → 根据本地事务结果 commit（消息转回原 Topic，可见）或 rollback（删除半消息）→ 若半消息状态未知（如生产者宕机），Broker 定时回查生产者，调用 `checkLocalTransaction` 获取本地事务状态。回查有次数限制（默认 15 次），超时后按 rollback 处理。

### 两者顺序消息怎么保证？

同一业务 key 路由到同一 Partition/Queue，消费端串行处理。Kafka 是单分区内有序，RocketMQ 是单 Queue 内有序。RocketMQ 顺序消费用 `MessageListenerOrderly`，Broker 会用锁保证单 Queue 同一时刻只被一个消费线程处理；Kafka 需要消费端自己保证单分区单线程。

### 为什么 Kafka 吞吐通常更高？

日志模型更纯粹，顺序写、PageCache、批量、压缩、sendfile 零拷贝优化成熟，业务语义相对少。RocketMQ 用 mmap 零拷贝（消费端需要读消息内容做过滤、重试、死信等业务逻辑，不能用 sendfile），且消费端要读 ConsumeQueue 再读 CommitLog（读放大）。压测显示 Kafka 比 RocketMQ 快 50% 左右，但 RocketMQ 仍能每秒处理 10w 量级数据。

### RocketMQ 事务消息是强一致分布式事务吗？

不是。它是最终一致方案：保证"本地事务"和"消息发送"的原子性，但下游消费是否成功由消费幂等和重试保证。如果下游消费一直失败，仍需对账补偿。事务消息解决的是消息发送端的一致性，不负责下游消费一定成功。

### NameServer 和 ZooKeeper 的区别？

NameServer 无状态、节点间不通信、最终一致（客户端拉取路由），轻量但可用性高（任一节点可用即可服务）。ZooKeeper 强一致（ZAB 协议）、节点间同步、功能丰富但重。RocketMQ 选择 NameServer 是因为消息队列对路由一致性要求不高，30 秒刷新已足够。

## 易错点

- **简单说 RocketMQ "一定比 Kafka 好/差"**：要结合场景。日志流场景 Kafka 更强，业务消息场景 RocketMQ 更合适。
- **把 RocketMQ 事务消息当强一致分布式事务**：它是最终一致方案，下游消费仍要幂等和补偿。
- **忽略 RocketMQ 性能开销**：CommitLog 统一写 + ConsumeQueue 索引 + mmap 零拷贝带来业务能力，但吞吐低于 Kafka。
- **延迟消息级别记错**：4.x 是 18 个固定级别，不能任意延迟；5.x 才支持任意延迟。
- **Tag 过滤不是精确过滤**：Broker 端按 Tag hashcode 过滤可能有 hash 冲突，消费端还需做精确 Tag 比对。

## 总结

RocketMQ 和 Kafka 相比，架构上做了减法（NameServer 替代 ZooKeeper、Queue 只存 offset、Broker 级主从），功能上做了加法（Tag 过滤、事务消息、延迟消息、死信队列、消费重试、消息回溯）。凡事皆有代价，RocketMQ 牺牲了一部分性能，换取了比 Kafka 更强大的业务消息特性。选型上，大数据场景（Spark/Flink 关键词频繁出现）用 Kafka；业务消息场景（订单、交易、延迟、事务）用 RocketMQ。

## 参考资料

- [RocketMQ Architecture](https://rocketmq.apache.org/zh/docs/introduction/02architecture)
- [RocketMQ 事务消息](https://rocketmq.apache.org/zh/docs/featureBehavior/03transactionmessage)
- [RocketMQ 延迟消息](https://rocketmq.apache.org/zh/docs/featureBehavior/04delaymessage)
- [Kafka Documentation](https://kafka.apache.org/documentation/)
