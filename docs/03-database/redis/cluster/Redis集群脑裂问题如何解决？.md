# Redis 集群脑裂问题如何解决

## 核心概念

脑裂（Split-Brain）是指主从集群中主节点因网络分区与从节点失联，但仍在接收客户端写入；同时哨兵感知到主节点"下线"，从节点被选为新主继续写入。这时集群出现两个主节点同时接受写入——客户端写入旧主的数据无法同步到新主，等网络恢复后旧主被降级为从节点，触发全量复制清空本地数据，分区期间旧主接收的写入全部丢失。

脑裂的核心危害是数据丢失：不是丢失主从复制延迟范围内的少量数据，而是丢失整个分区期间旧主接收的全部写入。这在金融、订单等强一致业务里是不可接受的。

Redis 通过 `min-replicas-to-write`（5.0 后改名 `min-replicas-to-write` 仍兼容，新名 `min-replicas-to-write`）和 `min-replicas-max-lag` 两个配置缓解脑裂：主节点发现可用从节点不足或延迟过大时直接拒绝写入，让脑裂期间的旧主无法接受新数据。

## 标准回答

Redis 脑裂指主节点网络分区后仍接收写入，从节点被提升为新主也接收写入，恢复后旧主降级为从触发全量复制，旧主分区期间的写入全部丢失。解决思路是 `min-replicas-to-write N` + `min-replicas-max-lag T`：主节点每秒检查从节点 ACK，可用从节点数 < N 或任一从节点延迟 > T 时拒绝写入。这样脑裂时旧主因失联从节点不足而拒绝写入，避免新增数据被覆盖。Cluster 模式下故障检测要求半数以上主节点同意，本身有防脑裂设计；哨兵模式下要合理配置 quorum。注意这两个配置只能降低风险，不能完全消除脑裂——异步复制本性决定了 Redis 不是 CP 系统。

要点：

1. 脑裂根因：网络分区 + 异步复制 + 故障切换，三者叠加导致双主写入。
2. `min-replicas-to-write N`：可用从节点数少于 N 时主节点拒绝写入。
3. `min-replicas-max-lag T`：从节点 ACK 延迟超过 T 秒视为不可用。
4. Cluster 模式天然防脑裂：故障检测需半数主节点共识，少数派分区无法触发切换。
5. 强一致需求要选 etcd/ZooKeeper，Redis 脑裂防护是"降低风险"非"消除"。

## 实现原理

### 脑裂发生过程

```text
初始状态：
  Master M  <--复制-->  Slave S1, S2
  M 接受客户端写入

t0: 网络分区，M 与 S1、S2 失联
    但 M 与部分客户端网络正常

t1: M 仍接受客户端写入（缓存到 replication buffer）
    M 尝试同步给 S1、S2 但失败

t2: 哨兵发现 M 在 down-after-milliseconds 内无响应
    哨兵判定 M 主观下线
    询问其他哨兵，达 quorum，判定客观下线

t3: 哨兵选 S1 为新主
    S1 开始接受客户端写入
    集群现在有两个主：M（旧主）和 S1（新主）

t4: 网络恢复
    哨兵把 M 降级为 S1 的从节点
    M 触发全量复制：清空本地数据
    M 分区期间接收的写入全部丢失！
```

### min-replicas-to-write 工作机制

```text
主节点维护：
  每个从节点最近一次 ACK 时间
  每个从节点的复制偏移量

每秒检查：
  for each connected slave:
    lag = current_time - slave.last_ack_time
    if lag <= min-replicas-max-lag:
      count += 1

  if count < min-replicas-to-write:
    拒绝写入，返回 NOREPLICAS
  else:
    正常处理写命令
```

### 配置示例与效果

```conf
# 主节点至少有 1 个从节点延迟不超过 10 秒时才接受写入
min-replicas-to-write 1
min-replicas-max-lag 10
```

效果：

```text
正常情况：
  M 有 S1、S2 两个从节点，都正常 ACK
  count = 2 >= 1，M 接受写入

网络分区（脑裂场景）：
  M 与 S1、S2 失联，无法收到 ACK
  等待 10 秒后，count = 0 < 1
  M 拒绝所有写入，返回 NOREPLICAS
  客户端写入失败，业务感知

网络恢复：
  哨兵降级 M 为 S1 的从
  M 本地没有新增数据（因为一直拒绝写入）
  全量复制清空本地数据不丢任何业务数据
  脑裂危害消除
```

### Cluster 模式天然的脑裂防护

```text
Cluster 故障检测流程：
  节点 A 检测到主节点 B 故障，标 PFAIL
  A 通过 Gossip 传播 PFAIL 状态
  半数以上主节点都标 B 为 PFAIL
  A 标 B 为 FAIL，广播

  B 的从节点 B' 检测到 B FAIL
  B' 发起选举，向其他主节点拉票
  多数主节点同意，B' 当选
  B' 接管 B 的槽位

防脑裂原理：
  假设集群 5 主 5 从，网络分区为 3+2
  少数派分区（2 主）无法达成"半数以上"共识
  少数派分区的主节点无法被标 FAIL
  少数派分区的从节点无法当选新主
  少数派分区的主节点继续写入（如果没配 min-replicas）

  但如果配了 min-replicas-to-write 1：
  少数派主节点的从节点不在分区里，ACK 中断
  超过 min-replicas-max-lag 后主节点拒绝写入
  双重防护
```

