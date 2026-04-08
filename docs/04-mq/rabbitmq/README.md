# RabbitMQ

## 核心概念

RabbitMQ 是基于 AMQP 协议的开源消息队列，支持多种消息模式，可靠性高，适合中小规模应用。

### 基本架构

```
Producer -> Exchange -> Queue -> Consumer

核心组件：
- Producer（生产者）：发送消息
- Consumer（消费者）：接收消息
- Exchange（交换机）：路由消息
- Queue（队列）：存储消息
- Binding（绑定）：Exchange 和 Queue 的绑定关系
- Routing Key：路由键，决定消息路由到哪个队列
```

### Exchange 类型

| 类型 | 路由规则 | 场景 |
|------|----------|------|
| Direct | 精确匹配 Routing Key | 点对点 |
| Fanout | 广播到所有绑定队列 | 广播 |
| Topic | 通配符匹配 | 订阅发布 |
| Headers | 匹配消息头 | 复杂路由 |

---

## 安装与配置

### Docker 部署

```bash
# 启动 RabbitMQ（带管理界面）
docker run -d --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management

# 访问管理界面
# http://localhost:15672
# 用户名/密码: guest/guest
```

### Spring Boot 集成

```yaml
# application.yml
spring:
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest
    virtual-host: /
    # 消费者确认
    listener:
      simple:
        acknowledge-mode: manual  # 手动确认
        prefetch: 10              # 预取数量
        retry:
          enabled: true
          max-attempts: 3
    # 生产者确认
    publisher-confirm-type: correlated
    publisher-returns: true
```

---

## 工作模式

### 1. 简单队列（Hello World）

```java
// 生产者
@Autowired
private RabbitTemplate rabbitTemplate;

public void send(String message) {
    rabbitTemplate.convertAndSend("queue-simple", message);
}

// 消费者
@Component
public class SimpleConsumer {
    
    @RabbitListener(queues = "queue-simple")
    public void receive(String message) {
        System.out.println("Received: " + message);
    }
}
```

### 2. 工作队列（Work Queue）

```java
// 多个消费者竞争消费
@Configuration
public class WorkQueueConfig {
    
    @Bean
    public Queue workQueue() {
        return new Queue("queue-work");
    }
}

// 消费者1
@RabbitListener(queues = "queue-work")
public void receive1(String message) {
    System.out.println("Consumer 1: " + message);
}

// 消费者2
@RabbitListener(queues = "queue-work")
public void receive2(String message) {
    System.out.println("Consumer 2: " + message);
}

// 公平分发（按能力分配）
// 设置 prefetch = 1，消费者处理完一条再接收下一条
```

### 3. 发布订阅（Pub/Sub）

```java
// Fanout Exchange - 广播到所有队列
@Configuration
public class PubSubConfig {
    
    @Bean
    public FanoutExchange fanoutExchange() {
        return new FanoutExchange("exchange.fanout");
    }
    
    @Bean
    public Queue queue1() {
        return new Queue("queue.pubsub1");
    }
    
    @Bean
    public Queue queue2() {
        return new Queue("queue.pubsub2");
    }
    
    @Bean
    public Binding binding1(Queue queue1, FanoutExchange fanoutExchange) {
        return BindingBuilder.bind(queue1).to(fanoutExchange);
    }
    
    @Bean
    public Binding binding2(Queue queue2, FanoutExchange fanoutExchange) {
        return BindingBuilder.bind(queue2).to(fanoutExchange);
    }
}

// 生产者
public void publish(String message) {
    rabbitTemplate.convertAndSend("exchange.fanout", "", message);
}

// 消费者1
@RabbitListener(queues = "queue.pubsub1")
public void receive1(String message) {
    System.out.println("Queue 1: " + message);
}

// 消费者2
@RabbitListener(queues = "queue.pubsub2")
public void receive2(String message) {
    System.out.println("Queue 2: " + message);
}
```

### 4. 路由模式（Routing）

