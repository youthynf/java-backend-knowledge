# MySQL 事务特性是什么

## 核心概念

事务是数据库执行的一个逻辑工作单元，它把一组 SQL 语句打包成一个“要么全做、要么全不做”的整体。InnoDB 是 MySQL 中支持事务的存储引擎，MyISAM 不支持。事务存在的意义是保证并发访问和故障场景下数据仍然正确。

事务有四个特性，合称 ACID：原子性（Atomicity）、一致性（Consistency）、隔离性（Isolation）、持久性（Durability）。其中一致性是最终目标，另外三个特性是达成一致性的手段。

理解 ACID 的关键不是背诵定义，而是搞清楚每个特性由什么机制保证、在并发和故障场景下如何生效。

## 标准回答

> 事务的 ACID 四个特性中，原子性由 undo log 保证，持久性由 redo log 保证，隔离性由 MVCC + 锁保证，一致性由前三个特性加上应用层约束共同保证。InnoDB 默认隔离级别是可重复读（RR），通过 ReadView + undo log 版本链实现快照读，通过 next-key lock 实现当前读的幻读规避。事务要短小，长事务会持有锁、阻碍 undo purge、放大主从延迟。

## 实现原理

### 四个特性的含义

| 特性 | 含义 | 解决的问题 |
|------|------|-----------|
| 原子性 Atomicity | 事务内操作要么全部成功，要么全部回滚 | 执行中途失败导致数据半成品 |
| 一致性 Consistency | 事务执行前后，数据库满足完整性约束 | 数据从一种合法状态变到另一种合法状态 |
| 隔离性 Isolation | 并发事务互不干扰，每个事务像独占系统 | 并发读写互相覆盖、读到中间状态 |
| 持久性 Durability | 事务提交后，修改永久保存，宕机不丢 | 提交成功后系统崩溃导致数据丢失 |

### InnoDB 如何保证 ACID

- **原子性**：通过 undo log 实现。每次修改前先写 undo log，记录修改前的旧值。事务回滚时按 undo log 反向恢复；事务提交后 undo log 由 purge 线程在无人引用时清理。
- **持久性**：通过 redo log + WAL 实现。事务提交时把 redo log 刷盘，崩溃后重启用 redo log 重放已提交事务的修改。redo log 是顺序写，远比随机写数据页高效。
- **隔离性**：通过 MVCC（多版本并发控制）和锁实现。快照读走 MVCC，读不加锁；当前读走加锁，按隔离级别决定锁范围。
- **一致性**：由原子性 + 持久性 + 隔离性 + 业务约束（外键、唯一键、应用校验）共同保证。一致性是结果，前三个是手段。

### 并发事务引发的问题

| 问题 | 现象 | 触发条件 |
|------|------|---------|
| 脏读 | 读到其他事务未提交的修改 | 读未提交级别 |
| 不可重复读 | 同一事务内两次读同一行结果不同 | 读已提交级别 |
| 幻读 | 同一事务内两次范围查询结果集行数不同 | 可重复读级别下仍可能发生（当前读场景） |

## 代码示例

转账场景：A 向 B 转 200 元，必须保证扣款和加款原子执行。

```sql
START TRANSACTION;

-- 检查余额并锁定 A 的账户（当前读，加行锁）
SELECT balance FROM account WHERE id = 1 FOR UPDATE;

-- 扣款
UPDATE account SET balance = balance - 200 WHERE id = 1 AND balance >= 200;

-- 加款
UPDATE account SET balance = balance + 200 WHERE id = 2;

-- 任意一步失败可 ROLLBACK，全部成功才 COMMIT
COMMIT;
```

Spring 中用 `@Transactional` 标注事务边界：

```java
@Service
public class TransferService {

    @Transactional(rollbackFor = Exception.class)
    public void transfer(Long from, Long to, BigDecimal amount) {
        Account src = accountMapper.selectByIdForUpdate(from);
        if (src.getBalance().compareTo(amount) < 0) {
            throw new BizException("余额不足");
        }
        accountMapper.decrease(from, amount);
        accountMapper.increase(to, amount);
        // 方法正常返回则提交；抛出异常则回滚
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 转账/订单创建 | 多张表写入放在一个事务里 | 事务内不要调用 RPC，避免长事务 |
| 扣减库存 | `SELECT ... FOR UPDATE` 锁行再更新 | 必须走索引，否则锁升级为表锁 |
| 批量数据导入 | 分批提交，每批 N 条一个事务 | 单事务过大导致 undo 膨胀、主从延迟 |
| 接口幂等 | 事务内先查再插，配合唯一索引 | 唯一索引冲突会触发回滚 |

## 深挖追问

### 1. 一致性到底由谁保证？

一致性是数据库层面和应用层面共同保证的。数据库通过 ACID 的另外三个特性 + 约束（主键、外键、唯一键、CHECK）保证数据从一个合法状态变到另一个合法状态；应用层通过业务校验保证语义正确。例如转账，数据库能保证 A 扣 200、B 加 200 都生效或都不生效，但“A 余额是否足够”需要应用判断。

### 2. MyISAM 为什么不支持事务？

MyISAM 不维护 undo log 和 redo log，写入时直接修改数据文件，崩溃后无法回滚也未保证已提交数据不丢。InnoDB 专门设计了 undo log、redo log 和 Buffer Pool 来支撑事务。

### 3. 事务自动提交和显式事务的区别？

MySQL 默认 `autocommit=1`，每条 SQL 自动包成一个事务提交。执行 `BEGIN`/`START TRANSACTION` 后进入显式事务，需要 `COMMIT` 或 `ROLLBACK` 结束。注意 `BEGIN` 后第一条 SQL 才真正启动事务（生成 ReadView 的时机也在此），`START TRANSACTION WITH CONSISTENT SNAPSHOT` 会立即启动事务。

### 4. 事务提交后数据就一定落盘了吗？

不一定。事务提交保证 redo log 已刷盘（`innodb_flush_log_at_trx_commit=1` 时），数据页可能还在 Buffer Pool 中是脏页，由后台线程异步刷盘。崩溃后通过 redo log 重放恢复脏页数据，所以数据不会丢。

## 易错点

- 把一致性当成独立机制：一致性是结果，不是某个日志或锁。
- 认为 `BEGIN` 立即启动事务：RR 下 ReadView 在第一条快照读时才生成。
- 在事务里调用 HTTP/RPC：远程调用耗时不可控，会拉长锁持有时间，引发长事务。
- 把隔离级别和锁混为一谈：隔离级别是并发行为规范，锁和 MVCC 是实现手段。
- 以为提交就刷数据页：提交只刷 redo log，数据页是异步刷的。

## 总结

ACID 是事务的纲领：原子性靠 undo log，持久性靠 redo log，隔离性靠 MVCC + 锁，一致性是前三者加业务约束的结果。InnoDB 默认 RR 隔离级别，配合 next-key lock 在很大程度上规避幻读。理解 ACID 后，下一步应深入 MVCC、隔离级别实现和长事务治理。

## 参考资料

- [MySQL 8.0 Reference Manual: InnoDB Transaction Model](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-model.html)
- [MySQL 8.0 Reference Manual: ACID](https://dev.mysql.com/doc/refman/8.0/en/mysql-acid.html)

---
