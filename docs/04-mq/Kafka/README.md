# Kafka

Kafka 是高吞吐分布式日志系统，面试重点是分区副本模型、消费者组、可靠性、Exactly-Once 和积压治理。

## 导航

| 文章 | 摘要 |
| --- | --- |
| [Kafka 入门概要](Kafka入门概要.md) | Topic、Partition、Broker、Producer、Consumer、ISR、Controller 等基础 |
| [Kafka 会丢消息吗？](Kafka会丢消息吗？.md) | 从生产者、Broker、消费者三段分析丢消息原因和配置 |
| [Kafka 的 Exactly-Once 语义怎么保证？](Kafka的Exactly-Once语义怎么保证？.md) | 幂等生产者、事务、offset 原子提交与外部系统边界 |
| [Kafka 百万消息积压如何处理？](Kafka百万消息挤压如何处理？.md) | 定位、止血、扩容、限流、跳过/回放、复盘治理 |

## 复习摘要

- **为什么快**：顺序写磁盘、PageCache、零拷贝、批量压缩、分区并行。
- **为什么可靠**：副本、ISR、acks、min.insync.replicas、消费者 offset。
- **为什么会重复**：重试、rebalance、处理成功但提交 offset 失败。
- **怎么治理**：合理分区、监控 lag、控制消息大小、限流和补偿。
