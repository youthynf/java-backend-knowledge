# InnoDB 与 MyISAM 区别是什么

## 核心概念

InnoDB 和 MyISAM 是 MySQL 历史上最常见的两个存储引擎。MyISAM 是 MySQL 5.5 之前的默认引擎，强调读性能和轻量；InnoDB 从 5.5 开始取代它成为默认引擎，强调事务、并发和崩溃恢复。两者的差异本质上源于设计目标不同：MyISAM 适合"读多写少、不要事务"的早期 Web 场景，InnoDB 适合"高并发读写、要强一致"的现代 OLTP 场景。

从底层看，二者的差异可以归纳为五个维度：事务支持、锁粒度、外键、索引组织方式、崩溃恢复。其中**索引组织方式**最关键：InnoDB 是聚簇索引，主键索引的叶子节点直接存放整行数据；MyISAM 是非聚簇索引，数据和索引分开存储，索引叶子节点存放数据行的物理地址。这一差异决定了 InnoDB 的主键设计更敏感，也决定了 MyISAM 的 `count(*)` 可以常量返回而 InnoDB 必须扫描。

## 标准回答

InnoDB 和 MyISAM 的核心区别是：InnoDB 支持事务、行级锁、外键、聚簇索引和崩溃恢复，适合 OLTP；MyISAM 不支持事务、只有表锁、非聚簇索引、崩溃后易损坏，仅适合读多写少且不需要事务的归档场景。MySQL 5.5 起 InnoDB 成为默认引擎，新业务几乎不再选 MyISAM。

## 详细对比

| 维度 | InnoDB | MyISAM |
|------|--------|--------|
| 事务 | 支持 ACID | 不支持 |
| 锁粒度 | 行锁（默认）/表锁（无索引时退化为表锁） | 表锁 |
| 外键 | 支持 | 不支持 |
| 索引组织 | 聚簇索引，叶子节点存整行数据 | 非聚簇索引，叶子节点存数据行物理地址 |
| 数据文件 | `.ibd`（独立表空间）或共享表空间 | `.MYD`（数据）+ `.MYI`（索引） |
| 崩溃恢复 | 有 redo log，崩溃后可恢复到一致状态 | 无事务日志，崩溃后需 `myisamchk` 修复，可能丢数据 |
| `count(*)` | 全表扫描（MVCC 下还需考虑 ReadView） | 维护内部计数器，常量返回 |
| 全文索引 | 5.6 起支持 | 早期就支持 |
| 哈希索引 | 不直接支持（自适应哈希索引 AHI） | 不支持 |
| 压缩 | 支持 Page Compression | 支持 MyISAM Pack |
| 适用场景 | OLTP、高并发读写、强一致 | 读多写少、归档、不需要事务 |

### 事务与崩溃恢复

InnoDB 通过 redo log（重做日志）保证已提交事务的持久性，通过 undo log（回滚日志）保证未提交事务的原子性，并支持 MVCC。即使数据库进程崩溃，重启后也能从 redo log 重做已提交事务、从 undo log 回滚未提交事务。

MyISAM 没有事务日志，写入时直接修改 `.MYD` 文件。崩溃后索引和数据可能不一致，需要 `myisamchk` 修复，修复过程中表不可用，且有可能丢失数据。

### 锁粒度

InnoDB 默认行级锁，但**行锁依附于索引**：如果 `UPDATE`/`DELETE` 的 WHERE 条件没有命中索引，会退化为表锁（实际是逐行加锁直到全表）。MyISAM 任何写操作都加表锁，一个更新会阻塞整张表的所有读写，并发写入能力差。

### 索引组织差异

```
InnoDB 聚簇索引（一张表只有一个）:
  主键 → 整行数据（叶子节点直接存）
  二级索引 → 主键值（查非索引字段需要"回表"）

MyISAM 非聚簇索引（数据与索引分离）:
  主键索引 → 数据行物理地址
  二级索引 → 数据行物理地址（与主键索引结构相同，只是 key 不同）
```

InnoDB 主键越长，所有二级索引就越大（因为二级索引叶子节点要存主键值）。MyISAM 没有这个问题，主键和二级索引在存储上是平级的。

