# 消息队列与中间件

本目录覆盖消息中间件（Kafka、RocketMQ、RabbitMQ）和后端常用基础设施（Zookeeper、Nginx、ElasticSearch、ClickHouse、Tomcat）。复习主线是：可靠性、顺序性、幂等、性能瓶颈和故障恢复。

## 目录

- [MQ 基础](/04-mq/basics/) — 消息模型、投递语义、重复消费、顺序、积压等共性问题
- [Kafka](/04-mq/Kafka/) — 高吞吐日志流平台，分区/副本/ISR、生产者 ack、Exactly-Once
- [RocketMQ](/04-mq/rocketmq/) — 阿里出品业务消息中间件，事务消息、延迟消息、死信队列
- [RabbitMQ](/04-mq/rabbitmq/) — 基于 AMQP 的灵活路由消息中间件，Exchange/Queue/Binding
- [Zookeeper](/04-mq/Zookeeper/) — 分布式协调服务，ZAB、Watcher、临时节点、选主
- [Nginx](/04-mq/Nginx/) — 反向代理与七层负载均衡，events/http 模块、限流
- [ElasticSearch](/04-mq/ElasticSearch/) — 分布式搜索分析引擎，倒排索引、分片副本、refresh
- [ClickHouse](/04-mq/ClickHouse/) — 列式 OLAP 数据库，MergeTree、分区/分片、物化视图
- [Tomcat](/04-mq/Tomcat/) — Servlet 容器，Connector/Container、线程模型、类加载

## 选型速查

| 中间件 | 核心定位 | 典型场景 |
|--------|----------|----------|
| Kafka | 高吞吐日志流 | 日志采集、埋点、流计算、数据管道 |
| RocketMQ | 业务消息 | 订单交易、事务消息、延迟取消、顺序消费 |
| RabbitMQ | 灵活路由 | 复杂业务路由、企业内部异步通信 |
| ElasticSearch | 近实时搜索 | 全文检索、日志分析、聚合统计 |
| ClickHouse | 列式 OLAP | 报表分析、用户行为、海量明细聚合 |
| Tomcat | Servlet 容器 | Spring Boot 内嵌、传统 WAR 部署 |
