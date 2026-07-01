# MySQL 死锁怎么办

## 核心概念

死锁是两个或多个事务互相持有对方想要的锁，导致循环等待，谁也推进不了。InnoDB 在 RR 隔离级别下大量使用间隙锁和临键锁，锁范围大、冲突概率高，是死锁的高发场景。

死锁的本质是"循环等待"，但 InnoDB 不是被动等超时，而是**主动检测**：每次事务申请锁时检查是否形成等待环，一旦检测到死锁立即回滚代价较小的事务。生产中死锁无法完全避免，关键是知道如何排查、如何降低概率、如何在业务层做好重试。

## 标准回答

InnoDB 死锁是事务间循环等待锁导致的。InnoDB 默认开启死锁检测（`innodb_deadlock_detect=ON`），检测到死锁后回滚代价较小的事务；同时有锁等待超时（`innodb_lock_wait_timeout=50s`）。排查用 `SHOW ENGINE INNODB STATUS` 查看最近一次死锁详情，结合 `performance_schema.data_locks` 和 `information_schema.innodb_trx` 定位。避免死锁：固定加锁顺序、缩短事务、走索引避免锁扩大、`LIMIT` 缩小范围、业务层幂等重试。

## 死锁的产生原因

### 死锁的四个必要条件

1. **互斥**：锁同一时刻只能被一个事务持有。
2. **占有且等待**：事务持有锁的同时等待其他锁。
3. **不可强占用**：不能强行剥夺其他事务的锁。
4. **循环等待**：事务间形成等待环。

只要破坏任意一个条件就能避免死锁。数据库场景下，最常破坏的是"循环等待"——固定加锁顺序。

### InnoDB 中常见的死锁场景

#### 场景 1：间隙锁互锁

RR 隔离级别下，间隙锁之间兼容，但间隙锁与插入意向锁冲突。两个事务先各自持有一个间隙锁，再尝试在对方间隙锁范围内插入，就会形成死锁：

```sql
-- 表: id=1, 5, 10 三条记录

-- 事务 A
BEGIN;
SELECT * FROM t WHERE id = 7 FOR UPDATE;  -- 加 (5, 10) 间隙锁

-- 事务 B
BEGIN;
SELECT * FROM t WHERE id = 8 FOR UPDATE;  -- 加 (5, 10) 间隙锁（间隙锁兼容）

-- 事务 A
INSERT INTO t VALUES (7);  -- 等待事务 B 的间隙锁释放
-- 阻塞

-- 事务 B
INSERT INTO t VALUES (8);  -- 等待事务 A 的间隙锁释放
-- 死锁！InnoDB 检测到后回滚其中一个事务
```

为什么两个事务都能持有 `(5, 10)` 间隙锁？因为间隙锁之间兼容（防止插入的目的相同，不冲突）。但插入操作需要申请插入意向锁，与间隙锁冲突，于是相互等待。

#### 场景 2：加锁顺序不一致

```sql
-- 事务 A
BEGIN;
UPDATE account SET balance = balance - 100 WHERE id = 1;  -- 锁 id=1
UPDATE account SET balance = balance + 100 WHERE id = 2;  -- 等待 id=2

-- 事务 B
BEGIN;
UPDATE account SET balance = balance - 100 WHERE id = 2;  -- 锁 id=2
UPDATE account SET balance = balance + 100 WHERE id = 1;  -- 等待 id=1
-- 死锁
```

#### 场景 3：唯一索引冲突 + 间隙锁

```sql
-- 表: user_id 上有唯一索引，存在 user_id=100, 200

-- 事务 A
INSERT INTO t (user_id) VALUES (150);  -- 申请 (100, 200) 间隙的插入意向锁
-- 阻塞（假设有其他事务持有该间隙锁）

-- 事务 B 持有 (100, 200) 间隙锁
-- 事务 A 等待 B
-- 事务 B 又尝试插入 150 等待 A → 死锁
```

## InnoDB 如何处理死锁

### 1. 主动死锁检测（默认开启）

`innodb_deadlock_detect=ON`（默认）：事务每次申请锁时，InnoDB 检查是否形成等待环。一旦检测到，立即回滚"代价较小"的事务（通常是修改行数少的事务），让另一事务继续。

代价：检测本身有开销，高并发场景下可能消耗 CPU。8.0 在高并发写场景下可以考虑关闭检测，改用超时机制（需谨慎）。

### 2. 锁等待超时

`innodb_lock_wait_timeout=50`（默认 50 秒）：事务等待锁超过该时间后回滚。这是被动方案，比检测慢但开销低。

### 3. 应用层处理

应用收到死锁错误（MySQL error 1213）后，应**捕获异常并重试**整个事务。死锁不是 bug，是并发副产物，业务必须能处理。

## 排查命令

### 查看最近一次死锁

```sql
SHOW ENGINE INNODB STATUS\G
-- 找到 "LATEST DETECTED DEADLOCK" 段
-- 包含:
--   事务 1 和事务 2 的 SQL、持有锁、等待锁
--   死锁回滚的是哪个事务
```

