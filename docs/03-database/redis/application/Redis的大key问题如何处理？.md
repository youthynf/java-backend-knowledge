# Redis 的大 key 问题如何处理

## 核心概念

"大 key"指单个 key 对应的 value 过大。判定标准因业务而异，通用经验：

- **String**：value > 10 KB（高并发场景 > 1 KB 就要注意）；
- **Hash/List/Set/ZSet**：元素数量 > 5000，或总内存 > 10 MB；
- **Stream**：消息数 > 1 万。

大 key 是 Redis 生产事故的常见根源：阻塞主线程、网络打满、内存倾斜、删除时卡顿、主从同步延迟、集群迁移超时。

一句话结论：**避免大 key 的核心是设计阶段就拆分（如按业务维度切片）；治理三步走：发现（`--bigkeys`/SCAN/MEMORY USAGE）→ 拆分（按 hash/范围分桶）→ 异步删除（`UNLINK`/`lazyfree`）。**

## 标准回答

| 阶段 | 工具/方案 | 说明 |
|------|-----------|------|
| 发现 | `redis-cli --bigkeys` | 每种类型 Top1 大 key |
| 发现 | `MEMORY USAGE key` | 单 key 内存占用（4.0+） |
| 发现 | `SCAN` 遍历 + 类型判断 | 全量扫描 |
| 发现 | RDB 离线分析（rdb-tools） | 不影响线上 |
| 治理 | 拆分（hash/范围分桶） | 设计阶段预防 |
| 治理 | 异步删除 `UNLINK` | 4.0+ 不阻塞主线程 |
| 治理 | 分批删除（HSCAN + HDEL 等） | 4.0 以下用 |
| 预防 | 监控 + 报警 | 容量阈值告警 |

## 详细机制

### 一、大 key 的危害

#### 1. 阻塞主线程

Redis 单线程执行命令，操作大 key 耗时长，期间所有其他客户端等待。

```text
对 100 万元素的 Hash 做 HGETALL：耗时约 1~2 秒
期间 Redis 主线程被阻塞，所有命令排队
```

典型慢命令：

| 命令 | 复杂度 | 危害 |
|------|--------|------|
| `KEYS *` | O(N) | 全库扫描，秒级阻塞 |
| `HGETALL` 大 Hash | O(N) | 返回大块数据 |
| `SMEMBERS` 大 Set | O(N) | 返回大块数据 |
| `LRANGE` 大 List | O(N) | 返回大块数据 |
| `ZRANGE` 大 ZSet | O(N) | 返回大块数据 |
| `DEL` 大 key | O(N) | 同步释放内存 |

#### 2. 网络打满

大 key 单次返回数据量大，千兆网卡下：

- 1 MB value × 1000 QPS = 1 GB/s 网络流量，远超千兆网卡上限（125 MB/s）；
- 多个客户端同时拉大 key，瞬间打满带宽。

#### 3. 内存倾斜

Cluster 模式按 slot 分片，大 key 只能落在一个分片。该分片内存远高于其他分片，造成倾斜。

#### 4. 删除时阻塞

`DEL` 大 key 是同步操作，释放大块内存需遍历数据结构，期间主线程阻塞。10 万元素的 Hash `DEL` 可能阻塞数百毫秒。

#### 5. 主从同步延迟

大 key 通过 RDB 全量同步或命令增量同步时，传输和加载耗时长，主从延迟变大。集群迁移 slot 时单 key 迁移可能超时失败。

### 二、发现大 key

#### 方法 1：`redis-cli --bigkeys`

```bash
redis-cli --bigkeys
# 每种类型输出 Top1 大 key
# Sampled 100000 keys in the keyspace!
# Biggest string found 'user:profile:1001' has 10240 bytes
# Biggest list   found 'msg:queue' has 50000 items
```

**注意**：

- 会扫描全库，建议在从节点或低峰执行；
- 加 `-i 0.1` 控制扫描间隔，降低影响；
- 只返回 Top1，看不到 TopN；
- 基于 SCAN，不会阻塞 Redis，但占 CPU。

#### 方法 2：`MEMORY USAGE`（4.0+）

```bash
MEMORY USAGE user:profile:1001
# 返回字节数，如 (integer) 10256

# 可指定 SAMPLES，对集合类型采样估算
MEMORY USAGE big_hash SAMPLES 5
```

适合已知 key 名时精确查询。

#### 方法 3：SCAN + 类型判断

```bash
SCAN 0 COUNT 100
# 返回 cursor 和 key 列表
TYPE user:1001
# 返回类型，如 "hash"
HLEN user:1001
# 返回元素数量
```

客户端遍历所有 key，按类型用对应命令查询大小。

#### 方法 4：rdb-tools 离线分析

```bash
# 安装
pip install rdbtools

# 解析 RDB 文件，输出大于 10KB 的 key
rdb -c memory --bytes 10240 -f bigkeys.csv dump.rdb

# 输出 TopN
rdb -c memory dump.rdb --largest 100
```

优点：不影响线上 Redis，可生成 CSV 报表。

#### 方法 5：Redis 4.0+ 的 `MEMORY STATS`

