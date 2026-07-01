# Redis 如何实现集群模式

## 核心概念

主从 + 哨兵解决了高可用问题，但单主节点仍然是写入瓶颈——所有写流量打到一台机器，内存和 CPU 都会到天花板。Redis Cluster（集群模式）在 Redis 3.0 引入，通过数据分片把数据分散到多个主节点，每个主节点只负责一部分数据，写入能力随节点数线性扩展。

Cluster 用哈希槽（Hash Slot）做分片：16384 个槽分配到各主节点，每个 key 通过 CRC16 计算后对 16384 取模定位到某个槽。节点间通过 Gossip 协议交换状态，客户端首次访问可能被 MOVED 或 ASK 重定向到正确节点。每个主节点可以配从节点做高可用，主节点故障时从节点接管。

Cluster 同时具备分片（扩容写能力和存储）和高可用（自动故障转移）能力，是 Redis 解决大规模数据和高并发场景的标准方案。

## 标准回答

Redis Cluster 通过 16384 个哈希槽分片数据，每个主节点负责一部分槽。key 用 CRC16 计算 16 位哈希值，再对 16384 取模定位槽位。客户端访问时如果 key 不在当前节点，会收到 MOVED 重定向到正确节点；槽迁移过程中收到 ASK 临时重定向。节点间通过 Gossip 协议（ping/pong/meet/fail 消息）交换状态，自动发现故障和拓扑变化。故障检测走主观下线→客观下线，从节点通过 Raft-like 选举接管故障主节点的槽。Cluster 兼具分片扩展和高可用，但跨槽事务、MGET 等多 key 操作受限。

要点：

1. 16384 个哈希槽，CRC16(key) % 16384 定位。
2. 节点间通信走集群总线（端口 + 10000），Gossip 协议传播状态。
3. MOVED：永久重定向，客户端应缓存槽位映射；ASK：临时重定向，槽迁移中。
4. 每个主节点可配 1-N 个从节点，主故障时从节点接管。
5. 跨槽操作受限：MGET、事务、Lua 跨 key 脚本要求所有 key 在同一槽（用 hashtag）。

## 实现原理

### 哈希槽定位

```text
key -> CRC16(key) -> 16 bit 哈希值
     -> hash % 16384 -> slot 编号 [0, 16383]
     -> 查集群槽映射表 -> 负责该 slot 的节点

例：
  CRC16("user:1001") = 0x1234 = 4660
  4660 % 16384 = 4660
  slot 4660 归属节点 A，则 user:1001 在节点 A
```

### 槽位分配方式

```text
方式 1：自动平均分配
  redis-cli --cluster create node1:6379 node2:6379 ... --cluster-replicas 1
  Redis 自动把 16384 个槽平均分给各主节点

方式 2：手动分配
  CLUSTER MEET <ip> <port>        # 让节点互相加入集群
  CLUSTER ADDSLOTS 0 1 2 ... 5460 # 给当前节点分配槽
  必须把 16384 个槽全部分配完，集群才正常工作

查询：
  CLUSTER NODES    # 列出所有节点和槽位
  CLUSTER SLOTS    # 列出槽位范围与节点对应关系
  CLUSTER COUNTKEYSINSLOT <slot>  # 某槽的 key 数
```

### MOVED 重定向

```text
客户端发送 SET user:1001 tom 到节点 A
节点 A 计算 slot = CRC16("user:1001") % 16384 = 4660
节点 A 检查 4660 是否归自己管
  是 -> 正常处理
  否 -> 返回 -MOVED 4660 <nodeB_ip>:<nodeB_port>

客户端收到 MOVED：
  1. 更新本地槽位映射表（slot 4660 -> nodeB）
  2. 重新向 nodeB 发送 SET user:1001 tom
  3. 后续访问 slot 4660 直接走 nodeB，不再重定向
```

### ASK 重定向（槽迁移中）

```text
背景：slot 4660 正在从 nodeA 迁移到 nodeB
迁移过程中 slot 4660 的 key 一部分在 A，一部分在 B

客户端 SET user:1001 tom 到 nodeA
nodeA 检查 slot 4660 状态：
  - 如果 key 在 A：正常处理
  - 如果 key 已迁移到 B：返回 -ASK 4660 <nodeB_ip>:<nodeB_port>

客户端收到 ASK：
  1. 不更新本地槽位映射（临时重定向）
  2. 向 nodeB 发 ASKING 命令（让 B 知道这是临时访问）
  3. 再发 SET user:1001 tom
  4. 下次访问 slot 4660 仍先尝试 nodeA

ASKING 的作用：
  nodeB 收到 ASKING 后，临时允许访问 slot 4660
  （否则 slot 4660 还没正式归属 nodeB，B 会返回 MOVED 让客户端回 A）
```

