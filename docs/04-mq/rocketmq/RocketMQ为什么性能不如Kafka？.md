# RocketMQ 为什么性能不如 Kafka

## 核心概念

RocketMQ 的架构参考了 Kafka，同时在此基础上做了调整。看起来 RocketMQ 各方面都比 Kafka 更能打，但 Kafka 一直没被淘汰，说明 RocketMQ 必然有不如 Kafka 的地方——主要在于性能，严格说是吞吐量。阿里中间件团队压测显示，同样条件下 Kafka 比 RocketMQ 快 50% 左右。但 RocketMQ 仍能每秒处理 10w 量级数据，非常能打。不能说 RocketMQ 弱，只能说 Kafka 性能太强。

性能差异的根本原因在**零拷贝技术选择**：Kafka 用 `sendfile`，RocketMQ 用 `mmap`。其他优化手段（批量、压缩、PageCache）RocketMQ 都能借鉴，唯独零拷贝选择受业务需求限制，无法改变。

## 标准回答

不能绝对说 RocketMQ 性能差。Kafka 在大吞吐日志场景通常优势明显；RocketMQ 在业务消息能力上更丰富。性能差异的根本原因：

1. **零拷贝选择不同**：Kafka 用 `sendfile`（2 次拷贝，零 CPU 拷贝），RocketMQ 用 `mmap`（3 次拷贝，1 次 CPU 拷贝）。
2. **存储模型复杂度**：Kafka 每 Partition 独立日志，读写一次到位；RocketMQ 全 Topic 统一 CommitLog + ConsumeQueue 索引，消费时读两次。
3. **业务特性开销**：RocketMQ 支持过滤、重试、死信、事务、延迟等业务能力，写入和消费路径更复杂。

压测结果受消息大小、刷盘策略、副本、过滤、事务/延迟消息、网络和磁盘影响，不是绝对值。

## 零拷贝原理

### 为什么需要零拷贝

操作系统分用户空间和内核空间。程序在用户空间，磁盘属于硬件，程序通过操作系统调用硬件能力。如果用户要把数据从磁盘发送到网络，传统方式：

1. 程序调用 `read()`：
   - 磁盘数据从设备拷贝到内核空间缓冲区。
   - 内核缓冲区拷贝到用户空间。
2. 程序调用 `write()`：
   - 用户空间拷贝到 socket 发送缓冲区。
   - socket 缓冲区拷贝到网卡。

整个过程：2 次系统调用，4 次用户/内核空间切换，4 次数据拷贝。零拷贝就是减少这些拷贝和切换。

### mmap（内存映射）

`mmap` 把内核空间缓冲区映射到用户空间，用 `mmap()` 替代 `read()`。磁盘数据从设备拷贝到内核缓冲区后，不需要再拷贝到用户空间，省了一次拷贝。

- 拷贝次数：3 次（磁盘→内核、内核→socket、socket→网卡）。
- 系统调用：2 次（`mmap` + `write`）。
- 上下文切换：4 次。
- **特点**：用户空间能拿到数据内容，应用层可以做逻辑处理（如消息过滤、修改、二次投递）。

### sendfile（零 CPU 拷贝）

`sendfile` 是内核提供的方法，专门用于发送文件数据。程序调用 `sendfile()`，内核读取磁盘数据并发送：

- 磁盘数据从设备拷贝到内核缓冲区。
- 内核缓冲区直接拷贝到网卡（DMA 完成，CPU 不参与）。

- 拷贝次数：2 次（都是 DMA 拷贝，零 CPU 拷贝）。
- 系统调用：1 次。
- 上下文切换：2 次。
- **特点**：应用层只知道"发送了几个字节"，不知道发了什么内容，无法对数据做处理。

### 对比

| 维度 | 传统 read/write | mmap | sendfile |
|------|-----------------|------|----------|
| 系统调用次数 | 2 | 2 | 1 |
| 上下文切换 | 4 | 4 | 2 |
| 数据拷贝 | 4（含 2 次 CPU） | 3（含 1 次 CPU） | 2（全 DMA） |
| 应用层访问数据 | 能 | 能 | 不能 |