### 哨兵模式的脑裂防护

```text
哨兵模式脑裂防护主要靠：
1. quorum 配置
   quorum = N/2 + 1，需要多数哨兵同意才能客观下线
   少数派哨兵无法触发故障转移

2. min-replicas-to-write（在 Redis 主节点配置）
   主节点失联从节点后拒绝写入

3. 合理的 down-after-milliseconds
   过短会让网络抖动误判，过长会让真正故障时延迟切换

4. failover-timeout
   控制故障转移超时，避免长时间双主
```

### 不同方案的脑裂防护能力对比

| 方案 | 防护机制 | 防护强度 |
|------|----------|----------|
| 单 Redis | 无 | 无 |
| 主从复制 | 无 | 无 |
| 哨兵 | quorum 多数派 + min-replicas | 中等 |
| Redis Cluster | 半数主节点共识 + min-replicas | 较强 |
| etcd/ZooKeeper | Raft/ZAB 多数派写入 | 强 |
| Redis + WAIT | 客户端等副本确认 | 中等 |

### 脑裂防护版本演进

| Redis 版本 | 脑裂防护改进 | 说明 |
|------------|-------------|------|
| 2.6 | 无 min-replicas | 脑裂期间旧主可任意写入 |
| 2.8 | 引入 `min-slaves-to-write` / `min-slaves-max-lag` | 主节点失联从节点后拒绝写入 |
| 3.0 | 同 2.8 | Cluster 半数共识防误切换 |
| 4.0 | psync2 | 故障切换后减少全量复制，间接降低脑裂影响 |
| 5.0 | `min-replicas-to-write` 取代 `min-slaves-to-write` | 配置项改名，语义中性 |
| 6.0 | ACL 支持 | 不影响脑裂防护 |
| 7.0 | 多 Replica backlog | 故障切换后从节点恢复更平滑 |
| 7.2 | 同 7.0 | 无大变化 |

注：5.0 把 `min-slaves-to-write` 改名为 `min-replicas-to-write`，旧名仍兼容但建议用新名。

### 脑裂故障恢复流程

```text
t0:  网络分区，主节点 M 与从节点 S1、S2 失联
t1:  M 仍接受客户端写入（缓存到 replication buffer）
       配置 min-replicas-to-write 1 + max-lag 10：
         M 等 10 秒后 count=0 < 1，拒绝写入
         客户端收到 NOREPLICAS 错误
t2:  哨兵发现 M 在 down-after-milliseconds 内无响应
t3:  哨兵判定 SDOWN → ODOWN
t4:  哨兵选 Leader，Leader 选 S1 为新主
t5:  S1 开始接受客户端写入
t6:  网络恢复
t7:  哨兵把 M 降级为 S1 的从节点
t8:  M 触发全量复制：清空本地数据
       - 配了 min-replicas：M 本地无新增数据，不丢业务数据
       - 没配 min-replicas：M 分区期间的写入全部丢失
t9:  M 从 S1 同步数据，成为新主的从节点
t10: 业务核对数据，从权威存储补回丢失的写入（如有）
```

## 代码示例

### 配置 min-replicas

```conf
# redis.conf 主节点配置
min-replicas-to-write 1
min-replicas-max-lag 10

# 配合哨兵
sentinel monitor mymaster 192.168.1.10 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 30000
sentinel parallel-syncs mymaster 1
```

### 在线调整

```bash
# 动态调整 min-replicas 配置
redis-cli CONFIG SET min-replicas-to-write 1
redis-cli CONFIG SET min-replicas-max-lag 10

# 持久化到配置文件
redis-cli CONFIG REWRITE

# 查看当前从节点状态
redis-cli INFO replication | grep -E "connected_slaves|slave[0-9]"

# 输出示例：
# connected_slaves:2
# slave0:ip=192.168.1.11,port=6379,state=online,offset=12345678,lag=0
# slave1:ip=192.168.1.12,port=6379,state=online,offset=12345678,lag=1

# lag 表示从节点最后 ACK 距今的秒数
```

### Java 客户端处理 NOREPLICAS

```java
public class RedisWriteWithBrainSplitProtection {
    private Jedis jedis;

    public void safeWrite(String key, String value) {
        try {
            jedis.set(key, value);
        } catch (JedisDataException e) {
            if (e.getMessage().contains("NOREPLICAS")) {
                // 主节点因从节点不足拒绝写入
                // 可能是脑裂或网络分区
                // 业务补偿：写入本地队列、发告警、降级
                log.error("Write rejected by NOREPLICAS, possible split-brain");
                fallbackToQueue(key, value);
                alertOps("Possible split-brain detected");
            } else {
                throw e;
            }
        }
    }

    private void fallbackToQueue(String key, String value) {
        // 写入本地持久化队列，网络恢复后重试
        // 或写入 MySQL 兜底
    }
}
```

### 监控脑裂风险