### Gossip 协议

节点间通过集群总线（对外端口 + 10000）通信，比如 6379 节点用 16379 端口做集群通信。

```text
消息类型：
  MEET：通知新节点加入集群
  PING：每秒向几个随机节点发送，含自己已知的部分节点信息
  PONG：对 PING/MEET 的响应，含自己的最新状态
  FAIL：判定某节点客观下线后向全集群广播

Gossip 传播：
  每个节点周期性选 k 个节点发 PING
  PING 中带几个已知节点的摘要（IP、端口、状态、最后通信时间）
  接收方更新本地拓扑视图
  经过多次传播，全集群状态最终一致
```

### 故障检测与转移

```text
阶段 1：主观下线（PFAIL）

节点 A 每秒向节点 B 发 PING
B 在 cluster-node-timeout（默认 15 秒）内没回 PONG
A 标记 B 为 PFAIL（probable failure，主观下线）

阶段 2：客观下线（FAIL）

A 通过 Gossip 把 B 的 PFAIL 状态传播出去
半数以上主节点都标记 B 为 PFAIL
A 把 B 标记为 FAIL
A 向全集群广播 B 的 FAIL 状态

阶段 3：故障转移（仅 B 是主节点时）

B 的从节点 B' 检测到 B FAIL
B' 进入选举资格检查：
  - B' 与 B 的复制断连时间不能超过 cluster-node-timeout * 2
  - 否则 B' 数据太旧，没资格接班

B' 发起选举（Raft-like）：
  - B' 自增 current_epoch，向其他主节点拉票
  - 主节点在一个 epoch 内只能投一票（先到先得）
  - B' 拿到多数主节点票当选

B' 当选后执行替换：
  - 把 B 负责的槽位转到自己名下
  - 向全集群广播 PONG，宣告自己是新主
  - 其他从节点改复制 B'
```

### 为什么是 16384 个槽

Redis 作者 antirez 在邮件列表解释过：

```text
1. 心跳包大小
   每个节点每秒发 PING，要带自己负责的槽位 bitmap
   16384 槽 -> bitmap = 16384 / 8 = 2KB
   65536 槽 -> bitmap = 65536 / 8 = 8KB
   100 个节点，每次 PING 多带 600KB，带宽浪费

2. 集群规模上限
   Redis 作者建议集群主节点数不超过 1000
   16384 槽对 1000 节点足够用（每节点平均 16 个槽）

3. 碰撞概率
   CRC16 输出 16 bit，理论碰撞率 1/65536
   16384 槽时，每 4 个 key 才有较明显碰撞
   8192 槽时，碰撞概率上升，节点数多时槽位分布不均
```

### Cluster 版本演进

| Redis 版本 | Cluster 关键变化 | 说明 |
|------------|-----------------|------|
| 3.0 | Cluster 正式发布 | 16384 槽、Gossip、MOVED/ASK、自动故障转移 |
| 3.2 | `CLUSTER COUNTKEYSINSLOT` 等命令 | 运维增强；quicklist 编码 |
| 4.0 | `redis-cli --cluster` 工具 | 取代 ruby 脚本 redis-trib.rb；混合持久化 |
| 5.0 | Stream 数据结构 | 新增场景；`CLUSTER RESET` 增强 |
| 6.0 | ACL 支持 | 集群节点间认证更细 |
| 6.2 | `CLUSTER LINKS` 命令 | 查看集群总线连接 |
| 7.0 | listpack 编码；sharded Pub/Sub | 跨槽 Pub/Sub 优化；multi-part AOF |
| 7.2 | Function 持久化 | 集群同步 Function；`CLUSTER SHARDS` 命令 |
| 7.4 | Cluster 多线程 IO 增强 | 网络层性能提升 |

3.0 之前 Redis 没有官方分片方案，社区用 Twemproxy、Codis 等代理方案。3.0 后 Cluster 成为官方方案，但客户端要支持 MOVED/ASK 重定向。4.0 的 `redis-cli --cluster` 工具大幅简化运维。

### Cluster 故障转移时序

