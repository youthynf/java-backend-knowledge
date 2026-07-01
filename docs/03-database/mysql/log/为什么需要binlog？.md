# 为什么需要 binlog

## 核心概念

binlog 是 MySQL Server 层的逻辑日志，记录所有写入性操作（DDL + DML，不记录 SELECT）。它是 MySQL 原生日志，所有存储引擎共享，与 InnoDB 的 redo log、undo log 不同层次。

binlog 解决两个核心问题：主从复制和数据恢复。主库把 binlog 传给从库回放，实现数据同步；备份恢复时用全量备份 + binlog 增量重放，恢复到任意时间点（PITR）。

binlog 不参与 crash-safe（那是 redo log 的职责），但通过两阶段提交与 redo log 协同，保证主从数据一致。

## 标准回答

> binlog 是 MySQL Server 层逻辑日志，追加写，所有引擎共享，用于主从复制和按时间点恢复（PITR）。它有三种格式：STATEMENT 记录 SQL 原文（小但动态函数可能不一致）、ROW 记录行变更（大但精确）、MIXED 自动选择。事务执行时 binlog 先写 binlog cache，提交时写到 binlog 文件，刷盘由 `sync_binlog` 控制（0/1/N）。binlog 与 redo log 通过两阶段提交协调，保证主库恢复数据与 binlog 一致，从而保证主从一致。

## 实现原理

### binlog 是什么

- **层次**：Server 层，所有存储引擎共享
- **类型**：逻辑日志，记录 SQL 语句或行变更
- **写入**：追加写，写满一个文件切下一个，不覆盖历史
- **内容**：所有写入操作（INSERT/UPDATE/DELETE/DDL），不记录 SELECT/SHOW
- **粒度**：事务提交时一次性写入（事务内多语句合并）

### binlog 与 redo log 的区别

| 维度 | binlog | redo log |
|------|--------|---------|
| 层次 | Server 层 | InnoDB 层 |
| 类型 | 逻辑日志 | 物理日志 |
| 内容 | SQL 或行变更 | 数据页物理修改 |
| 写入 | 追加写，全量保留 | 循环写，会被覆盖 |
| 用途 | 复制 + PITR | 崩溃恢复 |
| 引擎 | 所有引擎共享 | InnoDB 专属 |
| 时机 | 事务提交时一次性写 | 事务执行过程持续写 |

### binlog 三种格式

| 格式 | 记录内容 | 优点 | 缺点 |
|------|---------|------|------|
| STATEMENT | SQL 原文 | 日志小，从库回放快 | `NOW()`、`UUID()`、`RAND()` 等动态函数主从不一致 |
| ROW | 行级变更（前镜像+后镜像） | 精确，无动态函数问题 | 日志大，批量更新产生大量行记录 |
| MIXED | 自动选择 | 兼顾两者 | 复杂度略高 |

MySQL 5.7+ 默认 ROW 格式，能规避 STATEMENT 的动态函数不一致问题，是生产推荐配置。

### binlog 写入与刷盘

事务执行时，binlog 先写到线程私有的 binlog cache（`binlog_cache_size` 控制，默认 32KB），事务提交时再写到 binlog 文件。一个事务的 binlog 不能拆开，必须一次性写入，保证从库回放时事务原子性。

写入分两步：

- **write**：写到 binlog 文件，但实际只到 OS Page Cache，不强制落盘
- **fsync**：从 Page Cache 持久化到磁盘

`sync_binlog` 控制刷盘策略：

| 取值 | 行为 | 丢失风险 |
|------|------|---------|
| 0 | 提交时只 write，由 OS 决定 fsync | OS 崩溃丢 binlog |
| 1（双 1） | 每次提交都 fsync | 不丢 |
| N（>1） | 累积 N 个事务后 fsync | 崩溃丢 N 个事务 binlog |

### 主从复制三阶段

binlog 是主从复制的基石。复制流程：

```
阶段一：主库写 binlog
   主库执行事务 → 写 binlog → 提交事务 → 更新本地数据

阶段二：同步 binlog
   从库 IO 线程连接主库 Binlog Dump 线程
   → 主库推送 binlog 事件
   → 从库 IO 线程写入 relay log

阶段三：回放 binlog
   从库 SQL 线程读 relay log
   → 重放 binlog 事件
   → 更新从库存储引擎数据
```

文字流程图：

```
主库                          从库
事务提交                       |
  ↓                            |
写 binlog                      |
  ↓                            |
Binlog Dump 线程 ──网络──→ IO 线程
                                ↓
                            relay log
                                ↓
                            SQL 线程
                                ↓
                            回放更新数据
```

### 复制模型

| 模型 | 行为 | 适用 |
|------|------|------|
| 异步复制（默认） | 主库不等从库确认 | 高性能，主库崩溃可能丢数据 |
| 半同步复制 | 主库等至少一个从库收到 binlog | 数据安全，写延迟增加 |
| 全同步 | 主库等所有从库回放完 | 几乎不用，性能差 |
| 组复制 MGR | 基于 Paxos 多数派 | 强一致高可用 |