Kafka 用 `sendfile`，拷贝次数和切换次数最少，性能最高。RocketMQ 用 `mmap`，多了 1 次拷贝和 2 次切换。

## 为什么 RocketMQ 不用 sendfile

`mmap` 返回数据具体内容，应用层能获取消息内容做逻辑处理。`sendfile` 只返回发送字节数，应用层不知道发了什么。

RocketMQ 的业务功能需要了解消息内容：

- **消费失败重投递到死信队列**：需要拿到消息内容重新投递。
- **Tag 过滤**：需要解析 Tag hashcode 决定是否投递给消费者。
- **消费重试**：需要拿到消息内容重新入队。
- **延迟消息**：到期后需要重新投递原消息。

如果 RocketMQ 用 `sendfile`，根本没机会获取消息内容，这些业务功能无法实现。所以 RocketMQ 选择 `mmap`，用性能换功能。

## 其他性能差异

### 存储模型

Kafka 每 Partition 独立日志文件，消费时直接读 Partition 文件，一次读取到位。多 Topic 场景下，同时写多个 Partition 文件会让磁盘从顺序写退化为随机写，但单 Partition 内仍是顺序写。

RocketMQ 全 Topic 统一写 CommitLog（避免多文件随机写），但消费时要先读 ConsumeQueue 拿到 offset，再读 CommitLog 拿到消息体（读放大）。ConsumeQueue 是定长结构，命中 PageCache 时性能尚可，但仍比 Kafka 多一次读取。

### 刷盘策略

- **同步刷盘**：消息写入磁盘后才返回成功，可靠性高但延迟大。金融场景必选。
- **异步刷盘**：消息写入 PageCache 即返回，吞吐高但极端故障（断电）可能丢少量消息。

Kafka 默认异步刷盘（依赖 PageCache + 多副本保证可靠性），RocketMQ 可选同步或异步。两者都主要靠多副本保证可靠性而非单机刷盘。

### 业务特性开销

RocketMQ 支持事务消息、延迟消息、顺序消息、Tag 过滤、消费重试、死信队列等业务能力，每项都引入额外存储和计算开销：

- 事务消息要写半消息 Topic、回查 Topic。
- 延迟消息要写延迟 Topic，到期后重新投递。
- 消费重试要写重试 Topic，按级别递增延迟。
- 死信要写死信 Topic。

Kafka 业务语义少，链路纯粹，吞吐自然更高。

## 如何调优 RocketMQ 吞吐

虽然极限吞吐不如 Kafka，但 RocketMQ 仍有优化空间：

- **批量发送**：生产者攒批发送，减少网络交互。
- **异步发送**：`sendOneway` 或 `send(msg, callback)` 不阻塞等待。
- **合理刷盘**：非核心业务用异步刷盘。
- **增加队列数和 Broker**：提升并行度。
- **优化消息大小**：避免超大消息，必要时用 OSS 存储消息体。
- **减少同步调用**：消费端异步化、批量处理下游。

## 代码示例

### 同步刷盘 vs 异步刷盘配置

Broker 端 `broker.conf`：

```properties
# 异步刷盘（高吞吐，断电可能丢少量消息）
flushDiskType=ASYNC_FLUSH

# 同步刷盘（高可靠，延迟大）
flushDiskType=SYNC_FLUSH
```

### 生产者批量异步发送

```java
DefaultMQProducer producer = new DefaultMQProducer("batch-group");
producer.setNamesrvAddr("localhost:9876");
producer.start();

// 批量发送：同一 Topic 同一 Queue 的消息打成一批
List<Message> batch = new ArrayList<>();
for (int i = 0; i < 100; i++) {
    batch.add(new Message("batch-topic", "tag",
            ("msg-" + i).getBytes(StandardCharsets.UTF_8)));
}
// 一次发送 100 条
SendResult result = producer.send(batch);

// 异步发送：不阻塞等待
producer.send(msg, new SendCallback() {
    @Override
    public void onSuccess(SendResult result) { /* 成功 */ }
    @Override
    public void onException(Throwable e) { /* 失败重试 */ }
});
```

## 实战场景

