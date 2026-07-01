# MySQL 主从复制是什么

## 核心概念

主从复制是 MySQL 实现高可用、读写分离、数据备份的基础机制。主库（Master）把数据变更记录到 binlog，从库（Slave/Replica）拉取 binlog 并回放，从而保持与主库数据一致。

复制的核心是 binlog 的传输和重放。主库执行事务后写 binlog，从库 IO 线程拉取 binlog 写入 relay log，SQL 线程读 relay log 重放。这个过程默认异步，主库不等待从库确认，所以存在主从延迟和故障丢数据风险。

主从复制解决了单库的性能瓶颈（读写分离扩展读能力）、可用性问题（主库故障切换到从库）、数据安全问题（从库备份不占用主库）。但它也引入了一致性挑战，特别是延迟和读写分离的“写后读旧数据”问题。

## 标准回答

> MySQL 主从复制依赖 binlog，分三阶段：主库写 binlog、从库 IO 线程拉取 binlog 写 relay log、从库 SQL 线程读 relay log 回放。涉及三个线程：主库 Binlog Dump 线程、从库 IO 线程、从库 SQL 线程。默认异步复制，主库不等待从库，存在延迟和故障丢数据风险。复制模型有异步、半同步、组复制（MGR）。主从延迟由单线程回放、大事务、网络引起，处理方法包括关键读走主库、监控延迟、并行复制。从库数量不宜过多，一般一主二从。

## 实现原理

### 复制三阶段

```
阶段一：主库写 binlog
   主库执行事务 → 写 binlog（两阶段提交）→ 提交事务 → 更新本地数据
   主库 Binlog Dump 线程监听从库请求

阶段二：同步 binlog
   从库 IO 线程连接主库 Binlog Dump 线程
   → 主库推送 binlog 事件
   → 从库 IO 线程写入 relay log
   → 从库记录主库 binlog 位点（master.info）

阶段三：回放 binlog
   从库 SQL 线程读 relay log
   → 重放 binlog 事件（按事务顺序）
   → 更新从库存储引擎数据
   → 记录已回放位点（relay-log.info）
```

文字流程图：

```
主库 Master                          从库 Replica
  │                                    │
事务提交                               │
  ↓                                    │
写 binlog                              │
  ↓                                    │
Binlog Dump 线程 ────网络────→ IO 线程
  │                                    ↓
  │                                 relay log
  │                                    ↓
  │                                 SQL 线程
  │                                    ↓
  │                                 回放更新数据
  │                                    ↓
  │                                 数据与主库一致
```

### 三个线程的职责

| 线程 | 位置 | 职责 |
|------|------|------|
| Binlog Dump | 主库 | 监听从库请求，推送 binlog 事件 |
| IO 线程 | 从库 | 拉取主库 binlog，写入 relay log |
| SQL 线程 | 从库 | 读 relay log，回放 binlog 事件 |

### 复制位点

复制基于位点（position）或 GTID：

- **位点复制**：从库记录主库 binlog 文件名 + 偏移量（`mysql-bin.000001:1234`），传统方式，切换复杂
- **GTID 复制**：每个事务有全局唯一 ID（`server_uuid:transaction_id`），从库自动定位未回放事务，切换简单，5.6+ 推荐

```sql
-- 查看从库状态（8.0+ 用 SHOW REPLICA STATUS，旧版 SHOW SLAVE STATUS）
SHOW REPLICA STATUS\G
-- 关注：
-- Replica_IO_Running / Replica_SQL_Running：线程状态
-- Seconds_Behind_Master：延迟秒数
-- Retrieved_Gtid_Set / Executed_Gtid_Set：已拉取/已回放 GTID
```

### 复制模型

| 模型 | 行为 | 一致性 | 性能 | 适用 |
|------|------|--------|------|------|
| 异步复制（默认） | 主库不等从库 | 弱，主库崩溃丢数据 | 最快 | 互联网通用 |
| 半同步复制 | 主库等至少一个从库收到 binlog | 中，主库崩溃不丢 | 写延迟增加 | 数据安全要求高 |
| 全同步 | 主库等所有从库回放完 | 强 | 最慢 | 几乎不用 |
| 组复制 MGR | 基于 Paxos 多数派 | 强一致 + 自动选主 | 中等 | 高可用集群 |

### 半同步复制

```sql
-- 主库安装插件
INSTALL PLUGIN rpl_semi_sync_source SONAME 'semisync_source.so';
SET GLOBAL rpl_semi_sync_source_enabled = 1;
SET GLOBAL rpl_semi_sync_source_timeout = 1000;  -- 1 秒超时降级为异步

-- 从库安装插件
INSTALL PLUGIN rpl_semi_sync_replica SONAME 'semisync_replica.so';
SET GLOBAL rpl_semi_sync_replica_enabled = 1;
```

