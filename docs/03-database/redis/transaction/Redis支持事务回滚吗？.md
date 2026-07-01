# Redis 支持事务回滚吗

## 核心概念

Redis 提供了 `MULTI`/`EXEC`/`DISCARD`/`WATCH` 等事务命令，能将多条命令"打包"顺序执行，但**不支持关系型数据库那种事务回滚（ROLLBACK）**。命令入队时若发生语法错误，整个事务会被丢弃；但若命令入队成功后在 EXEC 阶段执行出错（如对 String 类型执行 LPUSH），出错命令跳过，其他命令仍会执行。

一句话结论：**Redis 事务没有回滚机制。命令入队时的语法错误会丢弃整个事务；执行时的运行时错误不会回滚已执行命令，也不会阻止后续命令。需要原子性保证时用 Lua 脚本替代。**

## 标准回答

| 特性 | Redis 事务 | MySQL 事务 |
|------|------------|------------|
| 原子性 | 不保证（执行时出错不回滚） | 保证 |
| 隔离性 | 单线程串行，无隔离级别 | 多级隔离 |
| 持久性 | 取决于持久化配置 | 保证（redo log） |
| 回滚 | 不支持 | 支持 ROLLBACK |
| 命令格式 | MULTI ... EXEC | BEGIN ... COMMIT/ROLLBACK |
| 条件分支 | 不支持 | 不支持（但可写存储过程） |

Redis 事务能做的：

- **保证命令顺序执行**：EXEC 之前的命令不会插队；
- **保证不被打断**：事务执行期间其他客户端命令需等待；
- **配合 WATCH 实现乐观锁**。

Redis 事务做不到的：

- **不支持回滚**：执行出错不会回滚已执行命令；
- **不支持部分失败处理**：错误命令跳过，其他继续；
- **不支持隔离级别**：没有脏读/不可重复读等概念；
- **不支持条件分支**：事务内不能 if/else。

## 详细机制

### 1. 事务基本流程

```text
MULTI        → 开启事务，后续命令入队
SET k1 v1    → 入队（不立即执行）
INCR k2      → 入队
EXEC         → 一次性按顺序执行所有入队命令，返回每条结果
```

```bash
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> SET foo bar
QUEUED
127.0.0.1:6379> INCR counter
QUEUED
127.0.0.1:6379> EXEC
1) OK
2) (integer) 1
```

`DISCARD` 取消事务，清空命令队列：

```bash
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> SET foo bar
QUEUED
127.0.0.1:6379> DISCARD
OK
```

### 2. 两类错误的处理

#### 错误一：命令入队时语法错误

如果命令本身有语法错误（如命令名拼写错、参数个数不对），Redis 在入队时就报错，**EXEC 时整个事务被丢弃，所有命令都不执行**。

```bash
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> SET foo bar
QUEUED
127.0.0.1:6379> WRONGCOMMAND foo
(error) ERR unknown command 'WRONGCOMMAND'
127.0.0.1:6379> SET baz qux
QUEUED
127.0.0.1:6379> EXEC
(error) EXECABORT Transaction discarded because of previous errors.
```

#### 错误二：命令执行时运行时错误

命令入队成功，但 EXEC 执行时出错（如对 String 类型执行 LPUSH），**出错命令跳过，其他命令正常执行，不会回滚**。

```bash
127.0.0.1:6379> SET foo bar
OK
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> INCR foo     # 入队成功（foo 是 String）
QUEUED
127.0.0.1:6379> SET baz qux
QUEUED
127.0.0.1:6379> EXEC
1) (error) ERR value is not an integer or out of range
2) OK
127.0.0.1:6379> GET baz
"qux"   # 尽管第一条出错，第二条仍执行
```

### 3. 为什么 Redis 不支持回滚

Redis 作者 antirez 的解释：

1. **错误多来自编程错误**：命令类型不匹配、参数错误等，这类错误应出现在开发阶段，生产环境很少触发；
2. **回滚与 Redis 设计哲学冲突**：Redis 追求简单高效，回滚机制（如 undo log）会增加复杂度和性能开销；
3. **不影响 Redis 命令的内部一致性**：单条 Redis 命令本身是原子的，事务出错只影响"事务内多命令"的协同，而这种情况可以通过测试避免。

### 4. WATCH 乐观锁

`WATCH key [key ...]` 监视一个或多个 key，如果在 EXEC 执行前这些 key 被其他客户端修改，整个事务被放弃（EXEC 返回 nil）。

```bash
# 客户端 A
127.0.0.1:6379> SET stock 10
OK
127.0.0.1:6379> WATCH stock
OK
127.0.0.1:6379> MULTI
OK
127.0.0.1:6379> DECR stock
QUEUED

# 此时客户端 B 执行 SET stock 5

127.0.0.1:6379> EXEC
(nil)   # 事务被放弃，因为 stock 被修改
```

WATCH 实现的是 **CAS（Compare-And-Swap）乐观锁**，适合"读 - 改 - 写"场景。失败后业务需重试。

