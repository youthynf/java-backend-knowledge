# Redis 和 MySQL 单节点能扛多并发量

## 核心概念

"Redis 和 MySQL 单节点能扛多少并发"是面试高频问题，但没有标准答案——容量取决于硬件配置、数据模型、命令复杂度、SQL 复杂度、连接数、网络、持久化策略、读写比例和响应时间目标。给出固定数字而不说明前提都是不严谨的。

经验上：Redis 单节点处理简单 `GET/SET` 通常在数万到十几万 QPS；MySQL 单节点简单主键查询可达数千到数万 QPS，复杂 Join、写事务会显著降低吞吐。这些数字只是量级参考，真实容量必须通过压测和监控得到 P95/P99 延迟、错误率、资源水位后才能定。

容量评估方法比记住某个数字更重要：先压测找瓶颈，再根据业务峰值留余量，最后用监控验证。

## 标准回答

Redis 单节点简单命令通常 5-15 万 QPS，瓶颈主要是网络带宽、CPU 单核和持久化 IO；MySQL 单节点简单主键读可达 1-5 万 QPS，写事务通常 1000-5000 TPS，瓶颈在磁盘 IO、锁、事务和 SQL 复杂度。具体数字必须压测得到，要看 P95/P99 延迟、错误率、CPU/内存/磁盘/网络水位。容量评估要结合业务峰值 + 安全余量 + 监控告警，不能只报一个数字。

要点：

1. Redis 5-15 万 QPS（简单命令），瓶颈在内存、CPU 单核、网络、持久化。
2. MySQL 简单读 1-5 万 QPS，复杂写 1000-5000 TPS，瓶颈在磁盘 IO、锁、SQL。
3. 大 Key、慢命令、复杂 SQL 会让单节点吞吐下降一个数量级。
4. 连接数不等于并发能力，过多连接增加调度开销。
5. 容量结论必须来自压测（redis-benchmark、sysbench）和线上监控。

## 实现原理

### 影响并发能力的关键因素

```text
Redis 单节点：
  + 硬件
    - CPU 单核频率（Redis 主线程单核）
    - 内存大小和带宽
    - 网卡带宽（千兆 ≈ 100MB/s ≈ 10 万小包 QPS）
    - 磁盘 IO（持久化 fsync）

  + 业务
    - 命令复杂度（GET O(1) vs KEYS O(N) vs ZRANGE O(logN+M)）
    - Value 大小（1KB vs 1MB 差 1000 倍）
    - 持久化策略（fsync always vs no）
    - 主从复制压力

  + 配置
    - maxclients 连接数上限
    - io-threads（6.0+ 多线程 IO）
    - 是否启用 AOF/RDB

MySQL 单节点：
  + 硬件
    - CPU 核数（多核并行）
    - 内存大小（Buffer Pool 命中率）
    - 磁盘 IO（SSD vs HDD，IOPS 差百倍）
    - 网卡带宽

  + 业务
    - SQL 复杂度（主键查 vs 多表 Join vs 子查询）
    - 索引设计（走索引 vs 全表扫描）
    - 事务长度（短事务 vs 长事务）
    - 锁竞争（行锁 vs 表锁）
    - 数据量（小表 vs 亿级大表）

  + 配置
    - innodb_buffer_pool_size
    - innodb_flush_log_at_trx_commit
    - max_connections
    - 隔离级别
```

### 典型场景下的 QPS 量级

| 场景 | Redis QPS | MySQL QPS |
|------|-----------|-----------|
| 简单 GET（小 value） | 10-15 万 | 3-5 万 |
| 简单 SET（小 value） | 8-12 万 | 1-2 万 |
| 复杂命令（ZRANGE） | 1-3 万 | - |
| 大 Key（1MB value） | 1-3 千 | 1-3 千 |
| 多表 Join | - | 500-2000 |
| 写事务（短） | - | 1000-5000 TPS |
| 写事务（长，含远程调用） | - | 100-500 TPS |

### 瓶颈定位思路

