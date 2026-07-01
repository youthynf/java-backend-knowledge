# Redis 高可用与集群

本目录覆盖 Redis 高可用和水平扩展方案：主从复制、哨兵模式、Cluster 集群模式、脑裂防护、容量评估、分库分表。

## 目录

- [Redis 如何实现主从复制](Redis如何实现主从复制？.md) — 全量复制 + 命令传播 + 增量复制
- [Redis 主从集群可以保证数据一致性吗](Redis主从集群可以保证数据一致性吗？.md) — 异步复制、故障切换丢数据、WAIT 与 min-replicas
- [Redis 如何实现哨兵模式](Redis如何实现哨兵模式？.md) — 监控、通知、自动故障转移、配置中心
- [Redis 哨兵机制如何实现选新的主节点](Redis哨兵机制如何实现选新的主节点？.md) — SDOWN/ODOWN/Raft 选举/选主规则
- [Redis 如何实现集群模式](Redis如何实现集群模式？.md) — 16384 槽位、Gossip、MOVED/ASK 重定向
- [Redis 集群模式的优缺点](Redis集群模式的优缺点？.md) — 何时该上 Cluster、跨槽限制
- [Redis 集群脑裂问题如何解决](Redis集群脑裂问题如何解决？.md) — min-replicas-to-write、min-replicas-max-lag
- [Redis 和 MySQL 单节点能扛多并发量](Redis和MySQL单节点能扛多并发量？.md) — 容量评估方法与压测
- [分库分表的区别是什么](分库分表的区别是什么？.md) — 垂直/水平拆分、ShardingSphere

## 阅读建议

1. 先读 [Redis 如何实现主从复制](Redis如何实现主从复制？.md) 理解复制机制
2. 再读 [数据一致性](Redis主从集群可以保证数据一致性吗？.md) 理解异步复制的代价
3. 然后读 [哨兵模式](Redis如何实现哨兵模式？.md) 和 [选新主](Redis哨兵机制如何实现选新的主节点？.md) 理解高可用
4. 接着读 [集群模式](Redis如何实现集群模式？.md) 和 [优缺点](Redis集群模式的优缺点？.md) 理解水平扩展
5. 最后读 [脑裂](Redis集群脑裂问题如何解决？.md)、[容量评估](Redis和MySQL单节点能扛多并发量？.md)、[分库分表](分库分表的区别是什么？.md) 看生产实践
