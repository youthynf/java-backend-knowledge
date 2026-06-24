# 数据类型-Hash

## 核心概念

Hash 是 Redis 中的 field-value 映射结构，适合保存对象的多个字段，例如用户资料、商品库存、配置项。原有要点：Hash 底层在旧版本中由压缩列表 ziplist 或哈希表 hashtable 实现；当元素个数小于 `hash-max-ziplist-entries`（默认 512）且每个值小于 `hash-max-ziplist-value`（默认 64 字节）时使用 ziplist，否则使用 hashtable；Redis 7.0 中 ziplist 已废弃，由 listpack 替代。

常用命令包括 `HSET`、`HGET`、`HMGET`、`HDEL`、`HEXISTS`、`HINCRBY`、`HGETALL`、`HSCAN`。单字段读写平均 O(1)，但 `HGETALL` 对大 Hash 是 O(N)，线上要慎用。

## 面试官想考什么

- 是否能区分 Hash 与 String JSON 存对象的优缺点。
- 是否知道 listpack/hashtable 编码和转换条件。
- 是否理解大 Hash、热 field、`HGETALL` 的风险。
- 是否能结合对象更新频率、字段数量、TTL 粒度设计 key。

## 标准回答

Hash 适合对象字段相对稳定、经常局部读写的场景。例如用户昵称、头像、等级可以放在 `user:1` 这个 Hash 中，更新等级时只改一个 field，不需要反序列化整个 JSON。小 Hash 用 listpack 节省内存，字段变多或值变大后转为 hashtable，提高随机访问效率。

与 String 存 JSON 对比：String JSON 适合整体读写、结构复杂、需要整体缓存的对象；Hash 适合局部字段更新和单字段读取。但 Hash 不能给单个 field 单独设置 TTL，TTL 只能设置在 key 上。

## 深挖追问

1. **Hash 一定比 String 省内存吗？** 不一定。小对象可能更省，但 field 很多、value 很大或 key 设计不合理时也会形成大 Key。
2. **为什么不建议大 Hash？** `HGETALL`、迁移、删除、rehash 都可能带来延迟尖刺。
3. **field 能单独过期吗？** Redis 原生命令按 key 过期，不按 field 过期；需要拆 key 或业务记录过期时间。
4. **购物车适合 Hash 吗？** 适合，field 为 skuId，value 为数量；但要控制单用户购物车大小。

## 实战场景 / 代码示例

```bash
# 用户资料局部更新
HSET user:1001 name alice level 5 city shanghai
HGET user:1001 name
HINCRBY user:1001 level 1
EXPIRE user:1001 3600

# 购物车
HSET cart:1001 sku:10 2 sku:18 1
HINCRBY cart:1001 sku:10 1
HDEL cart:1001 sku:18
```

Java 示例：

```java
redisTemplate.opsForHash().put("cart:1001", "sku:10", "2");
Object count = redisTemplate.opsForHash().get("cart:1001", "sku:10");
```

## 易错点 / 总结

- 不要无脑 `HGETALL` 大对象，优先 `HMGET` 或 `HSCAN`。
- Hash 的 TTL 是 key 级别，不是 field 级别。
- 对象字段频繁整体读取时，String JSON 可能更简单。
- 大 Hash 拆分可以按业务维度或 field hash 分桶。
- 总结：Hash 的关键词是**对象字段、局部更新、小对象内存优化**；面试要答出编码转换、与 String 的取舍和大 Key 风险。

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

