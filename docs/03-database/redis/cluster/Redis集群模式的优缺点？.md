# Redis 集群模式的优缺点

## 核心概念

Redis Cluster 是 Redis 3.0+ 提供的分布式方案，用哈希槽分片把数据分散到多个主节点，每个主节点配从节点做高可用。它解决了单机 Redis 在数据量、写入能力、单点故障上的瓶颈，是大规模 Redis 部署的主流选择。

但 Cluster 不是"全能升级版"——它牺牲了一些 Redis 单机版的能力（多 db、跨槽事务、跨槽 MGET）换来分片扩展。运维复杂度也显著上升：节点管理、槽位迁移、故障转移、客户端协议支持都要重新学习。

选不选 Cluster 要看业务规模：单机或主从+哨兵能扛住的场景不必上 Cluster；只有数据量超过单机内存、或写入 QPS 超过单机瓶颈时才考虑。

## 标准回答

Redis Cluster 优点：高可用（主节点故障自动转移）、高性能（分片扩展写入和读 QPS）、可扩展（在线增减节点）、数据分散（突破单机内存限制）。缺点：部署运维复杂、跨槽操作受限（多 key 事务/MGET/Lua 要同槽）、客户端必须支持 Cluster 协议（处理 MOVED/ASK）、数据迁移有开销、集群限制（只能用 db 0、Pub/Sub 开销大）。适用场景：数据量超单机内存、写入 QPS 超 10 万、需要水平扩展的缓存或存储。

要点：

1. 优点：水平扩展写能力、存储容量、自动故障转移。
2. 缺点：跨槽多 key 操作受限、客户端复杂度上升、运维成本高。
3. 单机或主从+哨兵能满足的场景不必上 Cluster。
4. Cluster 不能完全替代哨兵，两者解决不同问题。
5. 集群规模建议不超过 1000 主节点，3-100 节点最常见。

## 实现原理

### 优点详解

| 优点 | 实现 | 收益 |
|------|------|------|
| 高可用 | 每主节点配从节点，故障自动转移 | 单节点故障不影响整体服务 |
| 高性能（写） | 16384 槽分片，写流量分散 | 写 QPS 随主节点数线性扩展 |
| 高性能（读） | 主从都可读（默认从节点读） | 读 QPS = 主节点数 × 单机 QPS |
| 容量扩展 | 数据分散到多节点 | 突破单机内存限制 |
| 在线扩容 | `CLUSTER ADDSLOTS` + reshard | 不停机扩展集群 |
| 故障自愈 | Gossip + PFAIL/FAIL + 选举 | 无需人工干预 |

### 缺点详解

| 缺点 | 原因 | 影响 |
|------|------|------|
| 部署复杂 | 至少 6 节点（3 主 3 从），配置集群总线端口 | 初期部署成本高 |
| 运维复杂 | 槽位管理、节点增减、迁移、故障排查 | 需要 Redis 集群经验 |
| 跨槽操作受限 | 多 key 操作要求所有 key 在同一槽 | MGET/MSET/事务/Lua 受限 |
| 客户端复杂 | 必须处理 MOVED/ASK、维护槽位映射 | 不能用普通 JedisPool |
| 只能用 db 0 | Cluster 不支持多 db | 习惯多 db 隔离的业务要改 |
| Pub/Sub 开销大 | 消息要广播到所有节点 | 大量 Pub/Sub 不适合 Cluster |
| 数据迁移成本 | reshard 期间 key 迁移有性能影响 | 扩容期间业务延迟可能波动 |
| 故障切换丢数据 | 异步复制 + 切换窗口 | 与主从模式一样存在丢失窗口 |

### Cluster 与其他方案对比

| 维度 | 单机 Redis | 主从 + 哨兵 | Redis Cluster |
|------|------------|--------------|---------------|
| 高可用 | 无 | 有（自动故障转移） | 有（自动故障转移） |
| 写扩展 | 无 | 无（单主写入） | 有（多主分片） |
| 读扩展 | 无 | 有（多从读） | 有（多主多从读） |
| 容量 | 单机内存 | 单机内存（每节点全量） | 多节点内存之和 |
| 跨 key 操作 | 不限 | 不限 | 同槽限制 |
| 客户端复杂度 | 低 | 中（订阅 +switch-master） | 高（处理 MOVED/ASK） |
| 运维成本 | 低 | 中 | 高 |
| 适用规模 | 小 | 中 | 大 |

