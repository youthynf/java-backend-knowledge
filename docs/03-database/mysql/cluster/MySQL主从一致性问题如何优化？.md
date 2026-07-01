# MySQL 主从一致性问题如何优化

## 核心概念

主从一致性的根源问题是复制延迟。MySQL 主从复制默认异步，主库写完就返回客户端，binlog 异步推送给从库回放。从主库写入到从库回放完成存在时间差，期间读从库可能读到旧数据。

“不一致”分两类：一是延迟导致的“短暂不一致”（从库还没回放到最新位点），二是故障导致的“永久不一致”（主库崩溃丢未推送的 binlog）。优化方向也分两类：降低延迟（让从库尽快跟上）、规避延迟影响（关键读不走从库）。

实践中没有银弹，要根据业务一致性要求选方案：能接受最终一致的用异步+读写分离，强一致的用半同步或 MGR，核心业务用强制读主或选择性读主。

## 标准回答

> 主从一致性问题的根因是异步复制延迟。优化方案分四类：一是容忍最终一致，适合点赞/浏览等弱一致场景；二是半同步复制，主库等至少一个从库收到 binlog，缩小不一致窗口；三是强制读主，核心业务读写都走主库，配合缓存减压；四是选择性读主，用 Redis 标记“刚写过的数据”，写入后短时间强制读主。从库层面用并行复制（MTS）加速回放降低延迟。强一致高可用场景用组复制 MGR，基于 Paxos 多数派，自动选主不丢数据。

## 详细机制

### 问题根源：复制延迟

```
主库写入 → 立即返回客户端成功
         →（异步）推送 binlog 给从库
                              ↓
                         从库回放 binlog
                              ↓
                         从库数据更新（延迟 Lag）
```

延迟期间读从库 → 读到旧数据。延迟根因：

- SQL 线程单线程回放（5.7 前最大瓶颈）
- 大事务回放慢
- 网络带宽限制
- 从库自身负载高

### 方案一：容忍最终一致性

对一致性要求不高的业务（点赞数、浏览量、动态列表）接受短暂延迟，不做特殊处理。架构最简单、性能最好。

适用：社交、新闻、论坛等弱一致场景。不适用：金融、库存、订单。

### 方案二：半同步复制

主库提交事务时，至少等一个从库确认收到 binlog 才返回客户端。这样主库崩溃时至少有一个从库有最新数据，不丢数据。但“收到 binlog”≠“回放完成”，从库读仍可能读到旧数据，只是窗口缩短。

```sql
-- 主库
INSTALL PLUGIN rpl_semi_sync_source SONAME 'semisync_source.so';
SET GLOBAL rpl_semi_sync_source_enabled = 1;
SET GLOBAL rpl_semi_sync_source_timeout = 1000;  -- 1 秒超时降级

-- 从库
INSTALL PLUGIN rpl_semi_sync_replica SONAME 'semisync_replica.so';
SET GLOBAL rpl_semi_sync_replica_enabled = 1;
```

优点：配置简单、原生支持、不丢数据。缺点：写延迟增加（等从库确认）、网络抖动时降级为异步。适用：数据可靠性要求高、能接受写延迟的场景。

### 方案三：强制读主

核心业务读写都走主库，从根本上避免读到旧数据。为了减轻主库读压力，通常引入 Redis 缓存承担大部分读流量。

```
写请求 → 主库（同时更新 Redis 缓存）
读请求 → Redis 缓存（命中直接返回，未命中读主库并回填）
```

优点：强一致。缺点：主库压力大、违背读写分离初衷、架构复杂。适用：金融交易、订单创建后立即查看、库存扣减等强一致场景。

### 方案四：选择性读主

只在“刚写入、可能还没同步”的数据上强制读主，其他读从库。用 Redis 作为“脏标记”路由开关：

```
写主库时：
   1. 写入主库
   2. 在 Redis 写入"脏标记" user:100:dirty = 1，过期时间略大于平均主从延迟（如 3 秒）

读请求时：
   1. 先查 Redis 是否有 user:100:dirty
   2. 有 → 强制读主库（数据可能还没同步到从库）
   3. 无 → 读从库（已过同步窗口，从库数据是最新的）
```

```java
public User getUser(Long userId) {
    String dirtyKey = "user:" + userId + ":dirty";
    if (redis.exists(dirtyKey)) {
        return masterMapper.selectById(userId);  // 刚写过，读主
    }
    return slaveMapper.selectById(userId);  // 安全读从
}

public void updateUser(User user) {
    masterMapper.update(user);
    redis.set("user:" + user.getId() + ":dirty", "1", 3);  // 3 秒过期
}
```

优点：兼顾一致性和性能，灵活。缺点：架构复杂、要维护 Redis、业务代码侵入。适用：读写分离但又需要写后读一致性的场景。

### 方案五：并行复制加速从库

降低延迟本身。从库 SQL 线程单线程回放是延迟主因，5.7+ 的 MTS（Multi-Threaded Slave）支持多线程并行回放：

```sql
SET GLOBAL slave_parallel_type = LOGICAL_CLOCK;
SET GLOBAL slave_parallel_workers = 8;
SET GLOBAL slave_preserve_commit_order = ON;
```