```java
// Direct Exchange - 根据 Routing Key 精确匹配
@Configuration
public class RoutingConfig {
    
    @Bean
    public DirectExchange directExchange() {
        return new DirectExchange("exchange.direct");
    }
    
    @Bean
    public Queue infoQueue() {
        return new Queue("queue.info");
    }
    
    @Bean
    public Queue errorQueue() {
        return new Queue("queue.error");
    }
    
    @Bean
    public Binding infoBinding(Queue infoQueue, DirectExchange directExchange) {
        return BindingBuilder.bind(infoQueue).to(directExchange).with("info");
    }
    
    @Bean
    public Binding errorBinding(Queue errorQueue, DirectExchange directExchange) {
        return BindingBuilder.bind(errorQueue).to(directExchange).with("error");
    }
}

// 生产者
public void sendInfo(String message) {
    rabbitTemplate.convertAndSend("exchange.direct", "info", message);
}

public void sendError(String message) {
    rabbitTemplate.convertAndSend("exchange.direct", "error", message);
}
```

### 5. 主题模式（Topic）

```java
// Topic Exchange - 通配符匹配
// * 匹配一个单词
// # 匹配零个或多个单词
@Configuration
public class TopicConfig {
    
    @Bean
    public TopicExchange topicExchange() {
        return new TopicExchange("exchange.topic");
    }
    
    @Bean
    public Queue allQueue() {
        return new Queue("queue.all");  // 接收所有日志
    }
    
    @Bean
    public Queue orderQueue() {
        return new Queue("queue.order");  // 接收订单相关
    }
    
    @Bean
    public Binding allBinding(Queue allQueue, TopicExchange topicExchange) {
        return BindingBuilder.bind(allQueue).to(topicExchange).with("log.#");
    }
    
    @Bean
    public Binding orderBinding(Queue orderQueue, TopicExchange topicExchange) {
        return BindingBuilder.bind(orderQueue).to(topicExchange).with("log.order.*");
    }
}

// 生产者
public void sendLog(String level, String message) {
    rabbitTemplate.convertAndSend("exchange.topic", "log." + level, message);
}

// 示例路由
// log.order.create -> queue.all, queue.order
// log.user.login -> queue.all
// log.payment.success -> queue.all
```

---

## 高级特性

### 消息确认（ACK）

```java
// 手动确认模式
@Component
public class ManualAckConsumer {
    
    @RabbitListener(queues = "queue-manual")
    public void receive(Message message, Channel channel) throws IOException {
        try {
            // 处理消息
            String body = new String(message.getBody());
            System.out.println("Received: " + body);
            
            // 手动确认
            // deliveryTag: 消息标签
            // multiple: 是否批量确认
            channel.basicAck(message.getMessageProperties().getDeliveryTag(), false);
            
        } catch (Exception e) {
            // 拒绝消息
            // requeue: 是否重新入队
            channel.basicNack(message.getMessageProperties().getDeliveryTag(), false, false);
            
            // 或者拒绝单条消息
            // channel.basicReject(deliveryTag, requeue);
        }
    }
}
```

### 持久化

```java
// 队列持久化
@Bean
public Queue durableQueue() {
    return QueueBuilder.durable("queue.durable")
        .withArgument("x-message-ttl", 60000)  // 消息 TTL
        .withArgument("x-max-length", 10000)   // 队列最大长度
        .build();
}

// Exchange 持久化
@Bean
public Exchange durableExchange() {
    return ExchangeBuilder.directExchange("exchange.durable")
        .durable(true)
        .build();
}

// 消息持久化（默认）
MessageProperties properties = new MessageProperties();
properties.setDeliveryMode(MessageDeliveryMode.PERSISTENT);
Message message = new Message(body.getBytes(), properties);
rabbitTemplate.send("exchange", "routingKey", message);
```

### 死信队列（DLX）

