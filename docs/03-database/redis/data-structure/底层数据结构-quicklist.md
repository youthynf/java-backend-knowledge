# 底层数据结构-quicklist

## 核心概念

quicklist 是 Redis List 的底层实现，从 Redis 3.2 开始替代了早期的 ziplist/linkedlist 组合。它可以理解为“链表 + 紧凑列表”：外层是双向链表，链表每个节点内部保存一个 listpack（旧版本为 ziplist）。这样既支持两端快速 push/pop，又能减少纯链表每个元素一个节点的指针开销。

quicklist 通过配置控制每个节点大小和压缩深度，在性能与内存之间折中。List 命令如 `LPUSH`、`RPUSH`、`LPOP`、`RPOP` 都依赖 quicklist 提供高效两端操作。

## 面试官想考什么

- 是否知道 Redis List 现代底层是 quicklist。
- 是否能解释 quicklist 为什么是链表与 listpack 的折中。
- 是否理解两端操作 O(1)、中间访问 O(N)。
- 是否能联系 List 用作队列、时间线时的大 Key 风险。

## 标准回答

quicklist 解决的是 ziplist 和 linkedlist 各自的缺点：ziplist 内存紧凑但连续内存太大时插入删除成本高，linkedlist 两端操作快但每个元素都有前后指针，内存浪费严重。quicklist 把多个元素打包进一个 listpack 节点，再用双向链表串起来，既减少指针数量，又避免单块连续内存过大。

面试中可以把它和 List 场景结合：Redis List 适合队列、栈、最新 N 条数据，但不适合深分页和中间频繁操作。

## 深挖追问

1. **quicklist 为什么不是单个 listpack？** 单个连续内存太大时扩容、插入、删除成本高。
2. **为什么不是纯 linkedlist？** 纯链表每个元素都有指针，内存开销大且缓存局部性差。
3. **quicklist 节点能压缩吗？** Redis 支持配置压缩深度，中间节点可压缩以节省内存，两端保留未压缩保证操作效率。
4. **List 删除大 key 有风险吗？** 有，大量节点释放可能造成延迟，生产要避免无限增长。

## 实战场景 / 代码示例

```bash
RPUSH queue:task t1 t2 t3
LPOP queue:task
LPUSH feed:1001 post:9
LTRIM feed:1001 0 99
OBJECT ENCODING queue:task
```

使用 List 做最新动态时，应通过 `LTRIM` 控制长度，避免 quicklist 节点持续增长形成大 Key。

## 易错点 / 总结

- 不要再简单回答 List 底层是双向链表；Redis 3.2 后应答 quicklist。
- quicklist 优化两端操作，不优化任意位置随机访问。
- 配置节点大小过大或过小都会影响性能/内存平衡。
- List 做队列缺少完整 ACK 机制，可靠消息更适合 Stream。
- 总结：quicklist 的关键词是**链表 + listpack、两端高效、内存折中、List 底层**。
