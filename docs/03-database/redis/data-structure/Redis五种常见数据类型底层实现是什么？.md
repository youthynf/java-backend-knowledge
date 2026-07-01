# Redis 五种常见数据类型底层实现是什么

## 核心概念

Redis 的"数据类型"和"底层编码"是两个层次的概念。**数据类型是对外暴露的 API**（如 String、Hash、List、Set、ZSet），**底层编码是内部具体实现**（如 SDS、listpack、quicklist、skiplist）。Redis 为了"小对象省内存、大对象高效"的工程目标，让同一类型在不同数据规模下选择不同编码。

一句话总结：**String 底层 SDS（int/embstr/raw 三种编码）；Hash 小对象 listpack 大对象 hashtable；List 用 quicklist（小 List 直接 listpack）；Set 全整数小集合 intset 混合小集合 listpack 大集合 hashtable；ZSet 小集合 listpack 大集合 skiplist + dict**。

## 标准回答

### 五种类型与底层编码对照表（Redis 7.0+）

| 类型 | 小对象编码 | 大对象编码 | 编码转换阈值 |
|------|------------|------------|--------------|
| String | int / embstr | raw | int 整数；embstr <= 44 字节；raw > 44 字节 |
| Hash | listpack | hashtable | 元素数 < 128 且单值 < 64 字节 |
| List | listpack（7.2+） | quicklist | 元素少且短用 listpack，否则 quicklist |
| Set | intset / listpack | hashtable | intset 全整数且 < 512；listpack 混合类型且少；超阈值 hashtable |
| ZSet | listpack | skiplist + dict | 元素数 < 128 且单 member < 64 字节 |

> Redis 版本差异：6.x 之前 Hash/ZSet 小对象用 ziplist；7.0 起 ziplist 被 listpack 替代。7.2 起 List 小对象直接用 listpack，Set 引入 listpack 编码。

面试一句话：**Redis 类型背后不是固定结构，而是"小数据紧凑编码 + 大数据高效结构"的自动切换**。

## 实现原理

### 1. String：SDS + 三种编码

底层结构是 SDS（Simple Dynamic String），RedisObject 包装成三种编码：

| 编码 | 触发条件 | 内存布局 |
|------|----------|----------|
| int | value 可解析为 long 整数 | RedisObject.ptr 直接存指针位 |
| embstr | value <= 44 字节 | RedisObject + SDS 连续分配（一次 malloc，64 字节桶） |
| raw | value > 44 字节 | RedisObject 和 SDS 分两次 malloc |

为什么 44 字节是阈值？RedisObject 16 字节 + SDS header（sdshdr8）3 字节 + 内容 + `\0`，恰好是 jemalloc 的 64 字节桶。

```bash
SET k1 100             # int
SET k2 hello           # embstr
SET k3 $(printf 'a%.0s' {1..50})  # raw
OBJECT ENCODING k1     # "int"
OBJECT ENCODING k2     # "embstr"
OBJECT ENCODING k3     # "raw"
```

int 编码还共享 0-9999 整数对象（`OBJ_SHARED_INTEGERS = 10000`），省内存分配。

### 2. Hash：listpack / hashtable

- **listpack**：field-value 紧凑存储在连续内存，无指针开销，cache 友好
- **hashtable**：dict 实现，O(1) 单字段操作，但 dictEntry 有指针开销

转换条件：

- 元素数 >= `hash-max-listpack-entries`（默认 128）→ 转 hashtable
- 单 value >= `hash-max-listpack-value`（默认 64 字节）→ 转 hashtable

转换**不可逆**。

```bash
HSET user:1 name alice age 20
OBJECT ENCODING user:1   # "listpack"

# 加 200 字段后转 hashtable
for i in $(seq 1 200); do redis-cli HSET user:big f$i v$i; done
OBJECT ENCODING user:big  # "hashtable"
```

### 3. List：quicklist（小 List 直接 listpack）

Redis 3.2 起 List 统一用 quicklist（链表 + listpack 节点）；Redis 7.2+ 小 List 直接用 listpack，元素多时转 quicklist。

| 版本 | List 编码 |
|------|-----------|
| < 3.2 | ziplist 或 linkedlist |
| 3.2 ~ 7.0 | quicklist + ziplist 节点 |
| 7.0 ~ 7.2 | quicklist + listpack 节点 |
| 7.2+ | listpack（小）或 quicklist + listpack 节点 |

配置：

- `list-max-listpack-size`：单节点最大容量（默认 -2 = 8KB）
- `list-compress-depth`：中间节点 LZF 压缩深度（默认 0）

```bash
RPUSH mylist a b c
OBJECT ENCODING mylist     # "listpack"（7.2+ 小 List）

for i in $(seq 1 200); do redis-cli RPUSH mylist $i; done
OBJECT ENCODING mylist     # "quicklist"
```

### 4. Set：intset / listpack / hashtable

Redis 7.2+ Set 有三种编码：