可以把死锁日志写入独立文件，便于排查：

```ini
# my.cnf
innodb_print_all_deadlocks = ON
# 死锁日志会写入 error log
```

### 查看当前锁情况

```sql
-- 8.0 查看所有锁
SELECT * FROM performance_schema.data_locks;

-- 查看锁等待关系
SELECT * FROM performance_schema.data_lock_waits;

-- 查看所有事务
SELECT
  trx_id, trx_state, trx_started,
  trx_requested_lock_id, trx_wait_started,
  trx_mysql_thread_id, trx_query
FROM information_schema.innodb_trx;

-- 查看锁等待（哪个事务阻塞哪个事务）
SELECT
  r.trx_id AS waiting_trx_id,
  r.trx_mysql_thread_id AS waiting_thread,
  r.trx_query AS waiting_query,
  b.trx_id AS blocking_trx_id,
  b.trx_mysql_thread_id AS blocking_thread,
  b.trx_query AS blocking_query
FROM performance_schema.data_lock_waits w
JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_engine_transaction_id
JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_engine_transaction_id;
```

### kill 阻塞事务

```sql
-- 找到阻塞线程的 thread_id
KILL <blocking_thread_id>;
```

## 死锁案例完整排查

### 现象

应用日志频繁报 `Deadlock found when trying to get lock; try restarting transaction`。

### 排查步骤

1. `SHOW ENGINE INNODB STATUS\G` 找到 `LATEST DETECTED DEADLOCK` 段。

2. 解读死锁日志：

```
*** (1) TRANSACTION:
TRANSACTION 12345, ACTIVE 2 sec starting index read
mysql tables in use 1, locked 1
LOCK WAIT 3 lock struct(s), heap size 1136, 2 row lock(s)
MySQL thread id 100, OS thread handle 0x..., query id 200 localhost root updating
UPDATE account SET balance = balance + 100 WHERE id = 2   ← 事务1 在等 id=2

*** (1) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 50 page no 3 n bits 72 index PRIMARY of table `mydb`.`account`
trx id 12345 lock_mode X locks rec but not gap waiting
Lock rec but not gap, heap no 3 PHYSICAL RECORD

*** (2) TRANSACTION:
TRANSACTION 12346, ACTIVE 2 sec starting index read
mysql tables in use 1, locked 1
3 lock struct(s), heap size 1136, 2 row lock(s)
MySQL thread id 101, OS thread handle 0x..., query id 201 localhost root updating
UPDATE account SET balance = balance - 100 WHERE id = 1   ← 事务2 在等 id=1

*** (2) HOLDS THE LOCK(S):
RECORD LOCKS space id 50 page no 3 n bits 72 index PRIMARY of table `mydb`.`account`
trx id 12346 lock_mode X locks rec but not gap
Lock rec but not gap, heap no 2 PHYSICAL RECORD   ← 事务2 持有 id=2

*** (2) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS ...
trx id 12346 lock_mode X locks rec but not gap waiting
Lock rec but not gap, heap no 3 PHYSICAL RECORD   ← 事务2 等 id=1

*** WE ROLL BACK TRANSACTION (2)
```

3. 结论：事务 1 持有 id=1 等待 id=2，事务 2 持有 id=2 等待 id=1，加锁顺序不一致。

4. 修复：业务层调整加锁顺序，所有转账操作都按 `id` 升序加锁（先锁 id 小的，再锁 id 大的）。

## 如何避免死锁

### 1. 固定加锁顺序

业务上对多行加锁时，全系统统一按某个顺序（如主键升序）加锁，破坏"循环等待"。

```java
// 反例：按业务参数顺序加锁
@Transactional
public void transfer(Long from, Long to, BigDecimal amount) {
    update(from, -amount);  // 先锁 from
    update(to, +amount);    // 再锁 to
    // 不同调用者 from/to 顺序不同，可能死锁
}

// 正例：按主键升序加锁
@Transactional
public void transfer(Long from, Long to, BigDecimal amount) {
    Long first = Math.min(from, to);
    Long second = Math.max(from, to);
    update(first, first.equals(from) ? -amount : +amount);
    update(second, second.equals(from) ? -amount : +amount);
}
```

### 2. 缩短事务

长事务持锁时间长，死锁概率高。把事务里无关的操作移到事务外，事务只包含必须原子化的部分。

### 3. 走索引避免锁扩大

`UPDATE/DELETE` 的 WHERE 必须走索引，否则全表加锁，死锁概率激增。

### 4. 用 LIMIT 缩小范围

`UPDATE ... WHERE ... LIMIT n` 找到 n 条就停止，缩小锁范围。

### 5. 降低隔离级别

如果业务允许幻读，从 RR 降到 RC，间隙锁关闭，死锁概率大幅下降。许多互联网公司在主库用 RC 换并发性能。

### 6. 业务层幂等重试

死锁无法完全避免，业务必须能处理 1213 错误并重试。重试要保证幂等（同一请求多次执行结果一致）。

