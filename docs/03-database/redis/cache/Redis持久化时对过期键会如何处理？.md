# Redis 持久化时对过期键会如何处理

## 核心概念

Redis 持久化有 RDB 和 AOF 两种格式，它们对过期 key 的处理逻辑不同。理解这点能避免"重启后某些 key 不见了"或"AOF 文件越来越大"等困惑。

一句话结论：**RDB 生成时不保存已过期的 key；加载时主节点不加载过期 key，从节点全部加载（后续同步会清）。AOF 写入时若 key 还未删除会保留，被删除时追加 DEL；AOF 重写时不保存已过期的 key。**

## 标准回答

| 阶段 | RDB | AOF |
|------|-----|-----|
| 持久化生成 | 已过期 key 不写入文件 | key 未被删除时正常写入；被删除时追加 DEL 命令 |
| 持久化加载 | 主节点不加载过期 key；从节点全部加载 | 重放时按命令执行，遇到 DEL 自然删除 |
| 重写/压缩 | 不适用 | 已过期 key 不写入新 AOF |

## 详细机制

### 一、RDB 对过期键的处理

#### 1. RDB 生成阶段（BGSAVE）

主节点执行 `BGSAVE` 时，会遍历数据库，**对每个 key 检查是否已过期**。已过期的 key 不会写入新的 RDB 文件。

```text
遍历 DB → 对每个 key 调用 expireIfNeeded → 过期则跳过 → 未过期才写入 RDB
```

这意味着 RDB 文件天然不包含过期 key，重启后加载这些数据是干净的。

#### 2. RDB 加载阶段

加载时分两种情况：

- **主节点模式**：加载 RDB 时，再次检查 key 是否过期，**过期 key 不会被加载到内存**；
- **从节点模式**：加载 RDB 时，**不论是否过期都加载**。但随后主从同步会清空从节点数据，所以最终从节点的数据来自主节点，过期 key 不会留下。

| 模式 | 是否加载过期 key | 原因 |
|------|------------------|------|
| 主节点 | 不加载 | 保持数据干净 |
| 从节点 | 加载 | 后续会被主节点全量同步覆盖 |

### 二、AOF 对过期键的处理

#### 1. AOF 写入阶段

AOF 追加的是命令本身，不是数据快照。所以：

- 如果一个 key 已设置过期时间但**还没被删除**（惰性删除未触发、定期删除未抽到），AOF 仍保留这个 key 的写命令；
- 当 key 被删除（惰性/定期触发）时，Redis **向 AOF 追加一条 `DEL key` 命令**。

```text
SET foo bar
EXPIRE foo 10
# 10 秒后某次访问或定期删除触发
DEL foo   # 追加到 AOF
```

#### 2. AOF 重写阶段

AOF 重写（BGREWRITEAOF）会遍历当前数据库，**对每个 key 检查是否过期，已过期的 key 不会写入新的 AOF 文件**。这相当于"压缩"了 AOF，去掉了已删除 key 的历史命令。

重写前 AOF 可能有：

```text
SET foo bar
EXPIRE foo 10
DEL foo
```

重写后：这三条都不出现在新 AOF 中（因为 foo 已不存在）。

### 三、混合持久化的处理

Redis 4.0+ 支持混合持久化（RDB + AOF 增量）：

- AOF 文件前半部分是 RDB 格式（基础数据）；
- 后半部分是 AOF 增量命令。

过期 key 的处理遵循上述规则：RDB 部分不含过期 key，AOF 增量部分会追加 DEL。

启用混合持久化：

```conf
aof-use-rdb-preamble yes    # 4.4+ 默认 yes
```

### 四、AOF 三种刷盘模式的差异

AOF `appendfsync` 三种模式：

| 模式 | 行为 | 数据安全 | 性能 |
|------|------|----------|------|
| `always` | 每条命令都刷盘 | 最高（最多丢 1 条） | 最低 |
| `everysec` | 每秒刷盘一次 | 高（最多丢 1 秒） | 高（默认） |
| `no` | 由 OS 决定 | 低 | 最高 |

对过期 key 处理无差异：所有模式的 DEL 命令都会写入 AOF 缓冲区，差异只在何时刷到磁盘。

## 代码示例

观察过期 key 在 AOF 中的处理：

```bash
# 开启 AOF
CONFIG SET appendonly yes

# 写入并设置过期
SET foo "hello"
EXPIRE foo 5

# 立刻查看 AOF（foo 还没过期）
tail -f appendonly.aof
# 内容包含：SET foo "hello" 和 EXPIRE foo 5

# 6 秒后访问触发惰性删除
GET foo    # 返回 nil

# 再查看 AOF
# 末尾追加：DEL foo

# 手动触发 AOF 重写
BGREWRITEAOF

# 重写后 AOF 中 foo 相关命令全部消失
```