```bash
MEMORY STATS
# 返回内存详细信息：used_memory、dataset.bytes、keys.count 等
```

辅助判断整体内存分布。

### 三、治理大 key

#### 方案 1：拆分（设计阶段预防）

**Hash 拆分**：把 10 万字段的 Hash 按字段哈希拆成 100 个 Hash，每个 1000 字段。

```text
原：user:1001:profile (10 万字段)
拆：user:1001:profile:0  → 字段哈希 % 100 = 0 的字段
    user:1001:profile:1  → 字段哈希 % 100 = 1 的字段
    ...
    user:1001:profile:99
```

**List 拆分**：按范围或时间分桶。

```text
原：msg:queue (100 万元素)
拆：msg:queue:2026062900  → 按小时分桶
    msg:queue:2026062901
```

**Set/ZSet 拆分**：类似 Hash，按元素哈希分桶。

**String 拆分**：把大 JSON 拆成多个字段，分别存储。

```text
原：user:1001:detail (大 JSON 100KB)
拆：user:1001:detail:basic    → 基本信息
    user:1001:detail:contact  → 联系方式
    user:1001:detail:address  → 地址
```

#### 方案 2：异步删除（4.0+）

用 `UNLINK` 代替 `DEL`，主线程只移除 key 引用，实际内存释放在后台线程。

```bash
DEL bigkey       # 同步删除，阻塞主线程
UNLINK bigkey    # 异步删除，不阻塞
```

配合配置自动异步删除：

```conf
lazyfree-lazy-eviction yes       # 内存淘汰异步
lazyfree-lazy-expire yes         # 过期删除异步
lazyfree-lazy-server-del yes     # 服务端隐式 DEL 异步
lazyfree-lazy-user-del yes       # 用户主动 DEL 异步（6.0+）
replica-lazy-flush yes           # 从节点全量同步 flush 异步
```

#### 方案 3：分批删除（4.0 以下）

无 UNLINK 时，按类型分批删除：

```bash
# 大 Hash：HSCAN + HDEL
HSCAN big_hash 0 COUNT 100
# 拿到 100 个字段后
HDEL big_hash field1 field2 ... field100
# 重复直到 HLEN 为 0，最后 DEL big_hash

# 大 List：LTRIM
LTRIM big_list 100 -1   # 每次删前 100 个
# 重复直到 LLEN 为 0

# 大 Set：SSCAN + SREM
SSCAN big_set 0 COUNT 100
SREM big_set member1 member2 ...

# 大 ZSet：ZREMRANGEBYRANK
ZREMRANGEBYRANK big_zset 0 99   # 删 rank 0~99
```

Java 实现：

```java
public void deleteBigHash(String key, int batchSize) {
    String cursor = "0";
    do {
        ScanResult<Map.Entry<String, String>> result = jedis.hscan(key, cursor,
            ScanParams.scanParams().count(batchSize));
        List<Map.Entry<String, String>> entries = result.getResult();
        if (!entries.isEmpty()) {
            String[] fields = entries.stream()
                .map(Map.Entry::getKey)
                .toArray(String[]::new);
            jedis.hdel(key, fields);
        }
        cursor = result.getCursor();
    } while (!"0".equals(cursor));
    jedis.del(key);
}
```

### 四、监控与预防

```conf
# 监控内存
maxmemory 8gb
maxmemory-policy allkeys-lru

# 监控指标
INFO memory         # used_memory, mem_fragmentation_ratio
INFO stats          # evicted_keys, expired_keys
SLOWLOG GET 10      # 慢查询（含大 key 操作）
LATENCY HISTORY     # 延迟事件（7.0+）
```

报警阈值建议：

- 单 key 内存 > 10 KB（高并发场景 1 KB）；
- Hash/List/Set 元素数 > 5000；
- 单分片内存倾斜 > 20%；
- 慢查询数 > 10/分钟。

## 代码示例

### 集成预防：写入时自动分桶

```java
public class ShardedHashCache {
    private static final int BUCKET_NUM = 100;

    public void hset(String prefix, String field, String value) {
        int bucket = Math.abs(field.hashCode() % BUCKET_NUM);
        jedis.hset(prefix + ":" + bucket, field, value);
    }

    public String hget(String prefix, String field) {
        int bucket = Math.abs(field.hashCode() % BUCKET_NUM);
        return jedis.hget(prefix + ":" + bucket, field);
    }
}
```

### 巡检大 key 的定时任务

```java
@Scheduled(cron = "0 0 3 * * ?")  // 凌晨 3 点
public void scanBigKeys() {
    String cursor = "0";
    do {
        ScanResult<String> result = jedis.scan(cursor, ScanParams.scanParams().count(500));
        for (String key : result.getResult()) {
            Long mem = jedis.memoryUsage(key);
            if (mem != null && mem > 10_000) {
                alertService.notify("大 key 告警: " + key + " = " + mem + " bytes");
            }
        }
        cursor = result.getCursor();
    } while (!"0".equals(cursor));
}
```

### 大 key 异步删除（4.0+）

