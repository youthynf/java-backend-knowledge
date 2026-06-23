# Text数据类型可以无限大吗？

## 核心概念

Text数据类型可以无限大吗？
MySQL 3 种text类型的最大长度如下：
TEXT：65,535 bytes ~64kb
MEDIUMTEXT：16,777,215 bytes ~16Mb
LONGTEXT：4,294,967,295 bytes ~4Gb

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
