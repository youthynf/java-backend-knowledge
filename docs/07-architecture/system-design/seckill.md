# 秒杀系统设计

> 高并发场景典型系统，核心问题：防超卖、高并发、防刷

## 场景描述

- **典型场景**：双11秒杀、限时抢购、票务系统
- **核心特点**：
  - 流量突增（平时100 QPS，秒杀时10000+ QPS）
  - 库存有限（几千件商品，几十万人抢）
  - 时间窗口短（几秒到几分钟）

---

## 需求分析

### 功能需求

1. 秒杀商品展示
2. 用户下单购买
3. 库存扣减
4. 订单创建
5. 支付

### 非功能需求

| 指标 | 目标 |
|------|------|
| QPS | 10000+ |
| 响应时间 | < 100ms |
| 可用性 | 99.99% |
| 数据一致性 | 不超卖、不少卖 |

---

## 容量估算

```
假设：
- 日活用户：100万
- 秒杀参与率：50%
- 秒杀时长：10分钟
- 峰值系数：10

平均 QPS = 100万 × 50% ÷ (10 × 60) ≈ 830 QPS
峰值 QPS = 830 × 10 ≈ 8300 QPS

实际按 10000 QPS 设计
```

---

## 系统架构

### 整体架构

```
┌──────────────┐
│   客户端      │
└──────┬───────┘
       │
       ↓
┌──────────────┐      ┌──────────────┐
│   CDN/静态   │─────→│  静态资源    │
└──────┬───────┘      └──────────────┘
       │
       ↓
┌──────────────┐
│   网关层      │ ← 限流、鉴权
└──────┬───────┘
       │
       ↓
┌──────────────┐      ┌──────────────┐
│   应用服务   │─────→│   Redis      │ ← 库存预扣减
└──────┬───────┘      └──────────────┘
       │
       ↓
┌──────────────┐      ┌──────────────┐
│   消息队列   │─────→│   消费者     │
└──────────────┘      └──────┬───────┘
                             │
                             ↓
                      ┌──────────────┐
                      │   MySQL      │ ← 订单落库
                      └──────────────┘
```

### 架构分层

1. **客户端层**：App、H5、小程序
2. **CDN层**：静态资源加速
3. **网关层**：限流、鉴权、路由
4. **应用层**：业务逻辑
5. **缓存层**：Redis 缓存库存
6. **消息层**：削峰填谷
7. **数据层**：MySQL 持久化

---

## 核心难点与解决方案

### 1. 防止超卖

**问题**：库存只有100，但有1000人买到

**方案一：Redis 原子操作**

```java
// Lua 脚本保证原子性
String luaScript = """
    if redis.call('get', KEYS[1]) <= 0 then
        return 0
    end
    redis.call('decr', KEYS[1])
    return 1
    """;

Long result = redisTemplate.execute(
    new DefaultRedisScript<>(luaScript, Long.class),
    Collections.singletonList("stock:" + productId)
);

if (result == 1) {
    // 扣减成功，创建订单
} else {
    // 库存不足
}
```

**方案二：数据库乐观锁**

```sql
UPDATE product 
SET stock = stock - 1 
WHERE id = ? AND stock > 0;
```

**方案三：分布式锁 + Redis**

```java
String lockKey = "lock:product:" + productId;
boolean locked = redisTemplate.opsForValue()
    .setIfAbsent(lockKey, "1", 10, TimeUnit.SECONDS);

if (locked) {
    try {
        int stock = redisTemplate.opsForValue().get("stock:" + productId);
        if (stock > 0) {
            redisTemplate.opsForValue().decrement("stock:" + productId);
            // 创建订单
        }
    } finally {
        redisTemplate.delete(lockKey);
    }
}
```

**推荐方案：Redis 原子操作 + 数据库兜底**

---

### 2. 高并发压力

**问题**：瞬间大量请求压垮系统

**方案一：多级缓存**

```
请求 → 本地缓存 → Redis → MySQL
        (热点数据)  (库存)   (兜底)
```

**方案二：CDN 加速**

静态资源（商品详情页）部署到 CDN：

```nginx
location ~* \.(html|css|js|png|jpg)$ {
    expires 7d;
    add_header Cache-Control "public, immutable";
}
```

