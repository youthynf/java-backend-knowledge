# Redis 大 Key 对持久化有什么影响

## 核心概念

大 Key 是指单个 key 占用内存过大或元素过多的对象，比如一个 List 装了 100 万元素、一个 String 有 10MB 数据。大 Key 不只是内存问题，对持久化也是放大器——它会显著拖慢 RDB 快照、AOF 重写和 fsync，并放大 fork 阻塞和写时复制的内存开销。

大 Key 影响持久化的核心原因有三个：fork 子进程时页表复制正比于内存，大 Key 让 fork 更慢；持久化期间主进程修改大 Key 会触发整页复制，内存瞬间翻倍；AOF `always` 策略下大 Key 单次 fsync 写盘耗时长，主线程被阻塞。

治理大 Key 是 Redis 运维的基本功，要在设计阶段拆分，运行阶段监控，删除时用异步 `UNLINK`。

## 标准回答

大 Key 对持久化的影响主要在三个环节：fork 阻塞更久（页表复制时间长）、写时复制内存放大更严重（大 Key 被修改时整页复制）、AOF fsync 阻塞主线程（单次写盘量大）。它会拖慢 RDB 快照、AOF 重写和故障恢复，并可能引发主从同步延迟和脑裂。治理手段：设计上拆分大 Key、删除用 `UNLINK` 异步释放、监控 `memory usage` 和 `INFO commandstats`、定期用 `redis-cli --bigkeys` 扫描。

要点：

1. 大 Key 定义：String > 10KB，Hash/List/Set/ZSet 元素 > 5000 或总大小 > 10MB（业务口径）。
2. fork 时间正比于内存，大 Key 多的实例 fork 阻塞百毫秒到秒级。
3. COW 复制以页（4KB）为单位，大 Key 被修改会触发大量页复制。
4. AOF `always` 写大 Key 时 fsync 阻塞主线程，引发延迟尖刺。
5. `UNLINK`（4.0+）异步删除大 Key，不阻塞主线程。

## 实现原理

### 大 Key 影响持久化的三个环节

```text
1. fork 阶段
   主进程调用 fork() 复制页表
   大 Key -> 内存大 -> 页表大 -> 复制耗时长
   实测：10GB 实例 fork ≈ 50ms，50GB 实例 fork ≈ 300ms

2. 持久化执行阶段
   子进程遍历内存写盘，遇到大 Key 单条命令很长
   List/Set 等元素过多 -> 拆批写 -> CPU 占用高
   同时主进程修改大 Key -> COW 触发整页复制 -> 内存翻倍

3. AOF 写回阶段
   appendfsync always 时，每条命令 fsync 一次
   写入 10MB 的大 Key -> 单次 fsync 几百毫秒
   主线程在 fsync 期间完全阻塞，客户端感受到延迟尖刺
```

### 大 Key 在不同持久化场景的具体表现

| 场景 | 大 Key 影响 | 后果 |
|------|-------------|------|
| `BGSAVE` | fork 慢 + 子进程遍历慢 + COW 内存放大 | 主线程阻塞、内存可能 OOM |
| `BGREWRITEAOF` | 同上 + 重写缓冲区累积大 Key 命令 | 重写期间内存暴涨 |
| AOF `always` fsync | 单次写盘量大 | 主线程阻塞百毫秒到秒级 |
| AOF `everysec` | 后台 fsync 慢于 1 秒，主线程主动等待 | 延迟尖刺 + 丢数据窗口扩大 |
| 主从全量同步 | 主节点 BGSAVE 慢 + RDB 传输慢 | 同步耗时长，从节点长时间不可用 |
| 重启加载 | RDB/AOF 中大 Key 反序列化慢 | 实例启动慢，故障恢复时间长 |

### 大 Key 的其他连锁影响

- **客户端超时**：单线程执行 `LRANGE bigkey 0 -1` 等命令耗时长，后续命令排队。
- **网络阻塞**：1MB 的 Value 每秒被读 1000 次，产生 1GB/s 流量，千兆网卡被打满。
- **集群倾斜**：哈希槽分布均匀但大 Key 落在某个节点，导致该节点内存和 CPU 远超其他节点。
- **删除阻塞**：`DEL bigkey` 同步释放内存，主线程被阻塞几秒甚至更久。
- **过期阻塞**：大 Key 设置过期被定期删除策略命中时，主线程也要花时间释放内存。

### 大 Key 检测方法

