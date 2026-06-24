# persistence

## 核心概念

- [为什么会有Redis混合持久化？](为什么会有Redis混合持久化？.md)
- [AOF日志如何如何实现的？](AOF日志如何如何实现的？.md)
- [AOF重写机制是什么？](AOF重写机制是什么？.md)
- [RDB快照是如何实现的？](RDB快照是如何实现的？.md)
- [Redis大Key对持久化有什么影响？](Redis大Key对持久化有什么影响？.md)
- [Redis如何实现数据不丢失？](Redis如何实现数据不丢失？.md)

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