```java
// 死信队列：消息被拒绝、过期、队列满时进入死信队列
@Configuration
public class DLXConfig {
    
    // 死信交换机
    @Bean
    public DirectExchange dlxExchange() {
        return new DirectExchange("exchange.dlx");
    }
    
    // 死信队列
    @Bean
    public Queue dlxQueue() {
        return new Queue("queue.dlx");
    }
    
    @Bean
    public Binding dlxBinding(Queue dlxQueue, DirectExchange dlxExchange) {
        return BindingBuilder.bind(dlxQueue).to(dlxExchange).with("dlx");
    }
    
    // 业务队列（绑定死信）
    @Bean
    public Queue businessQueue() {
        return QueueBuilder.durable("queue.business")
            .withArgument("x-dead-letter-exchange", "exchange.dlx")  // 死信交换机
            .withArgument("x-dead-letter-routing-key", "dlx")         // 死信路由键
            .withArgument("x-message-ttl", 10000)                     // 消息过期时间
            .build();
    }
    
    // 死信消费者
    @RabbitListener(queues = "queue.dlx")
    public void handleDLX(String message) {
        System.out.println("Dead letter: " + message);
        // 处理失败消息：记录日志、告警、人工介入
    }
}
```

### 延迟队列

```java
// 方案1：TTL + 死信队列
@Configuration
public class DelayQueueConfig {
    
    @Bean
    public Queue delayQueue() {
        return QueueBuilder.durable("queue.delay")
            .withArgument("x-dead-letter-exchange", "exchange.process")
            .withArgument("x-dead-letter-routing-key", "process")
            .withArgument("x-message-ttl", 30000)  // 30秒后过期
            .build();
    }
    
    @Bean
    public Queue processQueue() {
        return new Queue("queue.process");
    }
    
    @Bean
    public DirectExchange processExchange() {
        return new DirectExchange("exchange.process");
    }
    
    @Bean
    public Binding processBinding(Queue processQueue, DirectExchange processExchange) {
        return BindingBuilder.bind(processQueue).to(processExchange).with("process");
    }
}

// 发送延迟消息
public void sendDelay(String message) {
    rabbitTemplate.convertAndSend("", "queue.delay", message);
    // 消息 30 秒后进入 queue.process
}

// 方案2：延迟消息插件
// 安装 rabbitmq_delayed_message_exchange 插件
// docker exec rabbitmq rabbitmq-plugins enable rabbitmq_delayed_message_exchange

@Configuration
public class PluginDelayConfig {
    
    @Bean
    public CustomExchange delayExchange() {
        Map<String, Object> args = new HashMap<>();
        args.put("x-delayed-type", "direct");
        return new CustomExchange("exchange.delay", "x-delayed-message", true, false, args);
    }
}

// 发送延迟消息
public void sendDelay(String message, int delayMs) {
    rabbitTemplate.convertAndSend("exchange.delay", "routingKey", message, msg -> {
        msg.getMessageProperties().setDelay(delayMs);
        return msg;
    });
}
```

### 消息可靠性投递

```java
// 1. 生产者确认
@Configuration
public class PublisherConfirmConfig {
    
    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        
        // 确认回调
        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (ack) {
                System.out.println("消息发送成功");
            } else {
                System.out.println("消息发送失败: " + cause);
                // 重试或记录日志
            }
        });
        
        // 退回回调（消息无法路由时）
        template.setReturnsCallback(returned -> {
            System.out.println("消息被退回: " + returned.getMessage());
        });
        
        return template;
    }
}

// 2. 发送消息时携带唯一 ID
public void send(String message) {
    CorrelationData correlationData = new CorrelationData(UUID.randomUUID().toString());
    rabbitTemplate.convertAndSend("exchange", "routingKey", message, correlationData);
}

// 3. 消费者确认
@RabbitListener(queues = "queue")
public void receive(Message message, Channel channel) throws IOException {
    try {
        // 处理消息
        process(message);
        // 确认
        channel.basicAck(message.getMessageProperties().getDeliveryTag(), false);
    } catch (Exception e) {
        // 拒绝并重新入队
        channel.basicNack(message.getMessageProperties().getDeliveryTag(), false, true);
    }
}

// 4. 本地消息表（最终一致性）
@Transactional
public void sendOrder(Order order) {
    // 1. 保存订单
    orderRepository.save(order);
    
    // 2. 保存消息记录
    MessageRecord record = new MessageRecord();
    record.setMessageId(UUID.randomUUID().toString());
    record.setStatus("PENDING");
    record.setContent(JSON.toJSONString(order));
    messageRepository.save(record);
    
    // 3. 发送消息
    rabbitTemplate.convertAndSend("exchange.order", "order.create", order, 
        new CorrelationData(record.getMessageId()));
}

// 定时任务检查未确认消息
@Scheduled(fixedDelay = 60000)
public void checkPendingMessages() {
    List<MessageRecord> pending = messageRepository.findByStatus("PENDING");
    for (MessageRecord record : pending) {
        if (record.getRetryCount() < 3) {
            // 重发
            rabbitTemplate.convertAndSend("exchange.order", "order.create", 
                record.getContent(), new CorrelationData(record.getMessageId()));
            record.setRetryCount(record.getRetryCount() + 1);
        } else {
            record.setStatus("FAILED");
        }
        messageRepository.save(record);
    }
}
```

