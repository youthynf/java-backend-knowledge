# 应用场景

这一部分围绕 Redis 数据结构、缓存设计、持久化、高可用和集群治理展开。面试重点通常是缓存问题如何落地解决，而不是单纯背命令。

## 面试复习重点

- 核心概念是什么，解决了什么问题，和相邻知识点如何区分。
- 面试官常从实现原理、适用场景、异常边界和性能影响继续追问。
- 生产落地时要结合监控、日志、压测和故障预案验证方案。

## 建议掌握程度

- **能讲清概念**：先用自己的话解释定义、背景和解决的问题。
- **能画出链路**：把核心流程、关键组件和状态变化串起来。
- **能回答追问**：准备优缺点、适用场景、常见坑和替代方案。
- **能落地排查**：结合日志、指标、工具和案例说明如何定位问题。

## 文章导航

- [如何解决Redis热Key问题？](/03-database/redis/application/如何解决Redis热Key问题？.md)
- [Redis布隆过滤器如何使用？](/03-database/redis/application/Redis布隆过滤器如何使用？.md)
- [Redis除了缓存还有哪些应用？](/03-database/redis/application/Redis除了缓存还有哪些应用？.md)
- [Redis的大key问题如何处理？](/03-database/redis/application/Redis的大key问题如何处理？.md)
- [Redis管道有什么作用？](/03-database/redis/application/Redis管道有什么作用？.md)
- [Redis如何实现分布式锁？](/03-database/redis/application/Redis如何实现分布式锁？.md)
- [Redis如何实现延迟队列？](/03-database/redis/application/Redis如何实现延迟队列？.md)
- [Redisson和Jedis有什么区别？](/03-database/redis/application/Redisson和Jedis有什么区别？.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
