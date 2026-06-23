# engine

## 核心概念

- [InnoDB和MyISAM数据文件组织方式](03-database/mysql/engine/InnoDB和MyISAM数据文件组织方式.md)
- [InnoDB是如何存储数据的？](03-database/mysql/engine/InnoDB是如何存储数据的？.md)
- [InnoDB与MyISAM区别是什么？](03-database/mysql/engine/InnoDB与MyISAM区别是什么？.md)
- [MySQL常用的存储引擎有哪些？](03-database/mysql/engine/MySQL常用的存储引擎有哪些？.md)
- [MySQL为什么选择InnoDB作为默认存储引擎？](03-database/mysql/engine/MySQL为什么选择InnoDB作为默认存储引擎？.md)

## 面试官想考什么

- InnoDB 与 MyISAM 在事务、锁、索引组织、崩溃恢复上的差异。
- 为什么现代 OLTP 场景通常优先 InnoDB。
- 存储引擎选择对并发、可靠性、备份恢复的影响。

## 标准回答

存储引擎选择影响事务、锁粒度、索引组织和崩溃恢复。InnoDB 支持事务、行级锁、MVCC 和崩溃恢复，适合多数 OLTP；MyISAM 不支持事务，主要是表级锁，现代业务通常不作为首选。

## 深挖追问

1. 为什么 InnoDB 适合 OLTP？事务、行锁、MVCC、崩溃恢复更完善。
2. MyISAM 适合什么？历史上的读多写少且无需事务场景。
3. 引擎会影响索引吗？会，数据和索引组织方式不同。

## 实战场景 / SQL 示例

```sql
SHOW TABLE STATUS LIKE "orders";
SHOW CREATE TABLE orders;
-- 关注 Engine、主键、索引和行格式。
```

## 易错点 / 总结

- 不要在需要事务的业务表上选择不支持事务的引擎。
- 不要只看读性能，可靠性和恢复能力同样重要。
- 不同版本细节可能变化，回答时说明基于常见 InnoDB。
