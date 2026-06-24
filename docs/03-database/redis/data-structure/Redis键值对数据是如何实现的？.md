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

---

## 面试版详细讲解

### 核心概念

这道题属于 **Redis 数据结构** 的高频考点，核心要抓住：redisObject、dict、SDS、listpack、quicklist、intset、skiplist。Redis 会根据数据规模选择紧凑或高性能编码。回答时按类型语义、底层结构、复杂度、应用场景、风险治理展开。

### 面试官想考什么

面试官通常不是只想听定义，而是想确认你能否说明：类型语义、底层编码、复杂度、场景选择和 big key 风险；还能否把它和真实业务里的性能、可靠性、可维护性联系起来。

### 标准回答

Redis 会根据数据规模选择紧凑或高性能编码。回答时按类型语义、底层结构、复杂度、应用场景、风险治理展开。

答题时建议用“三段式”：

1. 先给结论，明确适用前提；
2. 再解释底层机制或执行过程；
3. 最后补充业务取舍、风险点和排查手段。

### 深挖追问

- 这个结论在高并发或大数据量下是否仍然成立？
- 它依赖哪些版本、配置、索引/编码或业务一致性要求？
- 线上异常时应该看哪些命令、日志、指标或执行计划？

### 示例 / 实战场景

用户资料整体读写用 String，字段更新用 Hash，去重用 Set，排行榜用 Zset，签到用 Bitmap，消息流用 Stream。

```bash
# 先小范围验证命令复杂度和返回量，避免线上直接扫大 key
redis-cli --scan --pattern 'biz:*' | head
redis-cli --bigkeys
```

### 易错点

- 只背概念，不说明适用场景、代价和边界。
- 忽略数据量、并发量、版本差异和线上配置，给出绝对化结论。
- 没有把问题落到可观测手段：执行计划、慢日志、监控指标、客户端超时或错误日志。

### 一句话总结

这类题的面试核心不是“知道名词”，而是能说清 **机制 + 取舍 + 落地排查**。先给稳定结论，再讲底层原因，最后结合业务场景说明如何使用和如何避免坑。

