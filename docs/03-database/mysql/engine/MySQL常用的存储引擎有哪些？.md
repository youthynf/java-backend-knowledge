# MySQL 常用的存储引擎有哪些

## 核心概念

存储引擎是 MySQL 体系结构里"插件式"的一层：上层是 SQL 解析、优化、执行，下层是各家引擎各自实现的存储与索引方案。同一份 SQL，不同引擎的物理结构、锁粒度、事务支持、崩溃恢复可能完全不同。MySQL 5.5 之前默认 MyISAM，之后默认 InnoDB，但官方还提供 Memory、Archive、CSV、NDB 等多种引擎，针对不同场景做特化。

新业务几乎都选 InnoDB，但了解其他引擎仍有价值：一是面试常考，二是少数场景（内存表、归档表、分布式表）确实需要切到对应引擎。

## 标准回答

MySQL 常用存储引擎包括：InnoDB（默认，OLTP，支持事务和行锁）、MyISAM（历史遗留，读多写少无事务）、Memory（全内存，临时数据，重启丢失）、Archive（高压缩归档，只支持插入和查询）、CSV（CSV 文本存储，便于和外部工具交换）、NDB/Cluster（分布式分片）。绝大多数业务选 InnoDB，其他引擎针对特定场景。

## 引擎详细对比

| 引擎 | 事务 | 锁粒度 | 外键 | 压缩 | 全文索引 | 适用场景 |
|------|------|--------|------|------|----------|----------|
| InnoDB | 支持 | 行锁 | 支持 | 支持 Page Compression | 5.6+ 支持 | OLTP、强一致 |
| MyISAM | 不支持 | 表锁 | 不支持 | 支持 myisampack | 支持 | 读多写少、归档 |
| Memory | 不支持 | 表锁 | 不支持 | 不支持 | 不支持 | 临时数据、缓存 |
| Archive | 不支持 | 行锁 | 不支持 | 高压缩（zlib） | 不支持 | 日志归档、只追加 |
| CSV | 不支持 | 表锁 | 不支持 | 不支持 | 不支持 | 数据交换 |
| NDB Cluster | 支持 | 行锁 | 不支持 | 不支持 | 不支持 | 分布式、高可用 |

## 各引擎详解

### InnoDB（默认）

支持 ACID 事务、行级锁、MVCC、外键、崩溃恢复（redo/undo log），聚簇索引组织数据。5.6 起支持全文索引、在线 DDL、独立 undo 表空间；8.0 起支持原子 DDL、自增字段持久化。

适用：订单、支付、账户、库存等所有 OLTP 业务。

### MyISAM

不支持事务，只有表锁，崩溃后需 `myisamchk` 修复。`.MYD`（数据）+ `.MYI`（索引）+ `.frm`（结构）三文件分离，索引叶子节点存数据行的物理地址。`count(*)` 通过表级计数器常量返回。

适用：只读或读远多于写、不需要事务的归档表。现代业务基本被 InnoDB 取代。

### Memory（原名 HEAP）

数据全部存在内存中，重启后丢失。默认哈希索引（也支持 B+ 树），等值查询 O(1)。表锁。每个表最大大小受 `max_heap_table_size` 限制（默认 16MB）。

适用：会话缓存、临时映射表、ETL 中间结果。注意不要把 Memory 表当业务持久化用。

```sql
CREATE TABLE session_cache (
  session_id VARCHAR(64) PRIMARY KEY,
  user_id BIGINT,
  expire_at BIGINT
) ENGINE=Memory;
```

### Archive

只支持 `INSERT` 和 `SELECT`，不支持 `UPDATE`/`DELETE`。使用 zlib 压缩，压缩比通常 10:1 以上。行锁，写入时只追加不修改。查询时解压。

适用：日志归档、历史订单归档。比 MyISAM 更适合"只追加"的归档场景，因为压缩率更高。

### CSV

数据以 CSV 文本格式存储（`.CSV` 文件），每行一条记录，逗号分隔。不支持索引，所有查询全表扫描。表结构存 `.CSV` 之外的 `.CSM`（元数据）。

适用：与外部工具（Excel、ETL）交换数据。生产业务基本不用。

### NDB Cluster（MySQL Cluster）