## 代码示例

查看 binlog 配置：

```sql
-- binlog 格式
SHOW VARIABLES LIKE 'binlog_format';

-- 刷盘策略
SHOW VARIABLES LIKE 'sync_binlog';

-- binlog cache 大小
SHOW VARIABLES LIKE 'binlog_cache_size';

-- binlog 过期天数（自动清理）
SHOW VARIABLES LIKE 'binlog_expire_logs_seconds';

-- 查看当前 binlog 文件列表
SHOW BINARY LOGS;

-- 查看当前正在写入的 binlog
SHOW MASTER STATUS;

-- 查看某个 binlog 文件内容
SHOW BINLOG EVENTS IN 'mysql-bin.000001' LIMIT 10;
```

用 mysqlbinlog 工具解析 binlog：

```bash
mysqlbinlog --start-datetime="2025-06-01 00:00:00" \
            --stop-datetime="2025-06-01 12:00:00" \
            mysql-bin.000001 > recover.sql
```

误删数据恢复（PITR）：

```bash
# 1. 恢复最近的全量备份
mysql < full_backup.sql

# 2. 重放 binlog 到误操作前
mysqlbinlog --stop-datetime="2025-06-01 10:59:59" \
            mysql-bin.000001 mysql-bin.000002 | mysql
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 主从复制 | binlog + relay log | 异步复制有延迟，关键读走主库 |
| 误删恢复 | 全量备份 + binlog 重放 | 找准误操作前的时间点 |
| 数据同步到 ES/数仓 | Canal 解析 binlog | 延迟与主从复制同等 |
| 审计 | binlog 解析变更历史 | ROW 格式能精确到行 |
| 闪回 | binlog 反向 SQL | 需工具如 binlog2sql，依赖 ROW 格式 |

## 深挖追问

### 1. 为什么有了 binlog 还要 redo log？

历史原因和职责分工。MySQL 早期只有 MyISAM，没有 crash-safe，binlog 只用于归档。InnoDB 加入后需要 crash-safe，引入 redo log。两者职责不同：redo log 是物理日志、循环写、InnoDB 专属、用于崩溃恢复；binlog 是逻辑日志、追加写、Server 层、用于复制和 PITR。无法互相替代。

### 2. STATEMENT 格式为什么有主从不一致问题？

`NOW()`、`UUID()`、`RAND()`、`USER()` 等函数依赖执行上下文，主从执行结果不同。比如主库 `INSERT t VALUES(UUID())` 生成 uuid-A，从库回放这条 SQL 生成 uuid-B，主从数据不一致。ROW 格式记录具体行值，能规避此问题。

### 3. binlog 写多大算大？怎么清理？

`binlog_expire_logs_seconds`（8.0+，原 `expire_logs_days`）控制自动过期清理，默认 30 天。生产中根据磁盘容量调整，通常保留 7-30 天。手动清理用 `PURGE BINARY LOGS TO 'mysql-bin.000010'` 或 `PURGE BINARY LOGS BEFORE '2025-06-01 00:00:00'`，注意不要清理从库还没同步的 binlog。

### 4. 一个事务的 binlog 能被拆开吗？

不能。binlog 以事务为单位写入，事务执行过程中 binlog 在 binlog cache 累积，提交时一次性写入 binlog 文件。这样从库回放时整个事务原子执行，不会出现半事务状态。这也是为什么大事务 binlog 体积大、从库回放慢。

### 5. binlog 与 redo log 怎么保证一致性？

通过两阶段提交。事务提交时先写 redo log（prepare 状态），再写 binlog，最后把 redo log 改为 commit 状态。崩溃恢复时若 redo log 是 prepare 但 binlog 完整，则提交；若 binlog 不完整，则回滚。详见 [为什么需要两阶段提交](为什么需要两阶段提交？.md)。

## 易错点

- 以为 binlog 用于崩溃恢复：崩溃恢复用 redo log，binlog 用于复制和 PITR。
- 以为 binlog 是物理日志：binlog 是逻辑日志，redo log 才是物理日志。
- 以为 binlog 实时落盘：默认 `sync_binlog` 不一定是 1，可能丢数据。
- STATEMENT 格式主从不一致：动态函数问题，生产建议 ROW。
- 大事务导致 binlog 暴涨：单事务 binlog 不能拆，大事务一次性写入。

## 总结

binlog 是 MySQL Server 层逻辑日志，追加写、全量保留，用于主从复制和按时间点恢复。三种格式中 ROW 是生产推荐。写入分 write 和 fsync 两步，`sync_binlog` 控制刷盘策略。binlog 不参与 crash-safe，但通过两阶段提交与 redo log 协同保证主从一致。生产中要监控 binlog 大小、过期清理和主从延迟。

## 参考资料

- [MySQL 8.0 Reference Manual: The Binary Log](https://dev.mysql.com/doc/refman/8.0/en/binary-log.html)
- [MySQL 8.0 Reference Manual: Replication Formats](https://dev.mysql.com/doc/refman/8.0/en/replication-formats.html)

---
