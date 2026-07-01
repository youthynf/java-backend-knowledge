# 为什么 Redis 比 MySQL 快

## 核心概念

讨论这个问题的前提是先认清两者定位：Redis 是以内存为核心的高性能 KV 与数据结构服务器，常用于缓存、计数器、排行榜、分布式锁等低延迟场景；MySQL 是关系型数据库，核心目标是持久化、ACID 事务、复杂查询和数据一致性。"Redis 比 MySQL 快"不是因为 MySQL 差，而是因为二者在存储介质、数据模型、执行路径和一致性目标上完全不同。

一句话结论：**Redis 主要操作内存，数据结构简单，协议轻量，单线程事件循环避免大量锁竞争；MySQL 面向磁盘持久化和事务一致性，要经过 SQL 解析优化、锁与 MVCC、日志刷盘、索引访问等复杂流程，单次请求链路通常更长。**

## 标准回答

Redis 单机典型 QPS 可达 10 万级别（pipeline 模式可达百万），MySQL 单机通常在几千 QPS（主键点查可达 1~2 万）。差距来自五个维度：

1. **存储介质**：Redis 数据常驻内存，纳秒到微秒级访问；MySQL 主路径要操作磁盘页，即便有 Buffer Pool，写场景仍需刷 redo log/binlog。
2. **数据模型**：Redis 提供 String/Hash/List/Set/ZSet 等原语，命令语义明确，服务端不做 SQL 解析、不选择执行计划；MySQL 要做词法语法解析、优化器代价估算、可能走索引也可能全表扫描。
3. **线程模型**：Redis 命令执行长期单线程，避免锁竞争；MySQL 用多线程处理并发，需要加锁、MVCC、事务隔离。
4. **协议开销**：Redis RESP 协议简单，解析成本低；MySQL 协议要处理握手、认证、字符集、预编译语句、结果集元数据。
5. **一致性目标**：Redis 不提供 ACID 级别事务保证（虽支持 MULTI/EXEC 但不回滚）；MySQL 要支持 ACID、外键、唯一约束、崩溃恢复，链路必然更重。

## 详细机制

### 1. 内存访问 vs 磁盘 I/O

内存访问延迟通常是 100ns 量级，SSD 随机访问是 100μs 量级，机械盘是 10ms 量级。Redis 把热点数据放内存，普通 `GET/SET` 链路非常短。MySQL 一次更新即使命中 Buffer Pool，仍可能涉及：

- 查找 B+Tree 索引页
- 修改 Buffer Pool 中的数据页（dirty page）
- 写 undo log 支持回滚和 MVCC
- 写 redo log（顺序写，WAL 机制）保证崩溃恢复
- 写 binlog 支持复制和归档
- 后续异步刷脏页到磁盘

Redis 写操作虽然也有 AOF/RDB，但默认 `appendfsync everysec`，主路径只是写内存 + 写 AOF 缓冲区，刷盘异步。

### 2. 数据结构与命令语义

Redis 直接提供结构化原语，命令即操作：

```bash
GET user:1
HGET user:1 name
ZREVRANGE rank 0 9 WITHSCORES
```

服务端不做 SQL 解析、不做 Join、不选择执行计划。MySQL 则需要解析 SQL、生成执行计划、可能走索引也可能全表扫描、可能产生临时表。

### 3. 单线程事件循环

Redis 命令执行主路径长期采用单线程事件循环模型。Redis 6.0 起引入多线程 I/O（默认关闭，需配置 `io-threads`），仅用于网络读写和协议解析，命令执行仍由主线程串行处理。Redis 7.0 对多线程 I/O 进一步优化，但执行模型未变。

这样设计的好处是命令执行阶段无锁竞争，数据结构操作不需要考虑并发安全（如 `INCR`、`ZADD` 都是天然原子的）。

Redis 通过 I/O 多路复用同时处理大量连接，Linux 上常用 `epoll`：

```text
epoll_wait → 返回就绪 fd 列表 → 逐个读取请求 → 解析 RESP → 执行命令 → 写回响应
```

单进程单线程模型下，每个命令执行时间就是性能瓶颈，所以 Redis 强烈建议避免慢命令（`KEYS *`、大集合的 `SMEMBERS`、`HGETALL` 等）。

### 4. 协议简单

Redis 使用 RESP（REdis Serialization Protocol）协议，格式如下：

```text
*3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n
```

- `*3` 表示 3 个参数；
- `$3` 表示下一个参数长度 3 字节；
- 解析成本极低，无需复杂状态机。

Redis 6.0 引入 RESP3 协议（向后兼容），支持更多类型（map、set、big number、verbatim 等）和推送消息，但解析成本仍远低于 MySQL 协议。

MySQL 协议要处理握手包、认证、字符集协商、预编译语句、字段定义、行数据、EOF/OK 包等，链路复杂得多。

### 5. 不承担复杂关系型事务

MySQL 要支持 ACID、外键、唯一约束、隔离级别、崩溃恢复、主从复制等数据库能力。Redis 虽有持久化和事务命令（MULTI/EXEC），但：

- 事务不支持回滚；
- 没有外键、唯一约束（业务侧自行保证）；
- 隔离性弱（单线程串行，但无 MVCC 概念）；
- 持久化是异步的，AOF `everysec` 模式可能丢 1 秒数据。

## 代码示例

典型的"应用 + Redis + MySQL"组合架构：

