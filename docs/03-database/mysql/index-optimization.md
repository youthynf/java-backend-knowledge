# MySQL 索引与查询优化

## 一、索引基础

### 1.1 什么是索引？

索引是帮助 MySQL 高效获取数据的数据结构，类似于书籍的目录。

**索引的作用：**
- 加快数据检索速度
- 加速 ORDER BY、GROUP BY 操作
- 实现唯一性约束

**索引的代价：**
- 占用磁盘空间
- 降低写操作速度（INSERT、UPDATE、DELETE 需要维护索引）

### 1.2 索引的数据结构

**B+ 树（InnoDB 默认）**

```
                    [根节点]
                   /    |    \
              [非叶节点] [非叶节点] [非叶节点]
               /   \      |       /   \
         [叶子节点] [叶子节点] [叶子节点] [叶子节点]
              ↓        ↓        ↓        ↓
           数据页 → 数据页 → 数据页 → 数据页
                   (双向链表连接)
```

**B+ 树特点：**
1. 非叶子节点只存储键值和指针
2. 叶子节点存储所有数据，并按顺序链接
3. 范围查询效率高（直接遍历叶子节点链表）
4. 树高度低（通常 3-4 层），IO 次数少

**为什么不用 B 树？**
- B 树非叶子节点也存储数据，单页存储的键值少，树更高
- B+ 树范围查询只需遍历叶子节点链表

**为什么不用 Hash 索引？**
- 不支持范围查询
- 不支持排序
- 不支持模糊查询

---

## 二、索引类型

### 2.1 按存储结构分类

| 类型 | 说明 | 特点 |
|------|------|------|
| 聚簇索引 | 主键索引，叶子节点存储完整行数据 | 一个表只能有一个 |
| 非聚簇索引 | 二级索引，叶子节点存储主键值 | 可有多个 |

**聚簇索引结构：**
```
索引列值 → 完整行数据
```

**非聚簇索引结构：**
```
索引列值 → 主键值 → 回表查询聚簇索引获取完整数据
```

### 2.2 按功能分类

**主键索引（PRIMARY）**
```sql
CREATE TABLE user (
    id INT PRIMARY KEY,          -- 自动创建主键索引
    name VARCHAR(50)
);
```

**唯一索引（UNIQUE）**
```sql
CREATE UNIQUE INDEX uk_email ON user(email);
-- 或
ALTER TABLE user ADD UNIQUE INDEX uk_email(email);
```

**普通索引（INDEX）**
```sql
CREATE INDEX idx_name ON user(name);
-- 或
ALTER TABLE user ADD INDEX idx_name(name);
```

**组合索引**
```sql
CREATE INDEX idx_name_age ON user(name, age);
```

**全文索引（FULLTEXT）**
```sql
CREATE FULLTEXT INDEX ft_content ON article(content);
```

---

## 三、索引设计原则

### 3.1 适合创建索引的情况

1. **WHERE 条件列**
```sql
-- 经常用于查询条件的列
SELECT * FROM user WHERE name = '张三';
CREATE INDEX idx_name ON user(name);
```

2. **JOIN 关联列**
```sql
-- 外键关联
SELECT * FROM order o JOIN user u ON o.user_id = u.id;
CREATE INDEX idx_user_id ON order(user_id);
```

3. **ORDER BY / GROUP BY 列**
```sql
-- 排序和分组
SELECT * FROM user ORDER BY create_time;
CREATE INDEX idx_create_time ON user(create_time);
```

4. **区分度高的列**
```sql
-- 选择性 = 不同值数量 / 总行数，越接近 1 越好
-- 性别（区分度低）不适合单独建索引
-- 手机号、身份证号（区分度高）适合建索引
```

### 3.2 不适合创建索引的情况

1. **区分度低的列**：性别、状态（只有几个值）
2. **频繁更新的列**：索引需要维护，影响性能
3. **数据量小的表**：全表扫描更快
4. **不用于查询条件的列**

### 3.3 组合索引设计

**最左前缀原则**

组合索引 `(name, age, city)` 可以支持：
- `WHERE name = '张三'`
- `WHERE name = '张三' AND age = 25`
- `WHERE name = '张三' AND age = 25 AND city = '北京'`

