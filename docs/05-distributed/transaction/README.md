# 分布式事务

## 核心概念

### 什么是分布式事务

分布式事务是指事务的参与者、支持事务的服务器、资源服务器以及事务管理器分别位于不同的分布式系统的不同节点之上。需要保证跨节点的数据一致性。

### CAP 理论与 BASE 理论

**CAP 定理**：
- **Consistency（一致性）**：所有节点在同一时间看到相同的数据
- **Availability（可用性）**：每个请求都能在合理时间内得到响应
- **Partition Tolerance（分区容错性**：网络分区时系统仍能运行

**结论**：在分布式系统中，CAP 三者不可兼得，一般选择 AP 或 CP。

**BASE 理论**：
- **Basically Available（基本可用）**：允许损失部分可用性
- **Soft State（软状态）**：允许中间状态存在
- **Eventually Consistent（最终一致性）**：最终达到一致状态

## 分布式事务解决方案

### 1. 2PC（两阶段提交）

**原理**：
```
协调者                          参与者A        参与者B
   |                              |              |
   |---Prepare请求------------->|              |
   |                              |---Prepare--->|
   |                              |<--Ready------|
   |<---Ready响应----------------|              |
   |                              |              |
   |---Commit请求--------------->|              |
   |                              |---Commit---->|
   |                              |<--Done-------|
   |<---Done响应-----------------|              |
```

**两阶段**：
1. **Prepare 阶段**：协调者询问所有参与者是否可以提交
2. **Commit/Rollback 阶段**：所有参与者同意则提交，任一拒绝则回滚

**优点**：
- 强一致性，实现简单

**缺点**：
- **同步阻塞**：所有参与者阻塞等待
- **单点故障**：协调者宕机导致阻塞
- **数据不一致**：Commit 阶段部分失败导致不一致

### 2. 3PC（三阶段提交）

**三个阶段**：
1. **CanCommit**：询问是否可以执行事务
2. **PreCommit**：预执行事务
3. **DoCommit**：正式提交

**改进点**：
- 增加超时机制，减少阻塞
- 引入 PreCommit 阶段，降低阻塞范围

**缺点**：
- 仍可能数据不一致
- 网络开销更大

### 3. TCC（Try-Confirm-Cancel）

**核心思想**：将业务逻辑拆分为三个阶段：

```java
// Try：尝试执行，完成业务检查，预留资源
public boolean try(TransactionDTO dto) {
    // 冻结资金
    accountService.freeze(dto.getUserId(), dto.getAmount());
    return true;
}

// Confirm：确认执行，真正执行业务
public boolean confirm(TransactionDTO dto) {
    // 扣减冻结资金
    accountService.deduct(dto.getUserId(), dto.getAmount());
    return true;
}

// Cancel：取消执行，释放预留资源
public boolean cancel(TransactionDTO dto) {
    // 解冻资金
    accountService.unfreeze(dto.getUserId(), dto.getAmount());
    return true;
}
```

**特点**：
- **业务侵入性强**：需要编写三个接口
- **性能好**：锁粒度小，不阻塞整个资源
- **最终一致性**：适合对一致性要求不高的场景

**注意事项**：
- 幂等性设计：Confirm/Cancel 可能重复调用
- 空回滚：Try 未执行但 Cancel 被调用
- 悬挂：Cancel 比 Try 先执行

### 4. 本地消息表

**原理**：
```sql
-- 本地消息表
CREATE TABLE local_message (
    id BIGINT PRIMARY KEY,
    transaction_id VARCHAR(64),
    content TEXT,
    status TINYINT,  -- 0:待发送 1:已发送 2:已消费
    create_time DATETIME,
    INDEX idx_status (status)
);
```

**流程**：
1. 本地事务执行业务操作 + 写入消息表
2. 定时任务扫描消息表，发送 MQ
3. 消费者处理消息，更新状态

**优点**：
- 实现简单，可靠性高
- 不依赖第三方框架

### 5. 事务消息（RocketMQ）

**流程**：
```
生产者                          Broker                消费者
   |                              |                      |
   |---发送半消息--------------->|                      |
   |<---返回半消息ID------------|                      |
   |                              |                      |
   |---执行本地事务             |                      |
   |                              |                      |
   |---提交/回滚消息------------>|                      |
   |                              |---投递消息-------->|
   |                              |                  执行业务
   |                              |<---确认消费-------|
```

