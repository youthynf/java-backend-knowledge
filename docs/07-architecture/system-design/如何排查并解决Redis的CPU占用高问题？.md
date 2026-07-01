# 如何排查并解决 Redis 的 CPU 占用高问题

## 核心概念

Redis 单线程执行命令（Redis 6 引入辅助 IO 线程，但命令执行仍是单线程），CPU 高通常意味着某些命令执行成本高、请求量大、数据结构使用不当，或后台任务（持久化、删除、集群同步）造成压力。一句话点题：Redis CPU 高，几乎一定是"慢命令 + 大 key + 热 key + 后台任务"四类之一。

排查思路："看监控 → 看慢日志 → 看命令统计 → 看大 key/热 key → 看后台任务"。

## 标准回答

Redis CPU 高先看机器指标和 `info` 区分类型：流量型（QPS 暴涨）还是慢命令型（QPS 不高但单条慢）。`slowlog get` 看慢命令，`info commandstats` 看命令分布，`info clients` 看连接数，`info persistence` 看持久化。常见根因：`keys *`/`hgetall` 大 hash/大范围 `zrange`、大 key 操作、热 key 集中访问、Lua 脚本耗时长、AOF rewrite/RDB save、主从全量同步。处理：限流、禁用高危命令、拆分大 key、热 key 多级缓存、读写分离、分片。

## 排查步骤

```bash
# 1. 看整体状态：QPS、连接数、内存
redis-cli info stats
redis-cli info clients
redis-cli info memory

# 2. 看命令分布：哪类命令调用次数多、CPU 占用高
redis-cli info commandstats

# 3. 看慢日志（默认 10ms 阈值，可调）
redis-cli slowlog get 20
# 看每条慢命令的：命令、耗时、客户端、key

# 4. 看持久化状态：是否在 RDB save / AOF rewrite
redis-cli info persistence

# 5. 看主从同步：是否在做全量同步
redis-cli info replication

# 6. 找大 key（生产慎用，建议用 --bigkeys 或扫描脚本）
redis-cli --bigkeys
# 或用 memory usage 看 key 占用
redis-cli memory usage user:1001

# 7. 找热 key（Redis 4+ 自带）
redis-cli --hotkeys
# 需要配置 maxmemory-policy = allkeys-lfu

# 8. 实时监控（生产慎用，性能开销大）
redis-cli monitor
```

## 实现原理

### Redis 单线程模型

Redis 主线程负责：接受连接、解析命令、执行命令、返回响应。命令执行是单线程串行的，所以一个慢命令会阻塞所有其他命令。Redis 6 引入 IO 多线程（解析和写响应并行），但**命令执行仍是单线程**。所以 CPU 高，主线程被吃满，所有客户端都会变慢。

### 慢命令的代价

慢命令不仅自己慢，还会让后续所有命令排队。例如对 100 万元素的 hash 执行 `HGETALL` 要 100ms，期间整个 Redis 处于阻塞状态，其他客户端的 GET 也要等 100ms。这就是为什么 Redis 严格限制"单条命令不能太重"。

### 大 key 的危害

- 操作慢：`HGETALL`、`LRANGE 0 -1`、`SMEMBERS` 一次返回大量数据，主线程长时间占用。
- 网络阻塞：单次响应几十 MB，网卡打满。
- 删除慢：`DEL` 大 key 是同步操作（Redis 4+ 可用 `UNLINK` 异步删），释放内存耗时长。
- 集群迁移卡顿：槽位迁移时大 key 序列化耗时长，导致迁移超时。
- 容易触发内存抖动：大 key 过期一次性释放大量内存。

### 热 key 的危害

某个 key QPS 极高，单实例成为热点，CPU 打满，其他 key 也跟着慢。常见场景：热门商品详情、明星动态、首页推荐位。

### 后台任务的 CPU 开销

- **RDB save**：`BGSAVE` fork 子进程，COW 机制下大内存实例 fork 慢且占内存。
- **AOF rewrite**：重写时遍历所有 key，CPU 占用高。
- **AOF fsync**：`appendfsync always` 每条命令都 fsync，性能差。
- **主从全量同步**：从节点第一次连主节点，主节点 `BGSAVE` 全量数据。

## 代码示例

慢日志查询结果分析：

```bash
$ redis-cli slowlog get 5
1) 1) (integer) 14                    # 日志 ID
   2) (integer) 1640000000            # 时间戳
   3) (integer) 50000                 # 耗时（微秒），50ms
   4) 1) "HGETALL"                    # 命令
      2) "user:profile:big"           # key
```

Lua 脚本批量拆分大 hash：

```lua
-- 不要一次 HGETALL 大 hash，分批 HSCAN
local cursor = '0'
local result = {}
repeat
    local reply = redis.call('HSCAN', KEYS[1], cursor, 'COUNT', 100)
    cursor = reply[1]
    -- 处理 reply[2]
until cursor == '0'
```

异步删除大 key：

```bash
# Redis 4+ 推荐 UNLINK，后台异步释放内存
redis-cli UNLINK huge_key

# 配置 lazy free 自动异步删除大 key
# redis.conf
lazyfree-lazy-eviction yes
lazyfree-lazy-expire yes
lazyfree-lazy-server-del yes
```

rename 危险命令（生产防误用）：

