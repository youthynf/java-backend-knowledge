# Distinct与Group By性能比较？

## 核心概念

Distinct与Group By性能比较？
结论：
在语义相同，有索引的情况下：group by和distinct都能使用索引，效率相同。
在语义相同，无索引的情况下：distinct效率高于group by。原因是distinct 和 group by都会进行分组操作，但 group by 在Mysql8.0之前会进行隐式排序，导致触发filesort，sql执行效率低下。。

distinct 处理机制：
如果列具有NULL值，并且对该列使用DISTINCT子句，MySQL将保留一个NULL值，并删除其它的NULL值，因为DISTINCT子句将所有NULL值视为相同的值。
distinct多列的去重，则是根据指定的去重的列信息来进行，即只有所有指定的列信息都相同，才会被认为是重复的信息。

group by 处理机制：
group by可以进行单列去重，group by的原理是先对结果进行分组排序，然后返回每组中的第一条数据。且是根据group by的后接字段进行去重的。

隐式排序：
在Mysql8.0之前,Group by会默认根据作用字段（Group by的后接字段）对结果进行排序。在能利用索引的情况下，Group by不需要额外进行排序操作；但当无法利用索引排序时，Mysql优化器就不得不选择通过使用临时表然后再排序的方式来实现GROUP BY了。且当结果集的大小超出系统设置临时表大小时，Mysql会将临时表数据copy到磁盘上面再进行操作，语句的执行效率会变得极低。这也是Mysql选择将此操作（隐式排序）弃用的原因。

基于上述原因，Mysql在8.0时，对此进行了优化更新：从前（Mysql5.7版本之前），Group by会根据确定的条件进行隐式排序。在mysql 8.0中，已经移除了这个功能，所以不再需要通过添加order by null 来禁止隐式排序了，但是，查询结果可能与以前的 MySQL 版本不同。要生成给定顺序的结果，请按通过ORDER BY指定需要进行排序的字段。

## 面试官想考什么

- 能否先给定义，再讲原理、场景、代价。
- 能否把 SQL 语义、执行流程、数据类型、表设计联系到工程实践。
- 是否能用准确术语回答，而不是只背结论。

## 标准回答

MySQL 基础题要先说定义，再讲原理、应用场景和代价。面试更看重能否把 SQL 语义、执行流程、数据类型选择、范式和反范式设计联系到性能、正确性与可维护性。

## 深挖追问

1. 如何避免回答空泛？定义、原理、场景、代价、例子。
2. SQL 写法影响性能吗？函数、隐式转换、排序分组都会影响。
3. 表设计如何取舍？正确性、效率、扩展性和维护成本。

## 实战场景 / SQL 示例

```sql
CREATE TABLE user_profile (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  nickname VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL);
```

## 易错点 / 总结

- 不要只背概念，要能落到 SQL 和业务场景。
- 不要忽略边界条件、数据规模和并发。
- 不确定版本差异时要说明“取决于版本/配置”。
