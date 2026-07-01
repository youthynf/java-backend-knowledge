# Redis 如何实现数据不丢失

## 核心概念

Redis 是内存数据库，所有数据存在内存里，断电即失。要做到"重启后数据还在"，必须把内存数据以某种形式落盘，重启时再读回来——这就是持久化要解决的问题。

Redis 提供三种持久化方式：RDB 快照、AOF 日志、混合持久化。它们不是互斥的，可以组合使用。每种方式在"数据丢失窗口"和"恢复速度"之间做了不同的取舍：RDB 恢复快但可能丢一个快照周期；AOF 丢失少但恢复慢；混合持久化把两者优点合并。

数据不丢失是相对概念：单机持久化解决不了机器整机故障，所以生产环境还要配合主从复制、哨兵、集群做高可用，以及异地备份做容灾。

## 标准回答

Redis 通过把内存数据写入磁盘实现"重启不丢"。三种方式：RDB 以二进制快照保存全量数据，恢复快但丢失窗口大；AOF 以追加命令日志保存写入操作，丢失窗口小但恢复慢；混合持久化（4.0+）在 AOF 重写时把全量数据用 RDB 格式写入文件头，后续命令用 AOF 追加，兼顾两者。生产推荐配置：开启 AOF + 混合持久化 + 合理 fsync 策略，配合主从复制和定期备份做多重保障。

要点：

1. 三种持久化方式各有取舍，按 RPO（数据丢失容忍度）和 RTO（恢复时间目标）选择。
2. AOF `appendfsync everysec` 是默认推荐，最多丢 1 秒。
3. 持久化不等于备份，仍需要独立的异地备份和恢复演练。
4. 主从复制可以缓解单机故障，但异步复制仍有数据丢失窗口。
5. Redis 7.0 multi-part AOF 让持久化更可靠，混合持久化成为默认形态。

## 实现原理

### 三种持久化对比

| 维度 | RDB | AOF | 混合持久化 |
|------|-----|-----|------------|
| 文件内容 | 二进制全量快照 | 文本写命令日志 | RDB 头 + AOF 尾 |
| 触发方式 | save 配置 / BGSAVE | appendonly yes + fsync | AOF 重写时 |
| 数据丢失窗口 | 一个快照周期（最长 15 分钟） | 0-1 秒（everysec） | 0-1 秒 |
| 恢复速度 | 快（直接加载） | 慢（命令回放） | 快（RDB + 少量 AOF） |
| 文件体积 | 小 | 大 | 中等 |
| 性能影响 | fork 时短暂阻塞 | 主线程 write + 后台 fsync | 同 AOF |
| 默认启用 | 是 | 否 | 5.0+ 默认 yes |

### Redis 4.0 之前：RDB 或 AOF

4.0 之前 RDB 和 AOF 是两条独立路径，启动时如果都存在则只加载 AOF（更完整）。常见做法是 RDB 做定期备份，AOF 做实时持久化。

### Redis 4.0：混合持久化

引入 `aof-use-rdb-preamble`，AOF 重写时把全量数据以 RDB 写到文件头，重启时先加载 RDB 再回放 AOF 增量。这是当前推荐的持久化方案。

### Redis 7.0：multi-part AOF

AOF 文件拆成目录结构：

```text
appendonlydir/
  ├── manifest.aof                  # 清单
  ├── appendonly.aof.1.base.rdb     # base 文件
  ├── appendonly.aof.1.incr.aof     # 增量日志
  └── appendonly.aof.2.incr.aof     # 后续增量
```

每次 AOF 重写生成新的 base + incr，旧的保留为历史。结构更清晰，原子性更好，备份恢复更可靠。

### 数据丢失场景与防护

| 场景 | 丢失原因 | 防护手段 |
|------|----------|----------|
| 单机断电 | fsync 未完成的命令丢失 | `appendfsync everysec` 或 `always` |
| 单机磁盘损坏 | RDB/AOF 文件不可读 | 异地备份 + 主从复制 |
| 主节点宕机 | 异步复制未同步的命令丢失 | `min-replicas-to-write` + 哨兵切换 |
| 脑裂 | 旧主写入被新主覆盖 | `min-replicas-max-lag` + 客户端感知切换 |
| 误操作 FLUSHALL | 同步落盘的命令也会清空数据 | 慢查询审计 + 备份保留 + `rename-command` |
| AOF 文件损坏 | 磁盘故障或断电截断 | `redis-check-aof --fix` + 备份 |

### RDB + AOF 同时开启的行为

```text
启动时：
  1. 检查 appendonly yes -> 加载 AOF（含混合持久化的 RDB 头）
  2. AOF 不存在或关闭 -> 加载 dump.rdb
  3. 都不存在 -> 启动空库

运行时：
  - RDB 按 save 配置生成 dump.rdb
  - AOF 持续追加 + 周期性重写
  - 两者独立，磁盘空间加倍
```

## 代码示例

### 推荐生产配置

