# Kafka

## 核心概念

### Kafka 架构

```
                    ┌─────────────────────────────────────────────┐
                    │              ZooKeeper Cluster              │
                    │   (元数据管理、Controller 选举、消费者组协调)   │
                    └──────────────────────┬──────────────────────┘
                                           │
┌──────────────┐    ┌──────────────────────┼──────────────────────┐    ┌──────────────┐
│  Producer 1  │───▶│                      │                      │◀───│ Consumer 1   │
└──────────────┘    │   ┌─────────────────────────────────┐      │    └──────────────┘
                    │   │         Broker 1               │      │
┌──────────────┐    │   │  ┌─────────┐  ┌─────────┐     │      │    ┌──────────────┐
│  Producer 2  │───▶│   │  │Partition│  │Partition│     │◀─────│───▶│ Consumer 2   │
└──────────────┘    │   │  │   0     │  │   1     │     │      │    └──────────────┘
                    │   │  └─────────┘  └─────────┘     │      │
┌──────────────┐    │   └─────────────────────────────────┘      │    ┌──────────────┐
│  Producer 3  │───▶│              Kafka Cluster                 │◀───│ Consumer 3   │
└──────────────┘    └─────────────────────────────────────────────┘    └──────────────┘
```

**核心组件**：

| 组件 | 作用 |
|------|------|
| Broker | Kafka 节点，存储消息 |
| Topic | 消息分类，逻辑概念 |
| Partition | 分区，物理存储单元，有序 |
| Segment | 分区内的存储单元（.log + .index） |
| Offset | 消息在分区内的偏移量 |
| Consumer Group | 消费者组，实现单播/广播 |
| ZooKeeper | 元数据管理、Controller 选举（2.8 后可去 ZK） |

### 副本机制

**AR（Assigned Replicas）**：所有副本
**ISR（In-Sync Replicas）**：同步副本集合
**OSR（Out-of-Sync Replicas）**：非同步副本

```
AR = ISR + OSR
```

**Leader**：处理读写请求
**Follower**：从 Leader 同步数据，不处理客户端请求

### 消息发送流程

```
Producer → [序列化] → [分区选择] → [消息压缩] → [批量发送] → Broker
```

**分区策略**：
1. 指定分区号
2. 指定 key，hash(key) % 分区数
3. 轮询（Sticky Partition 优化）

**ACK 配置**：
- `acks=0`：不等待确认，可能丢失
- `acks=1`：Leader 确认，可能丢失
- `acks=-1/all`：ISR 所有副本确认，最可靠

### 消息消费流程

```
Consumer → [加入消费者组] → [Rebalance] → [分配分区] → [拉取消息] → [提交 Offset]
```

**Offset 提交方式**：
- 自动提交：定期提交，可能重复消费
- 手动同步提交：可靠，但阻塞
- 手动异步提交：性能好，可能丢失

---

## 面试高频问题

### 1. 如何保证消息不丢失？

**三个阶段保证**：

**生产者端**：
```java
Properties props = new Properties();
props.put("acks", "all");                    // 等待所有 ISR 副本确认
props.put("retries", Integer.MAX_VALUE);     // 无限重试
props.put("enable.idempotence", "true");     // 幂等性
props.put("max.in.flight.requests.per.connection", "5");  // 幂等性下可大于 1
```

**Broker 端**：
```properties
# 至少 3 个副本
replication.factor=3
# ISR 最少副本数
min.insync.replicas=2
# 不允许非 ISR 副本选举为 Leader
unclean.leader.election.enable=false
```

**消费者端**：
```java
// 关闭自动提交
props.put("enable.auto.commit", "false");

// 业务处理完成后手动提交
try {
    // 处理消息
    process(record);
    // 同步提交
    consumer.commitSync();
} catch (Exception e) {
    // 不提交，下次重新消费
    log.error("处理失败", e);
}
```

---

### 2. 如何保证消息顺序消费？

**问题**：分区有序，但多分区无序

**方案 1：单分区**
```java
// 发送到同一分区
producer.send(new ProducerRecord<>("topic", "key", value));
```

