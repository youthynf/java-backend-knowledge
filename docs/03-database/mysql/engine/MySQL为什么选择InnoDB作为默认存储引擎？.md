# MySQL 为什么选择 InnoDB 作为默认存储引擎？

## 核心概念

InnoDB 是 MySQL 默认存储引擎，核心原因是它适合通用 OLTP 场景：支持 ACID 事务、行级锁、MVCC、崩溃恢复、外键和较好的并发控制。相比 MyISAM，InnoDB 在一致性、并发写入和故障恢复方面更可靠。

InnoDB 表按聚簇索引组织，主键索引叶子节点保存整行数据，二级索引叶子节点保存主键值。它通过 redo log 保证崩溃恢复，通过 undo log 支持回滚和 MVCC，通过 buffer pool 缓存数据页。

## 面试官想考什么

- 是否能说出事务、行锁、MVCC、崩溃恢复；
- 是否知道 InnoDB 和 MyISAM 的主要区别；
- 是否理解聚簇索引、redo/undo、buffer pool 的作用；
- 是否能结合高并发业务解释默认选择。

## 标准回答

> InnoDB 成为默认引擎，是因为它支持事务、行级锁、MVCC 和崩溃恢复，更适合订单、支付、库存这类对一致性和并发要求高的业务。MyISAM 不支持事务，主要是表级锁，崩溃恢复能力弱。InnoDB 通过 redo log 保证已提交事务可恢复，通过 undo log 支持回滚和一致性读，通过 buffer pool 缓存数据页，所以更适合现代业务系统。

## 深挖追问

### InnoDB 行锁一定只锁一行吗？

不一定。行锁依赖索引，如果条件没有命中索引，可能扫描并锁住大量记录。可重复读隔离级别下还可能出现间隙锁和临键锁，用于解决幻读。

### 聚簇索引有什么影响？

主键决定数据组织方式。主键太长会让所有二级索引变大；主键随机写入会导致页分裂和碎片。因此常推荐短、稳定、趋势递增的主键。

## 实战场景 / SQL 示例

```sql
START TRANSACTION;
UPDATE product_stock
SET stock = stock - 1
WHERE sku_id = 1001 AND stock > 0;
INSERT INTO stock_log(sku_id, change_num) VALUES (1001, -1);
COMMIT;
```

扣库存、写流水需要事务保证同时成功或失败，InnoDB 能在异常时回滚，并在宕机后恢复到一致状态。

## 易错点 / 总结

- InnoDB 支持行锁，但 SQL 必须有效使用索引；
- 长事务会占用 undo、影响 purge，并可能造成锁等待；
- 主键设计会影响聚簇索引和二级索引大小；
- MyISAM 不是完全没用，但通用业务默认选 InnoDB；
- 面试可从一致性、并发、恢复能力三条线回答。
