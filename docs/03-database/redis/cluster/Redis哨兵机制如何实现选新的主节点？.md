# Redis 哨兵机制如何实现选新的主节点

## 核心概念

哨兵模式故障转移的核心动作是"选新主"——主节点故障后，从多个从节点中挑一个升级为新主，让其他从节点改连新主，并通知客户端。选新主不是随便挑一个，要保证新主数据尽可能新、网络稳定、优先级合理，否则切换后丢数据或新主不稳。

整个选主过程分四步：故障节点主观下线 → 客观下线 → 哨兵集群选 Leader → Leader 决定新主节点。前两步是"判断主节点真的挂了"，第三步是"选出谁来执行故障转移"，第四步才是真正的"选新主"。

选 Leader 用 Raft-like 算法，选新主用三段式过滤排序：先过滤故障节点，再按 `slave-priority` 排序，再按复制偏移量、runid 字典序兜底。

## 标准回答

哨兵选新主分四步：(1) 主观下线：单个哨兵在 `down-after-milliseconds` 内未收到主节点 PING 响应，标记 SDOWN；(2) 客观下线：超过 quorum 个哨兵同意，标记 ODOWN；(3) 选 Leader：发现 ODOWN 的哨兵成为候选者，向其他哨兵拉票，先到先得投票，获得 `max(quorum, N/2+1)` 票当选；(4) Leader 选新主：过滤故障从节点 → 按 `slave-priority` 升序 → 复制偏移量最大 → runid 字典序最小，选出后发 `SLAVEOF NO ONE` 升主，其他从节点改连新主。

要点：

1. SDOWN 是单哨兵判断，可能误判；ODOWN 是多数派共识，才触发故障转移。
2. Leader 选举用 Raft-like：先到先得投票，半数以上 + quorum 当选。
3. 选新主三段式：`slave-priority` → `slave_repl_offset` → `runid`。
4. `slave-priority` 越小越优先，设为 0 永不被选。
5. 切换完成后旧主上线会被降级为从，原主故障期间的写入如果未同步会丢。

## 实现原理

### 第一步：主观下线（SDOWN）

```text
哨兵 A 每秒向主节点发 PING
主节点回复 +PONG 表示存活
如果 down-after-milliseconds（默认 30 秒，生产常配 5 秒）内没回复
哨兵 A 标记主节点为 SDOWN

判断依据：
  - PING 超时
  - 主节点回复 LOADING / MASTERDOWN 等错误状态
  - 主节点回复非预期内容
```

主观下线只代表单个哨兵的判断，可能是网络抖动、哨兵自身网络问题、主节点短暂 GC 等，不直接触发故障转移。

### 第二步：客观下线（ODOWN）

```text
哨兵 A 标记 SDOWN 后，向其他哨兵询问：
  SENTINEL is-master-down-by-addr <ip> <port> <current_epoch> <runid>

其他哨兵根据自身判断回复 1（同意下线）或 0（不同意）

A 收集回复，同意数 >= quorum
A 标记主节点为 ODOWN
A 进入故障转移流程

注意：
  - ODOWN 只针对主节点
  - 从节点或哨兵下线只标 SDOWN，不进 ODOWN，不触发故障转移
```

### 第三步：选 Leader 哨兵（Raft-like）

```text
背景：故障转移只能由一个哨兵执行，避免多个哨兵同时操作导致混乱
机制：在哨兵集群中选一个 Leader

候选者：第一个发现 ODOWN 的哨兵
       （实际是当前哨兵判断主节点 ODOWN 后，给自己投一票并请求其他哨兵）

投票规则：
  1. 每个哨兵在一个 leader_epoch 内只能投一票
  2. 先到先得：哪个候选者先发请求，票就投给谁
  3. 候选者给自己投一票
  4. 候选者获得 max(quorum, N/2+1) 票当选

举例：3 哨兵，quorum=2
  哨兵 A 发现 ODOWN，发起选举
  A 投给自己（1 票）
  B 收到 A 的请求，先到先得，投给 A（2 票）
  C 收到 A 的请求，投给 A（3 票）
  A 票数 3 >= max(2, 2) = 2，当选 Leader

如果两个哨兵同时发现 ODOWN（罕见）：
  各自给自己投，再向其他哨兵拉票
  其他哨兵按"先到先得"原则只投一票
  最终有一个会拿到多数票
  都没拿到则等待下一轮选举
```

### 第四步：Leader 选新主节点

Leader 当选后，执行选新主逻辑，按下面顺序筛选：

```text
阶段 1：过滤

剔除已下线的从节点
剔除 down-after-milliseconds * 10 时间内断连次数 >= 10 的从节点
  （判断网络不稳定的从节点）

阶段 2：按 slave-priority 升序

slave-priority 配置项，数字越小优先级越高
默认 100，设为 0 表示永不被选为新主
相同 priority 进入下一轮

阶段 3：按复制偏移量降序

slave_repl_offset 最接近 master_repl_offset 的从节点
表示数据最新，丢失最少
相同 offset 进入下一轮

阶段 4：按 runid 字典序升序

仅为确定性，避免随机选
runid 是 Redis 启动时生成的随机 ID
```

