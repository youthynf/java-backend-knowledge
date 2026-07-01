# Redis 键值对数据是如何实现的

## 核心概念

Redis 是内存型 KV 数据库，键值对由四层结构组成：`redisDb`（数据库）→ `dict`（主字典）→ `dictEntry`（键值条目）→ `redisObject`（值包装）→ 具体底层编码（SDS/quicklist/dict/skiplist 等）。此外还有 `expires` 字典记录过期时间。

这种分层设计让 Redis 能在**对外提供统一命令 API**的同时，**对内根据数据规模选择最优底层结构**。key 总是 SDS，value 是 RedisObject，RedisObject 的 type 字段决定逻辑类型，encoding 字段决定底层实现。

一句话总结：**Redis KV = redisDb + dict（主字典）+ expires（过期字典）+ dictEntry + redisObject(type + encoding + ptr)**。

## 标准回答

### 整体结构

```
redisServer
+-----------------+
| redisDb[16]     |  默认 16 个数据库
+-----------------+
       |
       v
redisDb
+-----------------+      +-----------------+
| dict *dict      |----> | key -> redisObject 映射 |
| dict *expires   |----> | key -> 过期时间戳        |
| int id          |
+-----------------+
       |
       v
dict (主字典)
+--------+
| ht[0]  |---> table[0] -> dictEntry -> dictEntry -> NULL
| ht[1]  |     table[1] -> dictEntry -> NULL
| ...    |     ...
+--------+
       |
       v
dictEntry
+-------+--------+-------+
| *key  | *val   | *next |
+-------+--------+-------+
  SDS    redisObject  冲突链表
            |
            v
       redisObject
       +--------+--------+--------+--------+
       | type   | encod. | lru    | *ptr   |
       +--------+--------+--------+--------+
                              |
                              v
                      底层数据结构
                      (SDS / listpack / dict / skiplist / ...)
```

### 关键组件

| 组件 | 作用 |
|------|------|
| redisServer | 进程级状态，包含所有 redisDb |
| redisDb | 单个数据库，包含主字典和过期字典 |
| dict（主字典） | key → redisObject 映射，渐进式 rehash |
| dict（过期字典） | key → 过期时间戳 |
| dictEntry | 字典条目，包含 key/value/next 指针 |
| redisObject | 值包装，type + encoding + LRU/LFU + ptr |
| 底层结构 | SDS/listpack/quicklist/dict/skiplist/intset 等 |

## 实现原理

### 1. redisDb 结构

`src/server.h`：

```c
typedef struct redisDb {
    dict *dict;                // 主字典：key -> redisObject
    dict *expires;             // 过期字典：key -> timestamp(ms)
    dict *blocking_keys;       // 阻塞等待的 key（BLPOP 等）
    dict *ready_keys;          // 已就绪的阻塞 key
    dict *watched_keys;        // WATCH 监视的 key
    int id;                    // 数据库 ID（0-15）
    long long avg_ttl;         // 平均 TTL
    unsigned long expires_cursor;
    list *defrag_later;
} redisDb;
```

默认 16 个数据库（`databases 16`），SELECT 命令切换。Cluster 模式只能用 0 号库。

### 2. dict 主字典

主字典是 Redis KV 的核心，所有 key-value 都在这里。详见 dict 文章。

```c
typedef struct dict {
    dictType *type;
    void *privdata;
    dictht ht[2];              // 两个哈希表，rehash 用
    long rehashidx;            // -1 未 rehash
    unsigned long iterators;
} dict;
```

key 是 SDS 字符串，value 是 redisObject 指针。冲突用链地址法，渐进式 rehash 扩容。

### 3. dictEntry

```c
typedef struct dictEntry {
    void *key;                 // SDS 字符串
    union {
        void *val;             // redisObject 指针
        uint64_t u64;
        int64_t s64;
        double d;
    } v;
    struct dictEntry *next;    // 冲突链表
} dictEntry;
```

key 是 SDS，val 用 union 节省内存（多数情况存 redisObject 指针）。

