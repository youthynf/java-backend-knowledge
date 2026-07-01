# Redis 如何实现哨兵模式

## 核心概念

主从复制解决了数据冗余，但主节点故障时需要人工切换：选一个从节点升主，让其他从节点指向新主，通知客户端改连接。这种人工恢复在大规模集群里不可接受。Redis 2.8 引入 Sentinel（哨兵）机制，自动完成监控、通知、故障转移和配置中心四件事，让主从集群具备自动高可用能力。

哨兵本身也是一组独立的 Redis 进程（特殊模式），不处理业务数据，专门盯着主从节点。多个哨兵组成集群互相感知，避免单哨兵误判。当主节点故障，哨兵集群通过投票达成共识，自动选出一个从节点升主，并通知客户端切换。

哨兵模式下业务客户端不直接连主节点，而是先问哨兵"当前主是谁"，拿到地址后再操作。主节点切换时哨兵通过发布订阅通知客户端。

## 标准回答

Redis 哨兵模式由独立的 Sentinel 进程集群组成，承担四个职责：监控（持续 PING 主从节点）、通知（事件通过发布订阅通知客户端）、自动故障转移（主观下线→客观下线→选 Leader→选新主→通知）、配置中心（客户端从哨兵查询主节点地址）。哨兵之间通过 `__sentinel__:hello` 频道互相发现，通过 Raft-like 协议选 Leader 执行故障转移。故障转移分四步：选新主、其他从节点改复制源、通知客户端、旧主上线后降级为从。

要点：

1. 哨兵最少 3 个节点，quorum 一般设为 N/2+1。
2. 主观下线：单个哨兵认为节点不可达；客观下线：达到 quorum 数量共识。
3. 选 Leader：Raft-like，先到先得投票，半数以上 + quorum 当选。
4. 选新主：过滤故障节点 → 按 `slave-priority` → 复制偏移量 → runid 字典序。
5. 客户端通过订阅 `+switch-master` 等频道感知切换。

## 实现原理

### 哨兵四大职责

| 职责 | 实现 | 说明 |
|------|------|------|
| 监控 | 每秒 PING 主从节点，每 10 秒 INFO 主节点获取从节点列表 | 检测存活和拓扑变化 |
| 通知 | 发布订阅 `__sentinel__:hello` 和事件频道 | 客户端订阅感知切换 |
| 自动故障转移 | 主观下线→客观下线→选 Leader→选新主→通知 | 核心能力 |
| 配置中心 | 客户端 `SENTINEL get-master-addr-by-name` | 客户端不写死主节点 IP |

### 哨兵集群的形成

哨兵之间通过主节点的 `__sentinel__:hello` 频道相互发现：

```text
哨兵 A 启动，配置：
  sentinel monitor mymaster 192.168.1.10 6379 2

A 连接主节点 192.168.1.10:6379
A 订阅 __sentinel__:hello 频道
A 每隔 2 秒在 __sentinel__:hello 发布自己的 IP、端口、runid

哨兵 B 同样连接主节点，订阅频道
B 收到 A 的发布 -> 知道 A 的存在 -> 主动连接 A
A 收到 B 的发布 -> 主动连接 B
A、B 互相建立连接，形成集群

每个哨兵通过 INFO 命令从主节点获取从节点列表
再直接连接从节点进行监控
```

### 故障判定流程

```text
阶段 1: 主观下线（Subjectively Down, SDOWN）

哨兵 A 每秒向主节点发 PING
主节点在 down-after-milliseconds（如 5000ms）内没回复
A 标记主节点为 SDOWN

  注：单个哨兵的判断可能误判（网络抖动、自身网络问题）


阶段 2: 客观下线（Objectively Down, ODOWN）

A 标记 SDOWN 后，向其他哨兵发 SENTINEL is-master-down-by-addr
其他哨兵根据自身判断回复赞成/反对
赞成数 >= quorum（如 3 哨兵配 2）
A 标记主节点为 ODOWN

  注：客观下线只针对主节点；从节点或哨兵下线只标 SDOWN 不进 ODOWN


阶段 3: 选 Leader 哨兵（Raft-like）

想要执行故障转移的哨兵（先发现 ODOWN 的）成为候选者
候选者向其他哨兵发"选我当 Leader"请求
每个哨兵一轮只能投一票（先到先得）
候选者拿到 max(quorum, N/2+1) 票当选 Leader
未达票数则等待下次选举


阶段 4: Leader 执行故障转移

Leader 选出新主节点
Leader 向新主发 SLAVEOF NO ONE
Leader 向其他从节点发 SLAVEOF <new_master>
Leader 发布 +switch-master 频道通知客户端
Leader 持续监视旧主，旧主上线后发 SLAVEOF <new_master>
```

### 选新主节点的规则

Leader 从从节点中选新主，依次按以下规则过滤和排序：

