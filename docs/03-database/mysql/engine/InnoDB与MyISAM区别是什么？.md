# InnoDB与MyISAM区别是什么？

## 核心概念

InnoDB与MyISAM区别是什么？
Mysql的InnoDB存储引擎与MyISAM存储引擎的区别：
事务支持：InnoDB支持事务，MyISAM不支持事务，这是MySQL将默认存储引擎从MyISAM变成InnoDB的重要原因之一；
索引结构：InnoDB是聚簇索引，MyISAM是非聚簇索引。InnoDB索引结构信息和数据记录是存放在同一个文件中，而MyISAM数据文件和索引结构信息文件是分离的，索引保存的是数据文件指针。
锁粒度：InnoDB支持的最小粒度是行锁，MyISAM最小的锁粒度是表锁，一个更新语句会锁住整张表，导致其他查询和更新都会被阻塞，因此并发受限。
count效率：InnoDB不保存表的具体行数，执行select count(*)时需要全表扫描，而MyISAM用一个变量保存了整个表的行数，执行上述语句直接读出该变量即可，速度很快。

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
