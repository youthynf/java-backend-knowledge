# RocketMQ

## 核心概念

### 架构组件

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RocketMQ 架构                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌────────────┐         ┌────────────┐         ┌────────────┐         │
│   │  Producer  │         │  Producer  │         │  Producer  │         │
│   │  生产者     │         │  生产者     │         │  生产者     │         │
│   └──────┬─────┘         └──────┬─────┘         └──────┬─────┘         │
│          │                      │                      │                │
│          └──────────────────────┼──────────────────────┘                │
│                                 ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                        NameServer                                │   │
│   │               路由注册中心（轻量级注册中心）                        │   │
│   │                                                                 │   │
│   │   - Broker 路由信息                                              │   │
│   │   - Topic 路由信息                                               │   │
│   │   - 无状态，可集群部署                                            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                 │                                       │
│          ┌──────────────────────┼──────────────────────┐                │
│          ▼                      ▼                      ▼                │
│   ┌────────────┐         ┌────────────┐         ┌────────────┐         │
│   │   Broker   │◀───────▶│   Broker   │◀───────▶│   Broker   │         │
│   │  Master-A  │  同步    │  Master-B  │  同步    │  Master-C  │         │
│   │            │         │            │         │            │         │
│   │   Broker   │         │   Broker   │         │   Broker   │         │
│   │  Slave-A   │         │  Slave-B   │         │  Slave-C   │         │
│   └──────┬─────┘         └──────┬─────┘         └──────┬─────┘         │
│          │                      │                      │                │
│          └──────────────────────┼──────────────────────┘                │
│                                 ▼                                       │
│   ┌────────────┐         ┌────────────┐         ┌────────────┐         │
│   │  Consumer  │         │  Consumer  │         │  Consumer  │         │
│   │  消费者     │         │  消费者     │         │  消费者     │         │
│   │  (Group A) │         │  (Group B) │         │  (Group C) │         │
│   └────────────┘         └────────────┘         └────────────┘         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**核心组件**：

| 组件 | 作用 |
|------|------|
| NameServer | 路由注册中心，管理 Broker 和 Topic 路由信息 |
| Broker | 消息服务器，负责存储和转发消息 |
| Producer | 消息生产者，发送消息的应用 |
| Consumer | 消息消费者，接收消息的应用 |
| Topic | 消息主题，消息的第一级分类 |
| Queue | 消息队列，消息的第二级分类 |

### 消息模型

```
┌─────────────────────────────────────────────────────────────────┐
│                          Topic: Order                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Queue 0        Queue 1        Queue 2        Queue 3          │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐         │
│  │ Message │   │ Message │   │ Message │   │ Message │         │
│  │  0      │   │  1      │   │  2      │   │  3      │         │
│  │ Message │   │ Message │   │ Message │   │ Message │         │
│  │  4      │   │  5      │   │  6      │   │  7      │         │
│  │  ...    │   │  ...    │   │  ...    │   │  ...    │         │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘         │
│       ↑              ↑             ↑             ↑               │
│       │              │             │             │               │
│   Consumer 0     Consumer 1    Consumer 2    Consumer 3         │
│   (Group A)      (Group A)     (Group A)     (Group A)          │
│                                                                  │
│   一个 Topic 下有多个 Queue，Queue 是消息分区的最小单位            │
│   同一 Consumer Group 内的消费者平均分配 Queue                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 消息发送

### 发送方式

```java
// 1. 同步发送
public SendResult sendSync(Message msg) throws Exception {
    DefaultMQProducer producer = new DefaultMQProducer("producer-group");
    producer.setNamesrvAddr("localhost:9876");
    producer.start();
    
    Message message = new Message("TopicTest", "TagA", "Hello RocketMQ".getBytes());
    SendResult result = producer.send(message);
    
    // result.getSendStatus() - SEND_OK, FLUSH_DISK_TIMEOUT, FLUSH_SLAVE_TIMEOUT, SLAVE_NOT_AVAILABLE
    // result.getMsgId() - 消息ID
    // result.getMessageQueue() - 队列信息
    
    producer.shutdown();
    return result;
}

// 2. 异步发送
public void sendAsync(Message msg) throws Exception {
    DefaultMQProducer producer = new DefaultMQProducer("producer-group");
    producer.setNamesrvAddr("localhost:9876");
    producer.start();
    
    Message message = new Message("TopicTest", "TagA", "Hello RocketMQ".getBytes());
    producer.send(message, new SendCallback() {
        @Override
        public void onSuccess(SendResult sendResult) {
            System.out.println("发送成功: " + sendResult.getMsgId());
        }
        
        @Override
        public void onException(Throwable e) {
            System.err.println("发送失败: " + e.getMessage());
        }
    });
    
    // 异步发送，主线程不阻塞
    Thread.sleep(1000);  // 等待回调
    producer.shutdown();
}