### 选新主完整时序

```text
t0: 主节点 M 宕机
t1: 哨兵 A 在 down-after-milliseconds 后判定 SDOWN
t2: A 询问其他哨兵，赞成数达 quorum，判定 ODOWN
t3: A 发起 Leader 选举，向其他哨兵拉票
t4: A 获得 max(quorum, N/2+1) 票，当选 Leader
t5: Leader A 查询从节点列表（之前通过 INFO 维护）
t6: Leader 过滤故障从节点
t7: Leader 按 slave-priority 选出最高优先级从节点 S1
    （priority 一样则按 slave_repl_offset，再一样按 runid）
t8: Leader 向 S1 发 SLAVEOF NO ONE
t9: S1 升级为主节点，停止复制
t10: Leader 向 S2、S3 发 SLAVEOF <S1_ip> <S1_port>
t11: S2、S3 改为复制 S1
t12: Leader 在 +switch-master 频道发布新主信息
t13: 客户端感知切换，改连 S1
t14: M 上线后，Leader 向 M 发 SLAVEOF <S1>
t15: M 触发全量复制，清空本地数据，从 S1 同步
```

### 客户端感知新主

```text
方式 1：订阅频道（推荐）
  客户端订阅哨兵的 +switch-master 频道
  切换时哨兵发布：mymaster <old_ip> <old_port> <new_ip> <new_port>
  客户端收到后改连新主

方式 2：主动查询
  客户端定期或写失败时调用 SENTINEL get-master-addr-by-name
  拿到新主地址后重连

方式 3：成熟客户端封装
  JedisSentinelPool、Lettuce SentinelClientOptions 内部都做了上述封装
```

### 哨兵选新主版本演进

| Redis 版本 | 选主机制变化 | 关键改进 |
|------------|-------------|----------|
| 2.6 | 引入 Sentinel | 基础选主：SDOWN→ODOWN→选 Leader→选新主 |
| 2.8 | quorum 共识强化 | 多哨兵互相发现，需 quorum 同意才 ODOWN |
| 3.2 | `parallel-syncs` 调优 | 控制故障转移时同时同步的从节点数 |
| 4.0 | psync2 影响 | 故障切换后部分从节点仍可增量复制，减少全量 |
| 5.0 | `replica-priority` 取代 `slave-priority` | 语义中性化，配置项改名 |
| 6.0 | ACL 支持 | 选主时考虑 ACL 权限 |
| 7.0 | 多 Replica backlog | 故障切换后从节点恢复更平滑，选主后同步更快 |
| 7.2 | Function 同步 | 选主后新主同步 Function 库 |

选主核心算法（SDOWN→ODOWN→Raft 选举→priority/offset/runid 排序）自 2.8 以来基本稳定，后续版本主要优化故障转移后的同步效率。

### 故障转移完整流程

```text
t0:  主节点 M 宕机
t1:  哨兵 A 在 down-after-milliseconds 后判定 SDOWN
t2:  A 向其他哨兵发 SENTINEL is-master-down-by-addr
t3:  赞成数 >= quorum，判定 ODOWN
t4:  A 发起 Leader 选举（Raft-like）
       - A 自投一票
       - 向其他哨兵拉票
       - 先到先得投票
       - 获得 max(quorum, N/2+1) 票当选 Leader
t5:  Leader A 查询从节点列表（之前通过 INFO 维护）
t6:  Leader 过滤故障从节点
t7:  Leader 按 slave-priority 升序选新主
       - priority 相同则按 slave_repl_offset 降序
       - offset 相同则按 runid 字典序升序
t8:  Leader 向新主 S1 发 SLAVEOF NO ONE
t9:  S1 升级为主节点，停止复制
t10: Leader 向 S2、S3 发 SLAVEOF <S1_ip> <S1_port>
t11: S2、S3 改为复制 S1（parallel-syncs 控制并发数）
t12: Leader 在 +switch-master 频道发布新主信息
t13: 客户端订阅该频道，感知切换，改连 S1
t14: M 上线后，Leader 向 M 发 SLAVEOF <S1>
t15: M 触发全量复制，清空本地数据，从 S1 同步
t16: 故障转移完成
```

## 代码示例

### 优先级配置

```conf
# 在从节点 redis.conf 中设置
# 数字越小越优先被选为新主
replica-priority 100   # 默认 100，普通从节点

# 跨机房部署时，让同机房的从节点优先
# 机房 A 的从节点
replica-priority 50
# 机房 B 的从节点（备选）
replica-priority 100

# 永不被选为新主（只做读副本）
replica-priority 0
```

### 触发故障转移