**不能支持：**
- `WHERE age = 25`（跳过了 name）
- `WHERE city = '北京'`（跳过了 name 和 age）

**设计建议：**
1. 把区分度高的列放左边
2. 把经常查询的列放左边
3. 范围查询的列放右边

```sql
-- 好的设计
CREATE INDEX idx_user ON user(status, create_time);
-- 支持：WHERE status = 1 AND create_time > '2024-01-01'

-- 不好的设计
CREATE INDEX idx_user ON user(create_time, status);
-- 范围查询后无法使用 status 条件
```

---

## 四、索引失效场景

### 4.1 查询条件导致失效

```sql
-- 1. 使用函数
SELECT * FROM user WHERE YEAR(create_time) = 2024;  -- 索引失效
SELECT * FROM user WHERE create_time >= '2024-01-01' AND create_time < '2025-01-01';  -- 索引生效

-- 2. 隐式类型转换
SELECT * FROM user WHERE phone = 13800138000;  -- phone 是 VARCHAR，索引失效
SELECT * FROM user WHERE phone = '13800138000';  -- 索引生效

-- 3. LIKE 以 % 开头
SELECT * FROM user WHERE name LIKE '%张';   -- 索引失效
SELECT * FROM user WHERE name LIKE '张%';   -- 索引生效

-- 4. 使用 OR
SELECT * FROM user WHERE name = '张三' OR age = 25;  -- age 无索引，整体失效

-- 5. 使用 != 或 <>
SELECT * FROM user WHERE status != 1;  -- 索引失效

-- 6. 使用 NOT IN
SELECT * FROM user WHERE status NOT IN (1, 2, 3);  -- 索引失效

-- 7. IS NULL / IS NOT NULL（部分情况失效）
SELECT * FROM user WHERE name IS NULL;  -- 如果 NULL 值很多，可能失效
```

### 4.2 索引设计问题

```sql
-- 1. 违反最左前缀
-- 索引：(name, age, city)
SELECT * FROM user WHERE age = 25;  -- 索引失效

-- 2. 范围查询后索引失效
-- 索引：(name, age, city)
SELECT * FROM user WHERE name = '张三' AND age > 25 AND city = '北京';  -- city 索引失效

-- 3. 计算操作
SELECT * FROM user WHERE age + 1 = 26;  -- 索引失效
SELECT * FROM user WHERE age = 25;      -- 索引生效
```

---

## 五、Explain 执行计划分析

### 5.1 基本使用

```sql
EXPLAIN SELECT * FROM user WHERE name = '张三';
```

### 5.2 关键字段解读

| 字段 | 说明 | 关注点 |
|------|------|--------|
| id | 查询标识符 | 相同则从上往下执行，不同则大的先执行 |
| select_type | 查询类型 | SIMPLE 最好，SUBQUERY 需关注 |
| table | 访问的表 | - |
| type | 访问类型 | 从好到坏：system > const > eq_ref > ref > range > index > ALL |
| key | 实际使用的索引 | - |
| key_len | 使用的索引长度 | 越短越好 |
| rows | 预估扫描行数 | 越少越好 |
| Extra | 额外信息 | Using filesort, Using temporary 需优化 |

### 5.3 type 类型详解

**从好到坏排序：**

| type | 说明 | 示例 |
|------|------|------|
| system | 表只有一行 | 主键查询单行 |
| const | 主键或唯一索引查询 | `WHERE id = 1` |
| eq_ref | JOIN 时使用主键或唯一索引 | `JOIN ON a.id = b.a_id` |
| ref | 非唯一索引查询 | `WHERE name = '张三'` |
| range | 范围查询 | `WHERE age > 20` |
| index | 扫描整个索引树 | `SELECT id FROM user` |
| ALL | 全表扫描 | `WHERE age + 1 = 26` |

**优化目标：至少达到 ref 级别，避免 ALL**

### 5.4 Extra 关键信息

| Extra | 说明 | 建议 |
|-------|------|------|
| Using index | 覆盖索引，性能好 | - |
| Using where | 服务器层过滤 | 可优化索引 |
| Using filesort | 文件排序，需优化 | 添加合适索引 |
| Using temporary | 使用临时表 | GROUP BY 优化 |