// 3. 单向发送（不关心结果）
public void sendOneway(Message msg) throws Exception {
    DefaultMQProducer producer = new DefaultMQProducer("producer-group");
    producer.setNamesrvAddr("localhost:9876");
    producer.start();
    
    Message message = new Message("TopicTest", "TagA", "Hello RocketMQ".getBytes());
    producer.sendOneway(message);  // 不等待响应
    
    producer.shutdown();
}
```

### 消息选择器

```java
// 1. 顺序消息 - 根据业务 Key 选择队列
Message message = new Message("TopicTest", "TagA", "orderId", "Hello".getBytes());
SendResult result = producer.send(message, new MessageQueueSelector() {
    @Override
    public MessageQueue select(List<MessageQueue> mqs, Message msg, Object arg) {
        Long orderId = (Long) arg;  // 业务 ID
        long index = orderId % mqs.size();
        return mqs.get((int) index);  // 同一 orderId 发送到同一队列
    }
}, orderId);

// 2. 延迟消息
Message message = new Message("TopicTest", "TagA", "Hello".getBytes());
message.setDelayTimeLevel(3);  // 延迟级别
/*
延迟级别对应时间：
1: 1s    2: 5s    3: 10s   4: 30s   5: 1m
6: 2m    7: 3m    8: 4m    9: 5m    10: 6m
11: 7m   12: 8m   13: 9m   14: 10m  15: 20m
16: 30m  17: 1h   18: 2h
*/
SendResult result = producer.send(message);

// 3. 批量消息
List<Message> messages = new ArrayList<>();
messages.add(new Message("TopicTest", "TagA", "Message 1".getBytes()));
messages.add(new Message("TopicTest", "TagA", "Message 2".getBytes()));
messages.add(new Message("TopicTest", "TagA", "Message 3".getBytes()));
SendResult result = producer.send(messages);

// 4. 事务消息
TransactionMQProducer producer = new TransactionMQProducer("transaction-producer-group");
producer.setNamesrvAddr("localhost:9876");
producer.setTransactionListener(new TransactionListener() {
    
    @Override
    public LocalTransactionState executeLocalTransaction(Message msg, Object arg) {
        // 执行本地事务
        try {
            // 业务逻辑
            orderService.createOrder((Order) arg);
            return LocalTransactionState.COMMIT_MESSAGE;
        } catch (Exception e) {
            return LocalTransactionState.ROLLBACK_MESSAGE;
        }
    }
    
    @Override
    public LocalTransactionState checkLocalTransaction(MessageExt msg) {
        // 事务回查
        String orderId = msg.getKeys();
        Order order = orderService.getById(orderId);
        if (order != null && order.getStatus() == OrderStatus.CREATED) {
            return LocalTransactionState.COMMIT_MESSAGE;
        }
        return LocalTransactionState.ROLLBACK_MESSAGE;
    }
});
producer.start();

Message message = new Message("TopicTest", "TagA", "orderId", "Hello".getBytes());
TransactionSendResult result = producer.sendMessageInTransaction(message, order);
```

---

## 消息消费

### 消费模式

```java
// 1. 集群消费（Clustering）- 默认模式
// 同一 Group 下，每条消息只被一个消费者消费
DefaultMQPushConsumer consumer = new DefaultMQPushConsumer("consumer-group");
consumer.setMessageModel(MessageModel.CLUSTERING);
consumer.subscribe("TopicTest", "TagA || TagB");  // 订阅多个 Tag
consumer.registerMessageListener(new MessageListenerConcurrently() {
    @Override
    public ConsumeConcurrentlyStatus consumeMessage(List<MessageExt> msgs, ConsumeConcurrentlyContext context) {
        for (MessageExt msg : msgs) {
            System.out.println("收到消息: " + new String(msg.getBody()));
        }
        return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
    }
});
consumer.start();

// 2. 广播消费（Broadcasting）
// 同一 Group 下，每条消息被所有消费者消费
consumer.setMessageModel(MessageModel.BROADCASTING);

