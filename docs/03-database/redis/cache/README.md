# 缓存

这一部分围绕 Redis 数据结构、缓存设计、持久化、高可用和集群治理展开。面试重点通常是缓存问题如何落地解决，而不是单纯背命令。

## 面试复习重点

- 缓存穿透、击穿、雪崩、预热和更新一致性。
- 热点 Key、大 Key、过期策略与淘汰策略。
- 本地缓存、多级缓存、分布式锁和限流的组合取舍。

## 建议掌握程度

- **能讲清概念**：先用自己的话解释定义、背景和解决的问题。
- **能画出链路**：把核心流程、关键组件和状态变化串起来。
- **能回答追问**：准备优缺点、适用场景、常见坑和替代方案。
- **能落地排查**：结合日志、指标、工具和案例说明如何定位问题。

## 文章导航

- [本地缓存与Redis缓存有什么区别？](/03-database/redis/cache/本地缓存与Redis缓存有什么区别？.md)
- [常见的缓存更新策略有哪些？](/03-database/redis/cache/常见的缓存更新策略有哪些？.md)
- [如何保证数据与缓存一致性？](/03-database/redis/cache/如何保证数据与缓存一致性？.md)
- [如何避免Redis缓存穿透？](/03-database/redis/cache/如何避免Redis缓存穿透？.md)
- [如何避免Redis缓存击穿？](/03-database/redis/cache/如何避免Redis缓存击穿？.md)
- [如何避免Redis缓存雪崩？](/03-database/redis/cache/如何避免Redis缓存雪崩？.md)
- [如何设计一个可以动态缓存热点数据的缓存策略？](/03-database/redis/cache/如何设计一个可以动态缓存热点数据的缓存策略？.md)
- [为什么Redis比MySQL快？](/03-database/redis/cache/为什么Redis比MySQL快？.md)
- [Redis持久化时对过期键会如何处理？](/03-database/redis/cache/Redis持久化时对过期键会如何处理？.md)
- [Redis的LRU算法与LFU算法有什么区别？](/03-database/redis/cache/Redis的LRU算法与LFU算法有什么区别？.md)
- [Redis内存淘汰策略有哪些？](/03-database/redis/cache/Redis内存淘汰策略有哪些？.md)
- [Redis使用的过期删除策略是什么？](/03-database/redis/cache/Redis使用的过期删除策略是什么？.md)
- [Redis主从模式中对过期键如何处理？](/03-database/redis/cache/Redis主从模式中对过期键如何处理？.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
