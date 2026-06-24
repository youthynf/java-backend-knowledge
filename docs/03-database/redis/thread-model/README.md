# thread-model

## 核心概念

- [Redis单线程模型是怎么样的？](/03-database/redis/thread-model/Redis单线程模型是怎么样的？.md)
- [Redis的网络模型是怎么样的？](/03-database/redis/thread-model/Redis的网络模型是怎么样的？.md)
- [Redis如何运用IO多路复用的？](/03-database/redis/thread-model/Redis如何运用IO多路复用的？.md)
- [Redis是单线程吗？](/03-database/redis/thread-model/Redis是单线程吗？.md)
- [Redis为什么单线程还快？](/03-database/redis/thread-model/Redis为什么单线程还快？.md)

## 面试官想考什么

- Redis 单线程主要指命令执行主线程，不是所有模块都单线程。
- IO 多路复用、事件循环、内存操作为什么快。
- 慢命令、大 Key、阻塞操作如何影响整体延迟。

## 标准回答

Redis 快主要来自内存操作、高效数据结构、单线程命令执行避免锁竞争，以及基于 IO 多路复用的事件循环。新版本可用多线程处理部分网络 IO，但慢命令、大 Key、阻塞操作仍会拖慢主线程。

## 深挖追问

1. 单线程为什么还快？内存操作、IO 多路复用、少锁竞争。
2. 什么会阻塞 Redis？慢命令、大 Key、持久化压力、Lua 死循环。
3. 多线程后还要注意什么？命令执行主路径仍怕阻塞。

## 实战场景 / SQL 示例

```text
SLOWLOG GET 10
LATENCY DOCTOR
-- 找出慢命令、大 Key 和延迟尖刺。
```

## 易错点 / 总结

- 不要把“单线程”理解为 Redis 没有后台线程。
- 避免 KEYS、全量 LRANGE/SMEMBERS 等阻塞命令。
- 慢日志和延迟监控要常态化。
