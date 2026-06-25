# MySQL磁盘I/O很高怎么优化？

## 核心概念

MySQL磁盘I/O很高怎么优化？
现在我们知道事务在提交的时候，需要将 binlog 和 redo log 持久化到磁盘，那么如果出现 MySQL 磁盘 I/O 很高的现象，我们可以通过控制以下参数，来 “延迟” binlog 和 redo log 刷盘的时机，从而降低磁盘 I/O 的频率：
设置组提交的两个参数： binlog_group_commit_sync_delay 和 binlog_group_commit_sync_no_delay_count 参数，延迟 binlog 刷盘的时机，从而减少 binlog 的刷盘次数。这个方法是基于“额外的故意等待”来实现的，因此可能会增加语句的响应时间，但即使 MySQL 进程中途挂了，也没有丢失数据的风险，因为 binlog 早被写入到 page cache 了，只要系统没有宕机，缓存在 page cache 里的 binlog 就会被持久化到磁盘。
将 sync_binlog 设置为大于 1 的值（比较常见是 100~1000），表示每次提交事务都 write，但累积 N 个事务后才 fsync，相当于延迟了 binlog 刷盘的时机。但是这样做的风险是，主机掉电时会丢 N 个事务的 binlog 日志。
将 innodb_flush_log_at_trx_commit 设置为 2。表示每次事务提交时，都只是缓存在 redo log buffer 里的 redo log 写到 redo log 文件，注意写入到「 redo log 文件」并不意味着写入到了磁盘，因为操作系统的文件系统中有个 Page Cache，专门用来缓存文件数据的，所以写入「 redo log文件」意味着写入到了操作系统的文件缓存，然后交由操作系统控制持久化到磁盘的时机。但是这样做的风险是，主机掉电的时候会丢数据。

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