```bash
# 1. redis-cli 内置扫描工具
redis-cli --bigkeys
# 输出每种数据类型最大的 key

# 2. 内存使用分析
redis-cli -h xxx MEMORY USAGE keyname
# 返回该 key 占用的内存字节数

# 3. 列出所有 key 的内存并排序（小规模）
redis-cli --memkeys

# 4. 用 SCAN + MEMORY USAGE 编写脚本（生产推荐）
redis-cli --scan --pattern '*' | while read key; do
  size=$(redis-cli MEMORY USAGE "$key")
  if [ "$size" -gt 10485760 ]; then
    echo "$key $size"
  fi
done
```

### 大 Key 治理相关版本演进

| Redis 版本 | 大 Key 治理改进 | 说明 |
|------------|----------------|------|
| 2.6 | `OBJECT ENCODING` 查看编码 | 间接判断大 Key |
| 3.0 | `MEMORY USAGE` 命令 | 精确估算 key 占用字节数 |
| 4.0 | `UNLINK` 异步删除 | 释放交给 bio_lazy_free 线程 |
| 4.0 | `--bigkeys` 扫描工具 | redis-cli 内置 |
| 4.0 | `lazyfree-lazy-eviction` 等配置 | 内存淘汰异步释放 |
| 5.0 | `--memkeys` 扫描工具 | 按内存排序而非元素数 |
| 6.0 | `LAZYFREE-THREADS` 调优 | 多个 lazyfree 线程并行释放 |
| 7.0 | listpack 替换 ziplist | 小 Hash/List/Set/ZSet 内存占用下降，减少"假大 Key" |
| 7.0 | `lazyfree-lazy-user-del` | 默认 DEL 也异步 |
| 7.2 | 同 7.0 | 多线程删除更稳定 |

4.0 之前删除大 Key 只能用 `DEL` 同步释放，主线程阻塞几秒到几十秒。4.0+ 引入 `UNLINK` 和 lazyfree 系列配置后，大 Key 治理才真正可行。

### 大 Key 删除的正确姿势

```bash
# 错误：DEL 同步删除，大 Key 阻塞主线程
DEL bigkey

# 正确（4.0+）：UNLINK 异步释放内存
UNLINK bigkey

# List 渐进式删除（4.0 之前）
LPOP bigkey 100    # 每次删 100 个元素
# 循环直到列表为空，再 DEL

# Hash 渐进式删除
HSCAN bigkey 0 COUNT 100
HDEL bigkey field1 field2 ...

# 7.0+ 可以用 lazyfree 选项
CONFIG SET lazyfree-lazy-eviction yes
CONFIG SET lazyfree-lazy-expire yes
CONFIG SET lazyfree-lazy-server-del yes
```

## 代码示例

### 大 Key 监控脚本

```bash
#!/bin/bash
# 每天扫描一次，找出大于 10MB 的 key
THRESHOLD=10485760
redis-cli --scan --pattern '*' | while read key; do
  size=$(redis-cli MEMORY USAGE "$key" 2>/dev/null)
  if [ -n "$size" ] && [ "$size" -gt "$THRESHOLD" ]; then
    type=$(redis-cli TYPE "$key")
    echo "$(date +%F_%T) BIGKEY $key type=$type size=$size"
  fi
done >> /var/log/redis/bigkeys.log
```

### Java 客户端拆分大 List

```java
// 错误：直接 push 百万元素到单个 List
// jedis.rpush("history:1001", allElements); // 百万元素单次 rpush 阻塞

// 正确：按用户 ID 分桶 + 分批写入
public void appendHistory(long userId, List<String> events) {
    int bucket = (int) (userId % 100);
    String key = "history:" + userId + ":" + bucket;
    int batchSize = 1000;
    for (int i = 0; i < events.size(); i += batchSize) {
        List<String> batch = events.subList(i, Math.min(i + batchSize, events.size()));
        jedis.rpush(key, batch.toArray(new String[0]));
    }
    jedis.expire(key, 86400 * 30);
}
```

### Java 客户端安全删除

