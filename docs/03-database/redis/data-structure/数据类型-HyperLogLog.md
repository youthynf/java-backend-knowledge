# 数据类型-HyperLogLog

## 核心概念

数据类型-HyperLogLog
Redis HyperLogLog 是Redis 2.8版本新增的数据类型，是一种用于统计一个集合中不重复的元素个数的数据类型。但是，HyperLogLog的统计规则是基于概率完成的，不是非常准确，标准误算率是0.81%；简单来说HyperLogLog提供不精确的去重计数。

HyperLogLog的优点是，在输入元素的数量或者体积非常非常大时，计算基数所需的内存空间总是固定的、并且很小的。在Redis里面，每个HyperLogLog键只需要花费12KB内存，就可以计算接近2的64次方个不同元素的基数。

基础指令：
pfadd key element [element …]：添加指定元素到HyperLogLog中；
pfcount key [key …]：返回给定HyperLogLog的基数估算值；
pfmerge destkey sourcekey [sourcekey …]：将多个HyperLogLog合并。

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
