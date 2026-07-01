# RabbitMQ

RabbitMQ 是基于 AMQP（Advanced Message Queuing Protocol）协议实现的开源消息中间件，由 Erlang 语言编写。核心特点是**灵活路由**：通过 Exchange + Binding + Routing Key 把消息路由到不同 Queue，支持点对点、发布订阅、主题匹配等多种消息模式。适合复杂业务路由场景，不适合超大日志流堆积。

## 目录

- [RabbitMQ 是什么](RabbitMQ是什么？.md) — Exchange/Queue/Binding、四种交换器类型、延迟死信优先级队列、集群模式

## 核心要点

- **消息模型**：Producer → Exchange → Binding → Queue → Consumer。Exchange 不存消息，Queue 才存消息。
- **交换器类型**：direct（精确匹配）、topic（通配符匹配）、fanout（广播）、headers（头部匹配）。
- **可靠性**：publisher confirm（生产端确认）、mandatory + return（不可路由处理）、queue/message 持久化、consumer 手动 ack、重试与 DLQ。
- **集群模式**：普通集群（元数据同步，Queue 数据不同步）、镜像队列（Queue 主从复制，牺牲吞吐换高可用）、Quorum 队列（基于 Raft，解决脑裂）。
- **典型应用**：订单异步通知、支付结果分发、复杂业务路由、企业内部异步通信。
