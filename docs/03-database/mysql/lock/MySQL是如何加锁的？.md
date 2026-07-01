# MySQL 是如何加锁的

## 核心概念

InnoDB 的行锁加锁规则是面试高频考点，也是线上死锁排查的基础。核心要点：行锁锁的是索引记录；加锁基本单位是**临键锁（Next-Key Lock，前开后闭 `(a, b]`）**；在唯一索引等值查询命中记录、或某些范围查询边界条件下，临键锁会**退化**为记录锁或间隙锁。RR 隔离级别默认按临键锁加锁（防幻读），RC 隔离级别不加间隙锁（除唯一约束检查等内部场景）。

不同 SQL 的加锁范围由四个因素决定：**索引类型（主键/唯一/非唯一）**、**查询类型（等值/范围）**、**记录是否存在**、**隔离级别**。下面按 RR 隔离级别（默认）逐一展开。

## 标准回答

InnoDB 行锁锁的是索引记录，加锁基本单位是 Next-Key Lock（前开后闭 `(a, b]`）。RR 隔离级别下：唯一索引等值查询命中记录时退化为记录锁；唯一索引等值查询未命中时退化为间隙锁；非唯一索引等值查询扫描到第一个不匹配记录时退化为间隙锁；范围查询按 Next-Key Lock 加锁，边界条件决定是否退化。RC 隔离级别下不加间隙锁（除内部约束检查外）。WHERE 不走索引时全表逐行加 Next-Key Lock，效果等同表锁。通过 `performance_schema.data_locks` 查看实际加锁情况。

## 哪些 SQL 会加行锁

普通 `SELECT` 是快照读，不加锁（除 SERIALIZABLE 隔离级别）。加锁的语句：

```sql
-- 当前读，加 S 锁
SELECT ... FOR SHARE;                -- 8.0
SELECT ... LOCK IN SHARE MODE;       -- 5.7

-- 当前读，加 X 锁
SELECT ... FOR UPDATE;

-- DML，加 X 锁
UPDATE ... WHERE ...;
DELETE ... WHERE ...;
INSERT INTO ...;                     -- 插入意向锁 + 唯一性检查
```

行锁在**事务提交或回滚后**释放，不是语句执行完就释放。

## 唯一索引等值查询

### 记录存在 → 退化为记录锁

```sql
-- 表中存在 id=1, 5, 10 三条记录
SELECT * FROM user WHERE id = 5 FOR UPDATE;
-- 加锁: id=5 的记录锁（X, REC_NOT_GAP）
-- 不加间隙锁，因为唯一索引等值命中，记录本身已锁住，幻读不可能发生
```

### 记录不存在 → 退化为间隙锁

```sql
-- 表中存在 id=1, 5, 10 三条记录
SELECT * FROM user WHERE id = 3 FOR UPDATE;
-- 加锁: (1, 5) 间隙锁（X, GAP）
-- 因为 id=3 不存在，需要锁住 (1, 5) 间隙防止其他事务插入 id=2,3,4
```

为什么唯一索引等值未命中退化为间隙锁？因为唯一索引保证了等值条件下最多一条记录，未命中说明这条记录不存在，唯一需要防的是"插入新记录"，间隙锁就够用。

## 唯一索引范围查询

```sql
-- 表中存在 id=15, 20, 25 三条记录
```

### `id > 15`

```sql
SELECT * FROM user WHERE id > 15 FOR UPDATE;
-- 扫描 id>15 的所有记录
-- 加锁: (15, 20], (20, 25], (25, +∞]
-- 因为是严格 >，id=15 本身不锁
```

### `id >= 15`

```sql
SELECT * FROM user WHERE id >= 15 FOR UPDATE;
-- 等值部分 id=15 命中，退化为记录锁
-- 范围部分按 Next-Key Lock
-- 加锁: id=15 记录锁, (15, 20], (20, 25], (25, +∞]
```

### `id < 25`

```sql
SELECT * FROM user WHERE id < 25 FOR UPDATE;
-- 扫描到 id=25（不满足条件）时停止
-- id=25 的 Next-Key Lock (20, 25] 退化为间隙锁 (20, 25)
-- 加锁: (-∞, 15], (15, 20], (20, 25)
```

### `id <= 25`

```sql
SELECT * FROM user WHERE id <= 25 FOR UPDATE;
-- 扫描到 id=25 时仍满足条件，Next-Key Lock (20, 25] 不退化
-- 加锁: (-∞, 15], (15, 20], (20, 25]
```

### `id <= 22`（边界值不存在）

