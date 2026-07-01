# MySQL 基础

本目录覆盖 MySQL 数据类型、表设计、行存储、SQL 执行流程、连表与子查询等基础知识点，是后续索引、事务、优化等专题的预备知识。

## 目录

### 数据建模与类型

- [SQL 和 NoSQL 有什么区别](SQL和NoSQL有什么区别？.md) — 关系型与非关系型的取舍与典型选型
- [MySQL 有哪些常用数据类型](MySQL有哪些常用数据类型？.md) — 数值/字符串/时间/JSON 类型选型与坑
- [CHAR 和 VARCHAR 区别是什么](CHAR和VARCHAR区别是什么？.md) — 定长 vs 变长，N 的字符/字节含义
- [Text 数据类型可以无限大吗](Text数据类型可以无限大吗？.md) — TEXT 四档上限、行溢出与拆表设计
- [MySQL 时间类型如何选择](MySQL时间类型如何选择？.md) — DATETIME vs TIMESTAMP，2038 问题与跨时区
- [数据库三大范式是什么](数据库三大范式是什么？.md) — 1NF/2NF/3NF 与反范式的工程取舍

### 存储与执行

- [MySQL 一行记录如何存储](MySQL一行记录如何存储？.md) — 行格式、隐藏列、行溢出与 VARCHAR 上限
- [一条 SELECT 语句执行期间发生了什么](一条select语句执行期间发生了什么？.md) — 连接器→解析器→优化器→执行器→引擎
- [一条 UPDATE 语句执行期间发生了什么](一条update语句执行期间发生了什么？.md) — undo log/redo log/binlog 与两阶段提交

### 查询语法与性能

- [MySQL 连表查询语法有哪些](MySQL连表查询语法有哪些？.md) — INNER/LEFT/RIGHT/CROSS JOIN 与 ON/WHERE 区别
- [Distinct 和 Group By 性能有什么区别](Distinct和Group-By性能有什么区别？.md) — 5.7 隐式排序与 8.0 移除后的性能对比
- [EXISTS 和 IN 性能有什么区别](EXISTS和IN性能有什么区别？.md) — semi-join 改写、索引影响与 NOT IN 的 NULL 坑