5.7 基于组提交并行（同组事务无锁冲突可并行），8.0 基于 WRITESET 并行（无行冲突即可并行），并行度更高，延迟大幅降低。

### 方案六：组复制 MGR

强一致高可用方案，基于 Paxos 协议多数派确认。事务提交需多数节点确认，主库故障自动选主，不丢数据。

```sql
-- my.cnf
-- group_replication_group_name="..."
-- group_replication_local_address="..."
-- group_replication_group_seeds="..."

INSTALL PLUGIN group_replication SONAME 'group_replication.so';
SET GLOBAL group_replication_bootstrap_group=ON;
START GROUP_REPLICATION;
```

优点：强一致、自动选主、不丢数据。缺点：要求低延迟网络、写性能有损耗、运维复杂。适用：金融级高可用集群。

## 代码示例

监控主从延迟：

```sql
SHOW REPLICA STATUS\G
-- 关注：
-- Seconds_Behind_Master：延迟秒数，0 表示已同步
-- Replica_IO_Running / Replica_SQL_Running：线程是否正常
-- Retrieved_Gtid_Set / Executed_Gtid_Set：差值即未回放事务
```

半同步复制状态：

```sql
-- 主库
SHOW STATUS LIKE 'Rpl_semi_sync_source_clients';  -- 半同步从库数
SHOW STATUS LIKE 'Rpl_semi_sync_source_status';   -- 是否半同步模式
SHOW STATUS LIKE 'Rpl_semi_sync_source_no_tx';    -- 降级为异步的次数
```

并行复制配置：

```sql
SHOW VARIABLES LIKE 'slave_parallel_type';
SHOW VARIABLES LIKE 'slave_parallel_workers';
SHOW VARIABLES LIKE 'binlog_transaction_dependency_tracking';  -- 8.0 WRITESET
```

## 实战场景

| 场景 | 推荐方案 | 取舍 |
|------|---------|------|
| 社交点赞/浏览 | 容忍最终一致 | 最简单 |
| 订单创建后查看 | 强制读主 + 缓存 | 强一致 |
| 用户中心读写分离 | 选择性读主 | 兼顾性能 |
| 金融交易 | MGR 或半同步 + 强制读主 | 不丢不串 |
| 大表报表 | 从库 + 容忍延迟 | 不影响主库 |
| 高写入业务 | 并行复制降低延迟 | 从库更快跟上 |

## 深挖追问

### 1. 半同步复制真的不丢数据吗？

主库崩溃时不丢（至少一个从库有 binlog）。但如果半同步超时降级为异步，之后主库崩溃仍可能丢。`rpl_semi_sync_source_timeout` 控制超时时间，超时后降级以保证主库可用性。严格不丢要配置 `rpl_semi_sync_source_wait_no_slave=ON`（无半同步从库时主库阻塞），但这会牺牲可用性。

### 2. 选择性读主的“脏标记”过期时间怎么定？

略大于平均主从延迟即可。比如监控到 `Seconds_Behind_Master` 平均 1 秒，设 3 秒过期留足余量。太短可能还在延迟窗口内读从库，太长增加主库读压力。

### 3. 并行复制为什么 5.7 才成熟？

5.6 的并行复制基于库（database）级别，多库才能并行，单库场景无效。5.7 引入基于组提交的 LOGICAL_CLOCK 并行，同一组提交的事务无锁冲突可并行。8.0 引入 WRITESET 跟踪行级冲突，并行度更高。这是 MySQL 复制性能的关键演进。

### 4. MGR 和半同步的区别？

半同步只保证 binlog 至少传到一个从库，主库故障切换仍需外部工具（MHA）介入，且切换有窗口。MGR 是集群模式，基于 Paxos 多数派确认事务，自动选主、自动故障转移、强一致。MGR 更像“数据库集群”，半同步是“主从增强”。

### 5. 主从延迟大到什么程度要告警？

业务能容忍的延迟通常 1 秒以内。`Seconds_Behind_Master` 持续超过 5 秒要告警，超过 30 秒要立即排查（大事务、从库负载、网络）。金融业务建议 1 秒告警。

## 易错点

- 把异步复制当强一致：读从库读到旧数据。
- 半同步以为完全防丢：超时降级仍可能丢。
- 选择性读主脏标记过期时间太短：还在延迟窗口读从库。
- 并行复制不开启：单线程回放是延迟主因。
- 从库跑大查询影响回放：报表查询占用从库资源。

## 总结

主从一致性问题的根因是异步复制延迟。优化方案按一致性强度递增：容忍最终一致（最简单）、半同步复制（不丢数据）、强制读主（强一致）、选择性读主（兼顾性能）、并行复制（降低延迟）、MGR（强一致高可用）。选型取决于业务一致性要求和性能容忍度。生产实践常用“半同步 + 并行复制 + 关键业务读主”的组合。

## 参考资料

- [MySQL 8.0 Reference Manual: Replication Semantics](https://dev.mysql.com/doc/refman/8.0/en/replication-semantics.html)
- [MySQL 8.0 Reference Manual: Group Replication](https://dev.mysql.com/doc/refman/8.0/en/group-replication.html)

---