### 4. redisObject（核心）

`src/server.h`：

```c
typedef struct redisObject {
    unsigned type:4;           // OBJ_STRING/LIST/HASH/SET/ZSET/STREAM/MODULE...
    unsigned encoding:4;       // OBJ_ENCODING_INT/EMBSTR/RAW/LISTPACK/QUICKLIST/
                               // HASHTABLE/SKIPLIST/INTSET/STREAM/...
    unsigned lru:LRU_BITS;     // LRU 或 LFU 数据（24 bit）
    int refcount;              // 引用计数
    void *ptr;                 // 指向底层数据结构
} robj;
```

- **type**：4 bit，逻辑类型，对应 String/List/Hash/Set/ZSet 等
- **encoding**：4 bit，底层编码，详见"五种类型底层实现"文章
- **lru**：24 bit，LRU 时间戳或 LFU 计数（用于内存淘汰）
- **refcount**：引用计数，共享对象（0-9999 整数）refcount 很大
- **ptr**：指向底层数据结构（SDS/listpack/quicklist/dict/skiplist 等）

```
type = OBJ_STRING, encoding = OBJ_ENCODING_INT,      ptr = (void*)((long)100)
type = OBJ_STRING, encoding = OBJ_ENCODING_EMBSTR,   ptr = SDS(连续内存)
type = OBJ_STRING, encoding = OBJ_ENCODING_RAW,      ptr = SDS(独立分配)
type = OBJ_HASH,   encoding = OBJ_ENCODING_LISTPACK, ptr = listpack
type = OBJ_HASH,   encoding = OBJ_ENCODING_HASHTABLE,ptr = dict
type = OBJ_LIST,   encoding = OBJ_ENCODING_QUICKLIST,ptr = quicklist
type = OBJ_SET,    encoding = OBJ_ENCODING_INTSET,   ptr = intset
type = OBJ_ZSET,   encoding = OBJ_ENCODING_SKIPLIST, ptr = zset(skiplist + dict)
```

### 5. type 和 encoding 常量

```c
// src/server.h
#define OBJ_STRING 0
#define OBJ_LIST 1
#define OBJ_SET 2
#define OBJ_ZSET 3
#define OBJ_HASH 4
#define OBJ_MODULE 5
#define OBJ_STREAM 6

#define OBJ_ENCODING_RAW 0
#define OBJ_ENCODING_INT 1
#define OBJ_ENCODING_HT 2          // hashtable
#define OBJ_ENCODING_ZIPMAP 3      // 已废弃
#define OBJ_ENCODING_LINKEDLIST 4  // 已废弃（被 quicklist 替代）
#define OBJ_ENCODING_ZIPLIST 5     // 7.0 起被 listpack 替代（仅兼容代码）
#define OBJ_ENCODING_INTSET 6
#define OBJ_ENCODING_SKIPLIST 7
#define OBJ_ENCODING_EMBSTR 8
#define OBJ_ENCODING_QUICKLIST 9
#define OBJ_ENCODING_STREAM 10
#define OBJ_ENCODING_LISTPACK 11   // 7.0+

#define LRU_BITS 24                // lru 字段位数
#define OBJ_SHARED_INTEGERS 10000  // 共享整数 0-9999
```

### 6. expires 过期字典

过期字典与主字典分离：主字典存真实 value，过期字典存 key → 过期时间戳。

```c
// 设置过期
void setExpire(client *c, redisDb *db, robj *key, long long when) {
    dictEntry *kde = dictFind(db->dict, key->ptr);
    sds copy = sdsdup(key->ptr);
    dictAdd(db->expires, copy, (void*)when);
}
```

**为什么不用 redisObject 包装过期时间？** 过期时间是 int64 时间戳，单独存节省 redisObject 16 字节开销。主字典和过期字典的 key **不共享 SDS**（通过 `sdsdup` 复制，删除时各自释放）。

### 7. 过期删除策略

Redis 过期删除采用**惰性删除 + 定期删除**结合：

