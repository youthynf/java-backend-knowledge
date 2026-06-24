# Kafka入门概要

Kafka入门概要
Kafka核心概述
Apache Kafka 给自己的定位是事件流平台（event stream platform）。因此在消息队列中经常使用的 "消息"一词，在 Kafka 中被称为 "事件"。它最初由 LinkedIn 开发，是一个开源的分布式、高吞吐量、高可用的流处理平台。它的核心功能可以概括为三大类：
1. 消息系统（Message System）： 在系统或应用之间可靠地异步传递消息（发布-订阅模式）。
2. 存储系统（Storage System）： 以安全、持久化、多副本的方式存储数据流。
3. 流处理平台（Stream Processing Platform）： 在数据发生时实时地处理和分析数据流。

其核心设计目标：
高吞吐量： 即使是非常普通的硬件也能支持每秒数十万甚至百万级的消息处理。
低延迟： 毫秒级的消息延迟。
高可扩展性： 通过增加节点（Broker）可以轻松地水平扩展，无需停机。
持久性与可靠性： 消息被持久化到磁盘，并且通过副本（Replication）机制防止数据丢失。
容错性： 集群中节点宕机时能自动进行故障转移。

核心概念与架构
Producer（生产者）：向 Kafka 发送（发布） 消息的客户端应用程序。类比发布者；
Consumer（消费者）：从 Kafka 读取（订阅） 消息的客户端应用程序。类比订阅者；
Consumer Group（消费者组）：由多个消费者组成的逻辑组，用于实现横向扩展和两种消息模式（点对点、发布订阅）。类比一组合作的工作者；
Broker：Kafka 集群中的一个服务器/节点。一个集群由多个 Broker 组成。类比邮局分局；
Topic（主题）：消息的类别或 feed 名称。生产者将消息发送到特定的 Topic，消费者从特定的 Topic 读取消息。类比邮箱/频道；
Partition（分区）：每个 Topic 可以被分成多个 Partition。分区是 Kafka 实现横向扩展和高吞吐量的核心。一个分区是一个有序的、不可变的消息序列。类比邮箱的多个投递口；
Offset（偏移量）：分区中每条消息的唯一标识符（一个递增的序列号）。消费者通过管理 Offset 来追踪自己读取到了哪里。类比信件编号；
Replica（副本）：分区的备份，用于提供高可用性。每个分区有多个副本，分散在不同的 Broker 上。类比文件备份；
Leader / Follower：对于每个分区的多个副本，其中一个被选为 Leader，负责所有读写请求。其他副本作为 Follower，从 Leader 同步数据。类比主从架构；
ZooKeeper：Kafka 使用 Zookeeper 来管理元数据（如 Broker、Topic、分区信息）、领导者选举、服务发现和集群状态维护。（注：新版本正在移除对 ZK 的依赖）。类比集群管理员；

工作过程：
生产者将消息发布到特定 Topic 的某个 Partition。分配策略可以是轮询、基于键哈希（保证相同键的消息到同一分区）等。
消费者以组的形式工作。一个分区只能被同一个消费者组内的一个消费者消费（实现负载均衡）。但不同消费者组可以独立消费整个 Topic（实现发布订阅）。
分区副本分散在不同 Broker 上，提供数据冗余和高可用。

核心工作原理
消息存储与持久化
日志结构存储： Kafka 将每个分区抽象为一个追加日志（Log） 文件。新消息总是追加到文件末尾。这种顺序磁盘写入的速度非常快（甚至比随机内存写入还快）。
分段（Segment）： 日志文件被拆分成多个段（例如 1GB一段）。旧的段文件可以被压缩或删除（根据保留策略），这使得 Kafka 可以高效地管理海量数据。
零拷贝（Zero-Copy）： 为了优化数据传输，Kafka 使用了 sendfile系统调用，允许数据直接从磁盘文件通过网卡发送，绕过应用程序缓冲区，极大提升了吞吐量。

生产者
异步发送： 生产者默认批量异步发送消息，积累到一定大小或时间后一次性发送，极大提高吞吐量。
确认机制（acks）：
acks=0： 不等待 Broker 确认。速度最快，但可能丢失数据。
acks=1： 等待 Leader 副本写入确认。是吞吐量和可靠性的折中（默认）。
acks=all： 等待 Leader 和所有 ISR（同步副本）确认。最安全，但延迟最高。

3. 消费者
拉取模型（Pull）： 消费者主动从 Broker 拉取消息，可以按自己的处理能力控制消费速度。
偏移量提交（Commit Offset）： 消费者需要定期向 Kafka 提交自己消费到的 Offset。如果消费者崩溃，它可以从此 Offset 恢复消费。偏移量可以存储在 Kafka 内部的 __consumer_offsetsTopic 中。
消费者组重平衡（Rebalance）： 当消费者组内消费者数量发生变化（增、减、宕机）时，会触发重平衡，重新分配分区给存活的消费者。这是一个“Stop-The-World”的过程，期间所有消费者无法消费消息。

