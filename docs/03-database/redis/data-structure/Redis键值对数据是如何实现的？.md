# Redis 键值对数据是如何实现的？

## 核心概念

Redis 是内存型 KV 数据库，键值对主要由 `redisDb`、全局字典 dict、`dictEntry`、`redisObject` 以及具体底层编码共同组成。一个 key 会先存入当前数据库的主字典，字典通过哈希表完成 O(1) 平均复杂度的查找；value 不是直接裸数据，而是一个 RedisObject，里面记录类型、编码、LRU/LFU 信息和指向底层数据结构的指针。

典型链路可以理解为：`redisDb.dict` 保存 key 到 value 的映射，key 通常是 SDS，value 是 redisObject；redisObject 根据类型不同，可能指向 SDS、quicklist、dict、skiplist、intset、listpack 等结构。

## 面试官想考什么

- 是否知道 Redis KV 不是简单 HashMap，而是 dict + redisObject + 编码。
- 是否能说出 key/value 查找、过期字典、渐进式 rehash。
- 是否理解同一种逻辑类型会根据数据规模选择不同编码。
- 是否能联系内存占用、过期删除、淘汰策略。

## 标准回答

Redis 每个数据库都有一个字典保存键值对。key 是字符串对象，value 是 RedisObject，RedisObject 中的 type 表示逻辑类型，如 string/list/hash/set/zset；encoding 表示底层实现，如 int、embstr、raw、listpack、hashtable、skiplist 等。这样 Redis 可以在对外提供统一命令的同时，对小对象使用紧凑编码节省内存，对大对象切换到适合随机访问或范围查询的结构。

Redis 还维护 expires 字典记录 key 的过期时间。查 key 时会检查是否过期；同时后台定期删除一部分过期 key。内存不足时，再根据 maxmemory-policy 执行淘汰。

## 深挖追问

1. **为什么 value 要包一层 RedisObject？** 为了统一记录类型、编码、访问信息，支持多种底层结构和淘汰策略。
2. **Redis 字典扩容会阻塞吗？** Redis 使用渐进式 rehash，把迁移分摊到后续命令和定时任务中，避免一次性搬迁全部数据。
3. **过期 key 存在哪里？** 主 dict 保存真实键值，expires dict 保存 key 到过期时间戳的映射。
4. **同样是 Hash，底层一定是 hashtable 吗？** 不一定，小 Hash 可能是 listpack，大到阈值后才转 hashtable。

## 实战场景 / 代码示例

```bash
SET user:1:name alice EX 300
OBJECT ENCODING user:1:name
TTL user:1:name

HSET user:1 name alice age 20
OBJECT ENCODING user:1
```

排查内存时可结合 `MEMORY USAGE key`、`OBJECT ENCODING key`、`SCAN` 抽样，定位大 Key 和不合理编码。

## 易错点 / 总结

- 不要把 Redis 理解成单层 HashMap，value 的 type/encoding 很关键。
- 过期删除不是到点立刻 100% 删除，而是惰性删除 + 定期删除。
- 渐进式 rehash 能降低阻塞，但 rehash 期间字典查询可能需要查两个表。
- 小对象编码阈值与 Redis 版本、配置有关，回答时要说明版本差异。
- 总结：Redis KV 的关键词是**redisDb、dict、dictEntry、redisObject、encoding、expires**。