观察 RDB 加载行为：

```bash
# 主节点
SET foo bar EX 5
# 等 6 秒（确保过期）
BGSAVE   # foo 不在 RDB 中

# 重启 Redis
redis-server --dbfilename dump.rdb
# 启动后 GET foo 返回 nil（未加载）
```

Java 客户端配置混合持久化：

```bash
# redis.conf
appendonly yes
appendfsync everysec
aof-use-rdb-preamble yes
no-appendfsync-on-rewrite yes   # 重写期间不刷盘，避免 IO 抖动
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
```

## 实战场景

| 场景 | 行为 | 注意点 |
|------|------|--------|
| 大量临时 key 已过期但未触发惰性删除 | RDB 不保存 | 重启后内存可能下降 |
| AOF 文件膨胀 | DEL 命令累积 | 定期 BGREWRITEAOF |
| 重启后某些 key 不见了 | RDB 加载时跳过过期 key | 这是预期行为 |
| 主从切换后从库数据 | RDB 加载过期 key 但同步会清 | 不影响最终一致 |
| 混合持久化恢复 | RDB + AOF 增量 | 两层都正确处理过期 |
| 大批 key 同时过期 | DEL 风暴阻塞主线程 | 开 lazyfree + TTL 抖动 |

## 深挖追问

### 为什么从节点加载 RDB 时不跳过过期 key？

从节点 RDB 通常用于全量同步前的本地数据加载。加载后立即开始主从全量同步，本地数据被 `FLUSHALL` 清空，所以过期 key 短暂存在不影响最终状态。这样设计简化了从节点逻辑。

### AOF 重写时正在过期的 key 会写入吗？

不会。重写时遍历数据库，对每个 key 调用 `expireIfNeeded` 检查，过期则跳过。所以重写后 AOF 是"当前内存快照"加最新命令，干净紧凑。

### AOF `appendfsync` 三种模式对过期 key 处理有差异吗？

无差异。三种模式只影响何时把 AOF 缓冲区刷到磁盘，不影响 DEL 命令何时被写入 AOF 缓冲区。所有模式的 DEL 命令都会写入。

### RDB fork 时内存中的过期 key 算"已过期"吗？

是的。fork 时通过 COW 复制内存页，遍历数据库时检查的是当时内存中的过期字典。fork 期间新过期的不影响（fork 后是子进程独立处理）。

### 大量过期 key 同时触发 DEL 会拖慢 AOF 吗？

会。批量 DEL 会瞬间产生大量 AOF 写入。生产建议：

1. 开启 `lazyfree-lazy-expire yes` 让删除异步；
2. AOF 用 `everysec` 而非 `always`；
3. 避免大批量 key 同时过期（TTL 加随机抖动）；
4. 定期 `BGREWRITEAOF` 压缩 AOF。

### 混合持久化重启时如何加载？

```text
1. 读取 AOF 文件开头，识别 RDB preamble
2. 加载 RDB 部分（基础数据）
3. 重放 AOF 增量部分（增量命令）
```

加载速度比纯 AOF 快很多（RDB 二进制格式高效），适合大实例。

### RDB 和 AOF 同时开启时优先加载哪个？

优先加载 AOF（因为 AOF 通常更完整）。如果 AOF 不存在或损坏，才加载 RDB。

### 关闭持久化后过期 key 还会消失吗？

会。过期 key 的删除由惰性 + 定期删除机制决定，与持久化无关。持久化只影响重启后的数据状态。

## 易错点

- 误以为 RDB 会保留过期 key，重启后还能看到；
- 不理解 AOF 中 DEL 命令的来源，以为是 bug；
- 把主节点和从节点加载 RDB 的行为混淆；
- AOF 文件膨胀不重写，磁盘撑爆；
- 大量 key 同时过期触发 DEL 风暴，阻塞主线程；
- 误以为关闭持久化后过期 key 不会消失；
- AOF 重写期间断电导致数据丢失（重写是先写新文件再 rename）。

## 总结

RDB 和 AOF 对过期 key 的处理都遵循"**已过期则不持久化**"原则：RDB 生成时跳过，加载时主节点跳过、从节点全加载（后续同步清）；AOF 在 key 被删除时追加 DEL，重写时跳过过期 key。生产环境建议开启混合持久化 + lazyfree 异步删除，避免大量过期 key 同时触发 DEL 阻塞主线程。

## 参考资料

- [Redis 官方文档：Persistence](https://redis.io/docs/management/persistence/)
- [Redis 设计与实现：过期键的 RDB/AOF 处理](https://redisbook.readthedocs.io/)
- [Redis 4.0 混合持久化](https://redis.io/docs/management/persistence/)

---
