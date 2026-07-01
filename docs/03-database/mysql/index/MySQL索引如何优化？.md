# MySQL 索引如何优化

## 核心概念

索引优化是慢 SQL 治理的核心手段，分两个层面：**索引设计层面**（建什么索引、怎么建联合索引）和**SQL 编写层面**（怎么写 SQL 让索引能被用到）。前者解决"有没有索引可用"，后者解决"有了索引为什么没走"。

优化的根本目标是降低"扫描行数 + 回表次数 + 排序临时表"三项成本。具体手段包括：覆盖索引避免回表、前缀索引减小索引大小、自增主键避免页分裂、防止索引失效、合理设置 NOT NULL、避免 SELECT * 等。

## 标准回答

MySQL 索引优化从五个方向入手：1) 覆盖索引——把高频查询字段加入联合索引，避免回表；2) 前缀索引——长字符串字段用前缀建索引减小空间；3) 自增主键——避免页分裂和索引碎片区；4) 防止索引失效——避免函数/隐式转换/左模糊等；5) NOT NULL 与避免 SELECT *——减少 NULL 处理开销和回表。优化后必须用 EXPLAIN 验证 `type`、`key`、`rows`、`Extra`。

## 优化手段

### 1. 覆盖索引优化

把高频查询的所有字段都包含在索引里，避免回表：

```sql
-- 高频查询
SELECT id, name, age FROM user WHERE user_id = 1001;

-- 优化前：只有 (user_id) 索引
CREATE INDEX idx_user_id ON user(user_id);
-- 走 idx_user_id 后还要回表取 name 和 age

-- 优化后：覆盖索引
CREATE INDEX idx_user_id_name_age ON user(user_id, name, age);
-- Extra: Using index，无需回表
```

注意：覆盖索引会增加索引大小和写入成本，只对高频查询值得。

### 2. 前缀索引优化

长字符串字段（如 URL、长文本）建完整索引浪费空间，可用前缀索引：

```sql
-- 索引 name 完整值（VARCHAR(255)）
CREATE INDEX idx_name ON user(name);              -- 索引很大

-- 改为前缀索引（前 20 字符）
CREATE INDEX idx_name_prefix ON user(name(20));   -- 索引变小
```

前缀长度的选择：

```sql
-- 查看不同前缀长度的区分度
SELECT
  COUNT(DISTINCT LEFT(name, 5)) / COUNT(*) AS sel_5,
  COUNT(DISTINCT LEFT(name, 10)) / COUNT(*) AS sel_10,
  COUNT(DISTINCT LEFT(name, 20)) / COUNT(*) AS sel_20,
  COUNT(DISTINCT name) / COUNT(*) AS sel_full
FROM user;
-- 选择区分度接近完整值的最短前缀
```

前缀索引局限：

- **不能用于覆盖索引**：索引里只有前缀，无法确认完整值，必须回表。
- **不能用于 ORDER BY / GROUP BY**：索引里前缀有序，但完整值在前缀相同时不一定有序。

### 3. 主键索引最好是自增的

InnoDB 是聚簇索引，数据按主键顺序组织。自增主键插入时新行追加在最后，无需移动已有数据；非自增主键（如 UUID）插入位置随机，触发页分裂：

```
自增主键插入:
  [1, 2, 3, 4, 5] → 写满一页后开新页 → [6, 7, 8, ...]
  顺序追加，无页分裂

UUID 主键插入:
  [3, 5, 1, 4, 2] → 新 UUID 插入中间 → 移动数据 → 页分裂
  页分裂导致：写放大、碎片区、索引不紧凑
```

主键长度也要尽量小：二级索引叶子节点存主键值，主键越长，所有二级索引越大。Bigint（8B）够用且不太长；UUID（36B）作主键会让二级索引膨胀 4~5 倍。

### 4. 防止索引失效

详见 [索引失效的场景有哪些](索引失效的场景有哪些？.md)。要点：

- 不对索引列用函数或表达式：`WHERE YEAR(t)=...` → `WHERE t >= '...' AND t < '...'`。
- 不发生隐式类型转换：`WHERE phone=13800` → `WHERE phone='13800'`。
- 不用 `LIKE '%xxx'`：改用前缀匹配或全文索引。
- 联合索引满足最左前缀。
- `OR` 两边都要有索引。

### 5. 索引列尽量设置为 NOT NULL

```sql
-- 推荐
CREATE TABLE user (
  email VARCHAR(128) NOT NULL DEFAULT '',
  ...
);

-- 不推荐
CREATE TABLE user (
  email VARCHAR(128),   -- 允许 NULL
  ...
);
```

原因：

1. **优化器复杂度**：NULL 让索引统计和值比较更复杂，优化器选索引更难。
2. **存储空间**：行格式中要额外用 1 字节 NULL 值列表标记 NULL 列。
3. **索引覆盖**：NULL 多时 `IS NULL` 查询可能不走索引。

如果业务上确实允许空值，用空字符串 `''` 或 `0` 代替 NULL。

### 6. 避免 SELECT *

```sql
-- 不推荐
SELECT * FROM user WHERE user_id = 1001;
-- 几乎一定回表（除非 user_id 是主键）

-- 推荐
SELECT id, name FROM user WHERE user_id = 1001;
-- 配合 idx_user_id_name 联合索引可形成覆盖索引
```

`SELECT *` 强制取整行数据，覆盖索引失效。

### 7. 联合索引顺序优化