---

## 六、SQL 优化实践

### 6.1 避免全表扫描

```sql
-- 确保有合适的索引
CREATE INDEX idx_status_time ON user(status, create_time);

-- 使用索引覆盖
SELECT id, name FROM user WHERE status = 1;  -- 如果索引包含 id, name, status
```

### 6.2 优化分页查询

**问题：大偏移量**
```sql
-- 性能差：需要扫描前 100000 行
SELECT * FROM user LIMIT 100000, 10;
```

**优化方案 1：使用索引覆盖 + 子查询**
```sql
SELECT * FROM user u
JOIN (SELECT id FROM user ORDER BY id LIMIT 100000, 10) t
ON u.id = t.id;
```

**优化方案 2：记录上次 ID**
```sql
-- 第一页
SELECT * FROM user ORDER BY id LIMIT 10;

-- 下一页（假设上一页最后 id = 100010）
SELECT * FROM user WHERE id > 100010 ORDER BY id LIMIT 10;
```

### 6.3 优化 COUNT 查询

```sql
-- COUNT(*) 会统计所有行
SELECT COUNT(*) FROM user;

-- 如果只需要判断是否存在
SELECT 1 FROM user LIMIT 1;  -- 更快

-- COUNT(字段) 不统计 NULL
SELECT COUNT(age) FROM user;  -- 统计 age 不为 NULL 的行数
```

### 6.4 避免 SELECT *

```sql
-- 不好：读取不需要的列
SELECT * FROM user WHERE id = 1;

-- 好：只读需要的列
SELECT id, name FROM user WHERE id = 1;
```

### 6.5 批量操作优化

```sql
-- 批量插入
INSERT INTO user (name, age) VALUES 
('张三', 25),
('李四', 28),
('王五', 30);

-- 批量更新
UPDATE user SET status = 1 WHERE id IN (1, 2, 3, 4, 5);
```

---

## 七、慢查询优化流程

### 7.1 开启慢查询日志

```sql
-- 查看配置
SHOW VARIABLES LIKE 'slow_query_log%';
SHOW VARIABLES LIKE 'long_query_time';

-- 开启慢查询日志
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;  -- 超过 1 秒记录
```

### 7.2 分析慢查询

```bash
# 使用 mysqldumpslow 分析
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log

# 使用 pt-query-digest（推荐）
pt-query-digest /var/log/mysql/slow.log > slow_report.txt
```

### 7.3 优化步骤

1. 使用 EXPLAIN 分析执行计划
2. 查看是否使用了合适的索引
3. 检查是否有 Using filesort、Using temporary
4. 根据问题添加或修改索引
5. 重写 SQL 语句
6. 对比优化效果

---

## 八、索引优化案例

### 案例 1：组合索引优化

```sql
-- 查询
SELECT * FROM user WHERE name = '张三' AND age = 25 ORDER BY create_time;

-- 错误索引：只支持 WHERE
CREATE INDEX idx_name_age ON user(name, age);
-- Using filesort（需要额外排序）

-- 正确索引：支持 WHERE + ORDER BY
CREATE INDEX idx_name_age_time ON user(name, age, create_time);
-- Using index
```

### 案例 2：覆盖索引优化

```sql
-- 查询
SELECT id, name FROM user WHERE status = 1;

-- 方案 1：普通索引
CREATE INDEX idx_status ON user(status);
-- 需要回表查询 name

-- 方案 2：覆盖索引
CREATE INDEX idx_status_name ON user(status, name);
-- Using index（无需回表）
```

### 案例 3：避免隐式转换

```sql
-- phone 是 VARCHAR 类型
-- 错误查询
SELECT * FROM user WHERE phone = 13800138000;  -- 索引失效

-- 正确查询
SELECT * FROM user WHERE phone = '13800138000';  -- 索引生效
```

---

## 参考资料

- [高性能 MySQL](https://book.douban.com/subject/23008813/)
- [MySQL 技术内幕：InnoDB 存储引擎](https://book.douban.com/subject/24708143/)
- [JavaGuide - MySQL 面试题](https://javaguide.cn/database/mysql/mysql-questions-01.html)