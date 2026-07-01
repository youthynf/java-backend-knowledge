# 一条 UPDATE 语句执行期间发生了什么

## 核心概念

一条 `UPDATE` 语句的执行链路与 `SELECT` 高度相似：都要走连接器 → 解析器 → 预处理器 → 优化器 → 执行器 → 存储引擎。差异在执行阶段：UPDATE 不只是读数据，还要修改数据，并产生 redo log、undo log、binlog 三种日志，通过"两阶段提交"保证崩溃恢复和主从一致。

UPDATE 的核心机制是 **WAL（Write-Ahead Logging）**：先写日志，再改磁盘。InnoDB 不会立即把脏页刷盘，而是先把修改写到 redo log（顺序写，快），后台线程择机把脏页刷盘（随机写，慢）。这让 MySQL 在保证持久性的同时获得高写入吞吐。

两阶段提交（2PC）是 UPDATE 流程的精髓：redo log prepare → binlog 写盘 → redo log commit。这套机制确保崩溃恢复时 redo log 与 binlog 状态一致，避免主从数据漂移。

## 标准回答

> 一条 UPDATE 语句先走和 SELECT 一样的 Server 层链路（连接 → 解析 → 预处理 → 优化 → 执行），执行阶段调用 InnoDB 接口定位记录。InnoDB 先写 undo log（用于回滚和 MVCC），修改 Buffer Pool 中的数据页（标记为脏页），写 redo log（prepare 状态）；执行器写 binlog 到 binlog cache；事务提交时 binlog 刷盘，再把 redo log 状态改成 commit。这就是两阶段提交，保证 redo log 与 binlog 一致。

核心要点：

1. **Server 层链路**：与 SELECT 相同，连接 → 解析 → 预处理 → 优化 → 执行。
2. **InnoDB 修改**：undo log → 改 Buffer Pool 脏页 → redo log。
3. **WAL**：先写 redo log，脏页延迟刷盘。
4. **两阶段提交**：redo log prepare → binlog 写盘 → redo log commit。
5. **三种日志协作**：redo log 崩溃恢复、undo log 回滚和 MVCC、binlog 主从复制。

## 详细机制

### 1. 前置阶段：与 SELECT 相同

```sql
UPDATE user SET name = 'xiaoming' WHERE id = 1;
```

- **连接器**：认证 + 权限校验
- **解析器**：词法/语法分析，识别 `UPDATE` 语句
- **预处理器**：检查表 `user`、字段 `name`、`id` 是否存在，权限是否够
- **优化器**：`WHERE id = 1` 命中主键，决定用主键索引
- **执行器**：调用 InnoDB 接口执行更新

### 2. 执行阶段：InnoDB 真正改数据

#### 2.1 定位记录

执行器调用 InnoDB 接口，按主键索引 B+Tree 找到 `id = 1` 这一行。如果数据页在 Buffer Pool 中直接返回；否则从磁盘加载该页到 Buffer Pool。

#### 2.2 旧值对比（更新优化）

执行器拿到记录后，比较更新前后的值。如果完全相同（如把 `name` 从 `'xiaoming'` 改成 `'xiaoming'`），不再走后续更新流程，直接返回，节省日志开销。

#### 2.3 写 undo log

InnoDB 在修改数据前，先把旧值写入 undo log。这条 undo log 记录"如何把数据改回原样"，用于：

- 事务回滚：`ROLLBACK` 时按 undo log 还原
- MVCC：一致性读（RR/RC 隔离级别）通过 undo log 构建历史版本

undo log 写入 Buffer Pool 的 Undo 页面，并产生对应的 redo log（undo log 本身也要持久化）。

#### 2.4 修改 Buffer Pool 中的数据页

InnoDB 在内存中直接修改 Buffer Pool 里的数据页，把该页标记为脏页（dirty page）。此时磁盘上的数据还没改。

#### 2.5 写 redo log（prepare 状态）

把"对哪个数据页做了什么修改"写到 redo log buffer，并刷到 redo log 文件。这一步把 redo log 对应的事务状态标记为 `prepare`。

redo log 是物理日志，记录"页 X 偏移 Y 处改成值 Z"，顺序写、固定大小、循环覆盖。崩溃恢复时按 redo log 重放，把已提交但未刷盘的修改重新应用。

#### 2.6 写 binlog

执行器把这条 UPDATE 对应的逻辑变更（SQL 或行变更）写入 binlog cache（server 层维护的内存缓冲）。事务提交时统一刷到磁盘上的 binlog 文件。

binlog 是逻辑日志，记录"语句/行变更"，主要用于主从复制和数据备份恢复。

### 3. 提交阶段：两阶段提交

```
                  ┌── redo log prepare ──┐
                  │                      │
InnoDB 更新 ─────►│                      ├──► binlog 写盘 ──► redo log commit
                  │                      │
                  └──────────────────────┘
```

**两阶段提交步骤**：

1. **prepare 阶段**：InnoDB 把 redo log 写盘，事务状态置为 `PREPARE`。
2. **commit 阶段**：Server 层把 binlog 写盘，然后 InnoDB 把 redo log 状态置为 `COMMIT`。

崩溃恢复规则：

- 如果 redo log 已 `COMMIT`：事务已提交，恢复完成。
- 如果 redo log 是 `PREPARE` 且 binlog 完整：提交事务（因为 binlog 可能已被从库消费）。
- 如果 redo log 是 `PREPARE` 且 binlog 不完整：回滚事务。

这套机制确保 redo log 与 binlog 状态一致，避免主从数据漂移。