主库提交事务时，至少等一个从库确认收到 binlog 才返回客户端。超时后自动降级为异步，避免主库卡死。

### 并行复制

从库 SQL 线程单线程回放是主从延迟主因。MySQL 5.7+ 引入基于组提交的并行复制（MTS，Multi-Threaded Slave），多个事务可并行回放：

```sql
-- 从库开启并行复制
SET GLOBAL slave_parallel_type = LOGICAL_CLOCK;
SET GLOBAL slave_parallel_workers = 8;
SET GLOBAL slave_preserve_commit_order = ON;
```

5.7 基于组提交并行（同一组的事务可并行），8.0 基于 WRITESET 并行（无冲突的事务可并行），并行度更高。

## 代码示例

搭建主从复制：

```sql
-- 主库：创建复制账号
CREATE USER 'repl'@'%' IDENTIFIED BY 'password';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';

-- 主库：查看当前位点
SHOW MASTER STATUS;
-- File: mysql-bin.000001, Position: 1234

-- 从库：配置主库信息
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='master_host',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='password',
  SOURCE_LOG_FILE='mysql-bin.000001',
  SOURCE_LOG_POS=1234,
  SOURCE_AUTO_POSITION=0;  -- GTID 模式设为 1

-- 从库：启动复制
START REPLICA;

-- 从库：查看状态
SHOW REPLICA STATUS\G
```

GTID 模式配置：

```sql
-- 主从库 my.cnf
-- gtid_mode=ON
-- enforce_gtid_consistency=ON

-- 从库用 GTID 自动定位
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='master_host',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='password',
  SOURCE_AUTO_POSITION=1;
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 读写分离 | 写主读从 | 关键读走主库避免延迟 |
| 故障切换 | 主库故障切到从库 | 用 MHA/MGR 自动切换 |
| 数据备份 | 从库备份不占主库 | 备份用 --single-transaction |
| 数据分析 | 从库跑报表 | 大查询可能影响从库 |
| 跨地域容灾 | 异地从库 | 网络延迟影响复制 |

## 深挖追问

### 1. 主从延迟怎么处理？

延迟根因是 SQL 线程单线程回放慢、大事务、网络。处理方法：开启并行复制提升回放速度；关键业务读走主库；监控 `Seconds_Behind_Master` 告警；大事务拆分；网络优化。详见 [MySQL 主从一致性问题如何优化](MySQL主从一致性问题如何优化？.md)。

### 2. 异步复制主库崩溃会丢数据吗？

会。主库提交事务后异步推 binlog 给从库，主库崩溃时未推送的 binlog 对应事务会丢。半同步复制能缓解：主库至少等一个从库收到 binlog 才算提交成功。但半同步降级（从库超时）时仍可能丢。

### 3. 从库越多越好吗？

不是。从库增加，主库 Binlog Dump 线程也增加，消耗主库资源和网络带宽。一般一主二从或一主三从。读压力再大用分库分表或缓存，而不是堆从库。

### 4. GTID 比位点复制好在哪？

GTID 让每个事务全局唯一标识，从库自动定位未回放事务，故障切换时不用手动找位点。位点复制切换要精确计算 binlog 位点，易错。生产建议用 GTID。

### 5. 从库可以再作为主库吗（级联复制）？

可以。A→B→C 级联，B 既是 A 的从库又是 C 的主库。B 的 log_slave_updates=ON 时会把 A 的 binlog 也写入自己的 binlog 传给 C。级联能减轻主库推送压力，但增加延迟。

## 易错点

- 异步复制当强一致用：主从延迟下读从库可能读到旧数据。
- 从库太多拖垮主库：一主多从要控制从库数量。
- 不监控 `Seconds_Behind_Master`：延迟累积到故障切换时丢数据。
- 位点复制切换易错：用 GTID 简化。
- 大事务导致从库回放慢：拆分大事务。

## 总结

MySQL 主从复制基于 binlog，分三阶段：主库写 binlog、从库 IO 线程拉取写 relay log、从库 SQL 线程回放。涉及 Binlog Dump、IO、SQL 三个线程。默认异步复制有延迟和丢数据风险，半同步和 MGR 提升一致性。主从延迟靠并行复制和关键读走主库处理。生产建议 GTID + 并行复制 + 半同步，控制从库数量在一主二从。

## 参考资料

- [MySQL 8.0 Reference Manual: Replication](https://dev.mysql.com/doc/refman/8.0/en/replication.html)
- [MySQL 8.0 Reference Manual: Replication Implementation](https://dev.mysql.com/doc/refman/8.0/en/replication-implementation.html)

---
