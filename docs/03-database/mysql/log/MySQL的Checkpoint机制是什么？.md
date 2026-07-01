# MySQL 的 Checkpoint 机制是什么

## 核心概念

InnoDB 修改数据时先在 Buffer Pool 改脏页，异步刷盘。redo log 是循环写、空间有限，被覆盖前必须保证对应脏页已刷盘，否则崩溃后无法恢复。Checkpoint 机制就是“把脏页刷盘 + 记录恢复点”的过程。

Checkpoint 推进的位置（LSN）标记了“该位置之前的 redo log 对应的脏页都已落盘”，崩溃恢复时只需重放 Checkpoint 之后的 redo log，无需全量重放，加速恢复。同时 Checkpoint 让 redo log 空间可被循环复用。

如果 Checkpoint 长期滞后，redo log 写满会强制阻塞业务刷脏页，导致 SQL 卡顿。所以 Checkpoint 是数据安全与性能的关键枢纽。

## 标准回答

> Checkpoint 是 InnoDB 把 Buffer Pool 脏页批量刷盘、并记录恢复点 LSN 的机制。它由 redo log 写满、脏页比例达阈值、定期、关闭数据库等条件触发。Checkpoint 推进后，对应 LSN 之前的 redo log 可被覆盖复用，崩溃恢复只需重放 Checkpoint 之后的 redo log。核心标识是 LSN（日志序列号），通过 `SHOW ENGINE INNODB STATUS` 可看 `Log sequence number`、`Log flushed up to`、`Last checkpoint at` 三个 LSN 的差值判断 Checkpoint 滞后情况。生产中要监控 LSN 差值，避免 redo log 写满阻塞业务。

## 实现原理

### 为什么需要 Checkpoint

redo log 是固定大小的循环日志，写满会阻塞业务。要让 redo log 能循环复用，必须保证被覆盖的 redo log 对应的脏页已经刷盘——否则崩溃后没有 redo log 可恢复这部分数据。

Checkpoint 就是“刷脏页 + 记录已刷盘 LSN”的操作：

```
Checkpoint 之前：脏页已落盘，redo log 可覆盖
Checkpoint 之后：脏页可能未落盘，redo log 必须保留
```

### LSN（Log Sequence Number）

LSN 是单调递增的日志序列号，贯穿 redo log、数据页、Buffer Pool、Checkpoint。理解 Checkpoint 必须先理解 LSN。

| LSN 类型 | 含义 | 存储位置 |
|---------|------|---------|
| `Log sequence number` | 当前 redo log 最新写入位置 | 内存 |
| `Log flushed up to` | 已刷盘到 redo log 文件的 LSN | redo log file |
| `Last checkpoint at` | 最近 Checkpoint 的 LSN，该位置之前脏页已落盘 | 系统表空间 ibdata1 |
| `FIL_PAGE_LSN` | 数据页最后一次修改的 LSN | .ibd 文件页头 |

判断逻辑：数据页的 `FIL_PAGE_LSN > Last checkpoint at` → 该页是脏页（未刷盘）。

### Checkpoint 触发条件

| 触发场景 | 说明 | 关键参数 |
|---------|------|---------|
| redo log 写满 | 必须刷脏页推进 Checkpoint 才能继续写 | `innodb_log_file_size` |
| 脏页比例达阈值 | 主动刷避免积压 | `innodb_max_dirty_pages_pct`（默认 75%） |
| 脏页低水位 | 缓慢刷新避免峰值 | `innodb_max_dirty_pages_pct_lwm`（默认 30%） |
| 定期触发 | 后台线程周期刷 | `innodb_adaptive_flushing` |
| 正常关闭 | `SHUTDOWN` 时刷所有脏页 | — |

### Checkpoint 执行过程

1. **选页**：从 Flush 链表选脏页，优先 LSN 小的旧脏页（避免 redo log 链过长）
2. **写盘**：批量把脏页写入 .ibd 文件，受 `innodb_io_capacity` 限流避免占满 I/O
3. **更新元数据**：
   - 更新数据页 `FIL_PAGE_LSN`
   - 计算本次刷盘脏页最大 LSN
   - 更新系统表空间 ibdata1 的全局 Checkpoint LSN
   - 把已刷脏页标记为干净页，移出 Flush 链表

### Checkpoint 的两种类型

- **Sharp Checkpoint**：关闭数据库时把所有脏页刷盘，恢复时无需重放 redo log。`innodb_fast_shutdown=1`（默认）。
- **Fuzzy Checkpoint**：运行期间分批刷部分脏页，不阻塞业务。日常运行的都是 Fuzzy Checkpoint。

### Checkpoint 与崩溃恢复

崩溃后 InnoDB 重启恢复流程：

```
1. 找到最近的 Last checkpoint at LSN
2. 从该 LSN 开始扫描 redo log
3. 重放 redo log，恢复脏页到 Buffer Pool
4. 对 PREPARE 状态事务，配合 binlog 决定提交或回滚
```

Checkpoint 越新（越接近 `Log sequence number`），需要重放的 redo log 越少，恢复越快。Checkpoint 滞后会导致恢复时间长，甚至 redo log 写满阻塞业务。

### 监控 Checkpoint 健康度

```sql
SHOW ENGINE INNODB STATUS\G
```

关注 LOG 段三个 LSN：

```
Log sequence number  1896543210   -- redo log 当前写入位置
Log flushed up to    1896542000   -- redo log 已刷盘位置
Last checkpoint at   1896535000   -- Checkpoint 位置
```

差值含义：

