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
