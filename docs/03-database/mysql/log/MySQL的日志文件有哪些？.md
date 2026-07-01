# MySQL 的日志文件有哪些

## 核心概念

MySQL 的日志分散在 Server 层和存储引擎层，各自承担不同职责。面试最常考的是 redo log、undo log、binlog 三大日志，它们支撑了事务的 ACID、崩溃恢复和主从复制。除此之外还有 error log、slow query log、general log、relay log、ddl log 等。

理解 MySQL 日志的关键是分清层次：binlog 属于 Server 层，所有引擎共享；redo log 和 undo log 属于 InnoDB 引擎层，是 InnoDB 特有的。三者协同工作，通过两阶段提交保证一致性。

## 标准回答

> MySQL 重要日志有 redo log、undo log、binlog，外加 relay log、error log、slow log、general log。redo log 是 InnoDB 物理日志，循环写，保证崩溃恢复（crash-safe）；undo log 是 InnoDB 逻辑日志，记录旧值，用于事务回滚和 MVCC；binlog 是 Server 层逻辑日志，追加写，用于主从复制和按时间点恢复（PITR）。事务提交时通过两阶段提交协调 redo log 和 binlog，避免两者不一致。

## 详细机制

### 日志分类总览

| 日志 | 所属层 | 作用 | 写入方式 |
|------|--------|------|---------|
| redo log | InnoDB | 崩溃恢复，保证持久性 | 循环写 |
| undo log | InnoDB | 事务回滚，MVCC | 随数据页刷盘 |
| binlog | Server | 主从复制，PITR 恢复 | 追加写 |
| relay log | Server（从库） | 暂存主库 binlog，供回放 | 追加写 |
| error log | Server | 记录启动/运行/告警错误 | 追加写 |
| slow query log | Server | 记录慢 SQL | 追加写 |
| general log | Server | 记录所有 SQL | 追加写 |
| ddl log | Server | 记录 DDL 操作元数据 | 元数据 |

### 三大日志对比

| 维度 | redo log | undo log | binlog |
|------|---------|---------|--------|
| 所属层 | InnoDB | InnoDB | Server |
| 日志类型 | 物理日志 | 逻辑日志 | 逻辑日志 |
| 记录内容 | 数据页的物理修改 | 修改前的旧值 | SQL 或行变更 |
| 写入方式 | 循环写 | 随 undo 页刷盘 | 追加写 |
| 用途 | 崩溃恢复 | 回滚 + MVCC | 复制 + PITR |
| 保证特性 | 持久性 | 原子性 + 隔离性 | 复制一致性 |

### 各日志的典型问题

- **redo log**：写满会阻塞业务（强制刷脏页）；循环写意味着历史记录会被覆盖。
- **undo log**：长事务持有旧 ReadView 导致 purge 受阻，回滚段膨胀。
- **binlog**：格式（STATEMENT/ROW/MIXED）影响复制一致性；刷盘策略影响丢数据风险。
- **relay log**：从库 IO 线程拉取、SQL 线程回放，单线程回放是主从延迟主因。

### 日志相关参数速查

```sql
-- redo log 刷盘策略（0/1/2）
SHOW VARIABLES LIKE 'innodb_flush_log_at_trx_commit';

-- binlog 刷盘策略（0/1/N）
SHOW VARIABLES LIKE 'sync_binlog';

-- binlog 格式（STATEMENT/ROW/MIXED）
SHOW VARIABLES LIKE 'binlog_format';

-- 慢查询开关与阈值
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';

-- 错误日志位置
SHOW VARIABLES LIKE 'log_error';
```

## 实战场景

| 场景 | 用到的日志 | 说明 |
|------|----------|------|
| 崩溃后恢复已提交事务 | redo log | 重放 redo log 恢复脏页 |
| 误删数据恢复 | binlog + 全量备份 | binlog 增量重放到误操作前 |
| 主从复制 | binlog + relay log | 主库 binlog → 从库 relay log → 回放 |
| 慢 SQL 排查 | slow query log | `long_query_time` 阈值过滤 |
| 启动失败排查 | error log | 查看启动错误堆栈 |
| MVCC 一致性读 | undo log | 沿版本链找可见版本 |

## 深挖追问

### 1. 为什么 binlog 不能替代 redo log？

binlog 是逻辑日志，记录“做了什么操作”，不知道数据页的物理状态，无法在崩溃后恢复“已修改但未刷盘的脏页”。更重要的是，binlog 在事务提交时才一次性写入，事务执行中途崩溃 binlog 里没记录，但内存里数据已被修改（虽然是未提交）。redo log 是物理日志，记录“哪个页哪个偏移改成什么”，且事务执行过程中就持续写入，崩溃后能精确重放。所以 redo log 是 crash-safe 的关键，binlog 不是。

### 2. 为什么 redo log 不能替代 binlog？

redo log 是循环写，旧记录会被覆盖，无法保留全量历史，不能用于按时间点恢复。redo log 属于 InnoDB，无法跨引擎传播，也不能用于主从复制（从库需要逻辑日志回放）。binlog 追加写、保留全量、Server 层产出，是复制和归档恢复的基石。

### 3. general log 为什么线上不建议开？

general log 记录每一条 SQL，写放大严重，会拖慢业务、占满磁盘。只在排查特定问题时短暂开启。slow log 只记录慢 SQL，开销小很多，可以长期开。

### 4. relay log 什么时候清理？

从库回放完 relay log 中的事件后，由 SQL 线程自动清理。`relay_log_purge=ON`（默认）开启自动清理，`relay_log_retention` 控制保留时长。

### 5. error log 在哪看？

```sql
SHOW VARIABLES LIKE 'log_error';
```

Linux 下通常在 `/var/log/mysql/error.log` 或数据目录下。启动失败、InnoDB 异常、复制错误都会写到这里，是排查 MySQL 故障的第一站。

## 易错点

- 把 redo log 当作复制日志：复制用 binlog，redo log 只用于崩溃恢复。
- 以为 undo log 只用于回滚：还服务于 MVCC 一致性读。
- 以为 binlog 是物理日志：binlog 是逻辑日志，redo log 才是物理日志。
- 长期开 general log：写放大严重，线上禁用。
- 不知道 slow log 阈值单位：`long_query_time` 单位是秒，默认 10，常调到 1。

## 总结

MySQL 日志分 Server 层（binlog、relay log、error log、slow log、general log）和 InnoDB 层（redo log、undo log）。三大核心日志中，redo log 保证持久性、undo log 保证原子性和 MVCC、binlog 保证复制和恢复，三者通过两阶段提交协同。下一步应分别深入每个日志的写入时机、刷盘策略和配合流程。

## 参考资料

- [MySQL 8.0 Reference Manual: Server Logs](https://dev.mysql.com/doc/refman/8.0/en/server-logs.html)
- [MySQL 8.0 Reference Manual: InnoDB Redo Log](https://dev.mysql.com/doc/refman/8.0/en/innodb-redo-log.html)

---