```sql
SELECT * FROM user WHERE id <= 22 FOR UPDATE;
-- 扫描到 id=25（不满足条件）时停止
-- id=25 的 Next-Key Lock (20, 25] 退化为间隙锁 (20, 25)
-- 加锁: (-∞, 15], (15, 20], (20, 25)
```

## 非唯一索引等值查询

非唯一索引因为可能有重复值，加锁规则与唯一索引不同：扫描过程不会因命中而提前停止，而是继续扫描到第一个不匹配的记录。

### 记录存在

```sql
-- 表中存在 age=21, 22, 22, 39 记录（age 上有非唯一索引）
SELECT * FROM user WHERE age = 22 FOR UPDATE;
-- 扫描 age=22 的记录（两条）
-- 加锁:
--   二级索引: (21, 22], (22, 22]  ← 两条 age=22 的 Next-Key Lock
--             (22, 39)  ← 第一个不匹配 age=39 退化为间隙锁
--   主键索引: 两条 age=22 对应的主键记录锁
```

注意：非唯一索引等值查询不会退化为记录锁（因为可能有重复值，必须扫描到第一个不匹配才能确定扫描范围）。

### 记录不存在

```sql
-- 表中存在 age=22, 39 记录
SELECT * FROM user WHERE age = 25 FOR UPDATE;
-- 扫描到 age=39（第一个不匹配）退化为间隙锁
-- 加锁: (22, 39) 间隙锁
-- 不加主键索引锁（无匹配记录）
```

## 非唯一索引范围查询

非唯一索引范围查询**不退化**，全部按 Next-Key Lock 加锁：

```sql
-- 表中存在 age=21, 22, 39 记录
SELECT * FROM user WHERE age >= 22 FOR UPDATE;
-- 加锁:
--   二级索引: (21, 22], (22, 39], (39, +∞]   ← 全部 Next-Key Lock
--   主键索引: age=22, age=39 对应的主键记录锁
```

非唯一索引不退化的原因：非唯一索引允许重复值，单条记录锁无法防止"在记录前后插入相同值"导致幻读，必须用 Next-Key Lock 锁住范围。

## 没有走索引的查询

```sql
-- 表无合适索引
SELECT * FROM user WHERE name = '张三' FOR UPDATE;
-- 全表扫描，每条记录都加 Next-Key Lock
-- 效果等同于表锁
```

这是生产事故的常见来源：`UPDATE/DELETE` 的 WHERE 没走索引，导致全表加锁，所有写操作阻塞。**线上执行 `UPDATE/DELETE/SELECT FOR UPDATE` 前必须用 EXPLAIN 检查是否走索引**。

## RC 隔离级别的差异

RC（Read Committed）下间隙锁关闭，只加记录锁：

```sql
-- RC 隔离级别
SELECT * FROM user WHERE id > 15 FOR UPDATE;
-- 只对实际扫描到的记录加记录锁: id=20, 25, ... 的记录锁
-- 不加间隙锁
-- 所以 RC 不防幻读，但并发性更好
```

RC 下的特例：唯一约束检查和外键检查仍会短暂使用间隙锁。

## 加锁示例汇总表

| SQL | 索引类型 | 记录是否存在 | 加锁范围（RR） |
|-----|----------|--------------|----------------|
| `WHERE id=5 FOR UPDATE` | 主键 | 存在 | id=5 记录锁 |
| `WHERE id=3 FOR UPDATE` | 主键 | 不存在 | (1, 5) 间隙锁 |
| `WHERE id>15 FOR UPDATE` | 主键 | - | (15, 20], (20, 25], (25, +∞] |
| `WHERE id>=15 FOR UPDATE` | 主键 | - | id=15 记录锁 + (15, 20], (20, 25], (25, +∞] |
| `WHERE id<25 FOR UPDATE` | 主键 | - | (-∞, 15], (15, 20], (20, 25) |
| `WHERE id<=25 FOR UPDATE` | 主键 | - | (-∞, 15], (15, 20], (20, 25] |
| `WHERE age=22 FOR UPDATE` | 非唯一 | 存在 | (21, 22], (22, 22], (22, 39) + 主键记录锁 |
| `WHERE age=25 FOR UPDATE` | 非唯一 | 不存在 | (22, 39) 间隙锁 |
| `WHERE age>=22 FOR UPDATE` | 非唯一 | - | (21, 22], (22, 39], (39, +∞] + 主键记录锁 |
| `WHERE name='x' FOR UPDATE` | 无索引 | - | 全表 Next-Key Lock |

## 代码示例

8.0 查看实际加锁情况：

