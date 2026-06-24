# RocketMQ

RocketMQ 更偏业务消息场景，常考事务消息、顺序消息、延迟消息、重试和与 Kafka 的区别。

## 导航

| 文章 | 摘要 |
| --- | --- |
| [RocketMQ 与 Kafka 有什么区别？](/04-mq/rocketmq/RocketMQ与Kafka有什么区别？.md) | 从模型、性能、功能、适用场景、运维复杂度对比 |
| [RocketMQ 为什么性能不如 Kafka？](/04-mq/rocketmq/RocketMQ为什么性能不如Kafka？.md) | 从存储模型、索引、刷盘、功能复杂度解释性能差异 |

## 复习摘要

- **核心组件**：NameServer、Broker、Producer、Consumer、Topic、Queue、CommitLog、ConsumeQueue。
- **特色能力**：事务消息、延迟消息、顺序消息、Tag 过滤、失败重试和死信队列。
- **选型场景**：订单、支付、库存、通知等业务消息更适合 RocketMQ；日志采集和大数据流更常用 Kafka。