```conf
# 开启 AOF
appendonly yes
appendfsync everysec
no-appendfsync-on-rewrite no

# 混合持久化（5.0+ 默认 yes）
aof-use-rdb-preamble yes

# AOF 重写触发
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# RDB 作为补充备份
save 3600 1          # 1 小时一次冷备
save 300 100         # 5 分钟 100 次修改
save 60 10000

# 容错配置
stop-writes-on-bgsave-error yes
aof-load-truncated yes

# 7.0+ multi-part 目录
appenddirname "appendonlydir"
```

### 数据库与缓存分层

```text
业务写 -> MySQL（权威存储）-> 同步 Redis（缓存）
       |
       +--> Redis 持久化兜底（防止 MySQL 慢时缓存击穿）
```

Redis 不做唯一权威存储，DB 才是。Redis 持久化是为"重启不丢缓存"和"主从切换少丢数据"。

### 备份脚本

```bash
#!/bin/bash
# 每天凌晨做一次全量备份，保留 7 天
DATE=$(date +%Y%m%d)
redis-cli BGSAVE
sleep 120
tar czf /backup/redis-${DATE}.tar.gz /var/lib/redis/
find /backup -name "redis-*.tar.gz" -mtime +7 -delete

# 异地拷贝（建议）
rsync -avz /backup/redis-${DATE}.tar.gz backup@remote:/backup/
```

### 故障演练

```bash
# 模拟 AOF 损坏
cp /var/lib/redis/appendonly.aof /tmp/appendonly.aof.bak
echo "corrupt" >> /var/lib/redis/appendonly.aof

# 启动会报错，用工具修复
redis-check-aof --fix /var/lib/redis/appendonly.aof

# 验证数据完整性
redis-cli DBSIZE
redis-cli INFO persistence
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 缓存类业务 | RDB 即可，重启后从 DB 重建 | 不需要 AOF，省磁盘 IO |
| 会话存储 | AOF everysec + 混合持久化 | 最多丢 1 秒会话，业务可接受 |
| 计数器/排行榜 | AOF + DB 兜底 | Redis 不做唯一存储，定期对账 |
| 队列/Stream | AOF always + 主从 + 哨兵 | 关键数据要求强一致，考虑用更可靠的 MQ |
| 金融账户 | Redis 不做权威存储 | 走 MySQL + 分布式事务，Redis 只做加速 |

## 深挖追问

### 1. RDB 和 AOF 怎么选？

按业务对 RPO 和 RTO 的容忍度选。RPO 低（不能丢数据）：AOF everysec 或 always；RTO 低（要快速恢复）：RDB 或混合持久化。两者都要：混合持久化。纯缓存场景甚至可以全关，重启从 DB 重建。

### 2. appendfsync always 真的能零丢失吗？

不能完全零丢失。主线程执行命令到调用 fsync 之间仍有极小窗口；而且 fsync 只是落盘，磁盘自身的 cache、电池都可能在断电时丢数据。`always` 已经接近极限，但不是绝对零丢失。

### 3. 持久化和主从复制哪个更可靠？

互补关系。持久化解决"重启不丢"，主从复制解决"单机故障不丢"。但主从复制是异步的，故障切换时仍可能丢数据，所以主从 + 持久化 + 异地备份才是完整方案。

### 4. 如何评估 RPO 和 RTO？

RPO：根据 fsync 策略和主从延迟估算。`everysec` 单机 RPO ≈ 1 秒；加主从复制 RPO ≈ 1 秒（依赖网络）。

RTO：根据数据量估算。RDB 加载速度约 100-300MB/s，10GB 实例 RTO 约 30-100 秒；AOF 回放速度约 10-50MB/s，10GB 实例 RTO 数分钟。混合持久化接近 RDB 速度。

### 5. 大实例如何减少持久化影响？

单实例内存控制在 10-30GB；开启 `repl-diskless-sync` 让主从同步走网络不落盘；AOF 重写避开高峰；监控 `latest_fork_usec` 和 `aof_delayed_fsync`；必要时拆分集群。

## 易错点

- 把 Redis 持久化当成备份：持久化在实例本地，机器坏了文件也没了，必须有异地备份。
- 关闭 AOF 只用 RDB：丢失窗口可能到 15 分钟，业务能接受再关。
- AOF `always` 性能太差就回退 `everysec`：`always` 适合小流量高安全场景，不能盲目套用。
- 同时开 RDB 和 AOF 但不监控磁盘：磁盘写满后 Redis 拒绝写入，业务直接挂。
- 升级 Redis 不做兼容性验证：4.0+ 混合格式 3.x 读不了，7.0+ multi-part 老版本读不了。

## 总结

Redis 通过 RDB、AOF、混合持久化三种方式实现数据不丢失，各有取舍：RDB 快但丢得多，AOF 全但慢，混合持久化兼顾两者。生产推荐 AOF + 混合持久化 + `appendfsync everysec`，配合主从复制、哨兵、异地备份形成多重保障。Redis 7.0 的 multi-part AOF 让结构更清晰，是当前主流形态。重要原则：Redis 不应作为唯一权威存储，关键数据必须有 MySQL 等强一致系统兜底。

## 参考资料

- [Redis Persistence 官方文档](https://redis.io/docs/management/persistence/)
- [Redis 设计与实现] 黄健宏
- [Redis 7.0 Release Notes](https://github.com/redis/redis/blob/7.0/00-RELEASENOTES)