- **惰性删除**：每次访问 key（GET/SET/HGET 等）时检查 expires 字典，过期则删除
- **定期删除**：`serverCron` 定时任务周期性随机抽样 expires 字典，删除过期 key

```c
// 惰性删除
int expireIfNeeded(redisDb *db, robj *key) {
    if (!keyIsExpired(db, key)) return 0;
    // 删除 key（主字典 + 过期字典）
    deleteExpiredKey(db, key);
    return 1;
}

// 定期删除（serverCron 调用）
void activeExpireCycle(int type) {
    // 随机抽样 expires 字典，删除过期 key
    // 限制每次执行时间，避免阻塞
    // 如果过期比例 > 25%，重复抽样
}
```

定期删除算法：

1. 每次从 expires 字典随机抽 20 个 key
2. 删除已过期的 key
3. 如果过期比例 > 25%，重复抽样
4. 每轮执行时间不超过 25ms（`FAST_CYCLE`）/ 一定百分比 CPU（`NORMAL_CYCLE`）

### 8. 内存淘汰策略

内存超过 `maxmemory` 时按 `maxmemory-policy` 淘汰：

| 策略 | 说明 |
|------|------|
| noeviction | 不淘汰，写入报错（默认） |
| allkeys-lru | 所有 key 中 LRU 淘汰 |
| allkeys-lfu | 所有 key 中 LFU 淘汰 |
| allkeys-random | 所有 key 中随机淘汰 |
| volatile-lru | 设了过期的 key 中 LRU 淘汰 |
| volatile-lfu | 设了过期的 key 中 LFU 淘汰 |
| volatile-random | 设了过期的 key 中随机淘汰 |
| volatile-ttl | 设了过期的 key 中 TTL 最短优先 |

LRU/LFU 信息存在 redisObject.lru 字段（24 bit）。

> LRU 模式：lru 字段存秒级时间戳（最后访问时间）。
> LFU 模式：高 16 bit 存分钟级衰减时间戳，低 8 bit 存访问计数（对数衰减）。

### 9. 渐进式 rehash 与 KV

主字典 dict 扩容时采用渐进式 rehash（详见 dict 文章）：

- rehash 期间读写都要查 ht[0] 和 ht[1]
- 新增只写 ht[1]
- 每次操作顺带迁移一个桶
- `serverCron` 定时任务批量迁移

这让 Redis 在百万级 key 扩容时不阻塞主线程。

### 10. 共享对象

Redis 启动时预创建 0-9999 的 redisObject 放在 `shared.integers` 数组：

```c
// src/server.c
for (int i = 0; i < OBJ_SHARED_INTEGERS; i++) {
    shared.integers[i] = makeObjectShared(createObject(OBJ_STRING, NULL));
    shared.integers[i]->encoding = OBJ_ENCODING_INT;
    shared.integers[i]->ptr = (void*)((long)i);
}
```

SET 小整数直接复用，refcount = INT_MAX，省内存分配。但开启 RDB/AOF 加载或 maxmemory-policy 时部分共享对象会被禁用（淘汰需要单独引用计数）。

## 代码示例

```bash
# 主字典：所有 key 在 redisDb.dict
SET k1 v1
SET k2 v2
DBSIZE                       # 2，来自 dict.used

# 过期字典：key -> timestamp
EXPIRE k1 300
TTL k1                       # 来自 expires 字典
PERSIST k1                   # 从 expires 字典移除

# redisObject 的 type 和 encoding
SET k_int 100
SET k_str "hello"
HSET k_hash f1 v1
LPUSH k_list a b c

TYPE k_int                   # "string"（type 字段）
OBJECT ENCODING k_int        # "int"（encoding 字段）
TYPE k_hash                  # "hash"
OBJECT ENCODING k_hash       # "listpack"

# 内存分析
MEMORY USAGE k_str           # 字节数
DEBUG OBJECT k_str           # 详细信息
OBJECT REFCOUNT k_int        # 引用计数（共享对象会是 INT_MAX）

# 数据库切换
SELECT 0                     # 0 号库
SELECT 15                    # 15 号库（Cluster 模式只能用 0）

# FLUSHDB / FLUSHALL
FLUSHDB                      # 清空当前库
FLUSHALL                     # 清空所有库（生产慎用）
```

