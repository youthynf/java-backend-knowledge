
- **首页**
  - [首页](/)

- **Java 核心**
  - [基础](/01-java-core/basics/)
  - [集合](/01-java-core/collections/)
  - **并发编程**
    - [基础](/01-java-core/concurrency/basics/)
    - [JUC](/01-java-core/concurrency/JUC/)
    - [关键字](/01-java-core/concurrency/keywords/)
    - [线程池](/01-java-core/concurrency/thread-pool/)
  - [设计模式](/01-java-core/design-pattern/)
  - [IO](/01-java-core/io/)
  - **JVM**
    - [基础](/01-java-core/jvm/basics/)
    - [GC](/01-java-core/jvm/gc/)
    - [故障排查](/01-java-core/jvm/troubleshooting/)
  - [新特性](/01-java-core/new-features/)

- **框架**
  - [Spring](/02-frameworks/spring/)

- **数据库**
  - **MySQL**
    - [基础](/03-database/mysql/basics/)
    - [存储引擎](/03-database/mysql/engine/)
    - [索引](/03-database/mysql/index/)
    - [锁](/03-database/mysql/lock/)
    - [事务](/03-database/mysql/transaction/)
    - [日志](/03-database/mysql/log/)
    - [集群](/03-database/mysql/cluster/)
    - [调优](/03-database/mysql/optimization/)
  - **Redis**
    - [基础](/03-database/redis/basics/)
    - [数据结构](/03-database/redis/data-structure/)
    - [持久化](/03-database/redis/persistence/)
    - [集群](/03-database/redis/cluster/)
    - [缓存](/03-database/redis/cache/)
    - [线程模型](/03-database/redis/thread-model/)
    - [事务](/03-database/redis/transaction/)
    - [应用](/03-database/redis/application/)

- **消息队列**
  - [基础](/04-mq/basics/)
  - [Kafka](/04-mq/Kafka/)
  - [RocketMQ](/04-mq/rocketmq/)
  - [RabbitMQ](/04-mq/rabbitmq/)

- **分布式**
  - [分布式基础](/05-distributed/)

- **微服务**
  - [微服务](/06-microservice/)

- **架构设计**
  - [设计模式](/07-architecture/patterns/)
  - [系统设计](/07-architecture/system-design/)

- **网络**
  - [网络模型](/08-network/network-model/)
  - [网络层](/08-network/network-layer/)
  - [传输层](/08-network/transport-layer/)
  - [应用层](/08-network/application-layer/)
  - [网络安全](/08-network/network-security/)

- **算法**
  - [算法](/09-algorithm/)

- **DevOps**
  - [DevOps](/devops/)

- **中间件**
  - [Zookeeper](/04-mq/Zookeeper/)
  - [Nginx](/04-mq/Nginx/)
  - [ElasticSearch](/04-mq/ElasticSearch/)
  - [ClickHouse](/04-mq/ClickHouse/)
  - [Tomcat](/04-mq/Tomcat/)
## 核心概念
sidebar 可以放在“工程实践能力”这条主线里理解。复习时不要只背结论，要先说明它解决的核心问题，再解释关键机制、适用边界和代价。围绕这个知识点，重点关注：定义、原理、边界、取舍、常见问题、排查方法和落地成本。如果面试官继续追问，通常会从“为什么这样设计、在什么场景会失效、线上如何排查”三个方向展开。

## 面试回答与追问
- **标准回答**：先给出 sidebar 的定位，再说明它依赖的核心原理，最后结合业务场景说明如何使用。回答时要把“能解决什么问题”和“会带来什么成本”一起讲清楚。
- **常见追问**：如果数据量、并发量或调用链路继续放大，sidebar 的瓶颈会出现在哪里？如何观测、如何优化、如何回滚？
- **易错点**：不要把概念和具体实现混在一起，也不要只说 API 名称。面试中更重要的是说清楚边界条件、失败场景和取舍依据。

## 实战场景与排查
典型落地场景包括：真实业务开发、线上问题治理、性能优化、协作交付和面试复盘。实际处理线上问题时，可以按“现象确认 → 指标采集 → 假设验证 → 小步修复 → 复盘沉淀”的路径推进。先看日志、监控、链路追踪和核心指标，再判断是容量问题、配置问题、代码路径问题，还是外部依赖抖动。

## 总结
复习 sidebar 时，建议把它和相邻知识点放在一起比较：相同点是什么、区别在哪里、为什么当前场景选择它而不是替代方案。能讲清楚这些内容，才算真正掌握。
