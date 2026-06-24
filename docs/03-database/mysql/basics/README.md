# basics

## 核心概念

- [数据库三大范式是什么？](/03-database/mysql/basics/数据库三大范式是什么？.md)
- [一条select语句执行期间发生了什么？](/03-database/mysql/basics/一条select语句执行期间发生了什么？.md)
- [一条update语句执行期间发生了什么？](/03-database/mysql/basics/一条update语句执行期间发生了什么？.md)
- [CHAR和VARCHAR区别是什么？](/03-database/mysql/basics/CHAR和VARCHAR区别是什么？.md)
- [Distinct与Group-By性能比较？](/03-database/mysql/basics/Distinct与Group-By性能比较？.md)
- [EXISTS与IN性能比较？](/03-database/mysql/basics/EXISTS与IN性能比较？.md)
- [MySQL连表查询语法有哪些？](/03-database/mysql/basics/MySQL连表查询语法有哪些？.md)
- [MySQL时间类型选择？](/03-database/mysql/basics/MySQL时间类型选择？.md)
- [MySQL数据类型介绍？](/03-database/mysql/basics/MySQL数据类型介绍？.md)
- [MySQL一行记录时怎么存储的？](/03-database/mysql/basics/MySQL一行记录时怎么存储的？.md)
- [NOSQL与SQL有什么区别？](/03-database/mysql/basics/NOSQL与SQL有什么区别？.md)
- [Text数据类型可以无限大吗？](/03-database/mysql/basics/Text数据类型可以无限大吗？.md)

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
