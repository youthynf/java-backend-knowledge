# Redis 主从集群可以保证数据一致性吗

## 核心概念

Redis 主从复制默认是异步的：主节点写入成功后立即返回客户端，然后再把写命令传播给从节点。这意味着主从之间存在复制延迟——主节点上有的数据从节点可能还没有。所以 Redis 主从集群默认只能保证最终一致，不能保证强一致。

更严重的是故障切换时的数据丢失：主节点写入后还没来得及同步给从节点就宕机，从节点被提升为新主，原主未同步的写入就丢了。脑裂场景下旧主继续接收写入，恢复后会被新主覆盖，旧主的写入全部消失。

可以通过 `WAIT`、`min-replicas-to-write` 等机制降低风险，但不能把 Redis 变成强一致数据库。强一致需求要用 ZooKeeper、etcd 等 CP 系统。

## 标准回答

Redis 主从集群不能保证强一致，只能保证最终一致。原因：复制默认异步，主从之间存在延迟；故障切换时未同步的命令会丢；脑裂时旧主写入被新主覆盖。可以通过 `WAIT numreplicas timeout` 让客户端等待副本确认、`min-replicas-to-write` + `min-replicas-max-lag` 阻止孤主写入，降低风险但不等于强一致。强一致需求应选 ZooKeeper、etcd 等 CP 系统。

要点：

1. 异步复制：主节点不等从节点 ACK，性能高但有丢失窗口。
2. 故障切换丢数据：主节点宕机时未同步的命令会永久丢失。
3. 读写分离旧读：复制延迟期间读从节点可能拿到旧数据。
4. `WAIT` 命令：让客户端等待副本确认收到复制流，但不保证持久化。
5. `min-replicas-to-write`：从节点不足或延迟过高时主节点拒绝写入，降低脑裂风险。

## 实现原理

### 异步复制的丢失窗口

```text
t0: 客户端 SET k v 发给主节点
t1: 主节点执行命令，写 AOF，返回 OK 给客户端
t2: 主节点通过命令传播把 SET k v 发给从节点  <-- 异步，不等
t3: 从节点执行 SET k v，更新 offset

如果 t1-t2 之间主节点宕机：
  - 从节点被提升为新主
  - 客户端以为写入成功的 k=v 在新主上不存在
  - 数据丢失
```

### 读写分离的旧读问题

```text
t0: 客户端 A SET user:1 {name:"Tom"}  -> 主节点执行成功
t1: 客户端 B 立即 GET user:1           -> 读从节点
t2: 从节点尚未同步 t0 的写入            -> 返回 {name:"Old"}

业务表现：刚改完资料立刻查还是旧的
```

### 脑裂场景的数据丢失

```text
原主 M (192.168.1.10)             从 S1, S2
   |                                 |
   | ---网络分区---                  |
   |                                 |
M 仍能接受客户端写入                  哨兵认为 M 下线
缓存到 replication buffer             选举 S1 为新主
（无法同步给从节点）                   S1 开始接受写入
   |                                 |
   | ---网络恢复---                  |
   |                                 |
哨兵把 M 降级为 S1 的从节点
M 触发全量复制，清空本地数据
分区期间 M 接收的写入全部丢失
```

### WAIT 命令的作用与局限

```bash
SET order:1001 paid
WAIT 1 1000    # 等待至少 1 个从节点在 1000ms 内确认收到复制流
```

`WAIT` 的语义：让客户端阻塞，直到指定数量的从节点确认收到了复制流（不等于持久化、不等于执行完成）。

局限：

- 只确认从节点收到了字节流，不保证从节点执行完。
- 不等从节点 fsync 落盘，从节点宕机仍可能丢。
- 超时返回的是已确认数量，可能是 0，业务要自己处理。
- 在 Cluster 模式下只对当前 key 所在主节点的从节点生效。

### min-replicas-to-write 配置

```conf
# 主节点至少有 1 个从节点延迟不超过 10 秒时才接受写入
min-replicas-to-write 1
min-replicas-max-lag 10
```

工作机制：

```text
主节点每次处理写命令前检查：
  当前 ACK 有效的从节点数量 >= min-replicas-to-write
  且每个从节点的 lag <= min-replicas-max-lag
  满足 -> 正常写入
  不满足 -> 返回错误 NOREPLICAS

效果：
  脑裂时 M 与所有从节点失联
  M 拒绝写入，避免脑裂期间产生新数据
  网络恢复后 M 已无新增数据，被降级为从不会丢失
```

### Redis 版本演进的一致性增强

| 版本 | 增强 |
|------|------|
| 2.8 | 引入 PSYNC 增量复制，减少全量复制导致的不一致窗口 |
| 4.0 | psync2，故障切换后部分场景仍可增量 |
| 5.0 | `replicaof` 取代 `slaveof`，复制日志更详细 |
| 6.0 | `WAIT` 在 Cluster 模式下更准确 |
| 7.0 | 多 Replica backlog，故障切换后从节点恢复更平滑 |

### 一致性等级与适用场景

| 一致性等级 | 实现方式 | 适用场景 |
|------------|----------|----------|
| 最终一致 | 默认异步复制 | 缓存、计数器、排行榜 |
| 读己写 | 客户端写后短时间读主 / 会话粘性 | 用户资料更新 |
| 单调读 | 同一用户固定读同一从节点 | 信息流 |
| 强一致读 | 关键读走主节点 | 账户余额查询 |
| 接近强一致 | `WAIT` + `min-replicas-to-write` | 限流、分布式锁（仍有窗口） |
| 真正强一致 | 改用 etcd/ZooKeeper | 配置中心、选主 |

## 代码示例

### WAIT 实战

