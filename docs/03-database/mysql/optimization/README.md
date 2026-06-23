# optimization

## 核心概念

- [如何排查和优化慢查询？](03-database/mysql/optimization/如何排查和优化慢查询？.md)
- [如何优化深度分页问题？](03-database/mysql/optimization/如何优化深度分页问题？.md)
- [count(-)与count(1)有什么区别？](03-database/mysql/optimization/count(-)与count(1)有什么区别？.md)
- [explain执行计划如何使用？](03-database/mysql/optimization/explain执行计划如何使用？.md)

## 面试官想考什么

- 能否按慢 SQL、执行计划、索引、数据量、系统资源定位。
- 是否会用 EXPLAIN、慢日志、监控指标闭环验证。
- 是否避免盲目加索引、改参数或缓存一切。

## 标准回答

MySQL 优化建议按“发现慢 SQL → EXPLAIN 分析 → 判断扫描行数/回表/排序/临时表 → 调整 SQL 或索引 → 压测验证”闭环。优化前要确认瓶颈是 CPU、IO、锁等待、网络、连接数还是数据模型。

## 深挖追问

1. EXPLAIN 重点看什么？type、key、rows、filtered、Extra。
2. 慢查询只靠加索引吗？还要看 SQL、数据模型、锁、IO 和缓存。
3. 深分页为什么慢？OFFSET 会扫描并丢弃大量前置行。

## 实战场景 / SQL 示例

```sql
EXPLAIN SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20;
-- 结合 rows、key、Extra 判断是否需要 (user_id, created_at) 索引。
```

## 易错点 / 总结

- 不要只凭经验优化，要用执行计划和监控验证。
- 加索引会影响写入，需评估整体收益。
- 分页、排序、分组和回表是高频瓶颈。