```sql
-- 查询: WHERE status = 1 AND user_id = 1001
-- status 区分度低，user_id 区分度高

-- 不推荐：status 在前
CREATE INDEX idx_status_user ON orders(status, user_id);
-- 第一步用 status=1 过滤后可能仍有大量行，再过滤 user_id

-- 推荐：user_id 在前（区分度高）
CREATE INDEX idx_user_status ON orders(user_id, status);
-- 第一步用 user_id=1001 过滤后行数极少
```

### 8. ORDER BY 优化

把 ORDER BY 字段加入联合索引末尾，利用索引有序性避免 filesort：

```sql
-- 查询: WHERE user_id = 1001 ORDER BY created_at DESC

-- 仅有 (user_id) 索引
EXPLAIN SELECT * FROM orders WHERE user_id = 1001 ORDER BY created_at DESC;
-- Extra: Using filesort  ← 需要额外排序

-- 加联合索引
CREATE INDEX idx_user_created ON orders(user_id, created_at);
EXPLAIN SELECT * FROM orders WHERE user_id = 1001 ORDER BY created_at DESC;
-- Extra: NULL（无 filesort）
```

## 代码示例

综合优化示例：

```sql
-- 业务查询
SELECT id, order_no, amount FROM orders
WHERE user_id = 1001 AND status = 1
ORDER BY created_at DESC LIMIT 20;

-- 优化前: 无索引或只有 (user_id)
EXPLAIN ...
-- type: ref, Extra: Using filesort, rows 大

-- 优化后: 联合索引 + 覆盖索引
DROP INDEX idx_user_id ON orders;
CREATE INDEX idx_user_status_created_no_amount
ON orders(user_id, status, created_at, order_no, amount);
EXPLAIN ...
-- type: ref
-- key: idx_user_status_created_no_amount
-- Extra: Using index  ← 覆盖索引，无 filesort，无回表
-- rows: 20 左右
```

查看索引使用情况（8.0）：

```sql
-- 未使用的索引（可考虑删除）
SELECT * FROM sys.schema_unused_indexes
WHERE object_schema = 'mydb';

-- 冗余索引
SELECT * FROM sys.schema_redundant_indexes
WHERE table_schema = 'mydb';
```

## 实战场景

| 优化场景 | 手段 | 效果 |
|----------|------|------|
| 慢 SQL 回表多 | 联合索引 + 覆盖索引 | 减少回表 IO |
| 长字符串索引大 | 前缀索引 | 减小索引空间 |
| 写入慢、索引碎片区多 | 自增主键 + `OPTIMIZE TABLE` | 避免页分裂 |
| ORDER BY 慢 | ORDER BY 列加入联合索引 | 避免 filesort |
| 深度分页慢 | 游标分页 `WHERE id > last_id` | 避免 LIMIT 100000, 10 |
| 优化器选错索引 | `ANALYZE TABLE` 或 `FORCE INDEX` | 修正统计信息 |
| 索引列运算导致失效 | SQL 改写 | 让索引能走 |

## 深挖追问

### 索引越多越好吗？

不是。每个索引都是一棵 B+ 树，占用磁盘；INSERT/UPDATE/DELETE 要维护所有受影响的索引；索引多时优化器选错概率增加。经验值：OLTP 表索引不超过 5 个。

### 覆盖索引一定最快吗？

不一定。如果索引列很多，索引本身很大，扫描索引的开销可能超过回表。覆盖索引适合"高频、字段少、行数多"的查询；如果查询字段多，应权衡索引膨胀成本。

### 前缀索引为什么不能用于覆盖索引？

前缀索引叶子节点只存字段的前 N 个字符，不是完整值。查询 `SELECT name FROM user WHERE name='完整值'` 时，前缀匹配后无法在索引层确认完整值是否相等，必须回表读完整行再比对。

### 8.0 的降序索引有什么用？

8.0 之前 `INDEX(a DESC, b ASC)` 实际仍按 ASC 存储，查询 `ORDER BY a DESC, b ASC` 时要反向扫描，性能有损。8.0 真正按 DESC 存储，反向查询也能直接顺序扫描。对常用 DESC 排序的字段有用。

### `OPTIMIZE TABLE` 什么时候需要？

当表有大量 DELETE 留下空洞、或频繁页分裂导致碎片区多时，`OPTIMIZE TABLE` 重建表回收空间。但大表会锁表很久，建议用 `pt-online-schema-change` 在线重建。

## 易错点

- 误以为"覆盖索引一定快"——索引膨胀时反而慢。
- 误以为"前缀索引能用于覆盖索引"——不能。
- 误以为"自增主键永远是 bigint"——根据业务量选 int 也行，但 bigint 更安全。
- 误以为"OPTIMIZE TABLE 是无害优化"——大表锁表很久，不是日常操作。
- 误以为"索引列必须 NOT NULL"——是建议，不是强制；某些场景 NULL 有业务语义。

## 总结

MySQL 索引优化从五个方向入手：覆盖索引（避免回表）、前缀索引（节省空间）、自增主键（避免页分裂）、防止索引失效（避免函数/隐式转换/左模糊）、NOT NULL 与避免 SELECT *（减少额外开销）。优化时按"扫描行数 + 回表次数 + 排序临时表"三项成本评估，用 EXPLAIN 验证 `type`、`key`、`rows`、`Extra`。索引不是越多越好，5 个以内为宜。

## 参考资料

- [MySQL 8.0 Reference Manual: Index Optimization](https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html)
- [MySQL 8.0 Reference Manual: Covering Index](https://dev.mysql.com/doc/refman/8.0/en/glossary.html#glos_covering_index)

---