```java
public void safeDelete(String key) {
    // 优先用 UNLINK，回退到 DEL
    try {
        jedis.unlink(key);
    } catch (Exception e) {
        // 4.0 以下回退到分批删除
        String type = jedis.type(key);
        switch (type) {
            case "hash":
                deleteBigHash(key, 100);
                break;
            case "list":
                deleteBigList(key, 100);
                break;
            case "set":
                deleteBigSet(key, 100);
                break;
            case "zset":
                deleteBigZSet(key, 100);
                break;
            default:
                jedis.del(key);
        }
    }
}
```

## 实战场景

| 场景 | 大 key 来源 | 治理方案 |
|------|-------------|----------|
| 用户购物车 | 单用户 List 累积 | 按时间分桶 + 上限 |
| 消息推送队列 | List 无限增长 | 拆分多个 List + 过期 |
| 商品评论 | 单商品 Hash 字段过多 | 按评论 ID 哈希分桶 |
| 排行榜 | 单 ZSet 元素过多 | 按范围/类目拆分 |
| 历史数据归档 | Hash 持续写入 | 定期清理 + 拆分 |
| 用户画像 | 大 JSON String | 按字段拆分 Hash |
| 实时日志 | List 持续 LPUSH | 按小时分桶 + LTRIM |

## 深挖追问

### 大 key 的判定标准是什么？

无统一标准，因业务而异：

- 高并发低延迟场景：String > 1 KB、集合 > 1000 元素就算大；
- 低并发大容量场景：String > 100 KB、集合 > 1 万元素才算大。

参考阿里云规范：String > 10 KB、Hash/List/Set/ZSet > 5000 元素即视为大 key。

### `--bigkeys` 会阻塞 Redis 吗？

会，但有缓解：

- 它实际是基于 SCAN 的，不会一次性遍历；
- 加 `-i 0.1` 让每次 SCAN 间隔 0.1 秒，降低阻塞；
- 仍建议在从节点执行。

### UNLINK 删除大 key 真的不阻塞吗？

主线程不阻塞，但后台线程仍需时间释放内存。如果同时 UNLINK 多个大 key，后台线程压力大，可能影响其他 lazyfree 操作。生产建议分批 UNLINK。

### 大 key 怎么导出/迁移？

```bash
# 用 DUMP + RESTORE 迁移单 key
DUMP bigkey
# 拿到序列化字节后
RESTORE newkey 0 <serialized> REPLACE

# 集群 slot 迁移
CLUSTER SETSLOT <slot> NODE <target-node-id>
```

大 key 迁移可能超时，需调大 `cluster-node-timeout`。Redis 3.0+ 用 `MIGRATE` 命令的 `COPY`/`REPLACE` 选项优化。

### 主从同步大 key 会出问题吗？

会。全量同步时主节点 RDB fork 大量内存可能阻塞；增量同步时单条命令传输大 key 耗时，主从延迟变大。集群迁移大 key 也可能因超时失败回滚。

### 大 key 一定导致慢查询吗？

不一定。如果只是 `HGET`、`HGET` 单字段查询，复杂度 O(1)，不影响。但 `HGETALL`、`SMEMBERS`、`DEL`、`KEYS` 等会触发慢查询。所以治理重点是"避免对大 key 做批量操作"。

### Redis 7.0 对大 key 的处理有改进吗？

- `MEMORY USAGE` 支持更精确的估算；
- `LAZYFREE` 后台线程优化，多线程释放；
- `SHUTDOWN NOSAVE` 更安全；
- Cluster 模式 slot 迁移支持大 key 分批传输。

### 如何防止大 key 在线上突然出现？

- 上线前代码 review，检查写入逻辑；
- 监控 `INFO memory` 的 `used_memory` 突增；
- 慢查询监控（大 key 操作必产生慢查询）；
- 设置 `maxmemory` + 淘汰策略兜底。

## 易错点

- 设计阶段不考虑分桶，事后大 key 难以治理；
- 用 `DEL` 删大 key，主线程阻塞数秒；
- `--bigkeys` 在主节点高并发期执行，影响业务；
- 拆分后业务读取要按新规则路由，代码不更新导致读不到；
- 监控只看内存总量，忽略单 key 大小；
- 大 key 在集群迁移时超时失败导致 slot 迁移卡死；
- `MEMORY USAGE` 对集合类型默认采样，估算偏小。

## 总结

大 key 是 Redis 生产事故的常见根源。**核心是设计阶段就拆分**（Hash/List 按哈希或时间分桶），**治理三步走**：发现（`--bigkeys`/SCAN/MEMORY USAGE）→ 拆分（业务侧改造）→ 异步删除（`UNLINK`/lazyfree）。生产必须开启 `lazyfree-*` 配置避免删除阻塞，并建立监控报警（单 key 大小、内存倾斜、慢查询）。

## 参考资料

- [Redis 官方文档：Memory optimization](https://redis.io/docs/management/optimization/memory/)
- [Redis 4.0 lazyfree 特性](https://redis.io/docs/management/optimization/lazyfree/)
- [rdb-tools](https://github.com/sripathikrishnan/redis-rdb-tools)

---
