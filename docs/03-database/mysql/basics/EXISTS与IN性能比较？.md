# EXISTS 与 IN 性能比较？

## 核心概念

`IN` 和 `EXISTS` 都可以表达“是否存在匹配记录”，但语义不同：

- `IN` 判断某个值是否属于一个结果集；
- `EXISTS` 判断子查询是否能找到至少一行满足条件的记录。

早期经验常说“小表用 IN，大表用 EXISTS”，但这个结论过于粗糙。MySQL 5.6 之后优化器支持 semi-join、子查询物化、子查询改写等优化，很多 `IN`/`EXISTS` 最终会被改写成类似执行计划。真实性能要看索引、数据分布、选择性和 `EXPLAIN`。

## 面试官想考什么

1. 是否理解语义差异；
2. 是否知道不能死背“小表 IN，大表 EXISTS”；
3. 是否知道 MySQL 优化器会改写子查询；
4. 是否能结合索引和执行计划分析；
5. 是否注意 `NOT IN` 与 NULL 的坑。

## 标准回答

### `IN` 写法

```sql
SELECT *
FROM orders o
WHERE o.user_id IN (
  SELECT u.id FROM users u WHERE u.status = 'ACTIVE'
);
```

语义是：订单的 `user_id` 是否在活跃用户 id 集合中。

### `EXISTS` 写法

```sql
SELECT *
FROM orders o
WHERE EXISTS (
  SELECT 1
  FROM users u
  WHERE u.id = o.user_id
    AND u.status = 'ACTIVE'
);
```

语义是：对每条订单，是否能找到匹配的活跃用户。

### 现代 MySQL 中不能简单按大小表判断

MySQL 优化器可能把 `IN`/`EXISTS` 改写成 semi-join，常见策略包括：

- FirstMatch：找到第一条匹配就停止；
- LooseScan：利用索引跳跃扫描；
- Materialization：把子查询结果物化成临时表；
- Duplicate Weedout：去重后做半连接。

因此两条 SQL 最终执行计划可能非常接近。

### 真正影响性能的是索引和选择性

关键是关联字段、过滤字段是否有合适索引：

```sql
CREATE INDEX idx_users_status_id ON users(status, id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

如果关联字段没有索引，`EXISTS` 可能退化成大量嵌套循环；如果 `IN` 子查询结果很大且无法有效物化，也会很慢。

## 深挖追问

### `NOT IN` 和 `NOT EXISTS` 有什么坑？

`NOT IN` 遇到 NULL 非常危险。

```sql
SELECT * FROM orders
WHERE user_id NOT IN (SELECT id FROM blacklist);
```

如果子查询结果里有 NULL，整个判断可能变成 UNKNOWN，导致返回结果为空或不符合预期。更安全的写法是：

```sql
SELECT *
FROM orders o
WHERE NOT EXISTS (
  SELECT 1
  FROM blacklist b
  WHERE b.id = o.user_id
);
```

或者在 `NOT IN` 子查询中显式排除 NULL。

### 为什么 `EXISTS` 常写 `SELECT 1`？

因为 `EXISTS` 只关心是否存在行，不关心返回列内容。写 `SELECT 1` 更能表达语义，优化后通常和 `SELECT *` 没有明显差异。

### 怎么判断到底谁快？

用 `EXPLAIN` 或 MySQL 8.0 的 `EXPLAIN ANALYZE`：

```sql
EXPLAIN FORMAT=TREE
SELECT ...;
```

重点看是否走索引、访问行数、过滤比例、是否出现临时表/文件排序、是否被优化成 semi-join，以及实际执行耗时。

## 实战建议

- 表达“值属于集合”时，`IN` 可读性更好；
- 表达“存在匹配关系”时，`EXISTS` 更自然；
- 反向查询优先考虑 `NOT EXISTS`，避免 NULL 坑；
- 不要凭经验定性能，必须看执行计划；
- 给关联字段和过滤字段建立合适联合索引。

## 总结

`IN` 和 `EXISTS` 没有绝对谁快。现代 MySQL 会做子查询改写和 semi-join 优化，很多场景性能接近。面试时应该先讲语义差异，再讲优化器改写，最后强调索引、NULL 语义和 `EXPLAIN` 验证。
