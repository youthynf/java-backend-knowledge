# 数据类型-GEO

## 核心概念

数据类型-GEO
Redis GEO是Redis3.2版本新增的数据类型，主要用于存储地理位置信息，并对存储的信息进行操作。

GEO 本身并没有设计新的底层数据结构，而是直接使用了 Sorted Set 集合类型。GEO 类型使用 GeoHash 编码方式实现了经纬度到 Sorted Set 中元素权重分数的转换，两个关键机制：
对二维地图做区间划分；
对区间进行编码；

一组经纬度落在某个区间后，就用区间的编码值来表示，并把编码值作为Sorted Set元素的权重分数。因此可以把经纬度保存到 Sorted Set 中，利用 Sorted Set 提供的按权重进行有序范围查找的特性，实行 LBS 服务中频繁使用的搜索附近的需求。

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
