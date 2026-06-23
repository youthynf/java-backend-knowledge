# MySQL数据类型介绍？

## 核心概念

MySQL数据类型介绍？
数值型
TINYINT：1字节，范围：有符号(-128~127) / 无符号(0~255)
SMALLINT：2字节，范围：±3.2万
MEDIUMINT：3字节，范围：±838万
INT：4字节，范围：±21亿
BIGINT：8字节，范围：±9.2×10¹⁸
FLOAT：4字节，近似浮点数，精度约7位
DOUBLE：8字节，近似浮点数，精度约15位
DECIMAL(M,D)：变长，精确小数，M是总位数(最大65)，D是小数位

文本型
CHAR(N)：定长，最多255字符（存储大小=N×字符字节）
VARCHAR(N)：变长，最多65535字节（实际大小=字符数×编码字节+1~2长度位）
TINYTEXT：最大255字节（L+1字节存储）
TEXT：最大64KB（L+2字节）
MEDIUMTEXT：最大16MB（L+3字节）
LONGTEXT：最大4GB（L+4字节）

二进制型
BINARY(N)：定长二进制，N<255
VARBINARY(N)：变长二进制，N<65535
BLOB：二进制大对象（最大64KB）
MEDIUMBLOB：最大16MB
LONGBLOB：最大4GB

时间日期类型
DATE：3字节，格式'YYYY-MM-DD'，范围1000-9999年
TIME(fsp)：3~6字节，格式'HH:MM:SS[.小数秒]'
DATETIME(fsp)：5~8字节，格式'YYYY-MM-DD HH:MM:SS[.小数秒]'
TIMESTAMP(fsp)：4~7字节，UTC时间戳，范围1970-2038年（2038年后需用BIGINT存储）
YEAR：1字节，范围1901~2155年

其他类型
ENUM：1~2字节，单选枚举（例：ENUM('yes','no')）
SET：1~8字节，多选集合（例：SET('red','green')）
JSON：L+4字节，自动验证JSON格式
GEOMETRY：空间地理数据类型

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
