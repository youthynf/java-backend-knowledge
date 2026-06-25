# MySQL 的日志文件有哪些？

## 核心概念

MySQL 常见日志包括 redo log、undo log、binlog、relay log、slow query log、general log、error log 等。面试最常考的是 redo log、undo log 和 binlog：

- redo log：InnoDB 物理日志，记录数据页修改，用于崩溃恢复；
- undo log：记录修改前版本，用于事务回滚和 MVCC 一致性读；
- binlog：Server 层逻辑日志，记录数据变更，用于主从复制和数据恢复；
- relay log：从库接收主库 binlog 后落地的中继日志；
- slow log：记录慢 SQL，常用于性能优化。

## 面试官想考什么

- 是否能区分 redo、undo、binlog 的层次和作用；
- 是否理解事务提交和两阶段提交；
- 是否知道 binlog 在复制和恢复中的作用；
- 是否能用 slow log 做 SQL 优化入口。

## 标准回答

> MySQL 重要日志有 redo log、undo log 和 binlog。redo log 是 InnoDB 的物理重做日志，保证崩溃后已提交事务不丢；undo log 用于回滚和 MVCC；binlog 是 Server 层逻辑日志，用于主从复制和按时间点恢复。为了保证 redo log 和 binlog 一致，事务提交时会使用两阶段提交。

## 深挖追问

### redo log 和 binlog 有什么区别？

redo log 属于 InnoDB，记录“某个页做了什么修改”，循环写，主要用于崩溃恢复；binlog 属于 MySQL Server 层，记录逻辑变更，追加写，主要用于复制和恢复。redo 保证事务持久性，binlog 保证数据变更可以传播和重放。

### 什么是两阶段提交？

事务提交时，InnoDB 先写 redo log prepare，再写 binlog，最后写 redo log commit。这样崩溃恢复时可以根据 redo 和 binlog 状态判断事务是否应提交，避免主库恢复数据和 binlog 不一致。

## 实战场景 / SQL 示例

慢查询优化通常先开启并分析 slow log：

```sql
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 1;
```

误删数据恢复则依赖全量备份 + binlog 增量重放，恢复到误操作前的时间点。主从复制中，从库 IO 线程拉取主库 binlog 写入 relay log，SQL 线程再重放。

## 易错点 / 总结

- redo log 不是用来做主从复制的，binlog 才是；
- undo log 不只是回滚，也服务于 MVCC 快照读；
- 只开 binlog 不等于万无一失，还需要备份和恢复演练；
- general log 开销较大，线上不要长期全量开启；
- 日志刷盘策略影响性能和丢数据风险。