// 3. 顺序消费
consumer.registerMessageListener(new MessageListenerOrderly() {
    @Override
    public ConsumeOrderlyStatus consumeMessage(List<MessageExt> msgs, ConsumeOrderlyContext context) {
        for (MessageExt msg : msgs) {
            // 同一队列的消息顺序消费
            System.out.println("顺序消费: " + new String(msg.getBody()));
        }
        return ConsumeOrderlyStatus.SUCCESS;
    }
});
```

### 消费进度管理

```
┌─────────────────────────────────────────────────────────────────┐
│                       消费进度存储                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   集群模式（CLUSTERING）                                         │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Broker 端存储                                            │   │
│   │                                                          │   │
│   │  Topic: Order                                            │   │
│   │  ├── Queue 0: offset = 1000 (consumer-group-a)          │   │
│   │  ├── Queue 1: offset = 980  (consumer-group-a)          │   │
│   │  └── Queue 2: offset = 950  (consumer-group-a)          │   │
│   │                                                          │   │
│   │  不同消费者组独立维护 offset                               │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   广播模式（BROADCASTING）                                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Consumer 本地存储                                        │   │
│   │                                                          │   │
│   │  ~/.rocketmq_offsets/consumer-group-a/TopicTest/0.offset │   │
│   │  每个消费者维护自己的 offset                               │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 消息可靠性

### 发送端可靠性

```
┌─────────────────────────────────────────────────────────────────┐
│                      发送可靠性保障                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. 同步发送 + 重试                                             │
│      producer.setRetryTimesWhenSendFailed(3);  // 重试次数       │
│                                                                  │
│   2. 异步发送 + 回调                                             │
│      在 onException 中实现重试逻辑                               │
│                                                                  │
│   3. 事务消息                                                    │
│      半消息 + 本地事务 + 回查机制                                │
│                                                                  │
│   4. Broker 确认                                                 │
│      - SYNC_MASTER: 同步复制到 Slave 才返回成功                  │
│      - ASYNC_MASTER: 异步复制                                    │
│                                                                  │
│   5. 消息存储                                                    │
│      - SYNC_FLUSH: 同步刷盘                                      │
│      - ASYNC_FLUSH: 异步刷盘                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 消费端可靠性

```java
// 1. 消费重试
consumer.setMaxReconsumeTimes(16);  // 最大重试次数

// 消费失败，返回 RECONSUME_LATER
consumer.registerMessageListener(new MessageListenerConcurrently() {
    @Override
    public ConsumeConcurrentlyStatus consumeMessage(List<MessageExt> msgs, ConsumeConcurrentlyContext context) {
        try {
            // 业务处理
            process(msgs);
            return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
        } catch (Exception e) {
            // 失败后重试
            return ConsumeConcurrentlyStatus.RECONSUME_LATER;
        }
    }
});

// 2. 死信队列
// 重试 16 次后进入死信队列 %DLQ%consumer-group
// 需要人工处理或告警

// 3. 消费幂等性
// 使用消息 Key 或唯一 ID 实现幂等
consumer.registerMessageListener(new MessageListenerConcurrently() {
    @Override
    public ConsumeConcurrentlyStatus consumeMessage(List<MessageExt> msgs, ConsumeConcurrentlyContext context) {
        for (MessageExt msg : msgs) {
            String msgId = msg.getMsgId();
            String key = msg.getKeys();  // 业务唯一标识
            
            // 幂等检查
            if (redisTemplate.opsForValue().setIfAbsent("msg:processed:" + key, "1", 1, TimeUnit.DAYS)) {
                // 首次处理
                process(msg);
            } else {
                // 已处理，跳过
                log.info("消息已处理: {}", key);
            }
        }
        return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
    }
});
```

---

## 高可用架构

### 主从同步

```
┌─────────────────────────────────────────────────────────────────┐
│                       Broker 主从架构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                     Master Broker                        │   │
│   │                                                         │   │
│   │   - 接收 Producer 发送的消息                             │   │
│   │   - 接收 Consumer 的拉取请求                             │   │
│   │   - 向 Slave 同步消息                                    │   │
│   │                                                         │   │
│   │   brokerRole: SYNC_MASTER / ASYNC_MASTER                │   │
│   └───────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│                           │ 同步/异步复制                         │
│                           ▼                                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                      Slave Broker                        │   │
│   │                                                         │   │
│   │   - 接收 Master 同步的消息                               │   │
│   │   - 接收 Consumer 的拉取请求（读分离）                    │   │
│   │   - Master 宕机后可提升为 Master                         │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   刷盘方式：                                                     │
│   - SYNC_FLUSH：同步刷盘，消息写入磁盘后才返回成功               │
│   - ASYNC_FLUSH：异步刷盘，消息写入 PageCache 即返回成功        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 故障转移

```
┌─────────────────────────────────────────────────────────────────┐
│                      故障转移机制                                │
├────────────────────────────────────────────────