```bash
# 写入关键数据，等待 2 个从节点确认
SET order:1001 paid
WAIT 2 5000

# 返回值 2 表示 2 个从节点确认
# 返回值 0 表示超时无确认，业务要做补偿（重试或回滚）
```

### Java 客户端使用 WAIT

```java
// Jedis
jedis.set("order:1001", "paid");
Long confirmed = jedis.waitReplicates(2, 5000); // 等待 2 个副本，5 秒超时
if (confirmed < 2) {
    // 补偿：记录日志、走异步对账、或回滚
    log.warn("WAIT confirmed={}, expected=2", confirmed);
}

// Lettuce
RedisCommands<String, String> sync = connection.sync();
sync.set("order:1001", "paid");
Long confirmed = sync.dispatch(ConsoleCommands.createWait(2, 5000));
```

### 配置 min-replicas

```conf
# 主节点配置
min-replicas-to-write 1
min-replicas-max-lag 10

# 配合哨兵
sentinel monitor mymaster 192.168.1.10 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 30000
sentinel parallel-syncs mymaster 1
```

### 读写分离一致性策略

```java
public class ConsistentRedisClient {
    private JedisPool masterPool;
    private List<JedisPool> slavePools;

    // 强一致读：直接读主
    public String readStrong(String key) {
        try (Jedis jedis = masterPool.getResource()) {
            return jedis.get(key);
        }
    }

    // 写后读：写入后 1 秒内读主
    public String readAfterWrite(String key, long writeTimestamp) {
        if (System.currentTimeMillis() - writeTimestamp < 1000) {
            return readStrong(key);
        }
        return readFromSlave(key);
    }

    // 普通读：读从
    public String readFromSlave(String key) {
        // 轮询或随机选从节点
        JedisPool pool = slavePools.get(ThreadLocalRandom.current().nextInt(slavePools.size()));
        try (Jedis jedis = pool.getResource()) {
            return jedis.get(key);
        }
    }
}
```

## 实战场景

| 场景 | 一致性策略 | 注意点 |
|------|------------|--------|
| 缓存 | 最终一致，读从写主 | 缓存击穿和雪崩要单独防护 |
| 用户资料 | 写后短时间读主 | 设置 1-2 秒会话粘性窗口 |
| 计数器 | 异步复制 + 定期对账 | 关键计数走 MySQL |
| 分布式锁 | Redlock 或 etcd | 单 Redis 主从锁在切换时可能失效 |
| 排行榜 | 最终一致 | 重建可从原始数据重算 |
| 限流 | `WAIT` + `min-replicas-to-write` | 限流本身有容错，少量误差可接受 |

## 深挖追问

### 1. Redis 为什么不直接做同步复制？

同步复制会显著增加写延迟：主节点要等所有从节点 ACK 才返回客户端，从节点慢或网络抖动直接拖垮主节点。而且同步复制降低可用性——任何一个从节点故障都会导致主节点拒绝写入。Redis 的定位是高性能缓存，选择了异步复制 + 最终一致。

### 2. WAIT 能保证强一致吗？

不能。`WAIT` 只确认从节点收到了复制流（字节流），不保证从节点执行完，更不保证 fsync 落盘。从节点宕机仍可能丢。`WAIT` 是"降低风险"，不是"实现强一致"。如果业务真要强一致，应该用 CP 系统。

### 3. min-replicas-to-write 能彻底解决脑裂吗？

不能。它只是降低风险：脑裂时孤主拒绝写入，避免新增数据被覆盖。但脑裂期间旧主已经接收的写入仍可能丢失（在它降级为从时清空）。而且配置 `min-replicas-to-write 1` 意味着只要有一个从节点延迟正常就允许写，仍然有窗口。

### 4. 主从切换后从节点会丢多少数据？

取决于复制延迟和切换速度。最坏情况：主节点宕机前一刻刚写入但还没传播，从节点没收到，这部分丢失。哨兵 `down-after-milliseconds` 越小切换越快，但误判概率也越高。典型配置下丢失窗口在 1-30 秒。

### 5. 如何监控主从一致性？

```bash
# 主节点
redis-cli INFO replication | grep -E "master_repl_offset|connected_slaves|lag"

# 从节点
redis-cli INFO replication | grep -E "slave_repl_offset|master_link_status|master_last_io_seconds_ago"

# 计算 lag = master_repl_offset - slave_repl_offset
```

监控 `master_repl_offset - slave_repl_offset` 的差值，超过阈值告警。Prometheus + redis_exporter 有现成指标。

## 易错点

- 把"主从同步"等同于"强一致"——异步复制必然有窗口。
- `WAIT` 超时返回 0 时不处理——业务要做补偿。
- `min-replicas-to-write` 在 Cluster 模式下按节点生效，不是按槽。
- 读从节点拿到旧值就以为缓存坏了——可能是正常复制延迟。
- 主从切换后立即大量写入新主，从节点还没同步完，容易加剧延迟。

## 总结

Redis 主从集群默认只能保证最终一致，不能保证强一致。原因有三：异步复制有延迟、故障切换丢数据、脑裂场景旧主写入被覆盖。`WAIT` 和 `min-replicas-to-write` 是降低风险的工具，不是实现强一致的手段。真正强一致的场景要选 etcd、ZooKeeper 等 CP 系统。工程实践：缓存类业务接受最终一致，关键数据走 MySQL + 异步对账，分布式锁等场景评估容忍度后选合适工具。

## 参考资料

- [Redis Replication 官方文档](https://redis.io/docs/management/replication/)
- [Redis WAIT 命令](https://redis.io/commands/wait/)
- [Redis Sentinel 高可用](https://redis.io/docs/management/sentinel/)
