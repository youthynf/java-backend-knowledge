# MySQL的日志文件有哪些？

## 核心概念

MySQL的日志文件有哪些？
redo log 重做日志：InnoDB存储引擎层生成的日志，实现事务的持久性，主要用于崩溃恢复；
undo log 回滚日志：InnoDB存储引擎层生成的日志，实现事务的原子性，主要用于事务回滚和MVCC；
bin log 二进制日志：Server层生成的日志，主要用于数据备份和主从复制；
relay log 中继日志：用于主从复制场景下，slave通过io线程拷贝master的bin log后本地生成的日志；
slow log 慢查询日志：用于记录执行时间过长的sql，需要设置阈值后手动开启；

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
