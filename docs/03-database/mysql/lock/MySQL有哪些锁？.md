# MySQL 有哪些锁

## 核心概念

MySQL 的锁按粒度从大到小分为三类：**全局锁**（锁整个数据库）、**表级锁**（锁整张表）、**行级锁**（锁单行或一个范围）。InnoDB 同时支持表锁和行锁，MyISAM/Memory 只支持表锁。行锁是 InnoDB 高并发的核心，但行锁又细分为记录锁、间隙锁、临键锁、插入意向锁，每种的触发条件和冲突关系不同，是面试的重灾区。

按兼容性又可分为**共享锁（S 锁，读锁）**和**排他锁（X 锁，写锁）**：S 锁之间兼容，S/X 互斥，X/X 互斥。意向锁、间隙锁等都是在 S/X 基础上的特化。

## 标准回答

MySQL 锁按粒度分为全局锁、表锁、行锁。全局锁（`FLUSH TABLES WITH READ LOCK`）用于全库备份；表锁包括表级读写锁、元数据锁（MDL）、意向锁（IS/IX）、AUTO-INC 锁；行锁包括记录锁（Record Lock）、间隙锁（Gap Lock）、临键锁（Next-Key Lock）、插入意向锁。InnoDB 行锁锁的是索引记录，RR 隔离级别下默认用 Next-Key Lock 解决幻读。S 锁之间兼容，S/X 与 X/X 互斥。

## 全局锁

```sql
FLUSH TABLES WITH READ LOCK;   -- 加全局读锁
UNLOCK TABLES;                 -- 释放
```

加锁后整个数据库只读，其他线程的 DML/DDL 都阻塞。主要用于全库逻辑备份。

问题：备份期间业务不能写，影响大。InnoDB 替代方案：`mysqldump --single-transaction`，利用 MVCC 在事务内取一致性快照，备份期间业务可正常读写。

## 表级锁

### 1. 表锁（Table Lock）

```sql
LOCK TABLES t READ;    -- 表级共享锁（读锁）
LOCK TABLES t WRITE;   -- 表级排他锁（写锁）
UNLOCK TABLES;
```

- 读锁：当前会话和其他会话都可读，所有会话不能写。
- 写锁：当前会话可读写，其他会话不能读写。

InnoDB 一般不用表锁（用行锁即可），MyISAM 默认就是表锁。

### 2. 元数据锁（MDL，Metadata Lock）

MDL 不需要显式调用，对表做 CRUD 时自动加 MDL 读锁，做 DDL（ALTER TABLE 等）时自动加 MDL 写锁。

- **MDL 读锁**：CRUD 操作期间持有，防止 DDL 修改表结构。
- **MDL 写锁**：DDL 操作期间持有，防止其他事务读写。

MDL 在**事务提交后**才释放（不是语句结束）。这导致一个隐患：长事务持有 MDL 读锁时，DDL 申请 MDL 写锁会阻塞；DDL 一旦进入等待队列，后续所有该表的 CRUD（MDL 读锁申请）也会阻塞（写锁优先级高）。**线上 DDL 前必须先 kill 长事务**。

### 3. 意向锁（IS / IX）

意向锁是表级锁，目的是"快速判断表里是否有行被加锁"。

- 在某行加 S 锁前，先在表级加 IS（意向共享锁）。
- 在某行加 X 锁前，先在表级加 IX（意向排他锁）。

为什么需要？没有意向锁时，事务 A 想给整张表加表锁，必须遍历所有行看是否有行锁——成本极高。有意向锁后，事务 A 只需检查表上是否有 IS/IX 即可，O(1)。

兼容性：

|  | IS | IX |
|---|---|---|
| IS | 兼容 | 兼容 |
| IX | 兼容 | 兼容 |
| 表 S 锁 | 兼容 | 互斥 |
| 表 X 锁 | 互斥 | 互斥 |

意向锁之间互相兼容，只与表级 S/X 锁冲突。

### 4. AUTO-INC 锁

自增主键的赋值通过 AUTO-INC 锁实现。两种模式：

- **传统 AUTO-INC 锁**：表级锁，事务插入时持有，事务提交后才释放。并发插入性能差。
- **轻量级锁**（5.1.22+）：插入语句执行期间持有，赋值完立即释放，不必等事务提交。

通过 `innodb_autoinc_lock_mode` 控制：