```text
1. 过滤：剔除已下线、网络状态不佳的从节点
   - 已下线的从节点
   - down-after-milliseconds * 10 时间内断连超过 10 次的从节点

2. 按 slave-priority 升序选（数字越小优先级越高）
   slave-priority 0 永不被选
   slave-priority 默认 100

3. 复制偏移量最大的从节点（slave_repl_offset 最接近 master_repl_offset）
   说明数据最新

4. runid 字典序最小的从节点
   仅为确定性，无业务含义
```

### 故障转移时序图

```text
t0: 主节点 M 故障
t1: 哨兵 A 在 down-after-milliseconds 后判定 SDOWN
t2: A 询问其他哨兵，quorum 通过，标 ODOWN
t3: A 发起 Leader 选举，获得多数票当选
t4: A 选出从节点 S1 作为新主
t5: A 向 S1 发 SLAVEOF NO ONE，S1 升主
t6: A 向 S2、S3 发 SLAVEOF <S1>
t7: A 在 +switch-master 频道发布新主信息
t8: 客户端订阅该频道，感知切换，改连 S1
t9: M 恢复上线，A 向 M 发 SLAVEOF <S1>，M 降级为从
t10: 全量复制：M 清空本地数据，从 S1 同步
```

### 客户端感知切换

```text
客户端启动：
  1. 连接哨兵集群中任一节点
  2. SENTINEL get-master-addr-by-name mymaster
  3. 哨兵返回当前主节点 IP:Port
  4. 客户端连接主节点开始操作

运行中：
  1. 客户端订阅哨兵的 +switch-master 频道
  2. 主节点切换时哨兵发布消息
  3. 客户端收到后重新查询新主地址
  4. 改连新主继续操作
```

### 哨兵关键配置

```conf
# 监控的主节点名、IP、端口、quorum
sentinel monitor mymaster 192.168.1.10 6379 2

# 节点无响应多久判为主观下线（毫秒）
sentinel down-after-milliseconds mymaster 5000

# 故障转移时同时同步新主的从节点数（数字越小同步越慢但越稳）
sentinel parallel-syncs mymaster 1

# 故障转移超时时间（毫秒）
sentinel failover-timeout mymaster 60000

# 主节点认证
sentinel auth-pass mymaster <password>

# 通知脚本（可选）
sentinel notification-script mymaster /var/redis/notify.sh
```

### 哨兵版本演进

| Redis 版本 | 哨兵关键变化 | 说明 |
|------------|-------------|------|
| 2.4 | 无哨兵 | 主从切换需人工 |
| 2.6 | Sentinel 引入 | 监控+通知+故障转移，单哨兵即可 |
| 2.8 | 哨兵集群化 | 多哨兵互相发现、quorum 共识；PSYNC 减少全量复制 |
| 3.0 | 同 2.8 | 哨兵 + Cluster 不混用 |
| 3.2 | `sentinel parallel-syncs` 调优 | 故障转移并发同步控制 |
| 4.0 | 同 3.2 | 混合持久化让重启更快，间接加速故障转移 |
| 5.0 | `replicaof` 取代 `slaveof` | 语义中性；`replica-priority` 取代 `slave-priority` |
| 6.0 | ACL 支持 | 哨兵可带不同用户认证 |
| 6.2 | `sentinel announce-ip` | NAT 网络下宣告 IP |
| 7.0 | 同 6.2 | 多 Replica backlog，故障切换后从节点恢复更平滑 |
| 7.2 | Function 感知 | 哨兵故障转移时同步 Function |

2.6 的哨兵是单哨兵模式，2.8 才真正支持哨兵集群（多哨兵互相发现、quorum 共识）。生产环境至少 3 哨兵，quorum 设 N/2+1。

## 代码示例

### 部署 3 哨兵 + 1 主 2 从

```text
拓扑：
  Master  192.168.1.10:6379
  Slave1  192.168.1.11:6379  (replicaof 192.168.1.10 6379)
  Slave2  192.168.1.12:6379  (replicaof 192.168.1.10 6379)
  Sentinel1  192.168.1.10:26379
  Sentinel2  192.168.1.11:26379
  Sentinel3  192.168.1.12:26379
```

每个哨兵的 sentinel.conf：

```conf
port 26379
dir /var/lib/redis/sentinel
sentinel monitor mymaster 192.168.1.10 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel parallel-syncs mymaster 1
sentinel failover-timeout mymaster 60000
```

### 启动哨兵

```bash
redis-sentinel /etc/redis/sentinel.conf
# 或
redis-server /etc/redis/sentinel.conf --sentinel
```

### 客户端连接（Jedis）

```java
Set<String> sentinels = new HashSet<>();
sentinels.add("192.168.1.10:26379");
sentinels.add("192.168.1.11:26379");
sentinels.add("192.168.1.12:26379");

JedisSentinelPool pool = new JedisSentinelPool("mymaster", sentinels);
try (Jedis jedis = pool.getResource()) {
    jedis.set("key", "value");
    String value = jedis.get("key");
}
// JedisSentinelPool 内部订阅 +switch-master，自动感知切换
```