```conf
# redis.conf
rename-command KEYS ""
rename-command FLUSHDB ""
rename-command FLUSHALL ""
```

## 实战场景

| 场景 | 表现 | 处理 |
|------|------|------|
| `keys *` 在生产执行 | Redis 短时间卡死 | 禁用 keys，改用 SCAN；rename-command 屏蔽 |
| 大 hash `HGETALL` | 单命令 100ms+ | 拆分 key 或分批 HSCAN |
| 热点商品 key | 单实例 CPU 100% | 本地缓存、多副本读、key 加随机后缀分散 |
| AOF rewrite | 周期性 CPU 飙升 | 调大 rewrite 触发阈值、用 no-appendfsync-on-rewrite |
| 主从全量同步 | 从节点加入时主节点 CPU 飙升 | 错峰扩容、用 diskless replication |
| Lua 脚本复杂 | 单脚本执行慢 | 拆分逻辑、限制循环次数 |
| 集群 slot 迁移大 key | 迁移卡顿 | 拆分大 key 后再迁移 |
| 过期大 key 集中过期 | 内存抖动、CPU 突刺 | 过期时间加随机偏移 |

## 深挖追问

### 大 key 怎么定义？

不同 Redis 版本和业务场景标准不同，常见阈值：

- String 类型：单 value > 10 KB
- Hash/List/Set/ZSet：元素数量 > 5000 或总大小 > 10 MB

实际看监控：如果一个 key 的 `memory usage` 显著高于平均，就算大 key。线上用 `redis-cli --bigkeys` 或 `MEMORY USAGE` 扫描。注意 `--bigkeys` 扫描时也会占 CPU，业务高峰不要跑。

### 热 key 怎么发现？

- `redis-cli --hotkeys`（需要 LFU 淘汰策略）
- 业务侧埋点统计 key 访问频率
- proxy 层（如 twemproxy、codis）统计
- 客户端 SDK 上报

### 热 key 怎么解决？

- **本地缓存**：业务侧用 Caffeine 缓存热点数据，TTL 短（如 5 秒），减少 Redis 访问。
- **多副本读**：把热 key 复制到多个 Redis 实例，客户端随机选副本读。
- **key 分散**：把 `hot_key` 拆成 `hot_key_0`、`hot_key_1` ... `hot_key_9`，写入时随机选，读时全部读合并。
- **限流**：对热 key 访问做限流，超出部分直接走降级。

### 为什么 `keys *` 这么危险？

`keys *` 遍历所有 key，单线程下整个 Redis 阻塞直到扫描完成。10 万 key 的实例 `keys *` 可能阻塞几百毫秒，生产环境绝对禁止。替代方案：`SCAN` 游标式遍历，每次返回部分 key，不阻塞主线程。

### RDB fork 为什么慢？

fork 是写时复制（COW），fork 本身要复制页表，大内存实例（如 64GB）页表可达数百 MB，fork 耗时几百毫秒到秒级。期间主线程阻塞，所有命令排队。解决办法：降低实例内存上限、用 `vm.overcommit_memory=1`、避免单实例过大。

### Redis 6 的多线程 IO 能解决 CPU 高吗？

只能解决"网络 IO 阻塞"导致的吞吐瓶颈，不能解决"慢命令"导致的 CPU 高。多线程 IO 让读请求和写响应并行，但命令执行仍单线程。如果是慢命令（HGETALL 大 hash）导致的 CPU 高，多线程 IO 帮不上。

### Redis Cluster 下 Lua 脚本要注意什么？

Cluster 模式下 Lua 脚本里所有 key 必须在同一 slot，否则报 `CROSSSLOT` 错误。用 hash tag 强制同 slot：`{user:1001}:profile`、`{user:1001}:order` 都落在同一 slot。

## 易错点

- 生产高峰不要长时间 `monitor`，它会输出所有命令，性能开销大。
- `keys *` 绝对禁止，改用 `SCAN` 或在配置里 `rename-command KEYS ""`。
- 大 key 删除用 `UNLINK` 而不是 `DEL`。
- AOF `appendfsync always` 性能极差，生产用 `everysec`。
- 不要把所有热数据堆在一个实例，要做分片。
- `--bigkeys` 扫描时也会占 CPU，业务高峰不要跑。
- 客户端连接数高不一定 CPU 高，可能是网络 IO 瓶颈。

## 总结

Redis CPU 高排查链路：`info` 看整体 → `slowlog` 看慢命令 → `info commandstats` 看命令分布 → `--bigkeys`/`--hotkeys` 看大热 key → `info persistence` 看后台任务。核心四类根因：慢命令、大 key、热 key、后台任务。重点掌握：单线程模型理解、大 key 拆分、热 key 多级缓存、RDB/AOF 优化、`keys *` 禁用。和 Java 应用 CPU 高排查相比，Redis 排查更关注命令本身和 key 设计，而不是线程栈。

## 参考资料

- [Redis Documentation - Latency monitoring](https://redis.io/docs/management/optimization/latency/)
- [Redis Documentation - Memory optimization](https://redis.io/docs/management/optimization/memory-optimization/)
- [Redis Documentation - SCAN](https://redis.io/commands/scan/)
- [redis-cli --bigkeys](https://redis.io/docs/management/scaling/)

---
