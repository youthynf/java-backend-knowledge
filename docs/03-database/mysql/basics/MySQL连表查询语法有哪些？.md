# MySQL 连表查询语法有哪些？

## 核心概念

连表查询用于把多张表按关联条件组合成结果集。MySQL 常见 Join 包括：`INNER JOIN` 只返回两边都匹配的记录；`LEFT JOIN` 保留左表全部记录，右表没有匹配时补 `NULL`；`RIGHT JOIN` 保留右表全部记录；`CROSS JOIN` 产生笛卡尔积；MySQL 不直接支持 `FULL OUTER JOIN`，通常用 `LEFT JOIN UNION RIGHT JOIN` 模拟。

Join 的性能不只取决于语法，还取决于驱动表选择、关联字段索引、过滤条件选择性和中间结果规模。工程中应先保证语义正确，再用 `EXPLAIN` 验证执行计划。

## 面试官想考什么

- 是否能区分内连接、外连接、交叉连接的返回语义；
- 是否知道 `ON` 和 `WHERE` 对外连接结果的影响；
- 是否能写出 MySQL 模拟全外连接的 SQL；
- 是否理解 Join 性能与驱动表、索引、过滤条件有关。

## 标准回答

> MySQL 连表常用 `INNER JOIN`、`LEFT JOIN`、`RIGHT JOIN` 和 `CROSS JOIN`。内连接只返回匹配行，左连接会保留左表，右表没有匹配时补 `NULL`。MySQL 没有原生 `FULL JOIN`，可以用左连接和右连接 `UNION` 实现。实际写 SQL 时要把表关联条件放在 `ON` 中，并给关联字段建立合适索引，避免大表无索引 Join、笛卡尔积和外连接被 `WHERE` 条件误改成内连接。

## 深挖追问

### ON 和 WHERE 有什么区别？

`ON` 描述表之间如何匹配；`WHERE` 对连接后的结果过滤。对 `INNER JOIN` 很多场景结果等价，但对 `LEFT JOIN` 不等价：如果在 `WHERE` 中写右表字段条件，如 `o.status = 1`，会过滤掉右表为空的行，使左连接退化为内连接。

### MySQL 如何模拟 FULL JOIN？

```sql
SELECT u.id, u.name, o.id AS order_id
FROM user u LEFT JOIN orders o ON u.id = o.user_id
UNION
SELECT u.id, u.name, o.id AS order_id
FROM user u RIGHT JOIN orders o ON u.id = o.user_id;
```

## 实战场景 / SQL 示例

查询用户及最近订单，可以先聚合订单再 Join，避免大中间结果：

```sql
SELECT u.id, u.name, x.last_order_time
FROM user u
LEFT JOIN (
  SELECT user_id, MAX(created_at) AS last_order_time
  FROM orders
  WHERE created_at >= '2026-01-01'
  GROUP BY user_id
) x ON u.id = x.user_id
WHERE u.status = 1;
```

建议索引：`user(status, id)`、`orders(user_id, created_at)`。

## 易错点 / 总结

- 忘写 `ON` 会产生笛卡尔积；
- 外连接右表字段放到 `WHERE` 可能破坏外连接语义；
- Join 字段类型、字符集不一致可能导致索引不可用；
- 只判断是否存在时，`EXISTS` 有时比 Join 更清晰；
- 执行计划比“经验上小表驱动大表”更可靠。
