# Java 后端面试知识库

> 系统化的 Java 后端面试知识点，涵盖八股文、实战场景、架构设计

## 📚 知识模块

### 一、Java 核心
- [JVM](./docs/01-java-core/jvm/README.md) - 内存模型、垃圾回收、类加载、调优
- [并发编程](./docs/01-java-core/concurrency/README.md) - 线程、锁、线程池、并发容器
- [集合框架](./docs/01-java-core/collections/README.md) - HashMap、ArrayList、ConcurrentHashMap
- [Java 新特性](./docs/01-java-core/new-features/README.md) - Lambda、Stream、虚拟线程

### 二、框架与中间件
- [Spring Framework](./docs/02-frameworks/spring/README.md) - IOC、AOP、事务、Boot
- [MyBatis](./docs/02-frameworks/mybatis/README.md) - 缓存、Mapper、动态 SQL
- [Spring Cloud](./docs/02-frameworks/spring-cloud/README.md) - Nacos、Gateway、Feign、Sentinel

### 三、数据库
- [MySQL](./docs/03-database/mysql/README.md) - 索引、事务、锁、优化
- [Redis](./docs/03-database/redis/README.md) - 数据结构、持久化、集群、缓存策略

### 四、消息队列
- [Kafka](./docs/04-mq/kafka/README.md) - 架构、高可用、消息可靠性
- [RocketMQ](./docs/04-mq/rocketmq/README.md) - 事务消息、顺序消息
- [RabbitMQ](./docs/04-mq/rabbitmq/README.md) - 路由模式、可靠性

### 五、分布式系统
- [分布式理论](./docs/05-distributed/theory/README.md) - CAP、BASE、一致性
- [分布式锁](./docs/05-distributed/lock/README.md) - Redis、Zookeeper 实现
- [分布式事务](./docs/05-distributed/transaction/README.md) - 2PC、TCC、Seata
- [分布式 ID](./docs/05-distributed/id/README.md) - 雪花算法、Leaf

### 六、微服务架构
- [服务治理](./docs/06-microservice/governance/README.md) - 熔断、限流、降级
- [API 网关](./docs/06-microservice/gateway/README.md) - Gateway、Kong
- [链路追踪](./docs/06-microservice/tracing/README.md) - SkyWalking、Jaeger

### 七、架构设计
- [设计模式](./docs/07-architecture/patterns/README.md) - 单例、策略、责任链
- [高并发设计](./docs/07-architecture/high-concurrency/README.md) - 缓存、异步、分片
- [系统设计](./docs/07-architecture/system-design/README.md) - 秒杀、短链接、 Feed 流

### 八、网络协议
- [HTTP/HTTPS](./docs/08-network/http/README.md) - 协议、缓存、安全
- [TCP/IP](./docs/08-network/tcp/README.md) - 连接、流量控制、拥塞控制

### 九、算法
- [数据结构](./docs/09-algorithm/data-structure/README.md) - 链表、树、图
- [算法思想](./docs/09-algorithm/techniques/README.md) - 动态规划、贪心、回溯

## 📁 目录结构

```
java-backend-knowledge/
├── README.md                 # 项目说明
├── docs/                     # 知识文档
│   ├── 01-java-core/         # Java 核心
│   │   ├── jvm/
│   │   ├── concurrency/
│   │   ├── collections/
│   │   └── new-features/
│   ├── 02-frameworks/        # 框架与中间件
│   │   ├── spring/
│   │   ├── mybatis/
│   │   └── spring-cloud/
│   ├── 03-database/          # 数据库
│   │   ├── mysql/
│   │   └── redis/
│   ├── 04-mq/                # 消息队列
│   │   ├── kafka/
│   │   ├── rocketmq/
│   │   └── rabbitmq/
│   ├── 05-distributed/       # 分布式系统
│   │   ├── theory/
│   │   ├── lock/
│   │   ├── transaction/
│   │   └── id/
│   ├── 06-microservice/      # 微服务架构
│   │   ├── governance/
│   │   ├── gateway/
│   │   └── tracing/
│   ├── 07-architecture/      # 架构设计
│   │   ├── patterns/
│   │   ├── high-concurrency/
│   │   └── system-design/
│   ├── 08-network/           # 网络协议
│   │   ├── http/
│   │   └── tcp/
│   └── 09-algorithm/         # 算法
│       ├── data-structure/
│       └── techniques/
├── topics/                   # 面试主题列表
│   └── interview-topics.md   # 100 个高频主题
├── scripts/                  # 自动化脚本
│   └── push-topic.sh         # 推送脚本
└── .github/                  # GitHub 配置
    └── workflows/            # CI/CD（可选）
```

## 🚀 使用方式

### 本地阅读
```bash
git clone https://github.com/YOUR_USERNAME/java-backend-knowledge.git
cd java-backend-knowledge
# 使用任意 Markdown 编辑器阅读
```

### 贡献内容
1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/add-redis-cluster`)
3. 提交更改 (`git commit -m 'Add Redis Cluster 详解'`)
4. 推送分支 (`git push origin feature/add-redis-cluster`)
5. 创建 Pull Request

## ✍️ 内容规范

### 文档模板

```markdown
# [知识点名称]

## 核心概念
- 概念 1
- 概念 2

## 面试高频问题
1. 问题 1？
   - 回答要点

## 实战场景
- 场景描述
- 解决方案

## 代码示例
\`\`\`java
// 示例代码
\`\`\`

## 延伸思考
- 深入问题
- 相关知识点

## 参考资料
- [链接](url)
```

## 📅 更新计划

- [ ] 完成 JVM 模块 (7 篇)
- [ ] 完成并发编程模块 (9 篇)
- [ ] 完成集合框架模块 (5 篇)
- [ ] 完成 Spring 模块 (6 篇)
- [ ] 完成 MySQL 模块 (11 篇)
- [ ] 完成 Redis 模块 (8 篇)
- [ ] 完成分布式系统模块 (9 篇)
- [ ] 完成架构设计模块 (8 篇)

---

*创建时间: 2026-04-03*
*维护者: @youth*