### `count(*)` 为什么 MyISAM 快

MyISAM 在 `.MYI` 中维护了一个表级行数计数器，`SELECT COUNT(*) FROM t` 直接读这个变量，O(1)。InnoDB 由于 MVCC 的存在，不同事务在同一时刻看到的行数可能不同，所以不能维护一个全局计数器，必须扫描聚簇索引或最小的二级索引来计数。优化技巧是使用 `SHOW TABLE STATUS LIKE 't'` 的 `Rows` 字段（估算值，不精确）或维护一张计数表。

## 代码示例

查看表的引擎：

```sql
SHOW TABLE STATUS LIKE 'orders'\G
-- 关注 Engine 字段

-- 或者通过 information_schema
SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'mydb';
```

修改表的引擎（注意：大表会重建全表，锁表时间长）：

```sql
ALTER TABLE orders ENGINE = InnoDB;
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 订单、支付、库存等强一致业务 | 必须选 InnoDB，依赖事务回滚和崩溃恢复 | 不要因为"读多写少"误选 MyISAM |
| 历史日志归档表（只追加、不更新） | 可考虑 MyISAM 或 Archive，写入压缩比高 | 若用 MyISAM，备份用 `mysqldump --single-transaction` 不生效，需 `FLUSH TABLES WITH READ LOCK` |
| 临时统计表 `count(*)` 频繁 | MyISAM 计数器快，但现代 InnoDB 也可加缓存表 | 不要为快 count 选错引擎 |
| 全文搜索 | 5.6+ InnoDB 已支持 FULLTEXT，无需切到 MyISAM | 中文需 `ngram` 分词器 |

## 深挖追问

### InnoDB 的行锁真的只锁一行吗？

不是。InnoDB 行锁锁的是索引记录，不是数据行本身。如果 WHERE 没走索引，会扫描全表并对每条记录加锁，效果等同于表锁。RR 隔离级别下还可能加间隙锁/临键锁，锁定一个范围。

### MyISAM 真的一无是处吗？

不是。在只读或读远多于写、不需要事务、表数据量不大的场景下，MyISAM 没有 InnoDB 的 undo/redo 开销，单条查询可能略快，且 `count(*)` 常量返回。但现代硬件下 InnoDB 的缓冲池已经能覆盖大部分读请求，这种优势基本消失。

### 为什么 MySQL 5.5 把默认引擎从 MyISAM 改成 InnoDB？

因为 Web 业务全面转向 OLTP，事务、并发、崩溃恢复成为刚需。MyISAM 崩溃后修复时间长、并发写入能力差的问题在 2000 年后的高并发场景下暴露无遗。InnoDB 在 5.1 成为插件、5.5 成为默认引擎，是 MySQL 走向"严肃数据库"的关键一步。

## 易错点

- 误以为"MyISAM 读快就适合读多写少"——现代 InnoDB 有缓冲池，纯读性能差距很小，且 MyISAM 崩溃风险不可忽视。
- 误以为"InnoDB 行锁一定锁一行"——WHERE 不走索引时会退化为表级锁。
- 在 MyISAM 表上误用 `mysqldump --single-transaction`——该参数依赖事务，对 MyISAM 无效。
- 误以为 `.frm` 文件包含数据——`.frm` 只存表结构，数据在 `.ibd` 或 `.MYD`。

## 总结

InnoDB 和 MyISAM 的差异本质是 OLTP vs 轻量归档的设计取舍。InnoDB 用聚簇索引 + redo/undo + 行锁换来了事务和并发能力，MyISAM 用非聚簇索引 + 表锁 + 计数器换来了简单和快 count。MySQL 5.5 之后默认 InnoDB，新业务基本不再选 MyISAM，老项目迁移时重点检查事务、外键、`count(*)` 行为差异。

## 参考资料

- [MySQL 8.0 Reference Manual: InnoDB Introduction](https://dev.mysql.com/doc/refman/8.0/en/innodb-introduction.html)
- [MySQL 8.0 Reference Manual: MyISAM Storage Engine](https://dev.mysql.com/doc/refman/8.0/en/myisam-storage-engine.html)

---
