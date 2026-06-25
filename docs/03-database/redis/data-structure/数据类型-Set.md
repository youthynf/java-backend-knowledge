# 数据类型-Set

## 核心概念

Set 是 Redis 的无序去重集合，元素不能重复，适合表达“是否存在”“共同关系”“随机抽样”这类需求。原有要点：Set 类型底层由**整数集合 intset**或**哈希表 hashtable**实现；当集合元素都是整数且元素个数小于 `set-maxintset-entries`（默认 512）时，Redis 使用 intset；否则转为 hashtable。

常用命令包括 `SADD`、`SREM`、`SISMEMBER`、`SCARD`、`SMEMBERS`、`SINTER`、`SUNION`、`SDIFF`、`SRANDMEMBER`。单元素增删查平均 O(1)，集合交并差复杂度与参与集合大小相关，线上要特别注意大集合计算阻塞主线程。

## 面试官想考什么

- 是否知道 Set 的去重语义和典型场景：标签、关注关系、抽奖、黑名单、共同好友。
- 是否能说清底层编码 intset/hashtable 的转换条件。
- 是否理解 `SMEMBERS`、`SINTER` 对大 Key 的风险。
- 是否能结合业务设计 key、TTL、分片和离线计算策略。

## 标准回答

Set 是 Redis 用来保存不重复元素的集合结构。它没有顺序，但支持快速判断成员是否存在，也支持交集、并集、差集运算。小整数集合会用 intset 节省内存；只要出现非整数元素或元素数量超过阈值，就会升级为 hashtable。

面试回答时可以这样组织：如果业务只关心“某个用户是否在集合里”，用 `SISMEMBER` 很合适；如果要做共同好友、共同标签，可以用 `SINTER`；如果集合非常大，不建议在线直接 `SMEMBERS` 或多集合交集，而应做分页扫描、异步计算或按业务维度拆 key。

## 深挖追问

1. **Set 为什么无序？** 因为 hashtable 关注成员存在性，不维护插入顺序；需要排序应考虑 ZSet。
2. **intset 什么时候转 hashtable？** 元素不全是整数，或数量超过配置阈值时转换；转换不可逆。
3. **共同好友怎么做？** 小规模可 `SINTER follow:a follow:b`；大规模应先用 `SCARD` 选小集合、分片或离线预计算。
4. **Set 和 Bitmap 的区别？** Set 适合稀疏且成员不是连续数字的集合；Bitmap 适合用户 ID 连续、状态布尔、需要极致省内存的场景。

## 实战场景 / 代码示例

```bash
# 用户点赞去重
SADD post:1001:liked-users user:1
SISMEMBER post:1001:liked-users user:1
SCARD post:1001:liked-users

# 共同关注
SINTER user:1:follows user:2:follows

# 抽奖：随机取 3 个不删除
SRANDMEMBER campaign:2026:users 3
```

Java 中要避免一次拉全量：

```java
// Spring Data Redis 示例：判断是否点赞
Boolean liked = redisTemplate.opsForSet()
        .isMember("post:1001:liked-users", "user:1");
```

## 易错点 / 总结

- 不要对超大 Set 使用 `SMEMBERS`，会造成网络大包和 Redis 主线程阻塞。
- `SINTER` 不是免费操作，集合越大越危险；交集可以先从小集合开始或异步化。
- Set 不保证顺序，需要排行榜、TopN、按时间排序时用 ZSet。
- 大 Key 要考虑拆分，例如按日期、业务分片或用户 hash 分桶。
- 总结：Set 的关键词是**去重、存在性判断、集合运算**；面试要答出底层编码、复杂度、场景和大集合风险。