**方案 2：相同 key 路由到同一分区**
```java
// 订单 ID 作为 key
producer.send(new ProducerRecord<>("topic", orderId, orderEvent));
```

**方案 3：消费者端顺序处理**
```java
// 每个分区单线程处理
ExecutorService[] executors = new ExecutorService[numPartitions];
for (int i = 0; i < numPartitions; i++) {
    executors[i] = Executors.newSingleThreadExecutor();
}

while (true) {
    ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
    for (ConsumerRecord<String, String> record : records) {
        int partition = record.partition();
        executors[partition].submit(() -> process(record));
    }
}
```

---

### 3. 如何解决消息重复消费？

**原因**：消费者处理完消息但 Offset 提交失败

**解决方案：幂等性处理**

```java
public void process(ConsumerRecord<String, String> record) {
    String messageId = record.key();  // 假设 key 是消息唯一 ID
    
    // 方案 1：数据库唯一索引
    try {
        insertMessage(messageId, record.value());
    } catch (DuplicateKeyException e) {
        log.warn("消息已处理: {}", messageId);
        return;
    }
    
    // 方案 2：Redis SETNX
    Boolean success = redis.setNX("msg:" + messageId, "1", "EX", 86400);
    if (!success) {
        log.warn("消息已处理: {}", messageId);
        return;
    }
    
    // 方案 3：状态机
    Order order = orderRepository.findById(orderId);
    if (order.getStatus() != Status.CREATED) {
        log.warn("订单状态已变更: {}", orderId);
        return;
    }
    order.setStatus(Status.PAID);
    orderRepository.save(order);
}
```

---

### 4. Kafka 为什么快？

**1. 顺序读写**
- 消息追加到日志末尾，顺序写入
- 比随机写快几个数量级

**2. 零拷贝**
```
传统方式：磁盘 → 内核缓冲区 → 用户缓冲区 → 内核缓冲区 → 网卡
零拷贝：磁盘 → 内核缓冲区 → 网卡（sendfile 系统调用）
```

**3. 批量处理**
- 生产者批量发送
- 消费者批量拉取
- 减少网络请求次数

**4. 页缓存**
- 利用操作系统的 Page Cache
- 写操作写入 Page Cache，异步刷盘
- 读操作优先从 Page Cache 读取

**5. 压缩**
- 支持 GZIP、Snappy、LZ4、ZSTD
- 减少网络传输和磁盘存储

---

### 5. Rebalance 是什么？有什么影响？

**触发条件**：
- 消费者加入/离开消费者组
- Topic 分区数变化
- 消费者心跳超时（session.timeout.ms）
- 消费者处理超时（max.poll.interval.ms）

**影响**：
1. 消费暂停，服务不可用
2. 可能重复消费
3. 频繁 Rebalance 影响性能

**优化方案**：
```java
// 增加心跳超时时间
props.put("session.timeout.ms", "30000");
// 增加处理超时时间
props.put("max.poll.interval.ms", "600000");
// 减少单次拉取数量
props.put("max.poll.records", "100");
// 使用静态成员
props.put("group.instance.id", "consumer-" + hostName);
```

---

## 实战场景

### 场景 1：订单系统异步处理

```java
@Service
public class OrderService {
    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;
    
    @Transactional
    public void createOrder(Order order) {
        // 1. 保存订单
        orderRepository.save(order);
        
        // 2. 发送消息（事务提交后）
        kafkaTemplate.executeInTransaction(template -> {
            template.send("order-created", order.getId(), JSON.toJSONString(order));
            return true;
        });
    }
}

// 消费者
@KafkaListener(topics = "order-created", groupId = "inventory-service")
public void handleOrderCreated(ConsumerRecord<String, String> record) {
    Order order = JSON.parseObject(record.value(), Order.class);
    inventoryService.deductStock(order);
}
```

### 场景 2：日志收集系统

```yaml
# 生产者配置
producer:
  batch-size: 16384          # 16KB 批量
  buffer-memory: 33554432    # 32MB 缓冲区
  compression-type: lz4      # 压缩
  linger-ms: 10              # 等待时间

# Topic 配置
topic:
  partitions: 10             # 多分区提高并发
  replication-factor: 3      # 3 副本
```