```text
节点 A（检测方）                       节点 B（故障主节点）
  |                                     |
  | --- PING -------------------------> |  (无响应)
  |                                     |
  | 等待 cluster-node-timeout           |
  | (默认 15 秒)                        |
  |                                     |
  | 标记 B 为 PFAIL（主观下线）         |
  |                                     |
  | 通过 Gossip 传播 PFAIL              |
  | 向其他主节点发 PING 带 B 状态       |
  |                                     |
  | 半数以上主节点标 B 为 PFAIL         |
  | A 把 B 标为 FAIL（客观下线）        |
  | 向全集群广播 FAIL                   |
  |                                     |
  | B 的从节点 B' 检测到 B FAIL         |
  | B' 进入选举资格检查：               |
  |   - 与 B 断连时间                   |
  |     <= cluster-node-timeout * 2    |
  |                                     |
  | B' 自增 current_epoch              |
  | B' 向其他主节点拉票                 |
  |   (主节点一 epoch 投一票)           |
  |                                     |
  | B' 获多数票当选                     |
  | B' 把 B 的槽位转到自己名下          |
  | B' 向全集群广播 PONG                |
  | 宣告自己是新主                      |
  |                                     |
  | 其他从节点改复制 B'                 |
  | 客户端通过 MOVED 感知槽位新归属     |
```

### 集群限制

| 限制 | 说明 | 解决方案 |
|------|------|----------|
| 跨槽 key 操作 | `MGET`、`MSET` 多 key 必须同槽 | 用 hashtag `{}` 强制同槽 |
| 跨槽事务 | `MULTI/EXEC` 中多 key 必须同槽 | 同上 |
| Lua 脚本 | 脚本中多 key 必须同槽 | 同上 |
| 数据库选择 | Cluster 模式只能用 db 0 | 单机可用 0-15 |
| Pub/Sub | 跨集群广播开销大 | 用 Redis Streams 替代 |

### Hashtag 让相关 key 同槽

```text
key 中 {tag} 部分参与 CRC16 计算，其他部分不参与

user:{1001}:profile  -> CRC16("1001") % 16384 = slot X
user:{1001}:orders   -> CRC16("1001") % 16384 = slot X
user:{1001}:cart     -> CRC16("1001") % 16384 = slot X

三个 key 都在同一槽，可以在同一个事务或 Lua 脚本中操作
```

## 代码示例

### 创建集群

```bash
# 6 节点集群：3 主 3 从
redis-cli --cluster create \
  192.168.1.10:6379 \
  192.168.1.11:6379 \
  192.168.1.12:6379 \
  192.168.1.13:6379 \
  192.168.1.14:6379 \
  192.168.1.15:6379 \
  --cluster-replicas 1
```

### 集群运维命令

```bash
# 查看集群状态
redis-cli -c CLUSTER INFO

# 查看节点和槽位
redis-cli -c CLUSTER NODES

# 查看槽位映射
redis-cli -c CLUSTER SLOTS

# 检查集群健康
redis-cli --cluster check 192.168.1.10:6379

# 重新分配槽位（扩容/缩容时）
redis-cli --cluster reshard 192.168.1.10:6379

# 平衡槽位
redis-cli --cluster rebalance 192.168.1.10:6379
```

### 客户端连接（Jedis）

```java
import redis.clients.jedis.*;

Set<HostAndPort> nodes = new HashSet<>();
nodes.add(new HostAndPort("192.168.1.10", 6379));
nodes.add(new HostAndPort("192.168.1.11", 6379));
nodes.add(new HostAndPort("192.168.1.12", 6379));

try (JedisCluster cluster = new JedisCluster(nodes)) {
    cluster.set("user:1001", "tom");
    String value = cluster.get("user:1001");

    // 用 hashtag 让相关 key 同槽
    cluster.set("user:{1001}:profile", "{...}");
    cluster.set("user:{1001}:orders", "[...]");
    // 两个 key 在同一槽，可在一个事务操作
}
// JedisCluster 内部维护槽位映射表，自动处理 MOVED 重定向
```

### 客户端连接（Lettuce）

```java
import io.lettuce.core.cluster.*;

RedisClusterClient client = RedisClusterClient.create(
    RedisURI.create("redis://192.168.1.10:6379"));

try (StatefulRedisClusterConnection<String, String> conn = client.connect()) {
    // 自动处理 MOVED/ASK，自动刷新拓扑
    RedisAdvancedClusterCommands<String, String> sync = conn.sync();
    sync.set("user:1001", "tom");

    // 多 key 操作要求同槽
    sync.mset("user:{1001}:profile", "{...}",
              "user:{1001}:orders", "[...]");
}
```

