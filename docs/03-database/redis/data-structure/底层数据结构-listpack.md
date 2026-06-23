# 底层数据结构-listpack

## 核心概念

底层数据结构-listpack
quicklist虽然通过控制quicklistNode结构的压缩列表大小或者元素个数，来减少连锁更新带来的性能影响，但是并没有完全解决连锁更新的问题。Redis5.0设计了一个新的数据结构叫listpack，目的是替代压缩列表，最大特点是每个节点不再包含前一个节点的长度了。

listpack结构：
listpack总字节数：记录lispack总的字节数大小；
listpack总元素数量：记录listpack中所有元素数量总和；
listpack entry：主要包含三个方面内容，依次是encoding（定义该元素的编码类型，会对不同长度的整数和字符串进行编码）、data（实际存放的数据）、len（encoding+data的总长度）；
listpack结尾标识：lispack最后结尾标识；

listpack 节点没有像压缩列表那样记录前一个节点长度的字段了，listpack 节点只记录当前节点的长度，当我们向 listpack 加入新元素的时候，不会影响其他节点的长度字段的变化，从而避免了压缩链表的连锁更新问题。

如何从后往前遍历：
可以从当前列表项起始位置的指针开始，向左逐个字节解析，得到前一项的 entry-len 值，从而计算出前一项的地址。（所以其实len放在entry末尾是有伏笔的）

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