### 跨槽限制的具体表现

```text
1. MGET / MSET 多 key
   MGET k1 k2 k3
   如果 k1、k2、k3 不在同一槽，Cluster 返回错误：
   CROSSSLOT Keys in request don't hash to the same slot

   解决：用 hashtag 让相关 key 同槽
   MGET user:{1001}:profile user:{1001}:orders

2. 事务 MULTI/EXEC
   MULTI
   SET k1 v1
   SET k2 v2
   EXEC
   k1、k2 不同槽时 EXEC 报错

3. Lua 脚本
   EVAL "return redis.call('mset', KEYS[1], ARGV[1], KEYS[2], ARGV[2])" 2 k1 k2 v1 v2
   k1、k2 不同槽时执行失败

4. KEYS / SCAN
   KEYS 在 Cluster 模式下只返回当前节点的 key
   要遍历全集群需要用 redis-cli --cluster call 或循环访问每个主节点
```

### 集群规模建议

| 节点数 | 适用场景 | 注意 |
|--------|----------|------|
| 3 主 3 从 | 中小规模，10-50GB 数据 | 入门配置 |
| 5-10 主 | 中等规模，50-200GB 数据 | 主流生产配置 |
| 10-50 主 | 大规模，200GB-1TB 数据 | 需要专业运维 |
| 50-200 主 | 超大规模，1TB+ 数据 | Gossip 流量、监控复杂 |
| > 1000 | 不推荐 | 心跳开销大，Redis 作者建议上限 |

### Cluster 的隐藏成本

```text
1. 心跳开销
   每个节点每秒发 PING，带槽位 bitmap（2KB）和已知节点信息
   100 节点集群单节点 PING 流量约几百 KB/s
   节点数越多开销越大

2. 客户端连接数
   客户端要连所有主节点（或部分主节点 + 槽位映射）
   集群规模大时客户端连接数膨胀

3. 故障排查难度
   一个跨节点的请求链路可能涉及多个节点
   日志、监控、慢查询都要在多节点间关联

4. 数据迁移业务感知
   reshard 期间 key 在源节点和目标节点之间迁移
   业务请求可能命中 ASK 重定向，延迟略增
   大 Key 迁移会阻塞源节点

5. 版本升级复杂
   滚动升级要逐节点重启，期间槽位重新分配
   跨版本升级要考虑协议兼容性
```

## 代码示例

### 评估是否需要 Cluster

```text
场景 A：单机 Redis 内存使用 5GB，QPS 3 万
  -> 单机或主从+哨兵足够，不必上 Cluster

场景 B：单机 Redis 内存使用 50GB，fork 阻塞明显
  -> 数据量大，考虑 Cluster 分片

场景 C：单机 Redis QPS 15 万，CPU 接近 100%
  -> 写入瓶颈，考虑 Cluster 分片扩展写

场景 D：缓存 + 强一致需求
  -> Cluster 也是异步复制，强一致要 etcd/ZK，Cluster 不解决一致性问题
```

### 客户端多 key 操作的正确姿势

```java
// 错误：直接 MGET 多 key，可能跨槽报错
cluster.mget("user:1", "user:2", "user:3");  // 跨槽时抛异常

// 正确 1：用 hashtag 让相关 key 同槽
cluster.mget("user:{1}:profile", "user:{1}:orders", "user:{1}:cart");

// 正确 2：分组获取
List<String> keys = Arrays.asList("user:1", "user:2", "user:3");
Map<Integer, List<String>> bySlot = keys.stream()
    .collect(Collectors.groupingBy(k -> JedisClusterCRC16.getSlot(k)));
List<String> results = new ArrayList<>();
for (List<String> group : bySlot.values()) {
    results.addAll(cluster.mget(group.toArray(new String[0])));
}
```

### 集群监控要点

