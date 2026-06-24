# 日志

这一部分围绕 MySQL 查询执行、索引、事务、锁和日志体系展开。复习时要把 SQL 现象、执行计划、存储结构和并发控制串起来。

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

- [为什么需要两阶段提交？](/03-database/mysql/log/为什么需要两阶段提交？.md)
- [为什么需要binlog？](/03-database/mysql/log/为什么需要binlog？.md)
- [为什么需要Buffer-Pool？](/03-database/mysql/log/为什么需要Buffer-Pool？.md)
- [为什么需要redo-log](/03-database/mysql/log/为什么需要redo-log.md)
- [为什么需要undo-log](/03-database/mysql/log/为什么需要undo-log.md)
- [MySQL磁盘I-O很高怎么优化？](/03-database/mysql/log/MySQL磁盘I-O很高怎么优化？.md)
- [MySQL的日志文件有哪些？](/03-database/mysql/log/MySQL的日志文件有哪些？.md)
- [MySQL的Checkpoint机制是什么？](/03-database/mysql/log/MySQL的Checkpoint机制是什么？.md)
- [Undo-Log、Redo-Log、Binlog如何配合工作？](/03-database/mysql/log/Undo-Log、Redo-Log、Binlog如何配合工作？.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
