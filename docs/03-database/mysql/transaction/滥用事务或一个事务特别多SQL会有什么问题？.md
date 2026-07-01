# 滥用事务或一个事务特别多 SQL 会有什么问题

## 核心概念

事务保证原子性，但不是越大越安全。事务越长，锁持有时间越长，undo log 越难清理，回滚成本越高，对并发和稳定性的伤害越大。“滥用事务”指两种典型反模式：把无关操作塞进一个事务，以及让一个事务包含大量 SQL 长时间不提交。

长事务是 MySQL 线上事故的常见根源：连接占用、锁等待、死锁、undo 膨胀、主从延迟、回滚段满，最终拖垮整个库。事务应该短小、只包含必须强一致的本地数据库操作，外部调用、耗时计算、文件处理都不要放在事务里。

## 标准回答

> 滥用事务会降低并发和稳定性。长事务持有锁时间长，导致锁等待和死锁概率上升；undo log 旧版本无法被 purge 清理，回滚段膨胀，MVCC 一致性读变慢；事务太大回滚代价高；提交慢导致主从延迟。一个事务包含大量 SQL 还会让单次提交的 binlog/redo log 体量巨大。实践上事务要短：只把必须强一致的本地数据库操作放进事务，RPC、文件 I/O、复杂计算放事务外，用消息表/Outbox 模式解耦。

## 实现原理

### 长事务的多重危害

| 维度 | 危害 | 原因 |
|------|------|------|
| 锁 | 锁等待、死锁增多 | 长时间持有行锁/间隙锁，阻塞其他事务 |
| undo log | 回滚段膨胀，磁盘涨 | 旧版本要等无 ReadView 引用才能 purge，长事务持有旧 ReadView |
| MVCC | 一致性读变慢 | 版本链变长，查询要遍历更多 undo log |
| 主从复制 | 主从延迟 | 大事务 binlog 体量大，从库回放慢 |
| 连接池 | 连接耗尽 | 事务占用连接时间长，连接池易打满 |
| 回滚 | 回滚代价高 | undo log 多，回滚耗时长，可能比执行还久 |

### undo log purge 与长事务的关系

undo log 由 purge 线程异步清理，一条 undo log 能被清理的前提是：

1. 生成它的事务已提交
2. 没有活跃的 ReadView 需要看到它

长事务持有旧 ReadView，所有比该 ReadView 更新的 undo log 都无法被 purge 清理。如果长事务跑了几小时，这几小时内所有更新产生的 undo log 都堆积在回滚段，可能导致回滚段满、磁盘告警。

### 主从延迟与单事务大小

主库提交事务时，事务的 binlog 才完整写入 binlog 文件并传给从库。一个事务无论多大多久，binlog 都是一次性发送、从库一次性回放。大事务会让从库长时间阻塞在单事务回放上，导致延迟累积。

```sql
-- 反例：一个事务更新百万行
BEGIN;
UPDATE big_table SET status = 1 WHERE create_time < '2025-01-01';
-- 执行几十分钟，期间持有大量锁，undo 暴涨，从库延迟
COMMIT;
```

## 代码示例

### 反例：事务里调远程接口

```java
@Transactional
public void createOrder(CreateOrderCmd cmd) {
    orderMapper.insert(cmd.toOrder());
    stockMapper.decrease(cmd.getSkuId(), cmd.getCount());
    // 危险：HTTP 调用在事务内，超时会一直持有数据库锁和连接
    httpClient.notifyWarehouse(cmd.getOrderId());
    mqProducer.send(new OrderEvent(cmd.getOrderId()));
}
```

### 正例：Outbox 模式解耦

