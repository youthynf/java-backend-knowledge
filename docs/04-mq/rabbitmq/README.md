# RabbitMQ

RabbitMQ 是基于 AMQP 的传统消息中间件，面试重点是 Exchange 路由模型、确认机制、死信队列和可靠投递。

## 导航

| 文章 | 摘要 |
| --- | --- |
| [RabbitMQ 入门概要](RabbitMQ入门概要.md) | Exchange、Queue、Binding、RoutingKey、Confirm、Ack、DLX、TTL |

## 复习摘要

- **消息模型**：Producer → Exchange → Queue → Consumer，通过 Binding 和 RoutingKey 路由。
- **Exchange 类型**：direct 精确匹配，topic 通配符，fanout 广播，headers 按头匹配。
- **可靠性**：publisher confirm、mandatory/return、queue/message durable、manual ack、死信队列。
- **适用场景**：业务系统异步通知、任务队列、复杂路由；超大规模日志流一般不如 Kafka。

## 易错点

不要把 RabbitMQ 的 ack 和 publisher confirm 混为一谈：confirm 是 Broker 确认生产者消息已接收，ack 是消费者确认消息已处理。