### 集群扩容

```bash
# 1. 加入新主节点
redis-cli --cluster add-node 192.168.1.16:6379 192.168.1.10:6379

# 2. 加入新从节点（指定主节点 ID）
redis-cli --cluster add-node 192.168.1.17:6379 192.168.1.10:6379 \
  --cluster-slave --cluster-master-id <new_master_id>

# 3. 重新分配槽位到新主节点
redis-cli --cluster reshard 192.168.1.10:6379 \
  --cluster-from <source_node_id> \
  --cluster-to <new_master_id> \
  --cluster-slots 1000 \
  --cluster-yes

# 4. 平衡槽位
redis-cli --cluster rebalance 192.168.1.10:6379
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 大数据量缓存 | 数据按 hashtag 分桶到多主节点 | 单 key 不要过大，避免迁移阻塞 |
| 高并发写入 | 多主节点分摊写流量 | 写吞吐随主节点数线性扩展 |
| 在线扩容 | `--cluster reshard` 平滑迁移槽位 | 迁移期间业务有 ASK 重定向开销 |
| 故障自愈 | 主节点故障从节点自动接管 | `cluster-node-timeout` 配置影响检测速度 |
| 跨机房部署 | 主从跨机房，主节点尽量均匀分布 | 跨机房复制延迟要评估 |

## 深挖追问

### 1. 为什么 Cluster 模式只能用 db 0？

Cluster 的槽位映射是全局的，如果允许 16 个 db，每个 db 都要维护 16384 槽的映射，复杂度爆炸。Cluster 直接禁用多 db，简化设计。

### 2. 集群最少几个节点？

至少 3 主 3 从共 6 个节点。3 主是为了能达成多数派共识（故障检测、从节点选举）；3 从是为了每个主都有从节点可接管。少于 3 主时少数派故障会导致集群不可用。

### 3. 客户端要缓存槽位映射吗？

应该缓存。每次访问都查集群太慢。成熟客户端（JedisCluster、Lettuce）会维护本地槽位映射，遇到 MOVED 时更新对应槽。集群拓扑变化时通过 MOVED 通知客户端更新，或客户端定期 `CLUSTER NODES` 主动刷新。

### 4. 槽迁移过程中节点宕机怎么办？

迁移中源节点和目标节点都持有部分 key。如果源节点宕机，目标节点的 key 仍然可用；如果目标节点宕机，源节点的 key 仍可用。集群会标记迁移状态，恢复后继续。如果迁移中两节点都宕机，部分 key 会丢失，需要从备份恢复。

### 5. Cluster 模式和哨兵模式可以共存吗？

不能也不需要。Cluster 自带高可用（每个主有从节点、自动故障转移），不需要哨兵。两者混用会让拓扑管理混乱。如果只需高可用不需分片，用哨兵；如果需要分片扩展，用 Cluster。

## 易错点

- 误以为 Cluster 是"主从+哨兵的升级版"，实际它是独立的分片方案，不依赖哨兵。
- 跨槽 MGET/事务/Lua 直接报错，要用 hashtag `{}` 让相关 key 同槽。
- `cluster-node-timeout` 设过小会让网络抖动频繁触发故障转移，引发雪崩。
- 集群模式下客户端不刷新槽位映射会持续被 MOVED，性能差。
- 扩容时槽迁移期间大 Key 迁移会阻塞源节点和目标节点，要避开高峰。

## 总结

Redis Cluster 通过 16384 个哈希槽分片数据，CRC16 定位槽，Gossip 协议维护拓扑，MOVED/ASK 处理重定向，每个主节点配从节点实现自动故障转移。它兼具分片扩展和高可用能力，是大规模 Redis 部署的标准方案。使用关键点：用 hashtag 让相关 key 同槽以支持多 key 操作、客户端要缓存并刷新槽位映射、监控 Gossip 流量和故障转移事件、扩容时避开高峰并评估大 Key 迁移影响。Cluster 不依赖哨兵，与哨兵是两种独立的高可用方案。

## 参考资料

- [Redis Cluster 官方文档](https://redis.io/docs/management/scaling/)
- [Redis Cluster 规范](https://redis.io/docs/reference/cluster-spec/)
- [Redis 作者解释 16384 槽](https://github.com/redis/redis/issues/2576)
