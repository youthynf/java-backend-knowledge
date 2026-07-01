# Java 后端面试知识库

系统化的 Java 后端面试知识点，涵盖基础、框架、数据库、中间件、分布式、微服务、架构设计、网络、算法与 DevOps。每篇文章按统一结构组织，兼顾面试表达与生产落地。

## 项目结构

```text
java-backend-knowledge/
├── docs/       # 知识库内容源（docsify 站点）
├── site/       # Node/Express 站点壳
└── scripts/    # 同步和维护脚本
```

## 知识模块

- [Java 核心](./docs/01-java-core/README.md) — 基础、集合、并发、JVM、IO、设计模式、新特性
- [框架](./docs/02-frameworks/README.md) — Spring IoC/AOP/事务/循环依赖
- [数据库](./docs/03-database/README.md) — MySQL、Redis 全套
- [消息队列与中间件](./docs/04-mq/README.md) — Kafka、RocketMQ、RabbitMQ、Zookeeper、Nginx、ES、ClickHouse、Tomcat
- [分布式](./docs/05-distributed/README.md) — CAP/BASE、分布式锁、分布式事务、一致性算法、分布式 ID
- [微服务](./docs/06-microservice/README.md) — 注册发现、配置中心、网关、熔断限流、链路追踪
- [架构设计](./docs/07-architecture/README.md) — 设计模式（架构视角）、系统设计
- [网络](./docs/08-network/README.md) — 网络模型、网络层、传输层、应用层、网络安全
- [算法](./docs/09-algorithm/README.md) — 排序、二分、动态规划、回溯、贪心
- [DevOps](./docs/devops/README.md) — Docker、K8s、Linux、CI/CD

## 本地阅读

```bash
git clone https://github.com/YOUR_USERNAME/java-backend-knowledge.git
cd java-backend-knowledge

# 方式一：使用 docsify-cli 本地预览
npx docsify-cli serve docs

# 方式二：使用任意 Markdown 编辑器直接阅读 docs/ 目录
```

## 文档规范

所有文章遵循 [`docs/_STYLE_GUIDE.md`](./docs/_STYLE_GUIDE.md) 中的统一风格规范，结构为：

```
核心概念 → 标准回答 → 实现原理 → 代码示例 → 实战场景 → 深挖追问 → 易错点 → 总结 → 参考资料
```

## 贡献内容

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/add-xxx`)
3. 提交更改 (`git commit -m 'Add xxx 详解'`)
4. 推送分支 (`git push origin feature/add-xxx`)
5. 创建 Pull Request

---

*维护者: @youth*