```text
Redis 性能下降排查：
  1. SLOWLOG GET 10          -> 找慢命令
  2. INFO commandstats        -> 看命令分布
  3. LATENCY DOCTOR           -> 延迟诊断
  4. INFO persistence         -> AOF/RDB 状态
  5. INFO clients             -> 连接数
  6. INFO memory              -> 内存使用
  7. iostat -x 1              -> 磁盘 IO
  8. top -H -p <pid>          -> CPU 各核心

MySQL 性能下降排查：
  1. SHOW PROCESSLIST         -> 当前连接
  2. SHOW ENGINE INNODB STATUS -> 锁等待、事务
  3. 慢查询日志               -> 慢 SQL
  4. EXPLAIN <sql>            -> 执行计划
  5. SHOW STATUS LIKE 'Innodb_buffer_pool%'  -> 命中率
  6. SHOW STATUS LIKE 'Threads%'  -> 连接数
  7. iostat -x 1              -> 磁盘 IO
```

### Redis 6.0+ 多线程 IO 对容量的影响

```text
Redis 6.0 前：
  单线程 IO + 单线程命令执行
  瓶颈在单核 CPU 和网络

Redis 6.0+ 开启多线程 IO：
  io-threads 4
  io-threads-do-reads yes

  - IO 线程负责读写 socket
  - 主线程仍负责命令执行
  - 网络密集场景 QPS 提升 50%-100%
  - 命令执行仍是单线程瓶颈
```

## 代码示例

### Redis 压测

```bash
# 基础压测：GET/SET
redis-benchmark -h 127.0.0.1 -p 6379 -t get,set -n 1000000 -c 200 -d 100

# 测试不同 value 大小
redis-benchmark -t set -n 100000 -c 50 -d 100     # 100 字节
redis-benchmark -t set -n 100000 -c 50 -d 1024    # 1KB
redis-benchmark -t set -n 100000 -c 50 -d 10240   # 10KB
redis-benchmark -t set -n 100000 -c 50 -d 102400  # 100KB（看大 Key 影响）

# 测试 Lua 脚本
redis-benchmark -n 100000 -c 50 eval "return redis.call('set', KEYS[1], 'v')" 1 test:key

# 管道压测
redis-benchmark -t set -n 100000 -c 50 -P 16      # pipeline 16
```

### MySQL 压测（sysbench）

```bash
# 准备数据：1000 万行
sysbench oltp_read_write \
  --mysql-host=127.0.0.1 \
  --mysql-port=3306 \
  --mysql-user=root \
  --mysql-password=xxx \
  --mysql-db=test \
  --tables=10 \
  --table-size=1000000 \
  prepare

# 读写混合压测
sysbench oltp_read_write \
  --mysql-host=127.0.0.1 \
  --mysql-port=3306 \
  --mysql-user=root \
  --mysql-password=xxx \
  --mysql-db=test \
  --tables=10 \
  --table-size=1000000 \
  --threads=200 \
  --time=300 \
  run

# 只读压测
sysbench oltp_read_only \
  --threads=200 --time=300 \
  ... run
```

### 监控指标采集

```bash
# Redis 关键指标
redis-cli INFO stats | grep -E "total_commands_processed|instantaneous_ops_per_sec|rejected_connections|expired_keys|evicted_keys"
redis-cli INFO cpu    # CPU 使用
redis-cli INFO memory  # 内存使用

# MySQL 关键指标
mysql -e "SHOW GLOBAL STATUS LIKE 'Questions'"           # 总查询数
mysql -e "SHOW GLOBAL STATUS LIKE 'Threads_connected'"   # 连接数
mysql -e "SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_read_requests'"
mysql -e "SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool_reads'"
# 命中率 = 1 - Innodb_buffer_pool_reads / Innodb_buffer_pool_read_requests
```

### 容量评估示例

```text
业务场景：电商商品详情页缓存
  - 商品数 100 万
  - 平均 value 5KB（含描述、图片 URL）
  - 峰值 QPS 5000
  - 读多写少，读写比 100:1

Redis 容量评估：
  数据量 = 100 万 × 5KB = 5GB（含元数据约 8GB）
  单节点 8GB 内存够用
  QPS 5000 远低于单机瓶颈 10 万
  -> 单机 Redis + 主从即可，不必上 Cluster

MySQL 容量评估：
  商品表 100 万行，单行 1KB，总 1GB
  Buffer Pool 4GB 可全缓存
  简单主键查询 QPS 可达 3-5 万
  业务 QPS 5000（缓存击穿时）也能扛
  -> 单机 MySQL 即可

结论：单机 Redis + 单机 MySQL + 主从备份即可，无需集群
```

## 实战场景