NDB 是分布式存储引擎，数据自动分片到多个数据节点（data node），支持透明分片和高可用。提供推送到应用端的 NDB API，单事务延迟低于 InnoDB（适合电信级实时业务），但 join 性能差（数据可能跨节点）。

适用：对可用性和实时性要求极高的分布式场景。运维复杂度高，中小业务基本不选。

## 代码示例

查看支持的引擎：

```sql
SHOW ENGINES;
-- Support 列：DEFAULT 表示默认，YES 表示可用，NO 表示不可用
```

查看某张表的引擎：

```sql
SHOW TABLE STATUS LIKE 'orders'\G
-- 关注 Engine 字段
```

修改表引擎：

```sql
ALTER TABLE orders ENGINE=InnoDB;
-- 大表会重建全表，锁表时间长
```

## 实战场景

| 场景 | 选型 | 注意点 |
|------|------|--------|
| 订单、支付、用户 | InnoDB | 默认即可 |
| 全量日志归档（只追加查询少） | Archive | 压缩比高，省空间 |
| 跨实例数据导出/交换 | CSV 或 `mysqldump --tab` | CSV 不可索引，仅做交换 |
| 临时会话缓存 | Memory 或 Redis | Memory 表重启丢失，重要数据用 Redis |
| 历史读多写少表（无事务） | MyISAM 或 InnoDB | 现代建议仍用 InnoDB，崩溃风险低 |
| 高可用分布式 | NDB Cluster 或分库分表中间件 | NDB 运维复杂，中小业务慎选 |

## 深挖追问

### InnoDB 之外还有支持事务的引擎吗？

NDB Cluster 支持分布式事务。MyISAM/Memory/Archive/CSV 都不支持事务。第三方引擎如 TokuDB（已停更）、RocksDB（MyRocks）也支持事务，但非官方默认。

### Memory 表为什么不要当业务表用？

1. 重启即丢失：MySQL 重启或崩溃后 Memory 表数据全没。
2. 表锁：并发写入能力差。
3. 内存占用：数据全在内存，大表会挤压 Buffer Pool。
4. 不支持事务：无法回滚。
作为业务表用，等价于"裸跑无持久化"。

### Archive 为什么不更新不删除？

Archive 的设计目标是"日志归档"，强调压缩比和写入吞吐。如果允许更新/删除，需要维护索引和版本，压缩比和写入速度都会下降。归档场景下"只追加"是合理假设。

### NDB 和分库分表中间件（ShardingSphere）有什么区别？

NDB 是存储引擎层的分布式，对应用透明（看起来像一张表），但 join 跨节点性能差。ShardingSphere 是中间件层，应用感知分片，但可以用任意存储引擎。NDB 适合"实时电信级"，ShardingSphere 适合"互联网分库分表"。

## 易错点

- 误以为"内存表 = Memory"——MySQL 还有临时表（`CREATE TEMPORARY TABLE`），临时表默认用 InnoDB，不是 Memory。
- 误以为"Memory 表快就用它做业务表"——重启丢失，数据不持久。
- 误以为"MyISAM 适合归档"——Archive 压缩比更高，更适合只追加归档。
- 误以为"修改引擎很轻"——`ALTER TABLE ... ENGINE=` 对大表会锁表很久，需用 `pt-online-schema-change`。
- 误以为"NDB = 高性能"——NDB 单点查快，但跨节点 join 差，OLTP 复杂查询不如 InnoDB。

## 总结

MySQL 提供多种存储引擎以适应不同场景：InnoDB 是 OLTP 默认选择，MyISAM 是历史遗留，Memory 用于内存临时数据，Archive 用于高压缩归档，CSV 用于数据交换，NDB 用于分布式。新业务几乎都选 InnoDB，其他引擎在小众场景保留。理解每个引擎的事务、锁、持久化特性，是避免误用的前提。

## 参考资料

- [MySQL 8.0 Reference Manual: Storage Engines](https://dev.mysql.com/doc/refman/8.0/en/storage-engines.html)
- [MySQL 8.0 Reference Manual: Comparison of Storage Engines](https://dev.mysql.com/doc/refman/8.0/en/storage-engines-table-types.html)

---
