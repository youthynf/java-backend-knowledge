# RocketMQ

RocketMQ 是阿里开源的分布式消息中间件，2016 年捐赠给 Apache 后成为顶级项目。它在 Kafka 设计思想基础上做了调整，"架构上做减法，功能上做加法"：简化协调节点（去掉 ZooKeeper 改用 NameServer）、简化分区（Queue 只存 offset，消息统一写 CommitLog）、简化备份模型（以 Broker 为单位主从同步），同时增加消息过滤（Tag）、事务消息、延迟消息、死信队列、消息回溯等业务能力。

## 目录

- [RocketMQ 与 Kafka 有什么区别](RocketMQ与Kafka有什么区别？.md) — 架构减法、功能加法、选型场景对比
- [RocketMQ 为什么性能不如 Kafka](RocketMQ为什么性能不如Kafka？.md) — 零拷贝、存储模型、业务特性带来的开销

## 核心要点

- **协调节点**：NameServer 替代 ZooKeeper，更轻量，每个节点独立无状态。
- **存储模型**：所有 Topic 消息统一写 CommitLog，ConsumeQueue 存偏移和元数据，避免多 Topic 随机写。
- **业务能力**：事务消息（半消息 + 本地事务 + 回查）、延迟消息（18 个固定级别 4.x，任意延迟 5.x）、顺序消息、Tag 过滤、死信队列、消费重试。
- **消费模式**：集群消费（CLUSTERING，每条消息被组内一个消费者消费）和广播消费（BROADCASTING，每条消息被所有消费者消费）。
- **副本机制**：Master/Slave 异步或同步复制，5.x 引入 Controller 模式支持自动主从切换。
