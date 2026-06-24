# 数据结构

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

- [底层数据结构-哈希表](/03-database/redis/data-structure/底层数据结构-哈希表.md)
- [底层数据结构-双向链表](/03-database/redis/data-structure/底层数据结构-双向链表.md)
- [底层数据结构-跳表](/03-database/redis/data-structure/底层数据结构-跳表.md)
- [底层数据结构-压缩列表](/03-database/redis/data-structure/底层数据结构-压缩列表.md)
- [底层数据结构-整数集合](/03-database/redis/data-structure/底层数据结构-整数集合.md)
- [底层数据结构-listpack](/03-database/redis/data-structure/底层数据结构-listpack.md)
- [底层数据结构-quicklist](/03-database/redis/data-structure/底层数据结构-quicklist.md)
- [底层数据结构-SDS](/03-database/redis/data-structure/底层数据结构-SDS.md)
- [数据类型-Bitmap](/03-database/redis/data-structure/数据类型-Bitmap.md)
- [数据类型-GEO](/03-database/redis/data-structure/数据类型-GEO.md)
- [数据类型-Hash](/03-database/redis/data-structure/数据类型-Hash.md)
- [数据类型-HyperLogLog](/03-database/redis/data-structure/数据类型-HyperLogLog.md)
- [数据类型-List](/03-database/redis/data-structure/数据类型-List.md)
- [数据类型-Set](/03-database/redis/data-structure/数据类型-Set.md)
- [数据类型-Stream](/03-database/redis/data-structure/数据类型-Stream.md)
- [数据类型-String](/03-database/redis/data-structure/数据类型-String.md)
- [数据类型-Zset](/03-database/redis/data-structure/数据类型-Zset.md)
- [Redis键值对数据是如何实现的？](/03-database/redis/data-structure/Redis键值对数据是如何实现的？.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
