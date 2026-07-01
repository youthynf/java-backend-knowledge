# MySQL 可重复读彻底解决幻读问题了吗

## 核心概念

幻读指同一事务内多次按相同条件查询，结果集行数不一致（多了或少了行）。SQL 标准里可重复读（RR）允许幻读，但 InnoDB 通过 MVCC 和 next-key lock 在很大程度上规避了它。

但“很大程度上规避”不等于“彻底解决”。在快照读和当前读混用、或更新原本不可见的记录等场景下，仍会出现幻读。这是面试高频考点，也是生产中容易踩坑的地方。

回答这个问题的核心是分清两条路径：快照读走 MVCC 规避幻读，当前读走 next-key lock 规避幻读，但两者混用就会出问题。

## 标准回答

> InnoDB 的 RR 隔离级别没有彻底解决幻读，只是很大程度上规避。快照读通过 MVCC 复用 ReadView 规避（事务内看不到新插入的行）；当前读通过 next-key lock（记录锁 + 间隙锁）阻塞范围内的插入规避。但两种场景仍会幻读：一是事务先快照读、后当前读，当前读能看到其他事务提交的新行；二是事务 update 了一条原本 MVCC 不可见的记录，update 后该行 trx_id 变为自己，变得可见。要彻底避免幻读，可在事务开始时立即执行当前读加锁，或升级到串行化。

## 实现原理

### 快照读路径：MVCC 规避幻读

RR 下事务内第一次快照读生成 ReadView 并复用，新插入行的 `trx_id` 大于等于 ReadView 的 `max_trx_id`，不可见。

```sql
BEGIN;
SELECT COUNT(*) FROM t WHERE id > 10;  -- 假设 1 行（id=15）
-- 其他事务插入 id=12 并提交
SELECT COUNT(*) FROM t WHERE id > 10;  -- 仍 1 行（id=15），id=12 不可见
COMMIT;
```

### 当前读路径：next-key lock 规避幻读

当前读加 next-key lock = 记录锁 + 间隙锁，锁住记录及其前面的间隙，其他事务无法在该范围内插入。

```sql
BEGIN;
SELECT * FROM t WHERE id > 10 FOR UPDATE;  -- 加锁 (10, 15], (15, +∞)
-- 其他事务尝试 INSERT id=12 → 阻塞，直到事务提交
COMMIT;
```

### 仍会幻读的两种场景

**场景一：先快照读，后当前读**

```sql
-- RR 隔离级别
BEGIN;
SELECT * FROM t WHERE id > 10;           -- 快照读，看到 15
-- 其他事务插入 id=12 并提交
SELECT * FROM t WHERE id > 10 FOR UPDATE; -- 当前读，看到 12 和 15 → 幻读
COMMIT;
```

**场景二：更新了原本不可见的记录**

```sql
-- RR 隔离级别
BEGIN;
SELECT * FROM t WHERE id > 10;           -- 快照读，看到 15
-- 其他事务插入 id=12 并提交
UPDATE t SET name='x' WHERE id > 10;     -- 当前读，看到 12 和 15，update 后 12 的 trx_id 变为当前事务
SELECT * FROM t WHERE id > 10;           -- 快照读，现在看到 12（自己改的可见）和 15 → 幻读
COMMIT;
```

### 如何彻底避免幻读

1. **事务开始立即当前读加锁**：在第一条语句就执行 `SELECT ... FOR UPDATE`，提前加 next-key lock 阻塞其他事务插入。

```sql
BEGIN;
SELECT * FROM t WHERE id > 10 FOR UPDATE;  -- 立即加锁
-- 后续操作都在锁保护下
COMMIT;
```

2. **升级到串行化隔离级别**：所有读自动转 `FOR SHARE`，但并发性能差，几乎不用。

3. **业务上接受最终一致**：很多场景下幻读不影响业务，比如统计报表，可接受。

## 代码示例

订单创建后立即查看，避免看到别人插入的“幻影订单”：

```sql
-- 高并发下单：先用当前读锁定用户已有订单范围
START TRANSACTION;
SELECT COUNT(*) FROM orders WHERE user_id = 100 FOR UPDATE;  -- 当前读加锁
-- 此时其他事务无法为 user_id=100 插入新订单
INSERT INTO orders(user_id, ...) VALUES(100, ...);
COMMIT;
```

## 实战场景

| 场景 | 是否会幻读 | 规避方法 |
|------|----------|---------|
| 纯快照读事务 | 否 | MVCC 自然规避 |
| 纯当前读事务 | 否 | next-key lock 规避 |
| 快照读 + 当前读混用 | 是 | 事务开始就当前读加锁 |
| 快照读 + 更新不可见记录 | 是 | 同上，或避免此模式 |
| 统计报表 | 业务可接受 | 不处理 |

## 深挖追问

### 1. 为什么 next-key lock 能防止幻读？

next-key lock = 记录锁 + 间隙锁。记录锁锁定已有行防止修改，间隙锁锁定行之间的间隙防止插入。范围查询时锁住所有命中的记录及其前面的间隙，其他事务无法在该范围内插入新行，结果集行数不变。

### 2. 间隙锁只在 RR 下才有吗？

是的。RC 隔离级别下当前读只加记录锁，不加间隙锁，所以 RC 下幻读是允许的。这也是 RC 并发更好的原因之一。

### 3. 间隙锁有什么副作用？

间隙锁会阻塞范围内的插入，高并发写入场景下容易引发锁冲突和死锁。例如两个事务分别持有不同间隙锁但相互等待对方释放，就会死锁。这也是互联网项目常切到 RC 的原因。

### 4. 唯一索引等值命中会加间隙锁吗？

不会退化为 next-key lock，而是退化为记录锁。因为唯一索引能保证唯一性，不需要间隙锁防止重复插入。但唯一索引等值未命中、范围查询、非唯一索引等值命中仍会加间隙锁。

### 5. 幻读和不可重复读的区别？

不可重复读针对同一行内容变化（UPDATE 引起），幻读针对结果集行数变化（INSERT/DELETE 引起）。RR 用 MVCC 解决不可重复读，用 next-key lock 在当前读场景下解决幻读。

## 易错点

- 以为 RR 彻底解决幻读：混用快照读和当前读仍会幻读。
- 以为升级串行化是常规选项：并发性能极差，仅理论方案。
- 忽视“更新不可见记录导致幻读”：update 让记录 trx_id 变为自己，变得可见。
- 误以为 RC 有间隙锁：RC 当前读只加记录锁，间隙锁只在 RR 下生效。
- 在事务里穿插快照读和当前读：常见幻读诱因。

## 总结

InnoDB 的 RR 通过 MVCC（快照读）和 next-key lock（当前读）双管齐下规避幻读，但未彻底解决：快照读+当前读混用、更新不可见记录两种场景仍会幻读。生产中可在事务开始时立即当前读加锁，或切到 RC 接受不可重复读换取并发。间隙锁是 RR 规避幻读的关键，也是高并发死锁的常见诱因。

## 参考资料

- [MySQL 8.0 Reference Manual: InnoDB Locking](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html)
- [MySQL 8.0 Reference Manual: Avoiding the Phantom Problem](https://dev.mysql.com/doc/refman/8.0/en/innodb-next-key-locking.html)

---