### 客户端连接（Lettuce）

```java
import io.lettuce.core.*;
import io.lettuce.core.sentinel.*;

RedisURI sentinel1 = RedisURI.create("redis://192.168.1.10:26379");
RedisURI sentinel2 = RedisURI.create("redis://192.168.1.11:26379");
RedisURI sentinel3 = RedisURI.create("redis://192.168.1.12:26379");

SentinelClientOptions options = SentinelClientOptions.builder()
    .masterId("mymaster")
    .sentinel(sentinel1)
    .sentinel(sentinel2)
    .sentinel(sentinel3)
    .build();

RedisClient client = RedisClient.create();
StatefulRedis<String, String> connection = client.connect(options);
```

### 手动操作哨兵

```bash
# 查询当前主
redis-cli -p 26379 SENTINEL get-master-addr-by-name mymaster

# 查询主节点的从节点
redis-cli -p 26379 SENTINEL replicas mymaster

# 查询其他哨兵
redis-cli -p 26379 SENTINEL sentinels mymaster

# 手动触发故障转移
redis-cli -p 26379 SENTINEL failover mymaster

# 查看哨兵状态
redis-cli -p 26379 INFO sentinel
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 自动高可用 | 一主二从三哨兵 | quorum 设 N/2+1，避免脑裂 |
| 计划内维护 | `SENTINEL failover` 主动切换 | 切换前确认从节点数据已同步 |
| 客户端重连 | 客户端订阅 +switch-master 频道 | 用 JedisSentinelPool 等成熟客户端 |
| 跨机房容灾 | 哨兵跨机房部署 | 跨机房网络延迟会让心跳超时判断更复杂 |
| 故障演练 | kill 主节点验证切换 | 演练 quorum 和 failover-timeout 配置合理性 |

## 深挖追问

### 1. 哨兵集群为什么至少 3 个节点？

少数派必须服从多数派。3 节点允许 1 个故障，2 节点只要 1 个故障就无法达成 quorum，无法做客观下线判定。生产推荐 3 或 5 节点（奇数，能容忍 (N-1)/2 个故障）。

### 2. quorum 设成多少合适？

一般设 `N/2 + 1`，例如 3 哨兵设 2。这样客观下线需要多数派同意，避免单哨兵误判。如果设成 1，单哨兵判定就能触发故障转移，风险大。如果设成 N，要求所有哨兵同意，任一哨兵故障就无法转移。

### 3. 哨兵选举 Leader 是 Raft 吗？

是 Raft-like，不是严格 Raft。Redis 的实现简化：每个哨兵一轮只能投一票（先到先得），候选者拿到 `max(quorum, N/2+1)` 票当选。和标准 Raft 的区别：标准 Raft 有 term 和日志复制，哨兵选举更轻量。

### 4. parallel-syncs 设成多少？

控制故障转移时同时同步新主的从节点数量。设 1 表示一次只让一个从节点同步新主，避免多个从节点同时全量复制拖垮新主。设大可以加快恢复但风险大。一般保持默认 1。

### 5. 客户端不订阅 +switch-master 会怎样？

会继续连旧主。旧主被降级为从后会拒绝写入（默认 replica-read-only yes），客户端写入报错。读操作可能误打误撞读到旧主（已经是新主的从），但拿到的是旧数据。所以客户端必须支持哨兵模式或定期主动查询主节点地址。

## 易错点

- 哨兵自身没有主从复制，每个哨兵独立配置，但配置文件会被运行时改写（如新主地址），不要手动回写覆盖。
- quorum 设太小导致单哨兵触发故障转移，设太大导致任一哨兵故障就无法转移。
- `down-after-milliseconds` 设过小会导致网络抖动误判主节点下线，频繁切换。
- 客户端用普通 JedisPool 连主节点 IP 是错的，应该用 JedisSentinelPool 或自己订阅 +switch-master。
- 哨兵模式仍是单主写入，写性能瓶颈没解决；要分片扩展写能力得上 Cluster。

## 总结

Redis 哨兵模式实现了主从集群的自动高可用：哨兵集群通过发布订阅互相发现，通过 PING 监控主从，通过主观下线→客观下线→选 Leader→选新主完成故障转移，通过 +switch-master 频道通知客户端。哨兵本身不处理业务数据，是独立的"观察者"。客户端必须使用支持哨兵的连接池，否则无法感知切换。哨兵模式解决了高可用问题，但仍是单主写入，写扩展能力有限，要解决写瓶颈需要 Cluster 模式。

## 参考资料

- [Redis Sentinel 官方文档](https://redis.io/docs/management/sentinel/)
- [Redis Sentinel 选举算法](https://redis.io/docs/management/sentinel/#sentinel-leader-election)
- 《Redis 设计与实现》黄健宏
