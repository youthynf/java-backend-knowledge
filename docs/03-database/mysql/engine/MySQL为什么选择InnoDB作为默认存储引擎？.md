# MySQL 为什么选择 InnoDB 作为默认存储引擎

## 核心概念

MySQL 5.5 之前默认引擎是 MyISAM，5.5 起（2010 年）改为 InnoDB。这个变更不是性能层面的小调整，而是 MySQL 定位的根本转向：从"轻量 Web 数据库"转向"严肃 OLTP 数据库"。InnoDB 凭借 ACID 事务、行级锁、MVCC、外键约束、崩溃恢复这五项能力，覆盖了订单、支付、库存、账户等绝大多数现代业务场景对一致性和并发的要求，而 MyISAM 在这些场景下要么做不到要么要业务自己补课。

具体到技术点：InnoDB 通过 redo log 保证持久性、undo log 保证原子性和 MVCC、行锁 + 间隙锁解决并发冲突和幻读、聚簇索引让主键查询直接命中数据、Buffer Pool 缓存热数据降低 IO。这些能力是 MyISAM 完全没有的。

## 标准回答

InnoDB 成为默认引擎，是因为它支持 ACID 事务、行级锁、MVCC、外键和崩溃恢复，覆盖了 OLTP 场景对一致性、并发、可靠性的全部需求。MyISAM 不支持事务、只有表锁、崩溃后易丢数据，已不适合现代业务。5.5 起 MySQL 把默认引擎改为 InnoDB，5.6 起进一步把全文索引、在线 DDL 等能力补齐，新业务几乎都选 InnoDB。

## 详细原因

### 1. 事务支持

```sql
START TRANSACTION;
UPDATE account SET balance = balance - 100 WHERE user_id = 1;
UPDATE account SET balance = balance + 100 WHERE user_id = 2;
COMMIT;  -- 或 ROLLBACK
```

转账类操作必须要么全成功要么全失败，否则会出现"扣了款没收钱"的资损。MyISAM 不支持事务，业务要么自己实现两阶段提交，要么承担数据不一致风险。InnoDB 通过 redo/undo log 提供 ACID 保证，是金融、电商业务的硬需求。

### 2. 行级锁与高并发

MyISAM 任何写操作都加表锁，一个事务 `UPDATE` 时整张表的所有读写都被阻塞。在电商、社交这类高并发写入场景下，MyISAM 的吞吐量会迅速成为瓶颈。

InnoDB 默认行级锁（锁的是索引记录），多个事务可以同时更新同一张表的不同行：

```
事务A: UPDATE orders SET status=1 WHERE id=10;  -- 锁 id=10
事务B: UPDATE orders SET status=1 WHERE id=20;  -- 锁 id=20，不冲突
```

配合 MVCC，普通 `SELECT` 不加锁、不阻塞写，读写并发能力大幅提升。

### 3. MVCC 与一致性读

InnoDB 通过 undo log 构建历史版本，让普通 `SELECT` 在不加锁的情况下读到事务开始时刻的快照（RR 隔离级别）或语句开始时刻的快照（RC 隔离级别）。这样读写不互相阻塞，性能远高于"读加共享锁、写加排他锁"的传统方案。

MyISAM 没有 MVCC，所有读要么阻塞要么读到正在被修改的中间状态。

### 4. 崩溃恢复

InnoDB 通过 redo log（WAL，Write-Ahead Logging）保证已提交事务的持久性：

```
1. 修改数据页前，先把 redo log 写到 ib_logfile（顺序写，很快）
2. 数据页可以延迟刷盘（由 Buffer Pool 控制）
3. 崩溃后重启，重做 redo log 中已提交但未刷盘的部分
4. 回滚 undo log 中未提交的事务
```

即使数据库进程崩溃或断电，重启后也能恢复到一致状态。MyISAM 直接写 `.MYD`，崩溃后索引和数据可能不一致，需要 `myisamchk` 修复，且可能丢数据。

### 5. 外键约束

```sql
CREATE TABLE orders (
  id INT PRIMARY KEY,
  user_id INT,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
```

InnoDB 支持外键，可以在数据库层强制父子表数据一致性。MyISAM 不支持外键，约束只能由应用保证，容易出现"孤儿记录"。

### 6. 聚簇索引

InnoDB 主键索引叶子节点直接存整行数据，主键查询一次 IO 即可命中。MyISAM 主键索引叶子节点存的是数据行的物理地址，需要二次 IO。这个差异让 InnoDB 在主键点查和范围查上更有优势。