| 差值 | 含义 | 风险 |
|------|------|------|
| `Log sequence number - Log flushed up to` | redo log buffer 积压 | 宕机丢这部分未刷盘 redo log |
| `Log flushed up to - Last checkpoint at` | Checkpoint 滞后量 | 恢复耗时长，redo log 可能写满 |
| `Log sequence number - Last checkpoint at` | 总滞后量 | 综合风险 |

`Log flushed up to - Last checkpoint at` 过大时，说明脏页刷盘跟不上 redo log 产生速度，可能很快写满 redo log 触发强制刷盘阻塞业务。

## 代码示例

查看 Checkpoint 相关配置：

```sql
-- 脏页比例阈值
SHOW VARIABLES LIKE 'innodb_max_dirty_pages_pct';
SHOW VARIABLES LIKE 'innodb_max_dirty_pages_pct_lwm';

-- I/O 容量
SHOW VARIABLES LIKE 'innodb_io_capacity';
SHOW VARIABLES LIKE 'innodb_io_capacity_max';

-- 自适应刷脏页
SHOW VARIABLES LIKE 'innodb_adaptive_flushing';
SHOW VARIABLES LIKE 'innodb_adaptive_flushing_lwm';

-- 邻页刷盘（机械盘开启，SSD 关闭）
SHOW VARIABLES LIKE 'innodb_flush_neighbors';
```

调优（SSD 服务器常见配置）：

```sql
-- SSD 提升 I/O 容量
SET GLOBAL innodb_io_capacity = 2000;
SET GLOBAL innodb_io_capacity_max = 4000;

-- SSD 关闭邻页刷盘
SET GLOBAL innodb_flush_neighbors = 0;

-- 适当降低脏页上限，减少峰值刷盘
SET GLOBAL innodb_max_dirty_pages_pct = 60;

-- 开启自适应刷脏页，平滑刷盘
SET GLOBAL innodb_adaptive_flushing = ON;
```

监控 Checkpoint 滞后：

```sql
-- 计算滞后量
SHOW ENGINE INNODB STATUS\G

-- 查询活跃事务和 undo log 状态
SELECT * FROM information_schema.INNODB_TRX ORDER BY trx_started LIMIT 10;
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 业务间歇性卡顿 | redo log 写满强制刷盘 | 调大 redo log 文件 |
| 恢复耗时长 | Checkpoint 滞后严重 | 调大 I/O 容量、调低脏页上限 |
| SSD 性能没发挥 | 默认 I/O 容量太小 | `innodb_io_capacity=2000+` |
| 机械盘刷盘抖动 | 邻页刷盘开销 | `innodb_flush_neighbors=1` 开启 |
| 启动后慢 | Checkpoint 滞后导致恢复慢 | 平时监控 LSN 差值 |

## 深挖追问

### 1. Checkpoint 滞后会怎样？

短期滞后无影响，长期滞后有两个风险：一是崩溃后恢复时间长（要重放大量 redo log），二是 redo log 写满时强制停下业务刷脏页，SQL 阻塞甚至分钟级卡顿。监控 `Log flushed up to - Last checkpoint at` 差值，超过 redo log 容量 70% 要告警。

### 2. redo log 写满为什么阻塞业务？

redo log 是循环写，`write pos` 追上 `checkpoint` 时无空间可写。此时 InnoDB 必须停下业务，刷脏页推进 `checkpoint`，腾出空间后才能继续。期间所有写 SQL 阻塞。解决方法是调大 redo log 文件总容量（`innodb_redo_log_capacity` 8.0.30+）。

### 3. `innodb_adaptive_flushing` 是什么？

自适应刷脏页。InnoDB 根据 redo log 产生速度自适应调整刷脏页速率，避免 Checkpoint 滞后到 redo log 写满才暴力刷。建议开启，让刷盘平滑而非突发。

### 4. Sharp Checkpoint 和 Fuzzy Checkpoint 区别？

Sharp 把所有脏页刷盘，用于正常关闭数据库；Fuzzy 只刷部分脏页，运行期间持续进行，不阻塞业务。日常说的 Checkpoint 都是 Fuzzy。

### 5. `innodb_flush_neighbors` 该怎么设？

机械硬盘寻道开销大，刷一个脏页时顺带刷相邻页能减少寻道，设为 1（默认）；SSD 无寻道问题，邻页刷盘是浪费 I/O，设为 0。生产 SSD 服务器建议设 0。

## 易错点

- 把 Checkpoint 和 redo log 搞混：Checkpoint 是刷脏页+记录 LSN，redo log 是记录修改。
- 以为 Checkpoint 越频繁越好：太频繁增加 I/O，太稀疏恢复慢、易写满 redo log。
- 不监控 LSN 差值：Checkpoint 滞后到写满 redo log 才发现已晚。
- SSD 不调 I/O 容量：默认 200 太小，SSD 浪费性能。
- 机械盘关邻页刷盘：增加寻道开销。

## 总结

Checkpoint 是 InnoDB 把脏页刷盘并记录恢复 LSN 的机制，让 redo log 可循环复用、崩溃恢复快速。触发条件包括 redo log 写满、脏页比例、定期、关闭。核心标识是 LSN，通过三个 LSN 差值监控健康度。生产中要调好 I/O 容量、脏页上限、自适应刷盘参数，避免 Checkpoint 滞后导致恢复慢或 redo log 写满阻塞业务。

## 参考资料

- [MySQL 8.0 Reference Manual: InnoDB Checkpoints](https://dev.mysql.com/doc/refman/8.0/en/innodb-checkpoints.html)
- [MySQL 8.0 Reference Manual: InnoDB Buffer Pool Flushing](https://dev.mysql.com/doc/refman/8.0/en/innodb-buffer-pool-flushing.html)

---