**代码示例**：
```java
// 发送事务消息
TransactionSendResult result = producer.sendMessageInTransaction(msg, null);

// 本地事务执行器
public class TransactionListenerImpl implements TransactionListener {
    @Override
    public LocalTransactionState executeLocalTransaction(Message msg, Object arg) {
        try {
            // 执行本地事务
            orderService.createOrder(msg.getBody());
            return LocalTransactionState.COMMIT_MESSAGE;
        } catch (Exception e) {
            return LocalTransactionState.ROLLBACK_MESSAGE;
        }
    }
    
    @Override
    public LocalTransactionState checkLocalTransaction(MessageExt msg) {
        // 事务回查
        boolean success = orderService.checkOrder(msg.getKeys());
        return success ? LocalTransactionState.COMMIT_MESSAGE 
                       : LocalTransactionState.ROLLBACK_MESSAGE;
    }
}
```

### 6. Seata 框架

**四种模式**：

| 模式 | 一致性 | 性能 | 侵入性 | 适用场景 |
|------|--------|------|--------|----------|
| AT | 最终一致 | 高 | 无 | 大多数场景 |
| TCC | 最终一致 | 高 | 强 | 高性能要求 |
| Saga | 最终一致 | 中 | 中 | 长事务 |
| XA | 强一致 | 低 | 无 | 传统数据库 |

**AT 模式原理**：
```
一阶段：
1. 解析 SQL，记录前镜像
2. 执行业务 SQL
3. 记录后镜像
4. 生成 undo_log 并保存

二阶段：
- Commit：异步删除 undo_log
- Rollback：根据 undo_log 反向生成 SQL 还原数据
```

**Seata AT 示例**：
```java
@GlobalTransactional
public void purchase(String userId, String commodityCode, int count) {
    // 扣减库存
    storageService.deduct(commodityCode, count);
    // 扣减余额
    accountService.debit(userId, count * 100);
    // 生成订单
    orderService.create(userId, commodityCode, count);
}
```

## 面试高频问题

### 1. 分布式事务有哪些解决方案？各有什么优缺点？

**参考回答**：
- **2PC**：强一致，但阻塞严重，单点故障风险
- **TCC**：性能好，但业务侵入性强
- **本地消息表**：实现简单，但需要定时任务轮询
- **事务消息**：可靠性高，适合异步场景
- **Seata**：开箱即用，AT 模式无侵入

### 2. 什么场景用 TCC？什么场景用事务消息？

**参考回答**：
- **TCC**：同步调用，需要立即返回结果，如转账、支付
- **事务消息**：异步场景，允许延迟处理，如订单创建后发积分

### 3. Seata AT 模式如何实现回滚？

**参考回答**：
通过 undo_log 记录数据的前后镜像，回滚时用前镜像覆盖当前数据。同时有全局锁机制防止脏写。

### 4. 如何保证消息消费的幂等性？

**参考回答**：
1. 业务层幂等：唯一业务 ID 去重
2. 数据库唯一约束
3. Redis setnx + 过期时间
4. 状态机：只处理特定状态的消息

```java
// 幂等性示例
if (redis.setnx("order:consume:" + orderId, "1", "1h")) {
    // 首次消费，执行业务
    processOrder(orderId);
} else {
    // 已消费，直接确认
    log.info("订单已消费: {}", orderId);
}
```

## 实战场景

### 场景1：电商下单

**问题**：下单需要扣库存、扣余额、创建订单，跨三个服务

**方案**：Seata AT 模式
- 简单无侵入
- 最终一致性可接受
- 性能满足需求

### 场景2：转账

**问题**：跨行转账，需保证两边账户一致性

**方案**：TCC
- Try：冻结转出金额
- Confirm：扣减转出，增加转入
- Cancel：解冻转出金额

### 场景3：订单支付成功后发积分

**问题**：支付成功后发放积分，允许短暂延迟

**方案**：RocketMQ 事务消息
- 本地事务：更新订单状态为已支付
- 异步消费：发放积分
- 失败重试：利用消息重试机制

## 延伸思考

1. **分布式事务和分布式锁有什么区别？**
   - 分布式事务：保证跨服务数据一致性
   - 分布式锁：保证跨服务资源互斥访问

2. **为什么分布式系统不能同时满足 CAP？**
   - 网络分区必然存在（P 必选）
   - 分区时，选择一致性（C）则部分节点不可用（牺牲 A）
   - 选择可用性（A）则各节点数据可能不一致（牺牲 C）

3. **Saga 模式是什么？**
   - 长事务解决方案
   - 每个本地事务有对应的补偿事务
   - 失败时逆向执行补偿操作

## 参考资料

- [Seata 官方文档](https://seata.io/zh-cn/docs/overview/what-is-seata.html)
- [RocketMQ 事务消息](https://rocketmq.apache.org/docs/transactionMessage/)
- [分布式事务解决方案总结](https://segmentfault.com/a/1190000040321760)
