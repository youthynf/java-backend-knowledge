# 消息与中间件篇

本目录覆盖 MQ、搜索、网关/容器等后端中间件。面试复习时建议以“可靠性、吞吐量、一致性、可观测性”为主线，不要只背产品特性。

## 导航

| 模块 | 文章 | 摘要 |
| --- | --- | --- |
| MQ 基础 | [消息队列基础](/04-mq/basics/README.md) / [如何防止重复消费](/04-mq/basics/消息队列如何防止消息重复消费？.md) | 解耦、削峰、异步、可靠投递、幂等消费 |
| Kafka | [Kafka 总览](/04-mq/Kafka/README.md) / [入门概要](/04-mq/Kafka/Kafka入门概要.md) / [会丢消息吗](/04-mq/Kafka/Kafka会丢消息吗？.md) / [Exactly-Once](/04-mq/Kafka/Kafka的Exactly-Once语义怎么保证？.md) / [消息积压](/04-mq/Kafka/Kafka百万消息挤压如何处理？.md) | 高吞吐日志流、分区副本、消费者组、ISR、事务、积压治理 |
| RocketMQ | [RocketMQ 总览](/04-mq/rocketmq/README.md) / [与 Kafka 区别](/04-mq/rocketmq/RocketMQ与Kafka有什么区别？.md) / [性能对比](/04-mq/rocketmq/RocketMQ为什么性能不如Kafka？.md) | 业务消息、事务消息、延迟消息、顺序消息 |
| RabbitMQ | [RabbitMQ 总览](/04-mq/rabbitmq/README.md) / [入门概要](/04-mq/rabbitmq/RabbitMQ入门概要.md) | AMQP、Exchange、Queue、RoutingKey、确认机制 |
| 搜索/分析 | [ElasticSearch](/04-mq/ElasticSearch/README.md) / [ClickHouse](/04-mq/ClickHouse/README.md) | 搜索、倒排索引、列存、OLAP 分析 |
| 基础设施 | [Zookeeper](/04-mq/Zookeeper/README.md) / [Nginx](/04-mq/Nginx/README.md) / [Tomcat](/04-mq/Tomcat/README.md) | 协调、负载均衡、Servlet 容器与类加载 |

## 标准回答框架

回答 MQ 题建议从 **业务场景 → 消息模型 → 可靠性方案 → 性能与扩展 → 监控补偿** 展开。任何“保证不丢不重”的回答都必须补充边界：分布式系统只能通过幂等、事务/最终一致、对账补偿降低风险。

## 易错点

- 只说“加 MQ 解耦”，不说失败重试、幂等和死信。
- 把 Kafka 的 Exactly-Once 理解成外部数据库也天然 Exactly-Once。
- 积压时盲目加消费者，却忽略分区数和下游承载能力。
