# Redis 如何实现主从复制

## 核心概念

主从复制是 Redis 高可用的基础。一台 Redis 主节点（master）对外提供读写服务，多台从节点（slave/replica）通过复制主节点的数据保持同步，对外只读。一旦主节点故障，可以把某个从节点提升为新主节点继续服务，避免单点故障。

主从复制解决了两个问题：数据冗余（多副本防单机故障）和读写分离（读流量分摊到从节点）。但它的复制是异步的，主节点写入后立即返回客户端，不等待从节点确认，所以不能保证强一致——这是 Redis 高性能的代价。

主从复制分两个阶段：第一次同步走全量复制（主节点 BGSAVE 生成 RDB 发给从节点），后续走基于长连接的命令传播。网络断开恢复后优先尝试增量复制，复制积压缓冲区不够时退化为全量。

## 标准回答

Redis 主从复制通过 `replicaof`（5.0 之前 `slaveof`）建立主从关系，第一次同步走全量复制：从节点发送 `PSYNC ? -1`，主节点返回 `FULLRESYNC <runid> <offset>`，主节点 `BGSAVE` 生成 RDB 发给从节点，期间主节点新写入命令存到 replication buffer，RDB 发送完后再发 buffer 内容。之后走命令传播：主节点通过长连接把写命令异步同步给从节点。网络断开恢复后，如果偏移量差距在 repl_backlog 内走增量复制，否则重新全量。

要点：

1. 三个核心字段：`runid`（主节点唯一标识）、`offset`（复制偏移量）、`replid`（复制 ID，2.8+ 用于增量识别）。
2. 两个缓冲区：`repl_backlog_buffer`（环形缓冲区，用于增量复制）和 `replication buffer`（每个从节点一个，存放待发送数据）。
3. 全量复制代价大：主节点 fork + 生成 RDB + 网络传输，从节点清空 + 加载 RDB。
4. 增量复制靠 `repl_backlog` 环形缓冲区，默认 1MB，写多场景要调大。
5. 异步复制，主节点不等从节点 ACK，存在数据丢失窗口。

## 实现原理

### 全量复制时序

```text
从节点                                主节点
  |                                     |
  | --- PSYNC ? -1 -------------------> |   第一次同步，不知道 runid 和 offset
  |                                     |
  | <--- +FULLRESYNC <runid> <offset> - |   要求全量复制，返回主节点 runid 和当前 offset
  |                                     |
  |                                     |   执行 BGSAVE 生成 RDB
  |                                     |   同时把新写入命令存入 replication buffer
  |                                     |
  | <--- 发送 RDB 文件 ---------------- |
  |                                     |
  |   清空本地数据，加载 RDB            |
  |                                     |
  | --- +CONTINUE / 加载完成 ACK -----> |
  |                                     |
  | <--- 发送 replication buffer 命令 - |   补发 RDB 期间主节点的写入
  |                                     |
  |   执行命令，数据最终一致            |
  |                                     |
  | === 进入命令传播阶段（长连接）====> |
```

### 命令传播阶段

全量复制完成后，主从之间维护一条 TCP 长连接。主节点每执行一条写命令，就通过这个连接把命令发给所有从节点。从节点收到后执行，更新自己的 `slave_repl_offset`。这是异步的——主节点不等待从节点响应就返回客户端。

```text
主节点                                从节点
  |                                     |
  | 收到客户端 SET k v                  |
  | 执行命令，更新 master_repl_offset   |
  | 返回客户端 OK                       |
  |                                     |
  | ---传播 SET k v ------------------> |
  |                                     |   执行命令，更新 slave_repl_offset
  |                                     |
```

### 增量复制时序

Redis 2.8+ 引入增量复制，网络短暂断开恢复后不必走全量：

