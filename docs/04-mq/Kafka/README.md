# Kafka

Apache Kafka 是 LinkedIn 开源的分布式事件流平台（event stream platform），定位为高吞吐、低延迟、可持久化的分布式提交日志系统。在消息队列中它把"消息"称为"事件"。Kafka 既能做消息系统异步传递消息，也能作为存储系统持久化数据流，还能在数据发生时实时处理分析。

## 目录

- [Kafka 是什么](Kafka是什么？.md) — 核心概念、架构、高性能原因与生产消费示例
- [Kafka 会丢消息吗](Kafka会丢消息吗？.md) — 生产者、Broker、消费者三阶段丢消息风险与可靠配置
- [Kafka 的 Exactly-Once 语义怎么保证](Kafka的Exactly-Once语义怎么保证？.md) — 幂等生产者 + 事务 + read_committed 协同
- [Kafka 百万消息积压如何处理](Kafka百万消息积压如何处理？.md) — 定位瓶颈、止血、扩容、保护下游、复盘

## 核心要点

- **并行单位**：Topic → Partition，分区内有序，分区是并发、顺序和扩展性的基本单位。
- **副本机制**：每个分区多副本，Leader 负责读写，Follower 从 Leader 同步，ISR 是与 Leader 保持同步的副本集合。
- **消费者组**：一个分区同一时刻只被组内一个消费者消费，组与组之间独立消费实现发布订阅。
- **可靠性配置**：`acks=all` + `min.insync.replicas>=2` + 三副本 + 关闭 unclean leader election。
- **新版本**：Kafka 2.8+ 引入 KRaft 模式，逐步移除 ZooKeeper 依赖，3.3+ 标记生产可用。
