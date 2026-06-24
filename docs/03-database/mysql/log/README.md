# log

## 核心概念

- [为什么需要两阶段提交？](/03-database/mysql/log/为什么需要两阶段提交？.md)
- [为什么需要binlog？](/03-database/mysql/log/为什么需要binlog？.md)
- [为什么需要Buffer-Pool？](/03-database/mysql/log/为什么需要Buffer-Pool？.md)
- [为什么需要redo-log](/03-database/mysql/log/为什么需要redo-log.md)
- [为什么需要undo-log](/03-database/mysql/log/为什么需要undo-log.md)
- [MySQL磁盘I-O很高怎么优化？](/03-database/mysql/log/MySQL磁盘I-O很高怎么优化？.md)
- [MySQL的日志文件有哪些？](/03-database/mysql/log/MySQL的日志文件有哪些？.md)
- [MySQL的Checkpoint机制是什么？](/03-database/mysql/log/MySQL的Checkpoint机制是什么？.md)
- [Undo-Log、Redo-Log、Binlog如何配合工作？](/03-database/mysql/log/Undo-Log、Redo-Log、Binlog如何配合工作？.md)

## 面试官想考什么

- redo log、undo log、binlog 的职责边界。
- 事务提交、崩溃恢复、主从复制之间如何配合。
- 两阶段提交解决什么一致性问题。

## 标准回答

MySQL 日志要区分职责：undo log 用于回滚和 MVCC，redo log 用于崩溃恢复，binlog 用于复制和按时间点恢复。事务提交时 redo log 与 binlog 通过两阶段提交降低不一致风险。

## 深挖追问

1. redo 和 binlog 区别？redo 用于崩溃恢复，binlog 用于复制和归档恢复。
2. 为什么需要两阶段提交？降低 redo 与 binlog 不一致。
3. undo 只用于回滚吗？还用于 MVCC 构造历史版本。

## 实战场景 / SQL 示例

```sql
SHOW VARIABLES LIKE "sync_binlog";
SHOW VARIABLES LIKE "innodb_flush_log_at_trx_commit";
-- 参数影响持久性、性能和故障丢失窗口。
```

## 易错点 / 总结

- 不要混淆 Server 层 binlog 和 InnoDB redo/undo。
- 刷盘参数会影响性能和故障丢失窗口。
- 只知道日志名不够，要能串起提交与恢复流程。