## 历史脉络

| 版本 | 时间 | 关键变化 |
|------|------|----------|
| 4.1 | 2004 | InnoDB 作为标准插件 |
| 5.1 | 2008 | InnoDB 成为可插拔存储引擎，但仍非默认 |
| 5.5 | 2010 | **InnoDB 成为默认引擎**，MyISAM 退居二线 |
| 5.6 | 2013 | InnoDB 支持全文索引、在线 DDL、独立 undo 表空间 |
| 5.7 | 2015 | InnoDB 性能优化、JSON 支持、change buffer 增强 |
| 8.0 | 2018 | 数据字典事务化、原子 DDL、自增字段持久化 |

Oracle 收购 InnoDB 公司（2005）和 MySQL（2008）后，把 InnoDB 作为核心方向投入资源，性能和功能持续迭代。这是默认引擎变更背后的商业逻辑。

## 代码示例

查看默认引擎：

```sql
SHOW VARIABLES LIKE 'default_storage_engine';
-- 5.5+ 返回 InnoDB
```

查看会话/全局存储引擎：

```sql
SELECT @@default_storage_engine;
SELECT @@global.default_storage_engine;
```

建表时显式指定：

```sql
CREATE TABLE orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 订单/支付/账户 | InnoDB + 短事务 + 行锁 | WHERE 必须走索引，否则锁退化为表锁 |
| 高并发扣库存 | `UPDATE stock SET num=num-1 WHERE sku=? AND num>0` | 配合 `FOR UPDATE` 或乐观锁 |
| 崩溃后重启 | InnoDB 自动 redo 重做 + undo 回滚 | 启动时间取决于 redo log 大小和未刷盘量 |
| 跨表数据一致性 | 外键 + 事务 | 高吞吐场景有时禁用外键改由应用保证，权衡一致性与性能 |

## 深挖追问

### InnoDB 在哪些场景不如 MyISAM？

- 极端读多写少且表小：MyISAM 没有 undo/redo 开销，单次查询可能略快。
- `count(*)` 频繁且不需要精确：MyISAM 维护计数器，O(1)。
- 历史归档只读表：MyISAM 压缩表（`myisampack`）存储比 InnoDB 更小。

但这些场景在现代硬件和 InnoDB Buffer Pool 面前优势已经很小，且 MyISAM 崩溃风险大，新业务不建议用。

### 为什么不直接淘汰 MyISAM？

向后兼容。系统表、`mysql` 库的部分表（5.7 之前）、第三方工具的临时表仍在用 MyISAM。MySQL 8.0 把系统表全部改为 InnoDB，但 MyISAM 引擎本身仍保留以便老用户迁移。

### InnoDB 行锁是不是绝对优于表锁？

不一定。行锁开销大（要维护锁结构）、并发高时锁管理本身有成本。极小表、或者绝大部分操作都是全表扫描的场景，表锁反而更高效。这也是为什么 Memory、Archive 等引擎仍用表锁。

## 易错点

- 误以为"MySQL 默认引擎一直是 InnoDB"——5.5 之前是 MyISAM。
- 误以为"InnoDB 永远比 MyISAM 快"——纯读小表 MyISAM 可能略快。
- 误以为"MyISAM 完全没用"——历史归档、`count(*)` 不需要精确时仍有人用。
- 误以为"行锁一定锁一行"——WHERE 不走索引时锁全表。
- 误以为"外键一定加"——高并发业务常主动禁用外键，由应用层保证一致性以降低锁争用。

## 总结

MySQL 选择 InnoDB 作为默认引擎，是因为它用 ACID 事务、行级锁、MVCC、外键、崩溃恢复这五项能力覆盖了 OLTP 场景的核心需求，而 MyISAM 在这些维度上要么做不到要么要业务补课。5.5 是分水岭，之后 InnoDB 在功能、性能、可靠性上持续投入，新业务几乎都选 InnoDB，MyISAM 仅在归档、读多写少等小众场景下保留。

## 参考资料

- [MySQL 5.5 Release Notes: InnoDB as Default](https://dev.mysql.com/doc/relnotes/mysql/5.5/en/news-5-5-0.html)
- [MySQL 8.0 Reference Manual: InnoDB Introduction](https://dev.mysql.com/doc/refman/8.0/en/innodb-introduction.html)

---