---

## 面试高频问题

### 1. RabbitMQ 如何保证消息不丢失？

```
三个环节保证：

1. 生产者 -> Exchange
   - 开启确认模式（Confirm Callback）
   - 事务机制（性能差，不推荐）
   - 本地消息表

2. Exchange -> Queue
   - Exchange 持久化
   - Queue 持久化
   - 消息持久化（deliveryMode=2）

3. Queue -> Consumer
   - 手动确认模式
   - 处理成功后 ACK
   - 处理失败 NACK + 重试/死信
```

### 2. RabbitMQ 如何保证消息顺序性？

```
问题：多个消费者竞争消费，顺序无法保证

解决方案：
1. 单队列单消费者（性能差）
2. 单队列多消费者 + 内存队列
3. 多队列，相同 key 发送到同一队列

// 方案3 示例
public void sendOrder(Long orderId, String message) {
    String queueName = "queue.order." + (orderId % 10);
    rabbitTemplate.convertAndSend("", queueName, message);
}

// 每个队列只有一个消费者，保证顺序
@RabbitListener(queues = "queue.order.0")
public void receive0(String message) { }

@RabbitListener(queues = "queue.order.1")
public void receive1(String message) { }
```

### 3. RabbitMQ 如何避免消息重复消费？

```
原因：
- 网络抖动，ACK 未到达
- 消费者宕机，消息重新投递

解决方案：幂等性

// 基于 Redis 去重
@RabbitListener(queues = "queue")
public void receive(Message message, Channel channel) throws IOException {
    String messageId = message.getMessageProperties().getMessageId();
    
    // 检查是否已处理
    Boolean success = redisTemplate.opsForValue()
        .setIfAbsent("msg:" + messageId, "1", 1, TimeUnit.DAYS);
    
    if (!success) {
        // 已处理，直接确认
        channel.basicAck(message.getMessageProperties().getDeliveryTag(), false);
        return;
    }
    
    try {
        // 处理消息
        process(message);
        channel.basicAck(message.getMessageProperties().getDeliveryTag(), false);
    } catch (Exception e) {
        // 删除标记，重新消费
        redisTemplate.delete("msg:" + messageId);
        channel.basicNack(message.getMessageProperties().getDeliveryTag(), false, true);
    }
}
```

### 4. RabbitMQ 死信队列的应用场景？

```
死信产生原因：
1. 消息被拒绝（basicNack/basicReject）且 requeue=false
2. 消息过期（TTL）
3. 队列满了

应用场景：
1. 延迟任务（TTL + 死信）
2. 失败消息处理
3. 消息重试超过次数后处理
4. 临时队列溢出保护

实现：
@Configuration
public class DLXConfig {
    // 业务队列
    @Bean
    public Queue businessQueue() {
        return QueueBuilder.durable("queue.business")
            .deadLetterExchange("exchange.dlx")      // 死信交换机
            .deadLetterRoutingKey("dlx")             // 死信路由键
            .ttl(10000)                              // 过期时间
            .build();
    }
    
    // 死信队列
    @Bean
    public Queue dlxQueue() {
        return new Queue("queue.dlx");
    }
}
```

### 5. RabbitMQ 和 Kafka 的区别？

| 特性 | RabbitMQ | Kafka |
|------|----------|-------|
| 协议 | AMQP | 自定义协议 |
| 消息模型 | 队列模型 | 发布订阅 |
| 消息存储 | 内存/磁盘 | 磁盘日志 |
| 吞吐量 | 万级/秒 | 百