| 场景 | 中间件选择 | 理由 |
|------|------------|------|
| 海量埋点日志写入数据湖 | Kafka | 极限吞吐优势明显 |
| 交易事务消息 | RocketMQ | 业务能力价值高于极限吞吐 |
| 订单延迟取消 | RocketMQ | 原生延迟消息，Kafka 需自建 |
| Flink 实时计算 | Kafka | 流处理生态成熟 |
| 多业务系统按 Tag 订阅 | RocketMQ | Tag 过滤省消费端资源 |
| 用户行为流分析 | Kafka | 大吞吐、顺序写优势 |

## 深挖追问

### 同步刷盘和异步刷盘区别？

同步刷盘可靠性更高但延迟更大，消息写入磁盘后才返回成功，金融场景必选。异步刷盘吞吐高但极端故障（断电）可能丢少量消息，消息写入 PageCache 即返回。两者都主要靠多副本保证可靠性，单机刷盘只是兜底。RocketMQ 默认异步刷盘。

### 性能差异是否绝对？

不是。具体取决于版本、硬件、配置、消息大小、生产消费模型和业务逻辑。小消息 + 高并发场景 Kafka 优势明显；事务/延迟消息场景 RocketMQ 功能价值更高。压测要在真实业务负载下进行，不能简单引用他人数据。

### Kafka 和 RocketMQ 怎么选？

大数据场景（Spark/Flink 关键词频繁出现）用 Kafka。业务消息场景（订单、交易、延迟、事务）如果公司组件支持，优先用 RocketMQ。如果团队对 Kafka 运维更熟，且业务能用 Outbox + 延迟队列等自建方案补足，Kafka 也可行。

### RocketMQ 性能瓶颈常在哪？

通常在消费端和下游，而不一定在 Broker。常见瓶颈：消费端单条处理慢、下游 DB 慢、消费端同步调用外部接口、消费端没做批量。调优前先用监控定位生产、Broker、消费、下游哪个环节慢，避免盲目调 Broker 参数。

### mmap 和 sendfile 能混用吗？

理论上 Broker 可以对不同场景用不同零拷贝。但 RocketMQ 消费端需要拿到消息内容做过滤/重试/死信等业务逻辑，统一用 mmap 更简单。Kafka 消费端不需要处理消息内容（直接转发），用 sendfile 性能最优。这是设计取舍，不是技术限制。

## 易错点

- **只用"性能"评价中间件**：业务语义、稳定性、团队经验同样重要，甚至更重要。
- **认为 RocketMQ 性能瓶颈一定在 Broker**：实际常在消费端和下游，先定位再调优。
- **混淆同步刷盘和同步复制**：刷盘是单机磁盘操作，复制是多 Broker 间同步，是两个独立的可靠性维度。
- **认为零拷贝是"零拷贝"**：mmap 仍有 3 次拷贝（1 次 CPU），sendfile 仍有 2 次 DMA 拷贝。"零"指零 CPU 拷贝或零用户态拷贝，不是字面零拷贝。
- **忽略业务特性开销**：事务消息、延迟消息都有额外存储和计算开销，压测时要按真实业务负载。

## 总结

RocketMQ 性能不如 Kafka 的根本原因是零拷贝选择：Kafka 用 `sendfile`（2 次 DMA 拷贝，零 CPU 拷贝），RocketMQ 用 `mmap`（3 次拷贝，1 次 CPU 拷贝）。RocketMQ 选择 `mmap` 是因为业务功能（死信、过滤、重试、延迟）需要拿到消息内容，`sendfile` 做不到。其他差异包括存储模型复杂度（CommitLog + ConsumeQueue 读放大）和业务特性开销。调优前先用监控定位瓶颈环节。选型上，大数据场景用 Kafka，业务消息场景用 RocketMQ。

## 参考资料

- [Linux sendfile(2) manual](https://man7.org/linux/man-pages/man2/sendfile.2.html)
- [Linux mmap(2) manual](https://man7.org/linux/man-pages/man2/mmap.2.html)
- [RocketMQ Performance Test](https://rocketmq.apache.org/zh/docs/)
- [Kafka Performance](https://kafka.apache.org/documentation/#design)