| 值 | 模式 | 说明 |
|----|------|------|
| 0 | 传统 AUTO-INC 锁 | 全程持有，并发差 |
| 1 | 混合（5.7 默认） | 普通 INSERT 用轻量级锁；`INSERT...SELECT` 用传统锁 |
| 2 | 轻量级锁（8.0 默认） | 全程轻量级，配合 `binlog_format=row` 保证主从一致 |

8.0 默认 mode=2 + row 格式 binlog，既保证并发又保证主从一致。

## 行级锁（InnoDB 专属）

行锁锁的是**索引记录**，不是数据行本身。如果 WHERE 没走索引，会退化为对每条记录加锁（相当于表锁）。

### 1. 记录锁（Record Lock）

锁住索引上的**一条记录**。是最小粒度的行锁。

```sql
-- 假设 id=10 存在，主键索引
SELECT * FROM user WHERE id = 10 FOR UPDATE;
-- 仅在 id=10 的索引记录上加 X 型记录锁
```

### 2. 间隙锁（Gap Lock）

锁住索引记录之间的**间隙**，防止其他事务在间隙中插入新记录。仅 RR 隔离级别存在（RC 下关闭）。区间是**前开后开** `(a, b)`。

```sql
-- 假设有 id=5, id=10 两条记录
SELECT * FROM user WHERE id = 7 FOR UPDATE;  -- id=7 不存在
-- 加 (5, 10) 间隙锁，其他事务不能插入 id=6,7,8,9
```

间隙锁之间**互相兼容**（多个事务可同时持有重叠间隙的间隙锁），因为间隙锁的目的是"防止插入"，不是"防止读取"。

### 3. 临键锁（Next-Key Lock）

= 记录锁 + 间隙锁，锁住一个**前开后闭**区间 `(a, b]`。RR 隔离级别下默认行锁类型，用于解决幻读。

```sql
-- 假设有 id=5, id=10 两条记录
SELECT * FROM user WHERE id <= 10 FOR UPDATE;
-- 加 (-∞, 5], (5, 10] 临键锁
-- 其他事务不能插入 id<10 的新记录，也不能修改 id<=10 的记录
```

Next-Key Lock 在某些场景下会退化为记录锁或间隙锁（详见 [MySQL 是如何加锁的](MySQL是如何加锁的？.md)）。

### 4. 插入意向锁（Insert Intention Lock）

事务在插入记录前，如果插入位置被其他事务的间隙锁挡住，会等待并申请插入意向锁。插入意向锁之间互相兼容（不同事务可同时在同一间隙插入不同位置的记录），但与间隙锁/临键锁冲突。

插入意向锁名字里有"意向"但其实是行级锁，是间隙锁的特化。

## 共享锁与排他锁

| 锁类型 | S 锁（共享/读） | X 锁（排他/写） |
|--------|----------------|----------------|
| 加锁语句 | `SELECT ... LOCK IN SHARE MODE`（5.7）/ `SELECT ... FOR SHARE`（8.0） | `SELECT ... FOR UPDATE` / `UPDATE` / `DELETE` |
| 兼容性 | S/S 兼容 | S/X、X/X 互斥 |

普通 `SELECT` 不加锁（MVCC 快照读）。`UPDATE/DELETE/SELECT FOR UPDATE` 加 X 锁，`SELECT FOR SHARE` 加 S 锁。

## 锁兼容矩阵

行锁层面（同一索引记录上）：

|  | S 记录锁 | X 记录锁 | S 间隙锁 | X 间隙锁 | S 临键锁 | X 临键锁 |
|---|---|---|---|---|---|---|
| S 记录锁 | 兼容 | 冲突 | 兼容 | 兼容 | 兼容 | 冲突 |
| X 记录锁 | 冲突 | 冲突 | 兼容 | 兼容 | 冲突 | 冲突 |
| S 间隙锁 | 兼容 | 兼容 | 兼容 | 兼容 | 兼容 | 兼容 |
| X 间隙锁 | 兼容 | 兼容 | 兼容 | 兼容 | 兼容 | 兼容 |
| S 临键锁 | 兼容 | 冲突 | 兼容 | 兼容 | 兼容 | 冲突 |
| X 临键锁 | 冲突 | 冲突 | 兼容 | 兼容 | 冲突 | 冲突 |

要点：间隙锁之间永远兼容；记录锁/临键锁的 X 与 S/X 互斥；间隙锁只与"插入意向锁"冲突。