高性能的原因
批量发送
Kafka 收发消息都是批量进行处理的。使用批量收发消息，减轻了客户端和 Broker 的交互次数，提升了 Broker 处理能力。
生产者调用 doSend 方法后，并不会直接把消息发送出去，而是把消息缓存起来，缓存消息量达到配置的批量大小后，才会发送出去。一批消息属于同一个 topic 下面的同一个 partition。
Broker 收到消息后，并不会把批量消息解析成单条消息后落盘，而是作为批量消息进行落盘，同时也会把批量消息直接同步给其他副本。
消费者拉取消息，也不会按照单条进行拉取，而是按照批量进行拉取，拉取到一批消息后，再解析成单条消息进行消费。

消息压缩
如果消息体比较大，Kafka 消息吞吐量要达到千万级别，网卡支持的网络传输带宽会是一个瓶颈。Kafka 的解决方案是消息压缩。
发送消息时，如果增加参数 compression.type，就可以开启消息压缩：如果 compression.type 的值设置为 none，则不开启压缩。生产者缓存一批消息后才会发送，在发送这批消息之前就会进行压缩。目前 Kafka 支持的压缩算法包括：gzip、snappy、lz4，从 2.1.0 版本开始，Kafka 支持 Zstandard 算法。
在 Broker 端，会解压 header 做一些校验，但不会解压消息体。
消息体的解压是在消费端，消费者拉取到一批消息后，首先会进行解压，然后进行消息处理。

因为压缩和解压都是耗费 CPU 的操作，所以在开启消息压缩时，也要考虑生产者和消费者的 CPU 资源情况。有了消息批量收集和压缩，kafka 生产者发送消息的过程：序列化-》分配Partition-》批量收集-》压缩-》发送到Broker（某个 Topic 下的某个 partition）。
特别注意：同一批消息属于同一个 topic 下面的同一个 partition。

顺序读写
顺序读写省去了寻址的时间，只要一次寻址，就可以连续读写。在固态硬盘上，顺序读写的性能是随机读写的好几倍。而在机械硬盘上，寻址时需要移动磁头，这个机械运动会花费很多时间，因此机械硬盘的顺序读写性能是随机读写的几十倍。Kafka 的 Broker 在写消息数据时，首先为每个 Partition 创建一个文件，然后把数据顺序地追加到该文件对应的磁盘空间中，如果这个文件写满了，就再创建一个新文件继续追加写。这样大大减少了寻址时间，提高了读写性能。

PageCache
在 Linux 系统中，所有文件 IO 操作都要通过 PageCache，PageCache 是磁盘文件在内存中建立的缓存。当应用程序读写文件时，并不会直接读写磁盘上的文件，而是操作 PageCache。应用程序写文件时，都先会把数据写入 PageCache，然后操作系统定期地将 PageCache 的数据写到磁盘上。而应用程序在读取文件数据时，首先会判断数据是否在 PageCache 中，如果在则直接读取，如果不在，则读取磁盘，并且将数据缓存到 PageCache。Kafka 充分利用了 PageCache 的优势，当生产者生产消息的速率和消费者消费消息的速率差不多时，Kafka 基本可以不用落盘就能完成消息的传输。

零拷贝
Kafka Broker 将消息发送给消费端时，即使命中了 PageCache，也需要将 PageCache 中的数据先复制到应用程序的内存空间，然后从应用程序的内存空间复制到 Socket 缓存区，将数据发送出去。Kafka 采用了零拷贝技术把数据直接从 PageCache 复制到 Socket 缓冲区中，这样数据不用复制到用户态的内存空间，同时 DMA 控制器直接完成数据复制，不需要 CPU 参与。Java 零拷贝技术采用 FileChannel.transferTo() 方法，底层调用了 sendfile 方法。

mmap
Kafka 的日志文件分为数据文件(.log)和索引文件(.index)，Kafka 为了提高索引文件的读取性能，对索引文件采用了 mmap 内存映射，将索引文件映射到进程的内存空间，这样读取索引文件就不需要从磁盘进行读取。

使用实例
添加 Maven 依赖

<dependency>
    <groupId>org.apache.kafka</groupId>
    <artifactId>kafka-clients</artifactId>
    <version>3.6.1</version> <!-- 请使用最新版本 -->
</dependency>
生产者

import org.apache.kafka.clients.producer.*;
import org.apache.kafka.common.serialization.StringSerializer;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Properties;
import java.util.Random;
import java.util.concurrent.ExecutionException;

public class OrderProducer {

