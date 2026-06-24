# persistence

## 面试复习重点

- 索引、事务、锁、日志、SQL 优化和存储结构的整体关系。
- 从慢 SQL、锁等待、主从延迟等现象反推底层原因。
- 结合执行计划、监控指标和业务写入模型做优化取舍。

## 建议掌握程度

- **能讲清概念**：用自己的话说明定义、背景和解决的问题。
- **能画出链路**：把关键组件、核心流程和状态变化串起来。
- **能回答追问**：准备优缺点、适用场景、常见坑和替代方案。
- **能落地排查**：结合日志、指标、工具和案例说明定位思路。

## 面试表达模板

1. 先给结论：说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。


## 核心概念

- [为什么会有Redis混合持久化？](/03-database/redis/persistence/为什么会有Redis混合持久化？.md)
- [AOF日志如何如何实现的？](/03-database/redis/persistence/AOF日志如何如何实现的？.md)
- [AOF重写机制是什么？](/03-database/redis/persistence/AOF重写机制是什么？.md)
- [RDB快照是如何实现的？](/03-database/redis/persistence/RDB快照是如何实现的？.md)
- [Redis大Key对持久化有什么影响？](/03-database/redis/persistence/Redis大Key对持久化有什么影响？.md)
- [Redis如何实现数据不丢失？](/03-database/redis/persistence/Redis如何实现数据不丢失？.md)

## 面试官想考什么

- RDB、AOF、混合持久化的恢复速度和数据丢失窗口。
- fork、写时复制、AOF 重写对延迟和内存的影响。
- 如何按 RPO/RTO 选择持久化配置。

## 标准回答

Redis 持久化要比较 RDB、AOF 和混合持久化。RDB 恢复快、适合备份，但可能丢失最近快照后的数据；AOF 数据丢失窗口取决于 fsync 策略，但文件会膨胀并需要重写；混合持久化兼顾恢复速度和增量日志。

## 深挖追问

1. RDB 和 AOF 怎么选？按恢复速度、数据丢失窗口和磁盘压力取舍。
2. AOF always 一定最好吗？更安全但写延迟和磁盘压力更高。
3. fork 风险？大实例可能产生延迟抖动和写时复制内存压力。

## 实战场景 / SQL 示例

```text
CONFIG GET save
CONFIG GET appendonly
CONFIG GET appendfsync
-- 根据 RPO/RTO 和磁盘能力选择。
```

## 易错点 / 总结

- 持久化不是备份，仍需要独立备份和恢复演练。
- AOF 更安全不代表无成本，fsync 策略会影响延迟。
- 大实例 fork 可能造成延迟尖刺和内存压力。