```java
// 错误：直接 del 大 key
// jedis.del("bigkey");  // 阻塞主线程

// 正确：UNLINK 异步删除
jedis.unlink("bigkey");

// 兼容老版本：分批 hdel
public void safeDeleteHash(String key) {
    ScanParams params = new ScanParams().count(100);
    String cursor = "0";
    do {
        ScanResult<Map.Entry<String, String>> result = jedis.hscan(key, cursor, params);
        List<Map.Entry<String, String>> entries = result.getResult();
        if (!entries.isEmpty()) {
            jedis.hdel(key, entries.stream()
                .map(Map.Entry::getKey)
                .toArray(String[]::new));
        }
        cursor = result.getCursor();
    } while (!"0".equals(cursor));
    jedis.del(key);
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 历史数据归档 | 按时间或 ID 分桶存储 | 单个 List 控制在 1 万元素内 |
| 全局排行榜 | ZSet 拆分到多个 key 或用 Stream | 单 ZSet 不超过 10 万元素 |
| 大 JSON 配置 | 拆成多个 Hash 字段 | 不要存整段 JSON 字符串 |
| 删除积压数据 | `UNLINK` + 7.0 lazyfree | 监控后台 `bio_lazy_free` 队列 |
| 迁移大 Key | `MIGRATE` 用 `COPY` + 后台异步 | 大 Key 迁移期间阻塞源节点 IO |

## 深挖追问

### 1. 多大的 Key 算大 Key？

业界常用口径：String 类型 > 10KB，Hash/List/Set/ZSet 元素数 > 5000 或总内存 > 10MB。但具体阈值要看业务场景：4 核 8G 的小实例，1MB 的 Value 可能就算大；64 核 256G 的大实例，10MB 才算。重点不是绝对值，而是看是否影响主线程延迟。

### 2. UNLINK 比 DEL 好在哪？

`DEL` 是同步删除，主线程负责释放内存，大 Key 释放可能耗时几秒。`UNLINK` 把释放工作交给 `bio_lazy_free` 后台线程，主线程只做引用计数清零和从字典里移除，几乎不阻塞。代价是内存实际释放有延迟，对内存敏感场景要监控 `lazyfree_pending_objects`。

### 3. RDB 持久化时大 Key 被修改会怎样？

触发写时复制。大 Key 占的物理页被复制一份，主进程在新页上修改，子进程仍持有旧页写 RDB。如果大 Key 是 1GB 且被频繁修改，可能瞬间多出 1GB 内存。生产上要保证实例有空闲内存（建议 30%-50%）。

### 4. 如何避免大 Key 在 AOF 重写时拖慢主线程？

设计上拆分大 Key；运行时把重写触发条件调宽松，避开高峰；监控 `aof_last_rewrite_time_sec` 和 `latest_fork_usec`；必要时手动 `BGREWRITEAOF` 在低峰期触发。

### 5. 集群模式下大 Key 怎么处理？

Cluster 模式下单个 key 不能跨槽，所以大 Key 必然落在某个节点。设计上用 hashtag 把相关的多个小 key 放到同一槽，逻辑上仍是"一个对象"。如果实在拆不了，考虑用 Stream 或者把数据放到外部存储，Redis 只存索引。

## 易错点

- 用 `DEL` 删大 Key 会阻塞主线程几秒到几十秒，必须用 `UNLINK`。
- `KEYS *` 找大 Key 是错的，会阻塞主线程，应该用 `SCAN` 或 `--bigkeys`。
- 把 `MEMORY USAGE` 当成精确值，它返回的是抽样估算，对 ziplist/listpack 编码可能有偏差。
- 大 Key 设置过期时间并不意味着安全：过期触发时如果命中定期删除，仍会阻塞主线程。
- `MIGRATE` 大 Key 默认是同步迁移，源节点和目标节点都会阻塞，要加 `COPY` + 后台选项。

## 总结

大 Key 是 Redis 持久化的放大器：让 fork 更慢、COW 内存放大更严重、AOF fsync 阻塞更久、故障恢复时间更长。它还会拖累客户端响应、网络带宽和集群均衡。治理要从设计阶段做起——拆分大对象、按时间/ID 分桶、避免单 key 装过多数据。运行阶段要用 `--bigkeys`、`MEMORY USAGE`、`SCAN` 定期扫描，删除时用 `UNLINK` 异步释放。Redis 7.0 的 lazyfree 系列选项让大 Key 治理更自动化，但根本还是要避免大 Key 产生。

## 参考资料

- [Redis 内存优化官方文档](https://redis.io/docs/management/optimization/memory-management/)
- [Redis 4.0 lazyfree 实现](https://github.com/redis/redis/blob/4.0/src/lazyfree.c)
- [redis-cli --bigkeys 工具说明](https://redis.io/docs/management/optimization/memory-management/#identifying-big-keys)