| 编码 | 触发条件 |
|------|----------|
| intset | 元素全为整数且数量 <= `set-max-intset-entries`（默认 512） |
| listpack | 元素少且混合类型 |
| hashtable | 大集合或非整数元素 |

```bash
SADD s1 1 2 3            # intset
SADD s2 a b c            # listpack（7.2+）
for i in $(seq 1 600); do redis-cli SADD s3 $i; done   # hashtable

OBJECT ENCODING s1       # "intset"
OBJECT ENCODING s2       # "listpack"
OBJECT ENCODING s3       # "hashtable"
```

### 5. ZSet：listpack / skiplist + dict

| 编码 | 触发条件 |
|------|----------|
| listpack | 元素数 < `zset-max-listpack-entries`（默认 128）且单 member < `zset-max-listpack-value`（默认 64 字节） |
| skiplist + dict | 超阈值 |

skiplist + dict 协同：

- **dict**：member → score，`ZSCORE key member` O(1)
- **skiplist**：按 score 有序的多层链表，`ZRANGE`/`ZRANGEBYSCORE`/`ZRANK` O(logN + M)

为什么需要两个结构？skiplist 按 score 范围查询高效，但按 member 查 score 慢；dict 反之。两份数据共享同一份 member（sds）。

跳表关键常量：

```c
#define ZSKIPLIST_MAXLEVEL 32
#define ZSKIPLIST_P 0.25
```

```bash
ZADD rank 100 user:1 90 user:2
OBJECT ENCODING rank      # "listpack"

for i in $(seq 1 200); do redis-cli ZADD rank $((RANDOM%1000)) "u$i"; done
OBJECT ENCODING rank      # "skiplist"
```

### 6. 编码转换的特性

- **自动触发**：写入超阈值数据时即时转换
- **不可逆**：转换后即使删元素变少也不会转回
- **配置可控**：可通过 `CONFIG SET` 调整阈值，影响后续写入
- **类型不变**：转换只改 encoding 字段，对外 API 不变

### 7. 转换的开销

- listpack → hashtable/skiplist：重建数据结构，O(N) CPU 开销
- 大批写入触发大量转换可能造成延迟抖动
- 监控 `INFO stats` 的 `expired_keys`、`evicted_keys`，以及慢查询日志

### 8. 完整对照表（含版本演进）

| 类型 | Redis 6.x | Redis 7.0+ | Redis 7.2+ |
|------|-----------|------------|------------|
| String | int / embstr / raw | 不变 | 不变 |
| Hash | ziplist / hashtable | listpack / hashtable | 不变 |
| List | quicklist + ziplist 节点 | quicklist + listpack 节点 | listpack / quicklist + listpack 节点 |
| Set | intset / hashtable | 不变 | intset / listpack / hashtable |
| ZSet | ziplist / skiplist + dict | listpack / skiplist + dict | 不变 |

### 9. 关键源码常量汇总

```c
// src/object.c
#define OBJ_SHARED_INTEGERS 10000          // 共享整数 0-9999
#define OBJ_ENCODING_EMBSTR_SIZE_LIMIT 44  // embstr 阈值

// src/server.h
#define ZSKIPLIST_MAXLEVEL 32              // 跳表最大层数
#define ZSKIPLIST_P 0.25                    // 跳表晋升概率

// src/dict.h
#define DICT_HT_INITIAL_SIZE 4             // dict 初始桶数
#define DICT_FORCE_RESIZE_RATIO 5          // 有 BGSAVE 时 rehash 阈值

// 配置默认值
// hash-max-listpack-entries 128
// hash-max-listpack-value 64
// zset-max-listpack-entries 128
// zset-max-listpack-value 64
// set-max-intset-entries 512
// set-max-listpack-entries 128 (7.2+)
// set-max-listpack-value 64 (7.2+)
// list-max-listpack-size -2 (8KB)
// list-compress-depth 0
```

## 实战建议

- 对大集合使用 `SCAN`、`HSCAN`、`SSCAN`、`ZSCAN` 分批遍历
- 删除大 key 优先用 `UNLINK`，避免 `DEL` 阻塞主线程
- 监控 `bigkeys`、`hotkeys`、慢查询
- 控制 Hash 字段数、List 长度、Set/ZSet 元素数量
- 排行榜、时间线等场景要限制 TopN 范围，不要无限增长
- `OBJECT ENCODING key` 排查编码异常
- `MEMORY USAGE key` 分析内存占用

## 代码示例

