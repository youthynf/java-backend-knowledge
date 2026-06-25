# Redis 五种常见数据类型底层实现是什么？

## 核心概念

Redis 的“数据类型”和“底层编码”不是一回事。数据类型是对外暴露的 API，例如 String、Hash、List、Set、ZSet；底层编码是 Redis 为了节省内存和提升性能，在内部选择的具体实现。

一句话回答：**String 底层主要是 SDS；Hash 小对象使用 listpack，大对象使用 hashtable；List 使用 quicklist；Set 小整数集合使用 intset，普通集合使用 hashtable；ZSet 小集合使用 listpack，大集合使用 skiplist + dict。**

> 不同 Redis 版本细节略有差异：旧版本中 ziplist 使用较多，新版本逐步替换为 listpack。

## 面试官想考什么

1. 是否知道 Redis 类型背后不是固定一种结构；
2. 是否理解“小数据用紧凑编码，大数据用通用结构”的优化思路；
3. 是否知道 ZSet 为什么同时需要跳表和字典；
4. 是否知道底层结构和时间复杂度、内存占用的关系。

## 标准回答

### 1. String：SDS

Redis String 使用 SDS（Simple Dynamic String），而不是 C 原生字符串。

SDS 的优势：

- 记录长度，获取长度 O(1)；
- 二进制安全，可以存图片、序列化数据；
- 预分配和惰性释放，减少频繁扩容；
- 避免缓冲区溢出风险。

### 2. Hash：listpack / hashtable

Hash 字段少且字段和值较小时，使用 listpack 紧凑存储，节省内存；字段变多或 value 变大后，会转成 hashtable，提高查询和更新效率。

```text
小 Hash：listpack，内存省，查找 O(N)
大 Hash：hashtable，读写接近 O(1)
```

### 3. List：quicklist

Redis List 使用 quicklist。quicklist 可以理解成“链表 + listpack”的组合：

- 外层是双向链表，便于两端 push/pop；
- 每个节点内部是 listpack，提升内存连续性，减少指针开销。

这样兼顾了链表两端操作快和压缩列表省内存的优点。

### 4. Set：intset / hashtable

Set 如果元素都是整数且数量较少，会使用 intset；否则使用 hashtable。

- intset：整数数组，内存紧凑；
- hashtable：支持任意字符串元素，查询接近 O(1)。

### 5. ZSet：listpack / skiplist + dict

ZSet 小集合使用 listpack，节省内存；元素多或元素较大时，使用 skiplist + dict。

为什么要两个结构？

- dict：根据 member 快速查 score，支持 `ZSCORE`、更新分数；
- skiplist：按 score 有序，支持范围查询和排名。

如果只有 dict，无法高效范围查询；如果只有 skiplist，按 member 查找又不够快。

## 深挖追问

### 为什么小对象不用 hashtable？

hashtable 查询快，但每个 entry 都有额外指针和结构体开销。小对象使用 listpack 可以把数据紧凑存放在连续内存中，更省内存，CPU cache 友好。

### 编码转换会带来什么影响？

当元素数量或元素大小超过阈值时，Redis 会把紧凑编码转换成通用结构。转换会消耗 CPU，如果大批量写入触发大量转换，可能造成延迟抖动。

### 底层结构和大 key 有什么关系？

大 key 的问题不只在内存大，还会导致命令执行时间长、网络传输大、删除阻塞、迁移慢。理解底层结构有助于判断哪些命令可能阻塞主线程。

## 实战建议

- 对大集合使用 `SCAN`、`HSCAN`、`SSCAN`、`ZSCAN` 分批遍历；
- 删除大 key 优先用 `UNLINK`，避免 `DEL` 阻塞；
- 监控 `bigkeys`、`hotkeys`、慢查询；
- 控制 Hash 字段数、List 长度、Set/ZSet 元素数量；
- 排行榜、时间线等场景要限制 TopN 范围，不要无限增长。

## 总结

Redis 的底层实现体现了典型工程权衡：小数据优先节省内存，大数据优先查询效率。面试时不要只说“五种类型”，要能说出 String=SDS、List=quicklist、Hash=listpack/hashtable、Set=intset/hashtable、ZSet=listpack 或 skiplist+dict，并解释为什么这样设计。