| 场景 | Redis 容量 | MySQL 容量 | 建议 |
|------|------------|------------|------|
| 小型应用（QPS < 1 万） | 单机够用 | 单机够用 | 主从备份即可 |
| 中型应用（QPS 1-10 万） | 单机或主从 | 主从+读写分离 | 主从+哨兵 |
| 大型应用（QPS > 10 万） | Cluster 分片 | 分库分表 | Cluster + 分库分表 |
| 缓存击穿场景 | 单机可能扛不住 | DB 直接被打爆 | 互斥锁 + 限流 + 熔断 |
| 热点数据 | 单 key 热点 | 单表热点 | 多副本 + 本地缓存 |

## 深挖追问

### 1. 为什么 Redis QPS 通常比 MySQL 高？

Redis 数据在内存，访问纳秒级；命令模型简单，O(1) 操作多；单线程避免锁竞争和上下文切换；IO 多路复用让一个线程处理大量连接。MySQL 要处理 SQL 解析、查询优化、事务、锁、日志刷盘、磁盘页读写，每个环节都有开销，复杂度高出一个数量级。

### 2. 只看 QPS 够吗？

不够。还要看响应时间（P50/P95/P99）、错误率、CPU、内存、磁盘 IO、网络带宽、连接数、主从延迟、慢查询比例。高 QPS 但 P99 几秒对用户仍不可接受。容量评估必须多维指标。

### 3. Redis 单线程为什么也能扛 10 万 QPS？

10 万 QPS = 每命令 10 微秒。内存操作纳秒级，IO 多路复用让 socket 读写不阻塞，单条命令耗时主要在网络往返（局域网 0.1-0.5ms）。所以实际瓶颈不是 CPU 而是网络。6.0+ 多线程 IO 进一步把网络 IO 并行化。

### 4. MySQL 单机最高能到多少 QPS？

优化好的 MySQL 单机：简单主键读可达 5-10 万 QPS（数据全在 Buffer Pool、走主键索引）；写 TPS 通常 2000-5000（受 redo log 刷盘限制）；复杂 Join 通常 500-2000 QPS。极端优化（PCIe SSD、大内存、调优参数）能更高，但性价比要算。

### 5. 容量评估怎么做？

```text
1. 业务侧
   - 收集业务峰值 QPS、读写比、平均/最大 value 大小
   - 估算未来 1 年增长

2. 压测
   - 用真实数据和真实 SQL 压测
   - 逐步加压直到延迟超过目标（如 P99 < 100ms）
   - 记录此时的 QPS、CPU、内存、IO

3. 容量规划
   - 单机容量 = 压测峰值 × 0.7（留 30% 余量）
   - 集群节点数 = 业务峰值 / 单机容量
   - 数据量评估：内存要够装下 + 30% 余量

4. 监控验证
   - 上线后持续监控 QPS、延迟、资源水位
   - 接近 70% 时启动扩容
```

## 易错点

- 报一个固定数字而不说明前提，容量评估脱离场景没意义。
- 把"QPS 高"等同于"性能好"，忽视延迟、错误率、资源水位。
- 用 `redis-benchmark` 默认配置压测得到 10 万 QPS，就以为生产能扛 10 万，没考虑大 Key、慢命令、持久化影响。
- MySQL 用 `sysbench` 默认小表压测出 10 万 QPS，但生产亿级表复杂 SQL 远达不到。
- 只看 QPS 不看 RT，高 QPS + 高延迟对用户仍是灾难。

## 总结

Redis 单节点简单命令通常 5-15 万 QPS，MySQL 单节点简单读 1-5 万 QPS、写 1000-5000 TPS。这些数字只是量级参考，真实容量受硬件、业务、配置多重因素影响，必须通过压测（redis-benchmark、sysbench）和监控验证。容量评估方法比记住数字更重要：业务峰值 + 压测找瓶颈 + 安全余量 + 监控告警。Redis 瓶颈主要在 CPU 单核、内存、网络、持久化；MySQL 瓶颈主要在磁盘 IO、锁、事务、SQL 复杂度。记住"具体场景具体压测"比记数字重要。

## 参考资料

- [Redis Benchmark 官方文档](https://redis.io/docs/management/optimization/benchmarks/)
- [sysbench GitHub](https://github.com/akopytov/sysbench)
- [MySQL 性能优化官方文档](https://dev.mysql.com/doc/refman/8.0/en/optimization.html)