```java
@Retryable(value = DeadlockLoserDataAccessException.class, maxAttempts = 3, backoff = @Backoff(delay = 100))
@Transactional
public void doBusiness() {
    // 业务逻辑
}
```

### 7. 大事务拆批

大批量 `UPDATE/DELETE` 拆成小批次，每批独立事务，缩短单次锁持有时间。

## 代码示例

模拟死锁：

```sql
-- 会话 1
BEGIN;
UPDATE account SET balance = balance - 100 WHERE id = 1;

-- 会话 2
BEGIN;
UPDATE account SET balance = balance - 100 WHERE id = 2;

-- 会话 1
UPDATE account SET balance = balance + 100 WHERE id = 2;  -- 等待

-- 会话 2
UPDATE account SET balance = balance + 100 WHERE id = 1;  -- 死锁
-- ERROR 1213 (40001): Deadlock found when trying to get lock;
-- try restarting transaction
```

查看死锁配置：

```sql
SHOW VARIABLES LIKE 'innodb_deadlock_detect';      -- ON
SHOW VARIABLES LIKE 'innodb_lock_wait_timeout';    -- 50
SHOW VARIABLES LIKE 'innodb_print_all_deadlocks';  -- OFF
```

## 实战场景

| 场景 | 排查 / 解决 |
|------|-------------|
| 频繁死锁告警 | 开 `innodb_print_all_deadlocks`，分析日志找出加锁顺序问题 |
| 长事务死锁 | `information_schema.innodb_trx` 找长事务，业务缩短 |
| 大批量 UPDATE 死锁 | 拆批 + 走索引 + `LIMIT` |
| 唯一索引插入死锁 | 检查是否有间隙锁互锁，考虑改 RC 或调整并发 |
| 应用偶发 1213 | 加重试 + 幂等设计 |

## 深挖追问

### 死锁检测的开销大吗？

每次锁申请都检查等待环，高并发写场景下 CPU 消耗显著。8.0 在高并发死锁检测瓶颈场景下可考虑关闭检测（`innodb_deadlock_detect=OFF`），改用更短的锁等待超时（如 `innodb_lock_wait_timeout=5`）让事务快速失败重试。但关闭检测需谨慎，可能导致大量事务长时间等待。

### 死锁一定回滚整个事务吗？

InnoDB 默认回滚整个事务。但 8.0 可设置 `innodb_rollback_on_timeout=OFF`（默认）让超时只回滚最后一条语句。死锁检测回滚的总是整个事务。

### 如何判断死锁是哪一方的问题？

看 `SHOW ENGINE INNODB STATUS` 的 `LATEST DETECTED DEADLOCK` 段：被回滚的事务（`WE ROLL BACK TRANSACTION`）是 InnoDB 选择的"牺牲品"，不一定是"过错方"。要结合业务逻辑判断哪方的加锁顺序不合理。两方 SQL 都要看。

### 为什么间隙锁之间兼容还会死锁？

间隙锁之间确实兼容（两个事务可同时持有同一间隙的间隙锁）。但插入操作需要"插入意向锁"，与间隙锁冲突。所以"两个事务先各持有间隙锁，再互相在对方间隙锁范围内插入"就死锁。这是 RR 下间隙锁的死锁高发模式。

### RC 隔离级别下还会死锁吗？

会，但概率低。RC 没有间隙锁（除内部约束检查），死锁主要来自记录锁加锁顺序不一致。RC 死锁频率通常显著低于 RR，是高并发场景选 RC 的原因之一。

## 易错点

- 误以为"死锁是 bug"——死锁是并发的正常副产物，应用必须能处理。
- 误以为"事务越短越好就行"——短事务降低死锁概率，但不能完全避免。
- 误以为"被回滚的事务是过错方"——InnoDB 选代价最小的事务回滚，与过错无关。
- 误以为"间隙锁互斥"——间隙锁兼容，死锁来自插入意向锁与间隙锁冲突。
- 误以为"RC 不会死锁"——RC 死锁概率低但仍有，主要来自记录锁顺序不一致。
- 误以为"重试可以无限次"——重试要有限次数 + 退避，避免雪崩。

## 总结

InnoDB 死锁是事务间循环等待锁导致的，RR 下间隙锁高发。InnoDB 默认开启主动死锁检测，检测到后回滚代价较小的事务；锁等待超时 50 秒。排查用 `SHOW ENGINE INNODB STATUS` 看死锁详情，结合 `performance_schema.data_locks` 和 `information_schema.innodb_trx` 定位。避免死锁：固定加锁顺序、缩短事务、走索引、`LIMIT` 缩范围、考虑降 RC、业务层幂等重试。死锁无法完全避免，应用必须能处理 1213 错误。

## 参考资料

- [MySQL 8.0 Reference Manual: InnoDB Deadlock Detection](https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlock-detection.html)
- [MySQL 8.0 Reference Manual: InnoDB Deadlock Examples](https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlock-example.html)

---