```text
从节点                                主节点
  |                                     |
  | --- PSYNC <runid> <offset> -------> |   带 runid 和 offset
  |                                     |
  |              主节点判断：            |
  |              1. runid 是否匹配？     |
  |              2. offset 是否在 backlog 范围内？
  |                                     |
  | <- 匹配且在范围内 -- +CONTINUE ---- |
  |                                     |   从 backlog 取增量命令发送
  | <--- 发送 [offset, master_offset] 区间的命令
  |                                     |
  |   执行命令，追赶进度                 |
  |                                     |
  | --- (若 runid 不匹配或 offset 超出) |
  | <--- +FULLRESYNC <new_runid> <new_offset> - |
  |                                     |   退化为全量复制
```

### 核心数据结构

| 字段 | 位置 | 含义 |
|------|------|------|
| `master_replid` | 主节点 | 40 字符随机 ID，复制流的标识 |
| `master_repl_offset` | 主节点 | 主节点写入的字节偏移量 |
| `slave_repl_offset` | 从节点 | 从节点已读到的偏移量 |
| `repl_backlog_buffer` | 主节点 | 环形缓冲区，存最近的写入命令，默认 1MB |
| `replication buffer` | 主节点 | 每个从节点一个，存放待发送的命令 |
| `server.replid` | 从节点 | 复制 ID，2.8+ 用于识别复制源 |

### repl_backlog 大小估算

```text
repl_backlog_size = second * write_size_per_second * 2

second : 从节点断线到重连的平均时间（秒）
write_size_per_second : 主节点每秒产生的写命令数据量
* 2 : 留 1 倍冗余应对突发
```

示例：主节点每秒写入 1MB，从节点平均断线 30 秒，则 `repl_backlog_size = 1MB × 30 × 2 = 60MB`。配置 `repl-backlog-size 64mb` 比较合适。

### 级联复制分担主节点压力

主节点有大量从节点时，全量复制会让主节点 fork 压力和网络压力陡增。Redis 支持级联复制：从节点也可以作为其他从节点的主节点。

```text
主节点 M
  |-- 从节点 A（同时作为 B、C 的主节点）
        |-- 从节点 B
        |-- 从节点 C
  |-- 从节点 D
```

A 接收 M 的同步数据，同时把数据同步给 B 和 C。M 只需fork 一次给 A，A 再 fork 给 B 和 C，压力分摊。

### 主从复制版本演进

| 版本 | 改进 |
|------|------|
| 2.6 | 基础全量复制，断线即全量 |
| 2.8 | 引入 PSYNC 和 repl_backlog，支持增量复制 |
| 4.0 | 引入 psync2，故障切换后仍可增量复制 |
| 5.0 | `slaveof` 改名为 `replicaof`，语义更准确 |
| 6.0 | 支持 RDB 直接通过网络传输给从节点（diskless replication） |
| 7.0 | 复制积压缓冲区多副本支持，提升大集群同步效率 |

## 代码示例

### 配置主从

```conf
# 从节点 redis.conf
replicaof 192.168.1.10 6379

# 从节点只读
replica-read-only yes

# 主节点认证密码
masterauth <password>

# 复制积压缓冲区大小
repl-backlog-size 64mb
repl-backlog-ttl 3600

# 无盘同步（主节点 RDB 不落盘直接发网络）
repl-diskless-sync yes
repl-diskless-sync-delay 5
```

### 在线切换主从

```bash
# 把当前节点变成 192.168.1.10 的从节点
redis-cli REPLICAOF 192.168.1.10 6379

# 取消主从关系，升级为主节点
redis-cli REPLICAOF NO ONE

# 查看复制状态
redis-cli INFO replication
```

### 复制状态检查

```bash
# 主节点视角
redis-cli INFO replication | grep -E "role|connected_slaves|master_replid|master_repl_offset|repl_backlog_size|repl_backlog_first_byte_offset"

# 从节点视角
redis-cli INFO replication | grep -E "role|master_host|master_port|master_link_status|slave_repl_offset|master_sync_in_progress"

# 关键指标
# master_link_status:up         从节点与主节点连接正常
# master_last_io_seconds_ago:0  最近一次 IO 时间，过大说明复制延迟
# slave_repl_offset             从节点偏移量，与主节点 master_repl_offset 对比看延迟
```

### 主从延迟监控

