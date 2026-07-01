# MySQL 连表查询语法有哪些

## 核心概念

连表查询（JOIN）用于把多张表按关联条件组合成一个结果集。MySQL 支持 `INNER JOIN`、`LEFT JOIN`、`RIGHT JOIN`、`CROSS JOIN`，但不直接支持 `FULL OUTER JOIN`（用 `LEFT JOIN UNION RIGHT JOIN` 模拟）。

理解 JOIN 的关键不是背语法，而是搞清楚"驱动表选择、关联字段索引、ON 与 WHERE 的区别"对最终结果和性能的影响。同样一个 LEFT JOIN，把右表过滤条件放在 `ON` 还是 `WHERE`，结果可能完全不同：放 `WHERE` 会让外连接退化为内连接。

JOIN 性能取决于优化器选的驱动表、被驱动表关联字段是否有索引、中间结果集大小。复杂 JOIN 应该先用 `EXPLAIN` 看执行计划，再决定是否拆子查询或冗余字段。

## 标准回答

> MySQL 常用 JOIN 包括 `INNER JOIN`（取交集）、`LEFT JOIN`（保留左表）、`RIGHT JOIN`（保留右表）、`CROSS JOIN`（笛卡尔积）。`FULL OUTER JOIN` 不直接支持，用 `LEFT JOIN UNION RIGHT JOIN` 模拟。写 JOIN 时要把关联条件放 `ON`，过滤条件放 `WHERE`，并给被驱动表的关联字段建索引，避免大表无索引 JOIN 和笛卡尔积。

核心要点：

1. **INNER JOIN**：返回两表都匹配的记录。
2. **LEFT JOIN**：保留左表全部，右表不匹配补 NULL。
3. **RIGHT JOIN**：保留右表全部，左表不匹配补 NULL。
4. **CROSS JOIN**：笛卡尔积，M 行 × N 行。
5. **FULL JOIN**：用 UNION 模拟。

## 详细机制

### 四种 JOIN 语义

```
左表 L = {1, 2, 3}
右表 R = {2, 3, 4}

INNER JOIN  L ∩ R = {2, 3}
LEFT JOIN   L ∪ (L ∩ R) = {1, 2, 3}，1 对应 R 为 NULL
RIGHT JOIN  R ∪ (L ∩ R) = {2, 3, 4}，4 对应 L 为 NULL
CROSS JOIN  L × R = 9 行笛卡尔积
FULL JOIN   L ∪ R = {1, 2, 3, 4}，1 和 4 对应另一表为 NULL
```

### ON 与 WHERE 的区别

- `ON` 描述表之间如何匹配，对 LEFT/RIGHT JOIN 来说决定"哪些行参与连接"。
- `WHERE` 对连接后的结果过滤。

对 INNER JOIN 两者结果等价。对 LEFT JOIN 不等价：

```sql
-- 写法 A：右表过滤条件放 ON，左表全保留
SELECT u.id, u.name, o.id AS order_id
FROM user u
LEFT JOIN orders o ON u.id = o.user_id AND o.status = 1;
-- 即使没有 status=1 的订单，user 也会出现，order_id 为 NULL

-- 写法 B：右表过滤条件放 WHERE，左表会被过滤
SELECT u.id, u.name, o.id AS order_id
FROM user u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.status = 1;
-- 没有订单的 user 会被过滤掉，外连接退化成内连接
```

### JOIN 执行机制（Nested Loop Join）

MySQL JOIN 主要用嵌套循环算法：

1. **Simple Nested Loop Join**：驱动表每行去被驱动表全表扫描匹配。性能差。
2. **Index Nested Loop Join**：被驱动表关联字段有索引，走索引查找。生产环境主要这种。
3. **Block Nested Loop Join（BNL）**：被驱动表无索引时，把驱动表批量放入 join_buffer，被驱动表扫一次匹配多行。

MySQL 8.0.18+ 引入 **Hash Join** 替代 BNL，对无索引场景性能更好。

### 驱动表选择

优化器基于成本选驱动表。一般规则：

- 小表驱动大表（驱动表行数少，循环次数少）。
- 被 JOIN 表的关联字段有索引（走 Index Nested Loop）。
- WHERE 条件选择性高的表更适合做驱动表。

可以用 `STRAIGHT_JOIN` 强制 MySQL 按指定顺序 JOIN，但生产慎用。

### MySQL 模拟 FULL OUTER JOIN

```sql
SELECT u.id, u.name, o.id AS order_id
FROM user u LEFT JOIN orders o ON u.id = o.user_id
UNION
SELECT u.id, u.name, o.id AS order_id
FROM user u RIGHT JOIN orders o ON u.id = o.user_id;
```

`UNION` 会去重，`UNION ALL` 不去重但更快。这里需要去重所以用 `UNION`。

## 代码示例

用户与订单表的典型 JOIN：

```sql
CREATE TABLE `user` (
  `id` BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `status` TINYINT NOT NULL,
  KEY `idx_status` (`status`)
) ENGINE=InnoDB;

CREATE TABLE `orders` (
  `id` BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `status` TINYINT NOT NULL,
  `created_at` DATETIME NOT NULL,
  KEY `idx_user_status_time` (`user_id`, `status`, `created_at`)
) ENGINE=InnoDB;
```

