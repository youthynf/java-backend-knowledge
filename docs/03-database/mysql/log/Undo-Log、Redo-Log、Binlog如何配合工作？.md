# Undo-Log、Redo-Log、Binlog 如何配合工作

## 核心概念

undo log、redo log、binlog 是 InnoDB 事务体系的三大日志，分工明确又协同配合。undo log 保证原子性和 MVCC，redo log 保证持久性，binlog 保证主从复制和 PITR。三者通过两阶段提交协调，共同实现 ACID 和 crash-safe。

理解三者配合的关键是把“一条 UPDATE 语句的完整生命周期”走一遍：从读数据页到改内存、写 undo、写 redo、提交时写 binlog、崩溃恢复，每一步哪个日志干什么。这条主线串起来，三大日志的职责边界和配合逻辑就清晰了。

## 标准回答

> 三大日志分工：undo log 记录旧值用于回滚和 MVCC，redo log 记录物理修改用于崩溃恢复，binlog 记录逻辑变更用于复制和 PITR。一条 UPDATE 的流程是：加载页到 Buffer Pool → 写 undo log → 改 Buffer Pool 脏页 → 写 redo log buffer → 事务提交时两阶段提交（redo prepare → binlog write → redo commit）→ 异步刷脏页。undo log 自身修改也受 redo log 保护。崩溃恢复时按 redo log 重放脏页，对 PREPARE 状态事务按 binlog 完整性决定提交或回滚。三者通过两阶段提交保证一致性。

## 详细机制

### 三大日志职责对比

| 维度 | undo log | redo log | binlog |
|------|---------|---------|--------|
| 所属层 | InnoDB | InnoDB | Server |
| 日志类型 | 逻辑日志 | 物理日志 | 逻辑日志 |
| 记录内容 | 修改前旧值 | 数据页物理修改 | SQL 或行变更 |
| 写入方式 | 随 undo 页刷盘 | 循环写 | 追加写 |
| 保证特性 | 原子性 + 隔离性 | 持久性 | 复制一致性 |
| 用途 | 回滚 + MVCC | 崩溃恢复 | 复制 + PITR |

### 一条 UPDATE 的完整流程

以 `UPDATE user SET name='Li' WHERE id=1`（原 name='Wang'）为例：

```
【阶段一：执行修改，先留后路】

1. 加载数据页
   InnoDB 把 id=1 所在数据页从磁盘加载到 Buffer Pool（若不在）

2. 写 undo log
   生成 undo log：记录 id=1 的 name 旧值 'Wang'
   undo log 写入 Buffer Pool 的 undo 页
   关键：写 undo 页也产生 redo log（保护 undo log 持久性）

3. 更新 Buffer Pool
   把 Buffer Pool 中 name 改为 'Li'
   该数据页标记为脏页
   更新行的 trx_id = 当前事务 ID
   更新行的 roll_pointer → 新生成的 undo log

4. 写 redo log buffer
   记录该数据页的物理修改
   记录 undo 页的修改（步骤 2 产生的）
   全部进 redo log buffer


【阶段二：两阶段提交，保证一致性】

5. Prepare 阶段
   redo log 写入 redo log file，状态置为 PREPARE
   redo log fsync（innodb_flush_log_at_trx_commit=1 时）

6. 写 binlog
   Server 层把这条 UPDATE 的 binlog 写入 binlog 文件
   binlog fsync（sync_binlog=1 时）

7. Commit 阶段
   InnoDB 把 redo log 状态改为 COMMIT
   返回客户端成功


【阶段三：异步刷脏页】

8. 后台线程把 Buffer Pool 脏页刷到 .ibd 文件
   推进 Checkpoint
   redo log 对应位置可被覆盖复用
```

### WAL 流程图（文字版）

```
客户端 UPDATE
    ↓
[Buffer Pool 加载/修改数据页] ← 内存操作
    ↓
[写 undo log 到 undo 页] ← Buffer Pool
    ↓
[写 redo log buffer] ← 含数据页修改 + undo 页修改
    ↓
事务提交 ─────────────────────────────┐
    ↓                                  │
[redo log PREPARE + fsync]            │ 两阶段
    ↓                                  │ 提交
[binlog write + fsync]                │
    ↓                                  │
[redo log COMMIT]                     │
    ↓                                  │
返回客户端成功 ───────────────────────┘
    ↓（异步）
[后台线程刷脏页到 .ibd]
    ↓
[推进 Checkpoint，redo log 可覆盖]
```

### 崩溃恢复的两个场景

MySQL 重启后扫描 redo log，对 PREPARE 状态事务判断：

**场景 A：redo log PREPARE 后、binlog 写入前崩溃**

```
崩溃时刻：redo log 已 PREPARE 刷盘，binlog 未写
恢复：
  扫描 redo log 发现 PREPARE 事务
  拿 XID 查 binlog → 没找到（binlog 不完整）
  → 用 undo log 回滚事务
  → 主库数据回到旧值 name='Wang'
  → binlog 没记录，从库也不会回放
  → 主从一致（都没生效）
```

**场景 B：binlog 写入后、redo log COMMIT 前崩溃**

```
崩溃时刻：binlog 已完整写入，redo log 状态还是 PREPARE
恢复：
  扫描 redo log 发现 PREPARE 事务
  拿 XID 查 binlog → 找到（binlog 完整）
  → 提交事务（重放 redo log 恢复脏页）
  → 主库数据 name='Li'
  → binlog 已记录，从库会回放
  → 主从一致（都生效）
```

两种场景都保证主从一致，这就是两阶段提交的价值。