```sql
-- 会话 1
BEGIN;
SELECT * FROM user WHERE id = 5 FOR UPDATE;

-- 会话 2 查看锁
SELECT * FROM performance_schema.data_locks\G
-- 关注:
--   LOCK_TYPE: TABLE（表锁 IS/IX） 或 RECORD（行锁）
--   LOCK_MODE:
--     X              ← Next-Key Lock
--     X, REC_NOT_GAP ← 记录锁
--     X, GAP         ← 间隙锁
--     S, REC_NOT_GAP ← S 型记录锁
--     IX/IS          ← 意向锁
```

排查锁等待：

```sql
-- 查看当前锁等待
SELECT * FROM performance_schema.data_lock_waits;

-- 查看所有事务
SELECT * FROM information_schema.innodb_trx;

-- InnoDB 整体状态（包含死锁信息）
SHOW ENGINE INNODB STATUS\G
```

## 实战场景

| 场景 | SQL 与加锁 | 注意点 |
|------|-----------|--------|
| 主键点查更新 | `WHERE id=? FOR UPDATE` → 记录锁 | 走主键索引，最小锁范围 |
| 唯一性预留插入 | `WHERE id=? FOR UPDATE`（不存在）→ 间隙锁 | 防止其他事务并发插入相同 id |
| 范围批量更新 | `WHERE id BETWEEN ? AND ?` → 多个 Next-Key | 锁范围大，注意事务长度 |
| 非唯一索引查询 | `WHERE age=? FOR UPDATE` → Next-Key + 间隙锁 | 锁范围比唯一索引大 |
| 无索引更新 | `WHERE name=? FOR UPDATE` → 全表 Next-Key | 生产事故高发，必须检查 EXPLAIN |

## 深挖追问

### RR 下为什么默认 Next-Key Lock？

为了解决幻读。幻读是"同一事务内两次相同范围查询，第二次出现新行"。Next-Key Lock 锁住范围 `(a, b]`，阻止其他事务在范围内插入，从而消除幻读。代价是锁范围大、并发降低，所以有些业务会切到 RC 换并发性能（牺牲防幻读）。

### RC 下完全没间隙锁吗？

不是完全没。RC 下唯一约束检查（如 `INSERT` 时检查唯一索引是否冲突）和外键检查仍会短暂使用间隙锁，但用户查询的 `WHERE` 不会触发间隙锁。

### 为什么 `WHERE id >= 15` 等值部分退化，范围部分不退化？

`>=` 包含等值和范围两部分。等值部分（id=15）命中唯一索引，最多一条记录，记录锁就够，所以退化为记录锁。范围部分（id>15）仍需防止插入，按 Next-Key Lock。优化器在 `>=` 时会拆成"等值 + 范围"分别处理。

### 二级索引加锁后为什么还要在主键索引加锁？

防止其他事务通过主键索引修改/删除该行。如果只在二级索引加锁，其他事务走主键索引 `DELETE WHERE id=?` 不会触发二级索引的锁检查，会绕过锁。所以二级索引命中的记录，对应的主键索引记录也要加记录锁。

### `LIMIT` 会缩小加锁范围吗？

会。`SELECT ... WHERE age > 20 FOR UPDATE LIMIT 10` 找到 10 条就停止扫描，只对这 10 条加锁（加上最后一条后的间隙锁）。这是优化锁范围的常用手段。

## 易错点

- 误以为"`id > 15` 锁 id=15"——`>` 是开区间，不锁 15 本身。
- 误以为"`id <= 25` 退化为间隙锁"——`<=` 包含等值，命中时 Next-Key Lock 不退化。
- 误以为"非唯一索引等值查询退化为记录锁"——非唯一索引不退化（可能重复值）。
- 误以为"RC 也防幻读"——RC 不防，没有间隙锁。
- 误以为"`LIMIT` 不影响锁范围"——`LIMIT` 会停止扫描，缩小锁范围。
- 误以为"行锁语句结束就释放"——事务提交/回滚后才释放。

## 总结

InnoDB 行锁锁索引记录，加锁基本单位是 Next-Key Lock（前开后闭 `(a, b]`）。RR 下：唯一索引等值命中退化为记录锁；唯一索引等值未命中退化为间隙锁；非唯一索引等值扫描到第一个不匹配退化为间隙锁；范围查询按 Next-Key Lock 加锁，边界条件决定是否退化。RC 下不加间隙锁（除内部约束检查）。WHERE 不走索引时全表加 Next-Key Lock，等同表锁。用 `performance_schema.data_locks` 查看实际加锁情况，用 `EXPLAIN` 提前判断是否走索引。

## 参考资料

- [MySQL 8.0 Reference Manual: InnoDB Locking](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html)
- [MySQL 8.0 Reference Manual: Data Locks](https://dev.mysql.com/doc/refman/8.0/en/performance-schema-data-locks-table.html)

---