    private static final String BOOTSTRAP_SERVERS = "localhost:9092";
    private static final String TOPIC_NAME = "order-events";

    // 创建 Kafka 生产者配置
    private static Properties getKafkaProperties() {
        Properties props = new Properties();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, BOOTSTRAP_SERVERS);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());

        // 可选：提高可靠性配置
        props.put(ProducerConfig.ACKS_CONFIG, "all"); // 等待所有副本确认
        props.put(ProducerConfig.RETRIES_CONFIG, 3); // 发送失败重试次数
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true); // 启用幂等性
        return props;
    }

    public static void main(String[] args) throws InterruptedException {
        // 创建生产者
        KafkaProducer<String, String> producer = new KafkaProducer<>(getKafkaProperties());
        ObjectMapper objectMapper = new ObjectMapper();
        Random random = new Random();

        String[] products = {"Laptop", "Smartphone", "Headphones", "Book", "Monitor"};
        String[] emails = {"alice@example.com", "bob@example.com", "charlie@example.com"};

        try {
            // 模拟持续生成订单事件
            while (true) {
                // 随机生成一个订单
                OrderEvent order = new OrderEvent(
                        products[random.nextInt(products.length)],
                        random.nextInt(5) + 1, // 1-5 件商品
                        emails[random.nextInt(emails.length)]
                );

                // 将订单对象序列化为 JSON 字符串
                String orderJson = objectMapper.writeValueAsString(order);

                // 构建 ProducerRecord。Key 使用 productName，确保相同产品的订单进入同一分区，保证顺序性。
                ProducerRecord<String, String> record = new ProducerRecord<>(TOPIC_NAME, order.getProductName(), orderJson);

                // 发送消息（异步发送，带回调）
                producer.send(record, new Callback() {
                    @Override
                    public void onCompletion(RecordMetadata metadata, Exception exception) {
                        if (exception == null) {
                            System.out.printf("Produced order to topic %s, partition %d, offset %d. Order: %s%n",
                                    metadata.topic(), metadata.partition(), metadata.offset(), order);
                        } else {
                            System.err.println("Error producing order: " + exception.getMessage());
                        }
                    }
                });

                // 每秒产生一条订单
                Thread.sleep(1000);
            }
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            producer.close(); // 关闭生产者，释放资源
        }
    }
}
消费者1 - 订单处理器

import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.serialization.StringDeserializer;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.Collections;
import java.util.Properties;

public class OrderProcessorConsumer {

    private static final String BOOTSTRAP_SERVERS = "localhost:9092";
    private static final String TOPIC_NAME = "order-events";
    private static final String GROUP_ID = "order-processor-group"; // 消费者组

    private static Properties getKafkaProperties() {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, BOOTSTRAP_SERVERS);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.GROUP_ID_CONFIG, GROUP_ID);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest"); // 从最早的消息开始读
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "true"); // 自动提交偏移量
        return props;
    }

    public static void main(String[] args) {
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(getKafkaProperties());
        ObjectMapper objectMapper = new ObjectMapper();

        // 订阅主题
        consumer.subscribe(Collections.singletonList(TOPIC_NAME));

        System.out.println("Order Processor Consumer started...");

        try {
            while (true) {
                // 拉取消息（长轮询，超时时间100ms）
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));

                for (ConsumerRecord<String, String> record : records) {
                    try {
                        // 反序列化 JSON 字符串为 OrderEvent 对象
                        OrderEvent order = objectMapper.readValue(record.value(), OrderEvent.class);

                        // 模拟业务处理逻辑（检查库存、计算价格等）
                        System.out.printf("[ORDER PROCESSOR] Processing order %s for product %s. Partition: %d, Offset: %d%n",
                                order.getOrderId(), order.getProductName(), record.partition(), record.offset());

                        // 处理成功，更新状态
                        order.setStatus(OrderEvent.OrderStatus.PROCESSED);
                        System.out.printf("[ORDER PROCESSOR] Successfully processed order: %s%n", order);

                    } catch (Exception e) {
                        System.err.printf("Failed to process record from topic %s, partition %d, offset %d: %s%n",
                                record.topic(), record.partition(), record.offset(), e.getMessage());
                    }
                }
            }
        } finally {
            consumer.close();
        }
    }
}
消费者2 - 邮件通知器
这个消费者展示了不同的消费者组如何独立消费同一条消息，实现发布-订阅模式。

// ... (导入包与 OrderProcessorConsumer 类似)
public class EmailNotifierConsumer {

    private static final String BOOTSTRAP_SERVERS = "localhost:9092";
    private static final String TOPIC_NAME = "order-events";
    private static final String GROUP_ID = "email-notifier-group"; // 不同的消费者组！

