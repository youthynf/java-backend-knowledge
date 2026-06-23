# 数据类型-Zset

## 核心概念

数据类型-Zset
ZSet 类型的底层数据是有压缩列表或跳表实现的。

如果有序集合的元素个数小于128个，并且每个元素值小于64字节时，Redis会使用压缩列表作为底层数据结构，否则使用跳表作为底层数据结构。

在Redis7.0中，压缩列表数据结构已经废弃了，交由listpack数据结构来实现。

## 面试官想考什么

- Redis 类型的使用场景、底层编码和时间复杂度。
- 不同结构的内存占用、适用边界和反模式。
- key 设计、TTL、容量控制是否合理。

## 标准回答

Redis 数据结构题要同时回答使用场景、底层编码和复杂度。选择 String、Hash、List、Set、ZSet、Bitmap、HyperLogLog、GEO、Stream 等结构时，要考虑访问模式、内存占用、key 规模和命令复杂度。

## 深挖追问

1. 为什么有紧凑编码？节省内存并提升局部性。
2. ZSet 为什么适合排行榜？按 score 排序并支持范围查询。
3. Hash 适合存对象吗？适合小对象字段更新，但大 Hash 也可能成为大 Key。

## 实战场景 / SQL 示例

```text
ZADD rank:game 1001 user:1
ZREVRANGE rank:game 0 9 WITHSCORES
HSET user:1 name alice level 5
```

## 易错点 / 总结

- 不要忽略命令复杂度和集合规模。
- 大 Key、热 Key 往往比平均 QPS 更危险。
- 选择结构前先明确读写模式和过期策略。
