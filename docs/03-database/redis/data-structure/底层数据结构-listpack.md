# 底层数据结构-listpack

## 核心概念

listpack 是 Redis 用来替代 ziplist 的紧凑列表结构，Redis 7.0 后 ziplist 被废弃，Hash、ZSet 等小对象紧凑编码逐步使用 listpack。它把多个元素连续存放在一块内存中，相比链表节省指针开销，适合元素数量少、单个元素小的场景。

listpack 的设计目标是解决 ziplist 的连锁更新问题。ziplist 中每个节点保存前一个节点长度，当前一个节点长度变化跨过编码边界时，后续节点可能级联更新；listpack 改变节点布局，降低这种级联更新风险。

## 面试官想考什么

- 是否知道 listpack 是 ziplist 的替代品。
- 是否理解连续内存节省空间但中间操作成本较高。
- 是否能解释 ziplist 连锁更新问题和 listpack 的改进。
- 是否知道它常用于小 Hash、小 ZSet 等紧凑编码。

## 标准回答

listpack 是一种紧凑的连续内存结构，用于保存少量小元素。相比 hashtable、skiplist、linkedlist，它没有大量指针，内存利用率高，CPU 缓存友好；但因为是连续内存，插入、删除可能涉及内存移动，所以只适合小规模数据。Redis 用阈值控制对象何时从 listpack 转为更适合大数据的结构。

面试回答时可强调：Redis 的很多类型都有“小对象紧凑编码 + 大对象高效结构”的策略，listpack 就是紧凑编码的重要代表。

## 深挖追问

1. **listpack 为什么替代 ziplist？** 主要为了减少 ziplist 的连锁更新风险，并让编码更简洁安全。
2. **listpack 适合大列表吗？** 不适合，连续内存移动和扩容成本高，大结构会转为其他编码。
3. **listpack 和 quicklist 的关系？** quicklist 是多个 listpack 节点组成的链表，用于 List 的底层实现。
4. **为什么小对象不用 hashtable？** hashtable 指针和桶开销较大，小对象用 listpack 更省内存。

## 实战场景 / 代码示例

```bash
HSET profile:1 name alice city shanghai
OBJECT ENCODING profile:1

ZADD rank:small 10 user:1 20 user:2
OBJECT ENCODING rank:small
```

如果字段数或元素长度超过阈值，再查看 `OBJECT ENCODING` 通常会发现编码转为 hashtable 或 skiplist。

## 易错点 / 总结

- listpack 不是 Redis 对外暴露的数据类型，而是内部编码。
- 连续内存结构省空间，但不适合大量随机插入删除。
- ziplist/listpack 的使用与版本强相关，Redis 7 后应优先说 listpack。
- 编码转换通常不可逆，不要指望删小后自动转回。
- 总结：listpack 的关键词是**紧凑编码、连续内存、替代 ziplist、小对象优化**。