    private static Properties getKafkaProperties() {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, BOOTSTRAP_SERVERS);
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.GROUP_ID_CONFIG, GROUP_ID);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        return props;
    }

    public static void main(String[] args) {
        KafkaConsumer<String, String> consumer = new KafkaConsumer<>(getKafkaProperties());
        ObjectMapper objectMapper = new ObjectMapper();

        consumer.subscribe(Collections.singletonList(TOPIC_NAME));
        System.out.println("Email Notifier Consumer started...");

        try {
            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(100));
                for (ConsumerRecord<String, String> record : records) {
                    try {
                        OrderEvent order = objectMapper.readValue(record.value(), OrderEvent.class);

                        // 模拟发送邮件
                        System.out.printf("[EMAIL NOTIFIER] Sending confirmation email for order %s to %s. Partition: %d, Offset: %d%n",
                                order.getOrderId(), order.getCustomerEmail(), record.partition(), record.offset());
                        // 这里可以集成 JavaMail 等邮件发送库
                        System.out.printf("[EMAIL NOTIFIER] Dear customer, your order for %s x%d has been received!%n",
                                order.getProductName(), order.getQuantity());

                    } catch (Exception e) {
                        System.err.println("Error sending email notification: " + e.getMessage());
                    }
                }
            }
        } finally {
            consumer.close();
        }
    }
}

<!-- 面试复习补充 -->

## 面试复习补充

### 核心概念

Kafka 是分布式提交日志系统，核心抽象包括 Topic、Partition、Replica、Producer、Consumer Group 和 Offset。它通过顺序追加、批量传输、PageCache 和分区并行获得高吞吐。

### 面试官想考什么

面试官高频考可靠性、顺序性、重复消费、消息积压、消费者组再均衡、Exactly-Once 边界和 Java 客户端配置。

### 标准回答

Kafka 的 Topic 被拆成多个 Partition，分区内有序；消费者组内一个分区同一时刻通常只分配给一个消费者；offset 记录消费进度；副本和 ISR 提供容错。生产要配置确认和重试，消费要处理幂等和提交时机。

### 深挖追问

- 如果消息处理成功但确认失败会怎样？
- 如何设计幂等键和补偿任务？
- 该方案在高并发或故障恢复时有什么边界？

### 实战场景/示例

订单状态变更可以写 Kafka 供搜索、风控、通知等系统异步消费，但每个消费者都要设计幂等和补偿。

### 易错点/总结

MQ 不是银弹。不要只说“加 MQ 解耦”，还要说明可靠投递、重复消费、顺序性、延迟、监控和补偿。

<!-- 面试复习强化 -->

## 面试复习强化

### 核心概念

Kafka 是分布式提交日志系统。Topic 是逻辑主题，Partition 是并行和顺序的基本单位，Broker 存储分区副本，Producer 按分区写入，Consumer Group 内每个分区同一时刻只被一个消费者实例消费。Kafka 的高吞吐来自顺序写、PageCache、零拷贝、批量发送、压缩和分区并行。

### 面试官想考什么

- 是否理解分区是并发、顺序和扩展性的核心。
- 是否知道副本、Leader、Follower、ISR 与可靠性的关系。
- 是否能解释消费者组、offset、rebalance 和 lag。
- 是否能在可靠性与吞吐量之间做配置权衡。

### 标准回答

Kafka 通过 Topic/Partition 组织消息，每个 Partition 是有序追加日志。Producer 根据 key 或分区策略写入 Leader 副本，Follower 从 Leader 拉取同步，ISR 表示与 Leader 保持同步的副本集合。Consumer Group 通过分区分配实现水平扩展，消费进度由 offset 记录。可靠性一般配置 `acks=all`、`min.insync.replicas>=2`、合理副本数和手动提交 offset；性能上使用批量、压缩、合理 linger/batch、增加分区数。

### 深挖追问

- **为什么一个分区只能被同组一个消费者消费？** 为了保证分区内顺序；想提高并行度需要增加分区数。
- **Rebalance 有什么影响？** 会暂停消费并重新分配分区，可能导致延迟和重复消费，应控制消费者稳定性和处理时间。
- **分区越多越好吗？** 不是。分区过多会增加文件句柄、元数据、选主和恢复成本，也让顺序保证更弱。

### 示例/实战场景

订单事件按 `orderId` 作为 key 写入 Kafka，保证同一订单的创建、支付、取消进入同一分区并有序消费。监控 `consumer_lag`、生产 TPS、请求延迟、ISR 变化和磁盘使用率；当 lag 持续增长时先判断是生产突增、消费慢还是下游瓶颈。

### 易错点/总结

- Kafka 只能保证单分区内有序，不能天然保证全局有序。
- `acks=all` 提高可靠性但不是绝对不丢，还依赖 ISR、刷盘、副本和运维策略。
- offset 提交成功不代表业务一定成功，提交时机必须和业务处理配合。