```bash
# 手动触发（用于维护或演练）
redis-cli -p 26379 SENTINEL failover mymaster

# 查看从节点详情（含优先级、偏移量）
redis-cli -p 26379 SENTINEL replicas mymaster

# 输出示例：
# 1) ip=192.168.1.11 port=6379 priority=100 offset=12345678 runid=abc...
# 2) ip=192.168.1.12 port=6379 priority=50  offset=12340000 runid=def...

# 上面示例中 192.168.1.12 priority 更小，会被选为新主
```

### Java 客户端自动感知

```java
import redis.clients.jedis.JedisSentinelPool;
import java.util.HashSet;
import java.util.Set;

Set<String> sentinels = new HashSet<>();
sentinels.add("192.168.1.10:26379");
sentinels.add("192.168.1.11:26379");
sentinels.add("192.168.1.12:26379");

// JedisSentinelPool 内部订阅 +switch-master，自动切换主节点连接
try (JedisSentinelPool pool = new JedisSentinelPool("mymaster", sentinels);
     Jedis jedis = pool.getResource()) {
    jedis.set("k", "v");
}
```

### 故障演练脚本

```bash
#!/bin/bash
# 演练：杀掉主节点，验证切换

# 1. 查看当前主
MASTER=$(redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster | head -1)
PORT=$(redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster | tail -1)
echo "Current master: $MASTER:$PORT"

# 2. 杀掉主节点
ssh $MASTER "redis-cli -p $PORT SHUTDOWN NOSAVE"

# 3. 等待故障转移
sleep 30

# 4. 验证新主
NEW_MASTER=$(redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster | head -1)
NEW_PORT=$(redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster | tail -1)
echo "New master: $NEW_MASTER:$NEW_PORT"

if [ "$MASTER" != "$NEW_MASTER" ]; then
  echo "OK: master switched"
else
  echo "FAIL: master not switched"
fi
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 跨机房优先选主 | 同机房从节点 `replica-priority` 更小 | 避免跨机房写入延迟 |
| 计划内切换 | `SENTINEL failover` 主动触发 | 业务低峰期执行 |
| 永不升主的读副本 | `replica-priority 0` | 跨机房只读副本不抢主 |
| 故障演练 | kill 主节点观察切换时间 | 验证 down-after-milliseconds 配置 |
| 节点退役 | 先调高 priority 再 failover | 让退役节点不被选为新主 |

## 深挖追问

### 1. 为什么选 Leader 用 Raft-like 而不是直接由第一个发现 ODOWN 的哨兵执行？

避免多哨兵同时发现 ODOWN 时多个哨兵同时执行故障转移导致混乱。Raft-like 选举保证只有一个 Leader 执行，且 Leader 的产生经过多数派同意，决策可追溯。

### 2. slave-priority 一样时为什么按复制偏移量选？

复制偏移量 `slave_repl_offset` 越接近 `master_repl_offset`，说明从节点同步到的数据越新，丢失数据越少。优先选数据最新的从节点升主，能减少故障切换的数据丢失。

### 3. 选新主时为什么不考虑从节点的硬件配置？

哨兵不知道从节点的硬件信息，只知道 Redis 层面的指标（priority、offset、runid）。硬件配置差异要在部署时通过 `slave-priority` 反映——硬件好的节点 priority 设小一些。

### 4. 新主升主后其他从节点怎么同步？

Leader 向其他从节点发 `SLAVEOF <new_master_ip> <new_master_port>`，从节点改复制源。如果从节点之前已经复制过旧主的部分数据，会优先尝试增量复制（psync2），不行才全量。`parallel-syncs` 控制同时同步的从节点数。

### 5. 旧主重新上线后数据怎么处理？

旧主上线后被降级为新主的从节点，触发全量复制：清空本地数据，从新主加载 RDB。旧主在故障期间接收的写入（如果有，比如脑裂场景）会全部丢失。这是为什么脑裂危害大——数据会永久丢失。

## 易错点

- `slave-priority` 默认 100，所有从节点一样时会按偏移量选，不是"最先连接的"。
- `slave-priority 0` 不是最高优先级，而是"永不被选"，常被误用。
- 哨兵集群少于 3 个时容错能力差，2 个哨兵任一故障就无法达成 quorum。
- 客户端不订阅 `+switch-master` 会导致切换后仍连旧主写入失败。
- `down-after-milliseconds` 设过小会让网络抖动频繁触发切换，引发雪崩。

## 总结

哨兵选新主是故障转移的核心动作，分四步：主观下线（单哨兵判断）→ 客观下线（多数派共识）→ 选 Leader（Raft-like 投票）→ Leader 选新主（按 priority、offset、runid 三段式排序）。这套机制保证故障转移有共识、选主有依据、客户端能感知。理解关键是抓住"判定故障 → 选执行者 → 选新主"三层决策。生产配置要注意 quorum、down-after-milliseconds、slave-priority 这几个参数的合理设置，并通过故障演练验证。

## 参考资料

- [Redis Sentinel 官方文档](https://redis.io/docs/management/sentinel/)
- [Sentinel 选主算法](https://redis.io/docs/management/sentinel/#vote-the-best-slave)
- 《Redis 设计与实现》黄健宏
