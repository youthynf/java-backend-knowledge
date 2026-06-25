# 秒杀系统设计

## 核心概念

秒杀系统的核心矛盾是瞬时高并发、库存有限和用户体验之间的平衡。设计目标不是让所有请求都打到数据库，而是在入口层削峰、在缓存层快速判断、在队列中异步排队、在数据库中做最终一致扣减。

典型链路包括：活动预热、静态资源 CDN、网关限流、登录和风控、Redis 预扣库存、消息队列削峰、订单服务异步创建、数据库乐观扣减、超时未支付回补库存。

## 面试官想考什么

- 是否能从入口、缓存、队列、数据库全链路设计；
- 是否理解防超卖、防重复下单、削峰填谷；
- 是否能说明 Redis 扣库存和数据库最终一致；
- 是否考虑限流、风控、降级、监控和补偿。

## 标准回答

> 秒杀系统要把大部分请求挡在数据库之前。入口做验证码、风控、限流和静态化；活动开始前把库存预热到 Redis；用户请求先用 Lua 原子判断库存和是否重复购买，成功后写入 MQ；订单服务异步消费创建订单，并用数据库条件更新保证不超卖；支付超时后取消订单并回补库存。整个链路要有幂等、补偿、监控和降级。

## 深挖追问

### 如何防止超卖？

Redis 侧用 Lua 保证“判断库存、扣减库存、记录用户购买”原子执行；数据库侧用 `UPDATE stock SET stock = stock - 1 WHERE sku_id = ? AND stock > 0` 做最终防线。任何一层都不能只靠先查再改。

### 如何防止重复下单？

Redis 用 `set` 或用户维度 key 记录已抢购，数据库建立 `UNIQUE(user_id, activity_id, sku_id)` 唯一索引，消费者幂等处理 MQ 重复消息。

## 实战场景 / 代码示例

Redis Lua 预扣：

```lua
local stockKey = KEYS[1]
local userKey = KEYS[2]
local userId = ARGV[1]
if redis.call('SISMEMBER', userKey, userId) == 1 then
  return -2
end
local stock = tonumber(redis.call('GET', stockKey) or '0')
if stock <= 0 then
  return -1
end
redis.call('DECR', stockKey)
redis.call('SADD', userKey, userId)
return 1
```

数据库最终扣减：

```sql
UPDATE seckill_stock
SET stock = stock - 1
WHERE sku_id = ? AND stock > 0;
```

## 易错点 / 总结

- 秒杀不要让请求直接打数据库；
- 缓存扣减和数据库扣减都要原子；
- MQ 消费必须幂等，防止重复创建订单；
- 库存回补要处理取消、超时未支付、消费失败；
- 热点活动要提前压测，准备限流和降级预案。