### 三者的依赖关系

- undo log 修改受 redo log 保护（undo 页是数据页，修改产生 redo log）
- redo log 与 binlog 通过两阶段提交协调
- binlog 是事务“对外可见”的标志（一旦写入，从库可能拿到）
- MVCC 一致性读依赖 undo log 版本链 + ReadView
- 崩溃恢复依赖 redo log 重放 + binlog 完整性判断

## 代码示例

观察三者配合（开两个会话）：

```sql
-- 会话 A
BEGIN;
UPDATE user SET name='Li' WHERE id=1;
-- 此时：Buffer Pool 脏页已改、undo log 已写、redo log buffer 已写
-- 但事务未提交，redo log 状态不是 COMMIT
SELECT * FROM user WHERE id=1;  -- 当前事务能看到 'Li'（自己改的可见）
COMMIT;
-- 此刻：两阶段提交完成，binlog 写入，redo log COMMIT

-- 会话 B（RR）
BEGIN;
SELECT * FROM user WHERE id=1;  -- 看到旧值 'Wang'（沿 undo 版本链）
-- 会话 A COMMIT 后
SELECT * FROM user WHERE id=1;  -- 仍看到 'Wang'（ReadView 复用）
COMMIT;
```

查看三者状态：

```sql
-- redo log 状态
SHOW ENGINE INNODB STATUS\G
-- 关注 LOG 段的 LSN

-- binlog 状态
SHOW MASTER STATUS;
SHOW BINARY LOGS;

-- undo log 状态（活跃事务）
SELECT trx_id, trx_started, trx_rows_modified, trx_query
FROM information_schema.innodb_trx;
```

## 实战场景

| 场景 | 三者如何配合 | 关键点 |
|------|-------------|--------|
| 正常事务提交 | undo + redo + binlog 两阶段提交 | 双 1 保证不丢 |
| 事务回滚 | undo log 反向操作 | redo log 也回滚 |
| 崩溃恢复 | redo log 重放 + binlog 判断 | PREPARE 看 binlog 完整性 |
| 主从复制 | 主库 binlog → 从库 relay log → 回放 | 异步有延迟 |
| MVCC 一致性读 | undo log 版本链 + ReadView | 长事务阻碍 purge |
| 误删恢复 | 全量备份 + binlog 重放 | 需 ROW 格式 |

## 深挖追问

### 1. 为什么 undo log 修改也要写 redo log？

undo log 存在于 undo 页中，undo 页本身是数据页。事务执行过程中 undo 页在 Buffer Pool 修改，如果崩溃时 undo 页没刷盘，事务回滚就失去依据。所以 undo 页的修改也产生 redo log，崩溃后用 redo log 恢复 undo 页，再按 undo log 回滚事务。

### 2. redo log 和 binlog 谁先写？

redo log 先写（PREPARE 阶段），binlog 后写，最后 redo log 改 COMMIT。这是两阶段提交的固定顺序。崩溃恢复时依赖这个顺序判断：PREPARE 状态的 redo log + 完整 binlog → 提交；PREPARE + 不完整 binlog → 回滚。

### 3. 为什么不把三个日志合并成一个？

职责不同无法合并。undo 是逻辑日志用于回滚/MVCC，redo 是物理日志用于崩溃恢复，binlog 是逻辑日志用于复制/PITR。redo 必须循环写控制空间，binlog 必须追加写保留全量，undo 必须随 undo 页刷盘。合并会破坏各自的特性。

### 4. 崩溃恢复时 redo log 重放会重复执行已刷盘的修改吗？

可能会，但幂等。redo log 是物理日志，记录“把页 X 偏移 Y 改为值 Z”，重放时按 LSN 判断：如果数据页的 `FIL_PAGE_LSN` 已经大于 redo log 记录的 LSN，说明该修改已应用，跳过；否则应用。所以重放是幂等的，不会产生错误数据。

### 5. 长事务如何影响三者配合？

长事务持有旧 ReadView，导致 undo log 无法 purge（MVCC 依赖）。同时长事务通常持有锁、产生大量 redo log（redo log buffer 可能不够），提交时 binlog 体量大、从库回放慢。三者都被拖累。治理长事务是数据库运维基本功。

## 易错点

- 以为 undo log 不写 redo log：undo 页是数据页，修改产生 redo log。
- 以为 binlog 参与 crash-safe：crash-safe 靠 redo log，binlog 只参与一致性判断。
- 把两阶段提交顺序搞反：redo PREPARE → binlog → redo COMMIT，顺序固定。
- 以为崩溃恢复只看 redo log：PREPARE 状态要看 binlog 完整性决定提交或回滚。
- 以为三个日志独立无依赖：undo 受 redo 保护，redo 与 binlog 两阶段协调。

## 总结

undo log、redo log、binlog 三大日志分工明确：undo 保原子性和 MVCC，redo 保持久性，binlog 保复制一致性。一条 UPDATE 的流程串联起三者：改 Buffer Pool → 写 undo → 写 redo buffer → 两阶段提交（redo prepare → binlog → redo commit）→ 异步刷脏页。崩溃恢复时 redo log 重放脏页，PREPARE 事务按 binlog 完整性决定提交或回滚。三者通过两阶段提交保证主从一致，是 MySQL ACID 和 crash-safe 的实现基石。

## 参考资料

- [MySQL 8.0 Reference Manual: InnoDB Transaction Model](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-model.html)
- [MySQL 8.0 Reference Manual: InnoDB Redo Log](https://dev.mysql.com/doc/refman/8.0/en/innodb-redo-log.html)

---