## 代码示例

```sql
-- 加行级共享锁
BEGIN;
SELECT * FROM user WHERE id = 10 FOR SHARE;   -- 8.0 写法
-- 或 5.7: SELECT * FROM user WHERE id = 10 LOCK IN SHARE MODE;
COMMIT;

-- 加行级排他锁
BEGIN;
SELECT * FROM user WHERE id = 10 FOR UPDATE;
-- 业务逻辑
UPDATE user SET name = 'x' WHERE id = 10;
COMMIT;

-- 查看锁情况（8.0）
SELECT * FROM performance_schema.data_locks;
-- LOCK_TYPE: TABLE/RECORD
-- LOCK_MODE: S/X/IS/IX/X,GAP/X,REC_NOT_GAP/X
```

## 实战场景

| 场景 | 锁类型 | 注意点 |
|------|--------|--------|
| 全库备份 | `FLUSH TABLES WITH READ LOCK`（MyISAM）或 `mysqldump --single-transaction`（InnoDB） | InnoDB 务必用后者 |
| 线上 DDL | MDL 写锁 | DDL 前 kill 长事务 |
| 主键等值点查 | 记录锁 | 走索引，否则退化为全表 Next-Key Lock |
| 防止范围被插入 | 间隙锁 / 临键锁 | RR 默认；RC 不防幻读 |
| 自增主键并发插入 | AUTO-INC 锁 | 8.0 mode=2 + row binlog |
| 扣库存 | `SELECT FOR UPDATE` 加 X 记录锁 | 短事务，避免死锁 |

## 深挖追问

### 普通SELECT加什么锁？

不加锁。InnoDB 通过 MVCC 实现一致性读（快照读），读的是历史版本，不阻塞写，也不被写阻塞。只有 `SELECT ... FOR UPDATE` / `FOR SHARE`（当前读）才加锁。

### 间隙锁只在 RR 下存在吗？

是的。RC 隔离级别下间隙锁关闭（除唯一约束检查和外键检查的内部间隙锁外），所以 RC 不防幻读但并发性更好。RR 默认开间隙锁防幻读。

### 行锁锁的是什么？

锁的是**索引记录**，不是数据行。所以 WHERE 必须走索引才高效；不走索引时 InnoDB 会逐行加锁，效果等同于表锁。生产中 `UPDATE/DELETE` 一定要检查执行计划。

###意向锁和 MDL 是同一个东西吗？

不是。MDL 是 Server 层的元数据锁，保护表结构；意向锁是 InnoDB 层的表级锁，标记"表里有行被加锁"。两者层级和目的不同。

### 为什么间隙锁之间兼容？

间隙锁的目的是"防止其他事务在间隙里插入新记录"，不是"防止其他事务读间隙"。两个事务同时持有 `(5, 10)` 间隙锁互不影响，因为它们都在"防止插入"，不会冲突。冲突的是"想插入的事务"（插入意向锁）与"持有间隙锁的事务"。

## 易错点

- 误以为"行锁锁数据行"——锁的是索引记录。
- 误以为"普通 SELECT 也加锁"——快照读不加锁。
- 误以为"间隙锁之间互斥"——间隙锁之间兼容。
- 误以为"RC 也防幻读"——RC 不防，间隙锁只在 RR 默认开。
- 误以为"意向锁和行锁冲突"——意向锁只与表级 S/X 锁冲突，与行锁不冲突。
- 误以为"DDL 立即生效"——DDL 需要等 MDL 写锁，长事务会阻塞 DDL。

## 总结

MySQL 锁按粒度分为全局锁、表锁、行锁。表锁包括表读写锁、MDL、意向锁、AUTO-INC 锁；行锁包括记录锁、间隙锁、临键锁、插入意向锁。InnoDB 行锁锁索引记录，RR 默认用临键锁防幻读。S 锁之间兼容，S/X 与 X/X 互斥；间隙锁之间兼容。普通 SELECT 不加锁（MVCC）。WHERE 不走索引时行锁退化为表锁，生产 `UPDATE/DELETE` 必须检查执行计划。

## 参考资料

- [MySQL 8.0 Reference Manual: InnoDB Locking](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html)
- [MySQL 8.0 Reference Manual: Metadata Locking](https://dev.mysql.com/doc/refman/8.0/en/metadata-locking.html)

---