```bash
#!/bin/bash
# 比较主从偏移量，告警延迟
MASTER_OFFSET=$(redis-cli -h master INFO replication | grep master_repl_offset | cut -d: -f2 | tr -d '\r')
SLAVE_OFFSET=$(redis-cli -h slave INFO replication | grep slave_repl_offset | head -1 | cut -d: -f2 | tr -d '\r')
LAG=$((MASTER_OFFSET - SLAVE_OFFSET))
if [ "$LAG" -gt 1048576 ]; then
  echo "WARN: replication lag ${LAG} bytes"
fi
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 读写分离 | 主写从读，读流量分摊到多个从节点 | 复制延迟期间读从可能拿到旧数据 |
| 数据热备 | 一主一从，从节点随时待命接管 | 故障切换需配合哨兵或人工 |
| 读写分离 + 故障转移 | 一主多从 + 哨兵 | 哨兵自动选主，业务客户端感知切换 |
| 跨机房容灾 | 主从跨机房部署，从节点只读 | 跨机房网络延迟会导致复制延迟增大 |
| 读密集场景 | 一主多从扩展读 QPS | 从节点数量过多会让主节点 fork 压力大 |

## 深挖追问

### 1. 主从复制是同步还是异步？

异步。主节点执行完写命令立即返回客户端，不等从节点确认。所以主节点故障时未同步的命令会丢。可以用 `WAIT numreplicas timeout` 让客户端等待指定数量从节点确认，但仍不是严格同步复制。

### 2. 增量复制为什么需要 replid？

replid 是复制流的标识。如果主节点没换（replid 不变），从节点断线重连后可以带着自己的 offset 请求增量。如果主节点变了（故障切换），replid 变化，从节点只能走全量。Redis 4.0 的 psync2 让故障切换后的新主也能识别旧主的 replid，部分场景下还能增量复制。

### 3. 全量复制期间主节点的新写入怎么处理？

主节点 BGSAVE 生成 RDB 期间，把新写入命令存到 replication buffer（每个从节点一个）。RDB 发送完后，把 buffer 内容补发给从节点。这保证了全量复制期间主节点的写入不丢。

### 4. repl_backlog 满了会怎样？

repl_backlog 是环形缓冲区，写满后从头覆盖旧数据。如果从节点断线时间过长，要的 offset 已经被覆盖，主节点找不到对应数据，从节点只能走全量。所以写多场景要按公式估算并调大 `repl-backlog-size`。

### 5. 主从切换后原主节点重新上线会怎样？

原主节点会被设为新主的从节点，触发全量复制——清空原主数据，从新主加载 RDB。如果原主在故障期间还接收了客户端写入（脑裂），这些数据会在全量复制时被清空丢失。这就是脑裂丢数据的根因。

## 易错点

- 主从复制不是强一致，故障切换会丢数据，敏感业务要补偿。
- 从节点默认只读，但 `replica-read-only no` 可开启从写，写入不会同步回主，会造成数据不一致。
- `repl-backlog-size` 默认 1MB 太小，写多场景要调大，否则频繁全量复制。
- `masterauth` 不配置会导致从节点连不上需要认证的主节点，复制中断。
- 主节点 `repl-diskless-sync yes` 时如果磁盘 IO 不是瓶颈，反而可能因网络发送慢拖累同步。

## 总结

Redis 主从复制通过全量复制 + 命令传播 + 增量复制三种机制实现数据同步。第一次同步走全量：fork 生成 RDB + replication buffer 补发增量。之后走长连接命令传播，异步同步写入。网络断开恢复后优先走增量（repl_backlog 环形缓冲区），找不到 offset 才退化全量。复制是异步的，存在数据丢失窗口，这是 Redis 用性能换一致性的选择。理解 runid、offset、replid、repl_backlog 这几个核心字段是掌握主从复制的关键。

## 参考资料

- [Redis Replication 官方文档](https://redis.io/docs/management/replication/)
- [Redis PSYNC2 设计文档](https://github.com/redis/redis/issues/3284)
- 《Redis 设计与实现》黄健宏