```bash
# 集群状态
redis-cli CLUSTER INFO | grep cluster_state
# cluster_state:ok 表示健康，cluster_state:fail 表示集群不可用

# 节点状态
redis-cli CLUSTER NODES | grep -E "fail|handshake|pfail"

# 槽位分布
redis-cli CLUSTER SLOTS

# 检查槽位覆盖
redis-cli --cluster check 192.168.1.10:6379

# 各节点 key 数（评估倾斜）
for port in 6379 6380 6381; do
  echo "Node $port: $(redis-cli -p $port DBSIZE) keys"
done
```

## 实战场景

| 场景 | 是否适合 Cluster | 原因 |
|------|------------------|------|
| 中小缓存（< 10GB，QPS < 5 万） | 不适合 | 主从+哨兵够用，Cluster 增加复杂度 |
| 大规模缓存（> 50GB） | 适合 | 突破单机内存限制 |
| 高并发写入（QPS > 10 万） | 适合 | 写扩展能力 |
| 计数器/排行榜 | 适合 | 按 user_id 分桶到多节点 |
| 分布式锁 | 不适合 | 强一致需求选 etcd/ZK |
| 会话存储 | 适合 | 按 session_id 分片天然分散 |
| 强一致事务 | 不适合 | Cluster 异步复制 + 跨槽限制 |

## 深挖追问

### 1. Cluster 模式写入吞吐能到多少？

理论上是单机的 N 倍（N = 主节点数）。实测 3 主 3 从的 Cluster，简单 SET 操作 QPS 可到 30-50 万；6 主 6 从可到 60-100 万。但实际受网络、客户端、负载均衡影响，扩展比通常在 0.7-0.9。

### 2. Cluster 故障切换会丢多少数据？

和主从+哨兵一样，存在丢失窗口。主节点写入后未同步到从节点就宕机，这部分会丢。`cluster-node-timeout` 越小切换越快但误判概率高。典型配置下丢失窗口在 1-30 秒。

### 3. Cluster 模式下怎么实现分布式锁？

单实例 Redis 锁（SETNX + 过期）在 Cluster 下仍可用，但要考虑故障切换时锁可能丢失（主节点宕机，从节点升主，锁还没同步）。强一致场景用 Redlock（多节点 Quorum）或直接用 etcd/ZooKeeper。

### 4. Cluster 模式下 SCAN 怎么用？

`SCAN` 只扫描当前节点。要遍历全集群需要循环对每个主节点执行 SCAN。`redis-cli --cluster call` 可以批量在所有节点执行命令。客户端库如 JedisCluster 提供了遍历封装。

### 5. Cluster 和 Codis、Twemproxy 等代理方案相比？

Codis、Twemproxy 是客户端透明的代理分片方案，业务无感知。优点是客户端简单，缺点是代理层是单点（Codis 集群化后仍有协调开销）。Cluster 是 Redis 官方方案，无代理层性能更好，但客户端要支持 Cluster 协议。新项目优先选 Cluster，老项目迁移成本高时考虑 Codis。

## 易错点

- 误以为 Cluster 是"哨兵的升级版"，实际它解决分片问题，哨兵解决高可用问题。
- 跨槽多 key 操作报错才知道 Cluster 限制，要在设计阶段用 hashtag 规划。
- 客户端用普通 JedisPool 连 Cluster 是错的，要用 JedisCluster 或支持 Cluster 协议的客户端。
- 以为 Cluster 是强一致，实际仍是异步复制，故障切换会丢数据。
- 集群规模盲目扩大，节点数到几百时 Gossip 和监控成本爆炸。

## 总结

Redis Cluster 优点是水平扩展写入和存储能力、自动高可用、在线扩容；缺点是部署运维复杂、跨槽多 key 操作受限、客户端复杂度上升、仍是异步复制不解决强一致。选型原则：单机或主从+哨兵能满足的场景不必上 Cluster；数据量超单机内存或写入 QPS 超单机瓶颈时再考虑。生产实践要重点处理跨槽 key 设计（hashtag）、客户端协议支持、监控告警、扩容迁移窗口。Cluster 不是万能方案，强一致需求应选 etcd/ZooKeeper。

## 参考资料

- [Redis Cluster 官方文档](https://redis.io/docs/management/scaling/)
- [Redis Cluster 规范](https://redis.io/docs/reference/cluster-spec/)
- [Codis 与 Redis Cluster 对比](https://github.com/CodisLabs/codis)
