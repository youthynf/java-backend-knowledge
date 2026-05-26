# Distinct与Group By性能比较？

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
