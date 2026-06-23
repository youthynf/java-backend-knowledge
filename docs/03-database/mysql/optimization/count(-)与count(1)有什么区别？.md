# count(*)与count(1)有什么区别？

## 核心概念

count(*)与count(1)有什么区别？
一、结论：

count(*) = count(1) > count(主键字段) > count(字段)

二、count()作用
count()是一个聚合函数，函数的参数不仅可以是字段，也可以是任意表达式，该函数的作用是统计符合查询条件的记录中，函数指定的参数不为NULL的记录有多少个。

三、count函数的执行过程
count(主键字段)的执行过程
通过count函数统计有多少个记录时，MySQL的server层会维护一个名为count的变量。server层会循环向InnoDB读取一条记录，如果count函数指定的参数不为NULL，那么就会将变量count加1，直到符合查询条件的所有记录被读完，就推出循环，最后将count发送给客户端。由于二级索引相对聚簇索引占用内存更小，而且其叶子节点存放的是主键值，因此，count(主键)并存在二级索引时，查询优化器会优先选择二级索引，否则遍历聚集索引。

count(1)的执行过程
如果表中存在二级索引，InnoDB优先循环遍历的是二级索引，否则遍历聚簇索引。InnoDB循环遍历索引，将取到的记录返回给server层，但是不会读取记录中的任何字段，因为count函数的参数是1，不是字段，所以无需读取。参数1明显并不是NULL，因此server层每次读取到一条记录，就将count变量加1。因此count(1)相对count(主键)少了读取记录中字段的步骤，所以执行效率相比高一点。

count(*)的执行过程
count(*)并不类似select读取所有字段，其实count(*)其实等于count(0)，也就是说count(*)时，MySQL会将*参数转化为0参数来处理。所以count(*)执行过程跟count(1)执行过程基本一样的，性能没有什么差异。

count(字段)的执行过程
count(字段)的执行效率相比count(1)、count(*)、count(主键字段)执行效率是最差的。对于这个查询来说，会采用扫描全表的方式（explain分析type=ALL）来计数，同时需要对字段进行判空处理。

四、需要通过循环遍历方式计数的原因
MyISAM存储引擎里，执行count函数只需要O(1)时间复杂度，这是因为每张MyISAM的数据表都有一个meta信息存储了row_count值，由表级锁保证一致性，直接读取就是count函数的结果。而InnoDB存储引擎是支持事务的，同一时刻的多个查询，由于多版本并发控制(MVCC)的原因，InnoDB表应该返回多少行也是不确定的，所以无法像MyISAM一样，只维护一个row_count变量。

五、如何优化count(*)
count(*)虽然能通过二级索引遍历的方式进行计数，但是当数据表很大时，查询的耗时也是比较高的。
优化方式：
近似值
如果业务对于统计个数不需要很精确时，可以通过 show table status 或 explain 命令来进对表进行估算。
explain 估算值计算依赖数据表的统计信息：
索引基数（Index Cardingality）：通过 show index from table_name 显示的 Cardinality 值，表示索引中不重复值的数量（非精确值）；
总行数（TABLE ROWS）：通过 show table status 或 information_schema.TABLES 获取，InnoDB中这个是估算值；
数据分布直方图（Histograms，MySQL8.0+）：通过 ANALYZE TABLE … UPDATE HISTOGRAM生成，记录列值的分布情况，解决数据倾斜问题。
统计信息生成：
持久化统计信息：数据存储在 mysql.innodb_table_states 和 mysql.innodb_index_status上，通过采样算法获得，随机选取索引的N个数据页（默认20页），计算这些页上的不同值数量，推算全局基数。采样触发时机，执行 ANALYZE TABLE table_name 、表数据变化超过10%、重启后首次访问表；
直方图：存储桶记录不同值出现的频率，解决数据倾斜。

额外表保存计数值
如果是想精确的获取表的记录总数，我们可以将这个计数保存到单独的一张计数表中。当我们在数据表插入一条记录的同时，将计数表中的计数字段+1。也就是在新增和删除操作时，额外维护这个计数表。

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