Java 客户端模拟 KV 访问链路：

```java
// Spring Data Redis 封装了这些细节，但底层链路是：
// 1. 序列化 key -> SDS bytes
// 2. RESP 协议发送到 Redis
// 3. Redis 在 redisDb.dict 中哈希查找
// 4. 检查 expires 字典是否过期
// 5. 返回 redisObject.ptr 指向的数据
// 6. 序列化字节 -> Java 对象

public void demonstrateKvFlow() {
    // 写入：SET k1 v1
    // Redis 内部：
    //   - redisDb.dict 添加 dictEntry{key="k1"(SDS), val=redisObject{type=STRING, encoding=EMBSTR, ptr=SDS("v1")}}
    redisTemplate.opsForValue().set("k1", "v1");

    // 读取：GET k1
    // Redis 内部：
    //   - 检查 expires 字典，k1 是否过期
    //   - 在 redisDb.dict 哈希查找 "k1"
    //   - 返回 redisObject.ptr 指向的 SDS 内容
    String value = redisTemplate.opsForValue().get("k1");

    // 设置过期：EXPIRE k1 300
    // Redis 内部：
    //   - redisDb.expires 添加 dictEntry{key="k1"(SDS 复制), val=(now + 300)*1000}
    redisTemplate.expire("k1", Duration.ofSeconds(300));
}
```

排查内存问题：