```text
客户端 → 应用服务 → Redis 缓存（命中即返回）
                  → MySQL（miss 时回源）
```

读取流程：

```java
public User getUser(Long id) {
    String key = "user:" + id;
    User u = redis.get(key, User.class);
    if (u != null) return u;          // 命中缓存，亚毫秒级
    u = mysql.queryById(id);          // 未命中，毫秒级
    if (u != null) {
        redis.setex(key, 300, u);     // 回填 5 分钟
    }
    return u;
}
```

## 实战场景

| 场景 | Redis 与 MySQL 选择 | 关键点 |
|------|---------------------|--------|
| 用户中心读多写少 | Redis 缓存用户基本信息，MySQL 持久化 | 缓存命中率 95%+ 时单 Redis 节点扛住全量读 |
| 商品详情页 | Redis 缓存 JSON，MySQL 存权威数据 | 大促前预热，避免雪崩 |
| 计数器（点赞、PV） | Redis `INCR` 实时累加，定时同步 MySQL | MySQL 扛不住每秒上万次更新 |
| 排行榜 | Redis ZSet 实时排序 | MySQL `ORDER BY` 在亿级数据下无法实时 |
| 强一致金融账务 | 必须以 MySQL 为准 | Redis 仅作查询加速，写后立即删缓存 |
| 全文搜索 | 都不合适 | 用 Elasticsearch |

## 深挖追问

### Redis 一定比 MySQL 快吗？

不一定。以下场景 Redis 可能比 MySQL 还慢：

- 执行 `KEYS *`、`SMEMBERS` 大集合、`ZRANGE` 大范围、`HGETALL` 大 Hash 等慢命令会阻塞主线程；
- 跨机房访问时网络 RTT 可能远大于命令执行时间；
- MySQL 命中 Buffer Pool、SQL 简单且索引优秀时，主键查询可在 0.1ms 内返回；
- Redis 开启 AOF `appendfsync always`、RDB fork 大实例、内存 swap、CPU 打满时都会变慢；
- Redis 单 key 大 value（如 1MB String）的读取比 MySQL 索引查询还慢。

### Redis 能完全替代 MySQL 吗？

不能。原因：

- Redis 内存成本远高于磁盘，不适合存全量历史数据（1TB 内存成本是 1TB SSD 的几十倍）；
- Redis 持久化存在 RDB/AOF 恢复窗口，宕机可能丢数据（AOF `everysec` 默认丢 1 秒）；
- Redis 不支持复杂 SQL、Join、子查询、聚合、窗口函数；
- Redis 没有外键、唯一约束、Check 约束（业务侧自行保证，容易出 bug）；
- Redis 事务不支持回滚，复杂业务场景不适合。

### Redis 6.0 多线程后还会快多少？

多线程 I/O 主要解决网络读写瓶颈，对纯命令执行场景提升有限。压测数据显示在网络成为瓶颈时 QPS 可提升 1~2 倍（如 10 万 → 20 万），但 CPU 计算密集场景几乎无收益。生产环境一般配置 `io-threads 4`、`io-threads-do-reads yes`，超过 8 后收益递减。

```conf
io-threads 4
io-threads-do-reads yes
```

### Redis 单线程为什么还能扛 10 万 QPS？

- 命令执行在内存中，纳秒到微秒级；
- epoll 事件循环无锁竞争；
- RESP 协议解析极快；
- 没有 SQL 解析、优化器开销；
- 简单数据结构操作复杂度低（O(1) 或 O(log N)）。

按平均每条命令 10μs 计算，单线程理论上限是 10 万 QPS。

### 为什么 Redis 不用多线程执行命令？

- 命令执行非常快，多线程切换开销可能抵消并发收益；
- 多线程需要加锁保护数据结构，复杂度高且性能损失大；
- 单线程模型简单，避免并发 bug；
- 真正的瓶颈在网络 I/O，所以 6.0 引入多线程 I/O 即可。

## 易错点

- 只说"Redis 在内存里所以快"过于片面，要展开 5 个维度；
- Redis 单线程不等于慢，它避免了命令执行阶段的锁竞争；
- Redis 不是强一致数据库，不能简单替代 MySQL；
- Redis 慢查询常来自大 Key、慢命令、网络、fork、持久化和内存 swap；
- MySQL 也有 Buffer Pool，不能简单理解成"每次都读磁盘"；
- 把 Redis 当作"内存版 MySQL"使用，忽略持久化和事务差异；
- 忽略 Redis 6.0 多线程 I/O 仅用于网络读写，命令执行仍单线程。

## 总结

Redis 快，是因为它把核心路径做得非常短：内存访问、简单命令、轻量协议、事件驱动、少锁竞争。MySQL 更重，是因为它提供事务、持久化、SQL、索引、Join、约束和恢复能力。**Redis 适合做低延迟、高并发、数据结构化缓存；MySQL 适合做权威数据源。** 真正的系统设计不是二选一，而是根据一致性、延迟、成本和复杂度做组合。

## 参考资料

- [Redis 官方文档：Topics - Performance](https://redis.io/docs/management/optimization/)
- [Redis 官方文档：I/O Threads](https://redis.io/docs/management/optimization/io-threading/)
- [MySQL 官方文档：InnoDB Architecture](https://dev.mysql.com/doc/refman/8.0/en/innodb-architecture.html)
- [RESP3 协议规范](https://github.com/redis/redis-specifications/blob/master/protocol/RESP3.md)

---