```bash
# 验证各类型编码
SET k_int 100
SET k_str_short "hello"
SET k_str_long $(printf 'a%.0s' {1..50})
HSET k_hash f1 v1
RPUSH k_list a b c
SADD k_set 1 2 3
ZADD k_zset 100 m1

OBJECT ENCODING k_int       # "int"
OBJECT ENCODING k_str_short # "embstr"
OBJECT ENCODING k_str_long  # "raw"
OBJECT ENCODING k_hash      # "listpack"
OBJECT ENCODING k_list      # "listpack"
OBJECT ENCODING k_set       # "intset"
OBJECT ENCODING k_zset      # "listpack"

# 触发编码转换
for i in $(seq 1 200); do redis-cli HSET k_hash f$i v$i; done
for i in $(seq 1 200); do redis-cli RPUSH k_list $i; done
for i in $(seq 1 600); do redis-cli SADD k_set $i; done
for i in $(seq 1 200); do redis-cli ZADD k_zset $((RANDOM%1000)) "m$i"; done

OBJECT ENCODING k_hash      # "hashtable"
OBJECT ENCODING k_list      # "quicklist"
OBJECT ENCODING k_set       # "hashtable"
OBJECT ENCODING k_zset      # "skiplist"
```

## 深挖追问

### 为什么小对象不用 hashtable？

hashtable 查询快，但每个 dictEntry 至少 32 字节（key 指针 + value 指针 + next 指针 + jemalloc 元数据），小对象下指针开销远超数据本身。listpack 连续内存无指针，cache 友好，小数据下 O(N) 查询可接受。

### 编码转换会带来什么影响？

元素数或大小超阈值时 Redis 把紧凑编码转成通用结构。转换是 O(N) CPU 操作，大批写入触发大量转换可能造成延迟抖动。生产中应预估数据规模，避免临界值频繁转换。

### 底层结构和大 key 有什么关系？

大 key 的问题不只在内存大，还会导致命令执行时间长、网络传输大、删除阻塞、迁移慢。理解底层结构有助于判断哪些命令可能阻塞主线程：listpack/hashtable/skiplist 在 N 大时复杂度差异明显。

### ZSet 为什么同时需要 skiplist 和 dict？

skiplist 按 score 排序支持 `ZRANGE`/`ZRANGEBYSCORE` 范围查询和 `ZRANK` 排名，O(logN + M)；dict 按 member 索引支持 `ZSCORE` O(1)。两个结构互补，两份 score 共享 member（sds）。

### Redis 7.0 的 listpack 替代 ziplist 影响了什么？

ziplist 的 prevlen 字段导致连锁更新最坏 O(N^2)。listpack 改用 backlen 自记录长度消除连锁更新。Hash/ZSet/List 的小对象编码、quicklist 节点内部、Stream 消费组 PEL 都受影响。配置项从 `*-max-ziplist-*` 改为 `*-max-listpack-*`（旧名兼容）。

### listpack 阈值为什么是 128？intset 阈值为什么是 512？

128 是 Hash/ZSet listpack 阈值，经验值：太小不省内存，太大 listpack 内 O(N) 查询慢。intset 阈值 512：intset 是有序数组二分查找 O(logN)，比 listpack 顺序遍历快，所以阈值可以更大。

### 编码转换触发后内存怎么变化？

listpack 连续内存，无指针开销，小对象省内存。转 hashtable 后每元素一个 dictEntry（32+ 字节），内存可能翻几倍。监控 `INFO memory` 的 `used_memory` 在大批写入后的变化。

## 易错点

- 不要把"数据类型"和"底层编码"混淆。类型是 API，编码是内部实现。
- 不要在 Redis 6.x 上回答"小 Hash 用 listpack"，那时还是 ziplist。
- 不要假设编码转换可逆。一旦转 hashtable/skiplist 就不会转回 listpack。
- 不要忽略版本差异。Redis 7.0+ listpack 替代 ziplist；7.2+ List 小对象直接 listpack；7.2+ Set 引入 listpack 编码。
- 不要把 int/embstr/raw 当作 String 的"三种类型"。它们是同一种类型的不同编码。
- 不要把 Set 的 intset 阈值（512）和 Hash/ZSet 的 listpack 阈值（128）搞混。
- 不要忽略 `embstr` 修改后会转 `raw`（不可逆）。
- 跳表常量 `ZSKIPLIST_MAXLEVEL=32` 和 `ZSKIPLIST_P=0.25` 是 Redis 特有，不是跳表通用值。

## 总结

Redis 五种常见类型的底层实现体现了"小数据紧凑、大数据高效"的工程权衡。String 用 SDS 三种编码（int/embstr/raw）；Hash/List/Set/ZSet 都有"小对象紧凑编码 + 大对象通用结构"的双层设计。Redis 7.0 起 listpack 全面替代 ziplist，消除连锁更新。编码转换不可逆，受阈值配置控制。面试时要点出 String=SDS、List=quicklist/listpack、Hash=listpack/hashtable、Set=intset/listpack/hashtable、ZSet=listpack 或 skiplist+dict，并解释每对编码的取舍。

## 参考资料

- [Redis 源码 object.c](https://github.com/redis/redis/blob/7.0/src/object.c)
- [Redis 数据类型简介](https://redis.io/docs/data-types/)
- [Redis 设计与实现 - 数据类型与底层结构](http://redisbook.com/)
- [Redis 7.0 listpack 替代 ziplist PR](https://github.com/redis/redis/pull/8886)

---