```bash
#!/bin/bash
# 监控主从延迟和从节点数量，预警脑裂风险

MASTER=$(redis-cli -h master INFO replication)
SLAVES=$(echo "$MASTER" | grep connected_slaves | cut -d: -f2 | tr -d '\r')
echo "Connected slaves: $SLAVES"

if [ "$SLAVES" -lt 1 ]; then
  echo "CRITICAL: master has no slaves, possible split-brain"
  exit 2
fi

# 检查每个从节点的 lag
echo "$MASTER" | grep "^slave[0-9]" | while read line; do
  lag=$(echo "$line" | grep -oP 'lag=\K[0-9]+')
  if [ "$lag" -gt 10 ]; then
    echo "WARN: slave lag ${lag}s exceeds threshold"
  fi
done
```

### WAIT 命令配合防护

```bash
# 关键写入：用 WAIT 确保至少 1 个从节点收到
SET order:1001 paid
WAIT 1 5000

# 返回值是确认的从节点数
# 0 表示超时无确认，可能是网络分区，业务要做补偿
```

## 实战场景

| 场景 | 配置 | 说明 |
|------|------|------|
| 强一致敏感业务 | `min-replicas-to-write 1` + `min-replicas-max-lag 5` | 严格防护，少量延迟可接受 |
| 一般业务 | `min-replicas-to-write 1` + `min-replicas-max-lag 10` | 平衡防护和可用性 |
| 缓存场景 | 不配置 | 脑裂丢数据可从 DB 重建 |
| Cluster 模式 | 配 `min-replicas-to-write 1` + 半数共识 | 双重防护 |
| 跨机房 | `min-replicas-to-write` 设大些 | 跨机房延迟大，过严会频繁拒绝写入 |

## 深挖追问

### 1. min-replicas-to-write 能完全消除脑裂丢数据吗？

不能完全消除。它只能让脑裂期间的旧主拒绝新写入，避免新增数据丢失。但配置生效前已经写入但未同步的命令仍可能丢失。而且如果主从 ACK 刚好在 min-replicas-max-lag 边界内，旧主仍可能短暂接受写入。

### 2. min-replicas-max-lag 设多少合适？

5-10 秒是常见值。设过小（如 1 秒）会让网络抖动频繁触发拒绝写入，影响可用性；设过大（如 60 秒）脑裂期间旧主长时间接受写入，丢失数据多。要根据业务对数据丢失的敏感度和网络稳定性权衡。

### 3. Cluster 模式还需要配 min-replicas-to-write 吗？

建议配。Cluster 的半数共识防的是"误触发故障转移"，但少数派分区的主节点仍可能接受写入（它没意识到自己已经被分到少数派）。配合 min-replicas-to-write 让少数派主节点因从节点失联而拒绝写入，形成双重防护。

### 4. 脑裂后业务怎么恢复？

```text
1. 立即停止对旧主的写入（如果业务还能感知）
2. 等待哨兵/Cluster 完成故障转移，新主上线
3. 客户端切换到新主
4. 旧主降级为从后，触发全量复制
5. 业务核对数据：从权威存储（MySQL/日志）补回丢失的写入
6. 事后分析：网络分区原因、min-replicas 配置是否合理、监控是否及时发现
```

### 5. 为什么 Redis 不直接做 CP 系统消除脑裂？

CP 系统（如 etcd、ZooKeeper）用 Raft/ZAB 协议做同步复制，写入要多数派同意，性能比 Redis 低 1-2 个数量级。Redis 定位是高性能缓存/内存数据库，选择了 AP（高可用 + 最终一致）。如果业务真的需要 CP，应该用专门的 CP 系统，而不是强行改造 Redis。

## 易错点

- 以为配了 `min-replicas-to-write` 就万事大吉，实际上它只是降低风险，不是消除。
- `min-replicas-max-lag` 设过小会让网络抖动频繁拒绝写入，影响可用性。
- 哨兵 quorum 设成 1 等于放弃多数派防护，单哨兵误判就能触发切换。
- 客户端不处理 NOREPLICAS 错误，业务会直接抛异常。
- Cluster 模式下少数派分区主节点仍可能接受写入，必须配 min-replicas 双重防护。

## 总结

Redis 脑裂是网络分区 + 异步复制 + 故障切换三者叠加导致的"双主写入"问题，恢复后旧主降级为从会清空分区期间写入，造成数据丢失。`min-replicas-to-write` + `min-replicas-max-lag` 是核心缓解手段：主节点失联从节点后拒绝写入，避免新增数据被覆盖。Cluster 模式通过半数主节点共识天然防误切换，但仍需配合 min-replicas 双重防护。Redis 本质是 AP 系统不能完全消除脑裂，强一致需求要选 etcd/ZooKeeper。生产实践要监控从节点数量和 ACK 延迟，预案化处理脑裂后的数据恢复。

## 参考资料

- [Redis Replication 官方文档](https://redis.io/docs/management/replication/)
- [Redis min-replicas 配置说明](https://redis.io/docs/management/replication/#min-replicas-to-write)
- [Redis Sentinel 脑裂问题](https://redis.io/docs/management/sentinel/#split-brain)
