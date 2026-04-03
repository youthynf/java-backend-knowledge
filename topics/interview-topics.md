# Java 后端面试高频主题 (100 题)

## 一、Java 核心 (30 题)

### JVM (7 题)
1. JVM 内存模型详解
2. 垃圾回收算法对比 (标记-清除、复制、标记-整理)
3. G1 垃圾收集器原理
4. ZGC 低延迟实现
5. 类加载机制与双亲委派
6. JVM 调优实战
7. JVM 故障排查工具 (jstat, jmap, jstack, Arthas)

### 并发编程 (9 题)
8. synchronized 实现原理 (对象头、Monitor)
9. volatile 关键字深度解析 (可见性、禁止重排序)
10. CAS 与 Atomic 类 (乐观锁、ABA 问题)
11. AQS 核心原理 (state + CLH 队列)
12. 线程池参数详解 (corePoolSize, maximumPoolSize, queue)
13. 线程池拒绝策略与监控
14. ThreadLocal 原理与内存泄漏
15. 并发容器 ConcurrentHashMap (JDK7 vs JDK8)
16. 死锁检测与预防

### 集合框架 (5 题)
17. HashMap 底层原理 (数组 + 链表 + 红黑树)
18. HashMap 扩容机制 (负载因子 0.75)
19. ConcurrentHashMap 实现原理
20. ArrayList vs LinkedList
21. LinkedHashMap 与 LRU 缓存

### Java 新特性 (9 题)
22. JDK8 Lambda 表达式
23. JDK8 Stream API
24. JDK8 Optional 最佳实践
25. JDK8 默认方法
26. JDK9 模块化系统
27. JDK17 新特性概览
28. JDK21 虚拟线程 (Virtual Threads)
29. JDK21 结构化并发 (Structured Concurrency)
30. JDK21 分代 ZGC

## 二、框架与中间件 (15 题)

### Spring Framework (6 题)
31. Spring Bean 生命周期
32. Spring 循环依赖解决 (三级缓存)
33. Spring AOP 实现原理 (JDK 动态代理 vs CGLIB)
34. Spring 事务传播机制
35. Spring 事务失效场景
36. Spring Boot 自动配置原理 (@EnableAutoConfiguration)

### MyBatis (2 题)
37. MyBatis 缓存机制 (一级缓存、二级缓存)
38. #{} vs ${} 防注入

### Spring Cloud (7 题)
39. Nacos 服务发现原理
40. Nacos 配置中心实现
41. Spring Cloud Gateway 路由
42. OpenFeign 工作原理
43. Sentinel 限流熔断
44. Ribbon 负载均衡
45. Dubbo vs Spring Cloud

## 三、数据库 (20 题)

### MySQL (12 题)
46. B+ 树索引原理
47. 聚簇索引与非聚簇索引
48. 索引覆盖与回表
49. 最左前缀原则
50. 索引失效场景
51. MySQL 事务隔离级别
52. MVCC 实现原理 (Read View + Undo Log)
53. MySQL 锁机制 (行锁、间隙锁、临键锁)
54. redo log 与 binlog
55. SQL 优化实战
56. 分库分表策略
57. 慢查询分析与优化

### Redis (8 题)
58. Redis 数据结构 (String, Hash, List, Set, ZSet)
59. Redis 持久化 (RDB vs AOF)
60. Redis 过期策略 (惰性删除 + 定期删除)
61. Redis 内存淘汰策略
62. Redis 缓存穿透、击穿、雪崩
63. Redis 分布式锁 (SETNX + Lua)
64. Redis Cluster 原理
65. Redis 与数据库一致性方案

## 四、消息队列 (8 题)
66. Kafka 架构原理 (Broker, Topic, Partition)
67. Kafka 高可用机制 (ISR, ACK)
68. Kafka 消息不丢失保障
69. RocketMQ 架构原理
70. RocketMQ 事务消息
71. RabbitMQ 路由模式
72. 消息队列选型对比
73. 消息顺序性保障

## 五、分布式系统 (9 题)
74. CAP 定理
75. BASE 理论
76. 分布式锁实现 (Redis, Zookeeper, etcd)
77. 分布式事务方案 (2PC, TCC, Saga, 本地消息表)
78. Seata AT 模式原理
79. 分布式 ID 生成 (雪花算法, Leaf)
80. 分布式 Session 方案
81. 一致性哈希
82. Raft 共识算法

## 六、微服务架构 (6 题)
83. 服务拆分原则
84. API 网关设计
85. 服务熔断降级
86. 服务限流算法 (令牌桶, 漏桶, 滑动窗口)
87. 链路追踪设计 (SkyWalking, Jaeger)
88. 配置中心选型

## 七、架构设计 (7 题)
89. 单例模式实现 (饿汉、懒汉、双重检查、枚举)
90. 策略模式应用
91. 责任链模式
92. 高并发系统设计 (缓存、异步、分片)
93. 高可用系统设计 (限流、降级、熔断)
94. 秒杀系统架构
95. 短链接系统设计

## 八、网络协议 (3 题)
96. HTTP/HTTPS 原理
97. TCP 三次握手与四次挥手
98. TCP 滑动窗口与拥塞控制

## 九、算法 (2 题)
99. 链表反转
100. Top K 问题 (堆排序, 快速选择)

---

*总计: 100 题覆盖 Java 后端核心面试知识点*
*更新时间: 2026-04-03*