## 代码示例

### Java（Jedis）事务示例

```java
public boolean deductStock(String key, int count) {
    jedis.watch(key);
    String val = jedis.get(key);
    int stock = Integer.parseInt(val);
    if (stock < count) {
        jedis.unwatch();
        return false;
    }
    Transaction tx = jedis.multi();
    tx.decrBy(key, count);
    List<Object> result = tx.exec();
    if (result == null || result.isEmpty()) {
        return false;  // WATCH 触发，需重试
    }
    return true;
}
```

### Lua 脚本实现真正的原子性（推荐替代方案）

```lua
-- deduct_stock.lua
local stock = tonumber(redis.call('GET', KEYS[1]))
local count = tonumber(ARGV[1])
if stock >= count then
    redis.call('DECRBY', KEYS[1], count)
    return 1
else
    return 0
end
```

```bash
redis-cli --eval deduct_stock.lua stock:1001 , 1
```

### Spring Data Redis 事务

```java
redisTemplate.setEnableTransactionSupport(true);
redisTemplate.multi();
redisTemplate.opsForValue().set("k1", "v1");
redisTemplate.opsForValue().increment("counter");
redisTemplate.exec();
```

注意：Spring Data Redis 的事务支持有限，复杂场景建议直接用 Lua 或 `redisTemplate.executePipelined`。

## 实战场景

| 场景 | 方案 | 注意点 |
|------|------|--------|
| 转账（扣减 + 增加） | Lua 脚本 | 事务无法保证原子 |
| 库存扣减 | WATCH + MULTI | 失败重试，热点 key 性能差 |
| 批量写入 | MULTI/EXEC | 减少网络 RTT，但 Pipeline 更优 |
| 计数器累加 | 单条 INCR | 本身原子，无需事务 |
| 复杂业务判断 + 多操作 | Lua 脚本 | 推荐 |
| 配置批量更新 | MULTI/EXEC | 简单场景可用 |

## 深挖追问

### Redis 事务有原子性吗？

严格说没有。Redis 事务只保证"命令不被插队"和"顺序执行"，但不保证"全部成功或全部失败"。如果执行时某条出错，其他仍执行。所以**Redis 事务不满足 ACID 的原子性**。

### WATCH 失败后怎么办？

业务需捕获 EXEC 返回 nil 的情况，重新 WATCH + 重试。注意设置最大重试次数，避免无限循环。

### 事务过程中 Redis 宕机怎么办？

事务期间 Redis 宕机：

- 如果是 EXEC 之前宕机，事务未执行，无影响；
- 如果是 EXEC 期间宕机，已执行命令的持久化由 RDB/AOF 处理，可能部分丢失；
- 如果是 EXEC 之后宕机，所有命令已执行，AOF 持久化保证（最多丢 1 秒）。

### Cluster 模式下事务能用吗？

Cluster 模式下，事务内的命令必须操作同一个 hash slot 的 key（通常用 hash tag `{tag}` 强制同槽）。跨槽事务会报错 `CROSSSLOT`。

```bash
# 用 hash tag 保证同槽
MSET {user1001}.name "Alice" {user1001}.age 30
```

### Lua 脚本和事务哪个更好？

Lua 脚本：

- 真正原子（执行中不被打断）；
- 支持条件判断；
- 推荐用于复杂业务。

事务：

- 简单顺序执行；
- 配合 WATCH 做乐观锁；
- 不支持中间判断。

绝大多数场景 Lua 更优。

### DISCARD 和 ROLLBACK 一样吗？

不一样。DISCARD 只是清空命令队列、退出事务状态，不撤销已执行的命令（因为命令还没真正执行）。MySQL 的 ROLLBACK 是撤销已执行的修改。

### Redis 事务的隔离性如何？

Redis 事务的隔离性是天然满足的：EXEC 期间 Redis 单线程处理，其他客户端命令必须等待。但没有"隔离级别"概念，没有脏读、不可重复读等。

## 易错点

- 误以为 Redis 事务支持回滚；
- 命令执行错误不处理，导致数据不一致；
- WATCH 后忘了 EXEC 或 UNWATCH，事务被挂起；
- Cluster 模式跨槽使用事务报错；
- 把事务当原子操作，做转账等关键业务；
- 在事务内执行 WATCH/UNWATCH（这两个命令不能入队）；
- 嵌套 MULTI（Redis 不支持嵌套事务）。

## 总结

Redis 事务是"**命令打包顺序执行**"，不是 ACID 事务。**不支持回滚是核心限制**，执行时错误不撤销已执行命令。生产场景需要原子性时优先用 **Lua 脚本**：它真正原子，能做条件判断，更适合多步业务逻辑。事务主要适用于"减少 RTT"和"配合 WATCH 实现乐观锁"。

## 参考资料

- [Redis 官方文档：Transactions](https://redis.io/docs/interact/transactions/)
- [Redis Transactions FAQ - antirez](https://redis.io/docs/interact/transactions/#why-redis-does-not-support-roll-backs)

---