**方案三：页面静态化 + 动态加载**

```
秒杀页面：
- 静态部分：商品图片、描述 → CDN
- 动态部分：库存、倒计时 → Ajax 轮询
```

**方案四：限流**

```java
// 令牌桶限流
RateLimiter rateLimiter = RateLimiter.create(1000);  // 1000 QPS

if (rateLimiter.tryAcquire()) {
    // 处理请求
} else {
    // 返回"系统繁忙"
}
```

---

### 3. 削峰填谷

**问题**：瞬间流量太大，数据库扛不住

**方案：消息队列异步处理**

```java
// 秒杀入口：只做 Redis 扣减，发送 MQ 消息
public Result seckill(Long productId, Long userId) {
    // 1. Redis 原子扣减库存
    Long stock = redisTemplate.opsForValue().decrement("stock:" + productId);
    
    if (stock < 0) {
        redisTemplate.opsForValue().increment("stock:" + productId);
        return Result.fail("库存不足");
    }
    
    // 2. 发送消息到 MQ（异步创建订单）
    OrderMessage message = new OrderMessage(productId, userId);
    rocketMQTemplate.asyncSend("order-topic", message, new SendCallback() {
        @Override
        public void onSuccess(SendResult result) {
            log.info("消息发送成功");
        }
        
        @Override
        public void onException(Throwable e) {
            log.error("消息发送失败", e);
            // 回滚库存
            redisTemplate.opsForValue().increment("stock:" + productId);
        }
    });
    
    return Result.success("排队中，请稍后查询结果");
}

// 消费者：创建订单
@RocketMQMessageListener(topic = "order-topic", consumerGroup = "order-group")
public class OrderConsumer implements RocketMQListener<OrderMessage> {
    @Override
    public void onMessage(OrderMessage message) {
        // 创建订单
        orderService.createOrder(message.getProductId(), message.getUserId());
    }
}
```

**优点：**
- 秒杀入口快速返回
- 数据库按自己的节奏处理
- 流量平滑

---

### 4. 防刷机制

**问题**：黄牛、机器刷单

**方案一：验证码**

```java
// 秒杀前必须验证码
public Result seckill(Long productId, Long userId, String captcha) {
    if (!captchaService.verify(userId, captcha)) {
        return Result.fail("验证码错误");
    }
    // ...
}
```

**方案二：用户限流**

```java
// 同一用户限制请求频率
String key = "limit:user:" + userId;
Long count = redisTemplate.opsForValue().increment(key);

if (count == 1) {
    redisTemplate.expire(key, 1, TimeUnit.SECONDS);
}

if (count > 5) {  // 每秒最多5次
    return Result.fail("请求过于频繁");
}
```

**方案三：IP 限流**

```java
// 同一 IP 限制
String key = "limit:ip:" + ip;
// 类似用户限流
```

**方案四：隐藏秒杀地址**

```java
// 秒杀前先获取动态路径
@GetMapping("/seckill/path")
public String getSeckillPath(Long productId, Long userId) {
    // 验证用户资格
    if (!checkUserQualification(userId)) {
        return null;
    }
    // 生成随机路径
    String randomPath = UUID.randomUUID().toString();
    // 缓存路径
    redisTemplate.opsForValue().set(
        "seckill:path:" + randomPath, 
        productId + ":" + userId, 
        10, TimeUnit.SECONDS
    );
    return randomPath;
}

// 秒杀时验证路径
@PostMapping("/seckill/{path}")
public Result seckill(@PathVariable String path, Long productId, Long userId) {
    String value = redisTemplate.opsForValue().get("seckill:path:" + path);
    if (value == null || !value.equals(productId + ":" + userId)) {
        return Result.fail("非法请求");
    }
    // 执行秒杀...
}
```

---

### 5. 数据一致性

**问题**：Redis 扣减成功但订单创建失败

**方案：消息队列 + 重试 + 补偿**

```java
// 消费者处理
@Transactional
public void createOrder(OrderMessage message) {
    try {
        // 1. 创建订单
        Order order = new Order();
        order.setProductId(message.getProductId());
        order.setUserId(message.getUserId());
        orderMapper.insert(order);
        
        //