### 场景 3：消息积压处理

```java
// 1. 增加消费者实例
// 2. 增加分区数
// 3. 批量处理 + 异步写入
@KafkaListener(topics = "high-volume-topic")
public void batchConsume(List<ConsumerRecord<String, String>> records) {
    List<CompletableFuture<Void>> futures = records.stream()
        .map(record -> CompletableFuture.runAsync(() -> process(record), executor))
        .collect(Collectors.toList());
    
    CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
    acknowledge();
}
```

---

## 代码示例

### 生产者完整配置

```java
public class KafkaProducerDemo {
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("key.serializer", StringSerializer.class.getName());
        props.put("value.serializer", StringSerializer.class.getName());
        
        // 可靠性配置
        props.put("acks", "all");
        props.put("retries", Integer.MAX_VALUE);
        props.put("enable.idempotence", "true");
        
        // 性能配置
        props.put("batch.size", 16384);
        props.put("linger.ms", 5);
        props.put("buffer.memory", 33554432);
        props.put("compression.type", "lz4");
        
        Producer<String, String> producer = new KafkaProducer<>(props);
        
        // 发送消息
        ProducerRecord<String, String> record = new ProducerRecord<>(
            "my-topic", 
            "key", 
            "value"
        );
        
        producer.send(record, (metadata, exception) -> {
            if (exception != null) {
                exception.printStackTrace();
            } else {
                System.out.printf("发送成功: partition=%d, offset=%d%n", 
                    metadata.partition(), metadata.offset());
            }
        });
        
        producer.close();
    }
}
```

### 消费者完整配置

```java
public class KafkaConsumerDemo {
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092");
        props.put("group.id", "my-group");
        props.put("key.deserializer", StringDeserializer.class.getName());
        props.put("value.deserializer", StringDeserializer.class.getName());
        
        // Offset 配置
        props.put("enable.auto.commit", "false");
        props.put("auto.offset.reset", "earliest");
        
        // 性能配置
        props.put("max.poll.records", "500");
        props.put("fetch.min.bytes", "1");
        props.put("fetch.max.wait.ms", "500");
        
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
        consumer.subscribe(Arrays.asList("my-topic"));
        
        while (true) {
            ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
            
            for (ConsumerRecord<String, String> record : records) {
                try {
                    // 处理消息
                    process(record);
                } catch (Exception e) {
                    log.error("处理失败", e);
                    // 发送到死信队列
                    sendToDLQ(record);
                }
            }
            
            // 手动提交
            consumer.commitSync();
        }
    }
}
```

---

## 延伸思考

### 1. Kafka 为什么不用 MySQL 存储？

- 顺序写性能远高于 B+ 树随机写
- 不需要复杂查询，只需要追加和顺序读
- 页缓存 + 零拷贝效率更高
- 文件系统更简单、更可靠

### 2. Kafka 2.8 去除 ZooKeeper 的意义

- 简化架构，减少运维复杂度
- 减少元数据同步延迟
- 消除 ZK 成为瓶颈的风险
- KRaft 模式下 Controller 直接管理元数据

### 3. Kafka vs RocketMQ vs RabbitMQ

| 特性 | Kafka | RocketMQ | RabbitMQ |
|------|-------|----------|----------|
| 吞吐量 | 百万级 | 十万级 | 万级 |
| 延迟 | 毫秒级 | 毫秒级 | 微秒级 |
| 顺序性 | 分区有序 | 队列有序 | 队列有序 |
| 事务 | 支持 | 支持 | 不支持 |
| 消息回溯 | 支持 | 支持 | 不支持 |
| 延迟消息 | 不支持 | 支持 | 支持（插件）|
| 适用场景 | 日志、大数据 | 业务、金融 | 轻量业务 |

---

## 参考资料

- [Kafka 官方文档](https://kafka.apache.org/documentation/)
- [Kafka 权威指南](https://book.douban.com/subject/27179853/)
- [美团 Kafka 技术实践](https://tech.meituan.com/kafka_practice.html)
- [KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500)

---

*最后更新: 2026-04-08*