```java
@Transactional
public void createOrder(CreateOrderCmd cmd) {
    // 事务内只做本地数据库操作
    orderMapper.insert(cmd.toOrder());
    stockMapper.decrease(cmd.getSkuId(), cmd.getCount());
    // 把"要发的消息"写到 Outbox 表，与业务数据在同一个事务提交
    outboxMapper.insert(new OutboxEvent("ORDER_CREATED", cmd.getOrderId()));
}

// 事务外异步扫描 Outbox 表，发送 MQ 或调外部接口
// 失败可重试，不影响数据库事务
```

### 大批量更新分批提交

```java
public void batchUpdate() {
    int maxId = 0;
    while (true) {
        List<Long> ids = mapper.selectIdsGreaterThan(maxId, 1000);  // 每批 1000 行
        if (ids.isEmpty()) break;
        mapper.updateBatch(ids);  // 每批一个事务
        maxId = ids.get(ids.size() - 1);
        sleep(100);  // 短暂停顿，给从库追上的时间
    }
}
```

## 实战场景

| 场景 | 反模式 | 正确做法 |
|------|--------|---------|
| 下单 + 发消息 | 事务内调 MQ | Outbox 表，事务外异步发 |
| 批量数据迁移 | 一个大事务 | 按主键分批，每批独立事务 |
| 调外部系统 | 事务内 HTTP 调用 | 本地状态机 + 异步补偿 |
| 复杂计算 | 事务内做计算 | 计算放事务外，事务只写结果 |
| 长报表 | 事务内多次查询 | 拆成短查询或单独走从库 |

## 深挖追问

### 1. 为什么不能在事务里调用 RPC？

RPC 耗时和成功率不可控。一次 30 秒超时的 RPC，会让数据库事务持有锁和连接 30 秒。高并发下连接池瞬间打满、锁等待链式堆积。正确做法是本地事务先提交，再用消息或任务表驱动外部动作，失败可重试。

### 2. 大事务怎么发现？

查 `information_schema.innodb_trx`，关注 `trx_started`、`trx_rows_modified`、`trx_query`：

```sql
SELECT trx_id, trx_started, trx_rows_modified, trx_query
FROM information_schema.innodb_trx
ORDER BY trx_started ASC
LIMIT 10;
```

`trx_started` 早于当前时间 30 秒以上的，大概率是长事务。

### 3. 大批量更新怎么做？

按主键范围或时间窗口分批，每批限制行数（如 1000），每批独立事务提交后短暂 sleep，配合幂等标记和进度记录。这样既控制了单事务大小，又给从库追上的时间，避免延迟累积。

### 4. 数据库事务能解决分布式一致性吗？

不能。数据库事务只保证单库内的 ACID。跨库、跨服务要用分布式事务（XA、TCC、Saga、本地消息表），但分布式事务性能差、复杂度高，实践中通常用“最终一致 + 补偿”替代强一致。

### 5. Spring `@Transactional` 默认回滚什么异常？

默认只回滚 `RuntimeException` 和 `Error`，不回滚 checked exception。要用 `@Transactional(rollbackFor = Exception.class)` 显式指定回滚所有异常，否则业务异常会导致事务不回滚、数据不一致。

## 易错点

- 事务里调 HTTP/RPC：超时拖垮连接池和锁。
- 一个事务更新百万行：undo 膨胀、主从延迟。
- `@Transactional` 不指定 rollbackFor：checked exception 不回滚。
- 事务方法内部调用同类方法：Spring AOP 代理失效，事务不生效。
- 把“业务事务”和“数据库事务”画等号：业务可能跨服务，需要补偿机制。

## 总结

事务要短小精悍，只包含必须强一致的本地数据库操作。长事务会引发锁等待、undo 膨胀、MVCC 慢、主从延迟、连接占用五大问题。RPC、文件 I/O、复杂计算都应放事务外，用 Outbox 或本地消息表解耦。大批量操作分批提交。监控 `innodb_trx` 及时发现长事务。跨服务一致性靠补偿而非大事务。

## 参考资料

- [MySQL 8.0 Reference Manual: InnoDB Transaction Management](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-model.html)
- [Spring Framework: Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction.html)

---