**INNER JOIN**：有订单的用户

```sql
SELECT u.id, u.name, COUNT(o.id) AS order_cnt
FROM user u
INNER JOIN orders o ON u.id = o.user_id
WHERE u.status = 1
GROUP BY u.id, u.name;
```

**LEFT JOIN**：所有用户及其最近订单时间（无订单显示 NULL）

```sql
SELECT u.id, u.name, x.last_order_time
FROM user u
LEFT JOIN (
  SELECT user_id, MAX(created_at) AS last_order_time
  FROM orders
  GROUP BY user_id
) x ON u.id = x.user_id
WHERE u.status = 1;
```

**CROSS JOIN**：生成商品 × 日期的报表骨架

```sql
SELECT s.sku_name, d.day, COALESCE(SUM(sa.qty), 0) AS sold_qty
FROM sku s
CROSS JOIN (
  SELECT DATE(created_at) AS day FROM orders
  WHERE created_at >= '2026-06-01'
  GROUP BY DATE(created_at)
) d
LEFT JOIN sales sa ON sa.sku_id = s.id AND DATE(sa.created_at) = d.day
GROUP BY s.sku_name, d.day;
```

## 实战场景

| 场景 | JOIN 类型 | 注意点 |
|------|-----------|--------|
| 用户与其订单列表 | INNER JOIN | 关联字段 `user_id` 必须有索引 |
| 所有用户及最近订单（含无订单） | LEFT JOIN | 子查询先聚合再 JOIN，避免大中间结果 |
| 订单关联商品（保留被删除商品） | LEFT JOIN | 历史数据可能商品已下架 |
| 笛卡尔积报表骨架 | CROSS JOIN | 数据量大时慎用 |
| 全外连接 | LEFT JOIN UNION RIGHT JOIN | 注意 UNION 去重开销 |
| 多层关联（A→B→C） | 链式 INNER JOIN | 控制中间结果集，必要时拆临时表 |

## 深挖追问

### ON 和 WHERE 对 LEFT JOIN 的结果有何不同？

`ON` 决定"哪些右表行参与连接"，左表行无论如何都会保留。`WHERE` 对连接后的结果过滤，会把右表为 NULL 的行（即没匹配上的左表行）过滤掉，使外连接退化成内连接。

### MySQL 怎么选驱动表？

优化器基于成本估算。一般倾向"小表驱动大表"——驱动表行数少，循环次数少。但"小"指结果集小，不是表本身小。带 WHERE 的查询，过滤后的结果集才是优化器判断依据。可以用 `EXPLAIN` 看 `id` 列：相同 id 按 rows 顺序，第一个是驱动表。

### 什么是 Hash Join？什么时候用？

MySQL 8.0.18+ 引入 Hash Join，替代无索引场景下的 BNL。流程：构建阶段把小表散列到内存 hash 表；探测阶段扫大表每行查 hash 表。适合等值 JOIN 且无索引的场景。8.0.20 起完全替代 BNL。

### JOIN 字段类型不一致会怎样？

关联字段类型不一致（如 `VARCHAR` vs `BIGINT`）会触发隐式转换，导致索引失效，全表扫描。生产应保证关联字段类型、字符集、校对规则一致。

```sql
-- 错误：user_id 是 BIGINT，o.user_id 是 VARCHAR
SELECT * FROM user u JOIN orders o ON u.id = o.user_id;
-- 索引失效，全表扫描

-- 正确：两边类型一致
ALTER TABLE orders MODIFY user_id BIGINT NOT NULL;
```

### 多表 JOIN 性能差怎么优化？

- 给被驱动表关联字段建索引
- 减少中间结果集：先 WHERE 过滤再 JOIN
- 拆子查询：复杂 JOIN 改成临时表或多步查询
- 反范式冗余字段：高频 JOIN 字段冗余到主表
- 限制返回行数：用 LIMIT 控制结果集
- 拆分到 ES/ClickHouse 做分析查询

## 易错点

- LEFT JOIN 的右表过滤条件放 WHERE，导致外连接退化成内连接。
- 忘写 `ON` 子句，产生笛卡尔积。
- 关联字段类型/字符集不一致，索引失效。
- 大表无索引 JOIN，性能爆炸。
- 用 `SELECT *` 返回所有列，包括不需要的大字段。
- 多层嵌套子查询导致 MySQL 优化器选错计划。

## 总结

MySQL 常用 JOIN 包括 INNER、LEFT、RIGHT、CROSS，FULL OUTER JOIN 用 UNION 模拟。理解 ON 与 WHERE 对外连接的不同影响是写对 SQL 的关键。JOIN 性能取决于驱动表选择、被驱动表关联字段索引、中间结果集大小。复杂 JOIN 应该先用 EXPLAIN 看执行计划，必要时拆子查询、反范式冗余或迁移到分析型数据库。

## 参考资料

- [MySQL 8.0 JOIN Syntax](https://dev.mysql.com/doc/refman/8.0/en/join.html)
- [MySQL 8.0 Nested-Loop Join Algorithms](https://dev.mysql.com/doc/refman/8.0/en/nested-loop-joins.html)
- [MySQL 8.0 Hash Join](https://dev.mysql.com/doc/refman/8.0/en/hash-joins.html)

---
