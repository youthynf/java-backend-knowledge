# MySQL 数据库

## 核心概念

### 存储引擎

| 特性 | InnoDB | MyISAM |
|------|--------|--------|
| 事务支持 | ✅ | ❌ |
| 行级锁 | ✅ | ❌（表锁） |
| 外键 | ✅ | ❌ |
| 崩溃恢复 | ✅ | ❌ |
| 全文索引 | ✅（5.6+） | ✅ |

### 索引结构

**B+ 树特点**：
- 非叶子节点只存储键值，不存储数据
- 叶子节点存储所有数据，形成链表
- 范围查询效率高
- 树高度低（通常 3 层）

**索引类型**：
- **聚簇索引**：主键索引，叶子节点存储完整行数据
- **非聚簇索引**：辅助索引，叶子节点存储主键值
- **联合索引**：遵循最左前缀原则
- **覆盖索引**：查询字段都在索引中，无需回表

### 事务隔离级别

| 级别 | 脏读 | 不可重复读 | 幻读 |
|------|------|------------|------|
| READ UNCOMMITTED | ✅ | ✅ | ✅ |
| READ COMMITTED | ❌ | ✅ | ✅ |
| REPEATABLE READ | ❌ | ❌ | ✅（InnoDB 解决） |
| SERIALIZABLE | ❌ | ❌ | ❌ |

### MVCC（多版本并发控制）

**Read View**：
- m_ids：生成 Read View 时活跃的事务 ID 列表
- min_trx_id：最小活跃事务 ID
- max_trx_id：下一个要分配的事务 ID
- creator_trx_id：创建该 Read View 的事务 ID

**可见性判断**：
1. trx_id < min_trx_id → 可见
2. trx_id >= max_trx_id → 不可见
3. trx_id 在 m_ids 中 → 不可见
4. 否则 → 可见

### 锁机制

**行锁类型**：
- **记录锁（Record Lock）**：锁单条记录
- **间隙锁（Gap Lock）**：锁记录之间的间隙
- **临键锁（Next-Key Lock）**：记录锁 + 间隙锁

**锁模式**：
- 共享锁（S）：SELECT ... LOCK IN SHARE MODE
- 排他锁（X）：SELECT ... FOR UPDATE

---

## 面试高频问题

### 1. 为什么 MySQL 使用 B+ 树而不是 B 树？

**回答要点**：
- B+ 树非叶子节点不存数据，树更矮，IO 次数更少
- B+ 树叶子节点形成链表，范围查询更高效
- B+ 树查询效率稳定（都在叶子节点）

### 2. 索引什么情况下会失效？

**回答要点**：
- 查询条件中有 OR
- LIKE 以 % 开头
- 对索引列使用函数
- 隐式类型转换
- 联合索引不满足最左前缀
- 索引列参与计算

### 3. MySQL 如何解决幻读？

**回答要点**：
- MVCC（快照读）
- Next-Key Lock（当前读）
- RR 级别下 InnoDB 通过这两种机制解决幻读

### 4. redo log 和 binlog 有什么区别？

| 特性 | redo log | binlog |
|------|----------|--------|
| 所属 | InnoDB 引擎 | Server 层 |
| 内容 | 物理日志（数据页修改） | 逻辑日志（SQL 语句） |
| 写入方式 | 循环写 | 追加写 |
| 用途 | 崩溃恢复 | 主从复制、备份恢复 |

### 5. 如何优化慢查询？

**回答要点**：
1. EXPLAIN 分析执行计划
2. 检查索引是否命中
3. 避免全表扫描
4. 优化 SQL 写法
5. 考虑分库分表

---

## 代码示例

### EXPLAIN 分析

```sql
EXPLAIN SELECT * FROM orders WHERE user_id = 100 AND status = 'PAID';

-- 关注字段
-- type: const > eq_ref > ref > range > index > ALL
-- key: 实际使用的索引
-- rows: 预估扫描行数
-- Extra: Using index（覆盖索引） / Using filesort（文件排序）
```

### 索引创建

```sql
-- 联合索引（最左前缀）
CREATE INDEX idx_user_status_time ON orders(user_id, status, created_at);

-- 覆盖索引
CREATE INDEX idx_cover ON products(category, price, name);
```

---

## 实战场景

### 分库分表策略

**垂直分库**：按业务拆分（订单库、用户库、商品库）

**水平分库**：按分片键拆分（user_id % 分库数）

**分表键选择**：
- 数据分布均匀
- 查询命中率高
- 避免跨库查询

### 慢查询优化流程

1. 开启慢查询日志
2. 分析 SQL 执行计划
3. 检查索引设计
4. 优化 SQL 写法
5. 考虑数据结构调整

---

## 延伸思考

- 如何设计一个高可用的 MySQL 架构？
- 大表 DDL 操作如何避免锁表？
- 如何处理热点数据问题？
- 读写分离如何保证数据一致性？

## 参考资料

- [MySQL 官方文档](https://dev.mysql.com/doc/)
- [高性能 MySQL](https://book.douban.com/subject/23008813/)