### 4. 后台刷盘

脏页不会立即刷盘，由后台线程（`buf_flush_thread`）择机刷盘。触发刷盘的场景：

- redo log 写满，必须推进 checkpoint
- Buffer Pool 空闲页不足
- MySQL 正常关闭
- 手动 `FLUSH TABLES`

## 代码示例

观察 UPDATE 涉及的日志：

```sql
CREATE TABLE `user` (
  `id` BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `age` INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT INTO `user` (id, name, age) VALUES (1, 'alice', 18);

-- 开启事务观察日志流程
START TRANSACTION;
UPDATE `user` SET name = 'xiaoming' WHERE id = 1;
COMMIT;

-- 查看 binlog
SHOW BINARY LOGS;
SHOW BINLOG EVENTS IN 'mysql-bin.000001' LIMIT 5;
```

`mysqldump` 备份 + binlog 重放是经典恢复方案：

```bash
# 全量备份
mysqldump -u root -p --single-transaction --master-data=2 mydb > backup.sql

# 重放 binlog 到故障前
mysqlbinlog --start-position=107 --stop-position=1234 mysql-bin.000001 | mysql -u root -p
```

## 实战场景

| 场景 | 关注点 |
|------|--------|
| 主从数据不一致 | 两阶段提交是否被破坏、binlog 格式 |
| 崩溃恢复 | redo log 重放是否完整 |
| 大事务回滚慢 | undo log 太大、`ROLLBACK` 慢 |
| 主从延迟 | binlog 写入量、从库回放速度 |
| 误操作回滚 | 闪回工具（binlog2sql）按 binlog 反解析 |
| 写入吞吐调优 | redo log 大小、`innodb_flush_log_at_trx_commit` |

## 深挖追问

### 为什么需要两阶段提交？

redo log 和 binlog 是两个独立的日志系统：redo log 是 InnoDB 引擎层物理日志，binlog 是 Server 层逻辑日志。如果不用两阶段提交，可能出现：

- 先写 redo log 后崩溃，binlog 没写：主库恢复后事务已提交，从库没收到，主从不一致。
- 先写 binlog 后崩溃，redo log 没写：主库恢复后事务回滚，从库却收到了，主从不一致。

两阶段提交让 redo log 的状态依赖 binlog 是否完整，保证两个日志最终一致。

### redo log 和 binlog 有什么区别？

| 维度 | redo log | binlog |
|------|----------|--------|
| 层级 | InnoDB 引擎层 | MySQL Server 层 |
| 类型 | 物理日志（页 + 偏移 + 值） | 逻辑日志（语句/行变更） |
| 写入 | 顺序写、循环覆盖 | 顺序追加 |
| 用途 | 崩溃恢复 | 主从复制、备份恢复 |
| 大小 | 固定 | 持续增长 |
| 所有引擎 | 仅 InnoDB | 所有引擎 |

### innodb_flush_log_at_trx_commit 怎么选？

- `=1`（默认）：每次事务提交都刷盘，最强持久性，性能最低。
- `=0`：每秒刷盘一次，崩溃丢 1 秒数据。
- `=2`：每次提交写到 OS Buffer，每秒 fsync 一次，崩溃丢 1 秒数据（OS 不崩则不丢）。

生产交易核心必须 `=1`；非核心可 `=2` 换性能。

### sync_binlog 怎么选？

- `=1`：每次提交都 fsync binlog，最强一致性。
- `=N`：每 N 次提交 fsync 一次。
- `=0`：由 OS 决定 fsync 时机。

主从复制场景通常 `sync_binlog=1` + `innodb_flush_log_at_trx_commit=1`，即"双 1"配置。

### 为什么大事务回滚慢？

undo log 记录了反向操作。事务越大，undo log 越大，`ROLLBACK` 时按 undo log 反向执行越慢。生产应避免长事务、大事务，及时提交。

## 易错点

- 把 redo log 当成 binlog 的别名，两者层级、格式、用途都不同。
- 以为脏页立即刷盘。实际是 WAL，脏页延迟刷盘。
- 以为两阶段提交只是为了主从复制。它也保证崩溃恢复一致性。
- 把 `innodb_flush_log_at_trx_commit=0` 用在交易核心，崩溃丢数据。
- 大事务长时间不提交，导致 undo log 膨胀、回滚段压力大。
- 误以为 `ROLLBACK` 没成本，实际 undo log 反向执行可能很慢。

## 总结

一条 UPDATE 的 Server 层链路与 SELECT 相同，差异在执行阶段：InnoDB 先写 undo log，再改 Buffer Pool 脏页，写 redo log（prepare），然后 Server 层写 binlog，最后 redo log 置 commit。这就是两阶段提交，保证 redo log 与 binlog 一致。redo log 用于崩溃恢复，undo log 用于回滚和 MVCC，binlog 用于主从复制和备份恢复。生产核心库应配置"双 1"（`innodb_flush_log_at_trx_commit=1` + `sync_binlog=1`）。

## 参考资料

- [MySQL 8.0 InnoDB Redo Log](https://dev.mysql.com/doc/refman/8.0/en/innodb-redo-log.html)
- [MySQL 8.0 Binary Log](https://dev.mysql.com/doc/refman/8.0/en/binary-log.html)
- [MySQL 8.0 InnoDB Undo Log](https://dev.mysql.com/doc/refman/8.0/en/innodb-undo-logs.html)
- [MySQL 8.0 Two-Phase Commit](https://dev.mysql.com/doc/refman/8.0/en/binary-log-group-commit.html)

---
