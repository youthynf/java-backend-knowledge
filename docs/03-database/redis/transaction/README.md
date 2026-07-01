# Redis 事务

本目录覆盖 Redis 事务机制：MULTI/EXEC/DISCARD/WATCH 命令的使用、事务特性与限制、WATCH 乐观锁、Lua 脚本的原子性保证。

## 目录

- [Redis 支持事务回滚吗](Redis支持事务回滚吗？.md) — MULTI/EXEC 流程，两类错误处理，为什么不支持回滚，Lua 替代方案
- [Redis 事务的特性和限制是什么](Redis事务的特性和限制是什么？.md) — ACID 分析、隔离性、Cluster 跨槽限制、与 MySQL 事务对比
- [Redis 的 WATCH 如何实现乐观锁](Redis的WATCH如何实现乐观锁？.md) — CAS 机制、dirty flag 原理、重试逻辑、与悲观锁对比
- [Lua 脚本如何保证 Redis 操作的原子性](Lua脚本如何保证Redis操作的原子性？.md) — EVAL/EVALSHA、Cluster 同槽限制、Redisson 用法、Redis 7.0 Functions

## 阅读建议

1. 先读"支持事务回滚吗"建立基本认知，理解 Redis 事务 ≠ ACID 事务；
2. 再读"特性和限制"系统了解事务能力边界；
3. WATCH 乐观锁是面试常考点，理解 CAS 重试逻辑；
4. Lua 脚本是生产实践的首选方案，掌握 EVAL/EVALSHA 用法。

## 核心结论

Redis 事务是"命令打包顺序执行"的轻量级机制，**不支持回滚**是核心限制。需要真正原子性时优先用 **Lua 脚本**。事务主要适用于"减少 RTT"和"配合 WATCH 实现乐观锁"。