```bash
# 大 Key 扫描
redis-cli --bigkeys

# 内存采样分析
redis-cli --memkeys

# 单 key 内存占用
MEMORY USAGE user:1

# 编码查询
OBJECT ENCODING user:1

# 引用计数
OBJECT REFCOUNT user:1

# 过期分析
DEBUG OBJECT user:1           # 查看 ttl 字段

# 慢查询日志
SLOWLOG GET 10

# 延迟诊断
LATENCY DOCTOR

# 内存详情
INFO memory                   # used_memory、mem_fragmentation_ratio
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 内存分析 | `MEMORY USAGE` + `OBJECT ENCODING` | 大 Key 定位 |
| 编码异常排查 | `OBJECT ENCODING` | 小对象意外转 hashtable 可能是阈值问题 |
| 过期分析 | `DEBUG OBJECT` | 看 ttl 字段 |
| 容量规划 | `INFO memory` | 关注 used_memory 和 mem_fragmentation_ratio |
| rehash 监控 | `INFO stats` 的 `dict_resizes` | 大量 rehash 可能造成延迟抖动 |
| 数据库切换 | `SELECT 0-15` | Cluster 模式只能用 0 |
| 大 Key 治理 | `redis-cli --bigkeys` + `UNLINK` | 定期扫描，异步删除 |
| 引用计数排查 | `OBJECT REFCOUNT` | 共享对象 refcount = INT_MAX |

## 深挖追问

### 为什么 value 要包一层 RedisObject？

为了统一记录 type、encoding、LRU/LFU 信息，支持多种底层结构和淘汰策略。没有 RedisObject 的话，每种类型需要独立结构，无法统一管理。RedisObject 16 字节开销换来了类型系统、编码切换、淘汰策略等能力。

### Redis 字典扩容会阻塞吗？

Redis 使用渐进式 rehash，把迁移分摊到后续命令和定时任务中，避免一次性搬迁全部数据。但 rehash 期间字典查询可能需要查两个表，每次操作有少量额外开销。百万级 key 扩容仍可能在 BGSAVE 阈值从 1 升到 5 时积累，导致延迟抖动。

### 过期 key 存在哪里？

主 dict 保存真实键值（key → redisObject），expires dict 保存 key → 过期时间戳。两个字典 key **不共享** SDS（通过 sdsdup 复制）。删除过期 key 时同时删两个字典的 entry。

### 同样是 Hash，底层一定是 hashtable 吗？

不一定。小 Hash（字段数 < 128 且单值 < 64 字节）用 listpack 紧凑存储，超阈值才转 hashtable。Redis 通过 encoding 字段动态切换。

### 为什么不用单独的内存表存所有 key？

主字典就是这个表。dict 的 ht[0].table 就是哈希桶数组，所有 dictEntry 都在这里。渐进式 rehash 保证扩容不阻塞。

### LRU 和 LFU 在 redisObject 里怎么存？

都用 `lru` 字段（24 bit）。LRU 模式存上次访问时间戳（秒），LFU 模式高 16 bit 存上次衰减时间（分钟）、低 8 bit 存访问计数。两种模式互斥，由 `maxmemory-policy` 决定。

### redisDb 的 dict 和 expires 的 dict 共享 key 吗？

不共享。expires 字典的 key 是 `sdsdup` 复制的 SDS。删除 key 时主字典 dictEntry 释放 key SDS，expires 字典也要 `sdsfree` 自己的 key SDS。这让两个字典能独立 rehash。

### 共享对象（0-9999 整数）怎么工作？

Redis 启动时预创建 0-9999 的 redisObject 放在 `shared.integers` 数组，refcount = `OBJ_SHARED_REFCOUNT`（INT_MAX）。SET 小整数直接复用，省内存分配。但开启 maxmemory-policy 时共享对象会被禁用（淘汰需要单独引用计数）。

### SELECT 切换数据库有什么限制？

Cluster 模式只能用 0 号库，SELECT 1 会报错。单机模式 0-15 都可用，但跨库操作无原子性保证（MULTI/EXEC 不能跨库）。

### 删除大 Key 为什么会阻塞？

`DEL` 命令同步释放内存，大 dict/hashtable/skiplist 释放需要 O(N) 时间。生产用 `UNLINK` 异步释放：主线程从字典移除，后台线程释放内存。

## 易错点

- 不要把 Redis 理解成单层 HashMap，value 的 type/encoding 很关键。
- 过期删除不是到点立刻 100% 删除，而是惰性删除 + 定期删除。
- 渐进式 rehash 能降低阻塞，但 rehash 期间字典查询可能需要查两个表。
- 小对象编码阈值与 Redis 版本、配置有关，回答时要说明版本差异。
- redisDb.id 默认 0-15，Cluster 模式只能用 0。
- 共享对象只针对 0-9999 整数，超出范围或非整数不共享。
- LRU 和 LFU 不能同时启用，由 `maxmemory-policy` 决定。
- `TYPE` 返回的是逻辑类型，`OBJECT ENCODING` 返回的是底层编码，两者不同。
- 主字典和过期字典的 key 不共享 SDS，删除时各自释放。
- `DEL` 大 Key 会阻塞，生产用 `UNLINK`。

## 总结

Redis 键值对由 redisDb + dict + expires + dictEntry + redisObject + 底层结构组成。主字典 dict 存 key → redisObject 映射，过期字典 expires 存 key → 时间戳。redisObject 通过 type（逻辑类型）+ encoding（底层编码）+ lru（LRU/LFU）+ ptr（底层数据结构指针）实现"统一 API + 多种底层实现"。渐进式 rehash 保证扩容不阻塞，惰性 + 定期删除处理过期 key。关键词是**redisDb、dict 主字典、expires 过期字典、dictEntry、redisObject(type/encoding/lru/ptr)、渐进式 rehash、惰性 + 定期删除、共享对象**。

## 参考资料

- [Redis 源码 server.h](https://github.com/redis/redis/blob/7.0/src/server.h)
- [Redis 源码 db.c](https://github.com/redis/redis/blob/7.0/src/db.c)
- [Redis 源码 object.c](https://github.com/redis/redis/blob/7.0/src/object.c)
- [Redis 设计与实现 - 数据库](http://redisbook.com/preview/sds/database.html)

---
