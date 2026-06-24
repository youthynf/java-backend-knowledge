# transaction

## 核心概念

- [快照读和当前读是什么？](快照读和当前读是什么？.md)
- [滥用事务或一个事务特别多SQL会有什么问题？](滥用事务或一个事务特别多SQL会有什么问题？.md)
- [事务的隔离级别是怎么实现的？](事务的隔离级别是怎么实现的？.md)
- [MVCC实现原理是怎么样的？](MVCC实现原理是怎么样的？.md)
- [MySQL可重复读彻底解决幻读问题了吗？](MySQL可重复读彻底解决幻读问题了吗？.md)
- [MySQL事务特性是什么？](MySQL事务特性是什么？.md)

## 面试官想考什么

- ACID、隔离级别、MVCC、快照读和当前读是否理解。
- 可重复读下如何降低幻读风险，以及当前读为什么会加锁。
- 长事务对 undo、锁等待、连接占用和主从延迟的影响。

## 标准回答

MySQL 事务回答要围绕 ACID、隔离级别和 InnoDB 实现。InnoDB 通过 undo log 保存历史版本，通过 ReadView 支持 MVCC；快照读通常不加锁，当前读读取最新版本并可能加锁。事务要短小，避免长时间持有锁和阻碍 undo 清理。

## 深挖追问

1. RC 和 RR 的 ReadView 有何差异？RC 通常每次快照读生成，RR 通常事务内复用。
2. 快照读和当前读怎么区分？普通 SELECT 多为快照读，更新和加锁读是当前读。
3. 长事务有什么危害？占锁、阻碍 undo 清理、增加回滚成本和复制延迟。

## 实战场景 / SQL 示例

```sql
START TRANSACTION;
SELECT stock FROM sku WHERE id = 100 FOR UPDATE;
UPDATE sku SET stock = stock - 1 WHERE id = 100 AND stock > 0;
COMMIT;
```

## 易错点 / 总结

- 不要把隔离级别和锁机制混为一谈。
- 事务中不要夹杂 RPC、文件处理等慢操作。
- 可重复读降低幻读风险，但当前读、唯一约束和锁范围仍要具体分析。
