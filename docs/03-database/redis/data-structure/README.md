# Redis 数据结构

本目录覆盖 Redis 底层数据结构、五种基本类型与扩展类型，是 Redis 面试的核心战场。内容按"底层数据结构 → 数据类型 → 整体实现"三层组织，每一篇都包含版本演进、编码转换阈值、内存布局示意。

## 底层数据结构（8 篇）

- [Redis 的 SDS 是什么](Redis的SDS是什么？.md) — 简单动态字符串，String 类型和所有 key 的底层，5 个子类型按长度省内存
- [Redis 压缩列表 ziplist 是什么](Redis压缩列表ziplist是什么？.md) — 早期紧凑编码，prevlen 字段导致连锁更新，7.0 起 listpack 替代
- [Redis 的 listpack 是什么](Redis的listpack是什么？.md) — ziplist 安全升级版，backlen 自记录长度消除连锁更新，7.0 起全面替代 ziplist
- [Redis 的 quicklist 是什么](Redis的quicklist是什么？.md) — 双向链表 + listpack 节点，Redis 3.2+ List 统一底层，7.2+ 小 List 直接 listpack
- [Redis 双向链表 adlist 是什么](Redis双向链表adlist是什么？.md) — Redis 内部通用双向链表，3.2 后 List 已改用 quicklist，adlist 仅内部使用
- [Redis 哈希表 dict 是什么](Redis哈希表dict是什么？.md) — 链地址法 + SipHash + 渐进式 rehash，支撑 redisDb 主 key 空间和 Hash/Set 大对象
- [Redis 整数集合 intset 是什么](Redis整数集合intset是什么？.md) — 有序整数数组 + 自适应编码（int16/32/64），Set 全整数小集合的省内存编码
- [Redis 跳表 skiplist 是什么](Redis跳表skiplist是什么？.md) — 多层有序链表 + 概率晋升，ZSet 大对象按 score 排序的底层（MAXLEVEL=32, P=0.25）

## 数据类型（9 篇）

- [Redis 的 String 类型是什么](Redis的String类型是什么？.md) — 通用 KV，三种编码 int/embstr/raw，44 字节阈值，512MB 上限
- [Redis 的 List 类型是什么](Redis的List类型是什么？.md) — 有序可重复，两端 O(1)，quicklist + listpack 节点，适合队列/栈/时间线
- [Redis 的 Hash 类型是什么](Redis的Hash类型是什么？.md) — field-value 映射，listpack/hashtable 按 128/64 阈值切换，适合对象局部更新
- [Redis 的 Set 类型是什么](Redis的Set类型是什么？.md) — 无序去重，intset/listpack/hashtable 三种编码，支持集合运算
- [Redis 的 Zset 类型是什么](Redis的Zset类型是什么？.md) — 有序去重 + score，小对象 listpack，大对象 skiplist + dict 协同
- [Redis 的 Bitmap 是什么](Redis的Bitmap是什么？.md) — String 位操作，1 bit 表示布尔状态，1 亿用户约 12MB，offset 稀疏会内存爆炸
- [Redis 的 HyperLogLog 是什么](Redis的HyperLogLog是什么？.md) — 概率型基数估算，12KB 固定内存，0.81% 误差，适合 UV 统计
- [Redis 的 GEO 是什么](Redis的GEO是什么？.md) — ZSet + GeoHash，52 bit 编码经纬度，附近搜索/距离计算
- [Redis 的 Stream 是什么](Redis的Stream是什么？.md) — 5.0 持久化消息流，radix tree + listpack，消费组/ACK/PEL，比 List 完整比 Kafka 轻

## 整体实现（3 篇）

- [Redis 五种常见数据类型底层实现是什么](Redis五种常见数据类型底层实现是什么？.md) — 五种类型与底层编码对照表，版本演进、转换阈值、源码常量汇总
- [Redis 数据类型以及使用场景是什么](Redis数据类型以及使用场景是什么？.md) — 按访问模式选型，9 种类型核心能力、典型场景、对比取舍
- [Redis 键值对数据是如何实现的](Redis键值对数据是如何实现的？.md) — redisDb + dict + expires + dictEntry + redisObject 四层架构，渐进式 rehash 与惰性+定期删除

---
