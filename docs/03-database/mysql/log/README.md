# 日志

本目录覆盖 MySQL 三大日志（redo log、undo log、binlog）及 Buffer Pool、Checkpoint、两阶段提交、磁盘 IO 优化等核心机制。

## 目录

- [MySQL 的日志文件有哪些](MySQL的日志文件有哪些？.md) — redo/undo/binlog/relay/error/slow/general 全景
- [为什么需要 Redo-Log](为什么需要Redo-Log？.md) — WAL 崩溃恢复与顺序写优化
- [为什么需要 Undo-Log](为什么需要Undo-Log？.md) — 事务回滚与 MVCC 版本链
- [为什么需要 binlog](为什么需要binlog？.md) — 主从复制与按时间点恢复
- [为什么需要 Buffer-Pool](为什么需要Buffer-Pool？.md) — 内存缓存与改进 LRU
- [为什么需要两阶段提交](为什么需要两阶段提交？.md) — redo log 与 binlog 一致性协调
- [MySQL 的 Checkpoint 机制是什么](MySQL的Checkpoint机制是什么？.md) — 脏页刷盘与 LSN 恢复点
- [Undo-Log、Redo-Log、Binlog 如何配合工作](Undo-Log、Redo-Log、Binlog如何配合工作？.md) — 一条 UPDATE 的完整生命周期
- [MySQL 磁盘 IO 很高怎么优化](MySQL磁盘IO很高怎么优化？.md) — 刷盘参数、组提交、硬件优化
