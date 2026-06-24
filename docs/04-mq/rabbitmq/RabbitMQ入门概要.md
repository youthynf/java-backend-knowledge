# RabbitMQ入门概要

RabbitMQ入门概要
RabbitMQ 核心概念
Queue：队列，用来承载消息的独立进程；
Exchange：交换器，一个可以定制消息路由分发策略的组件，将消息与Queue通过一个类似正则表达式的字符串bindingKey声明绑定在一起。这些维护在Exchange里的路由方式和绑定关系称为元数据；
Broker：每一台服务器上的 RabbitMQ 实例，就是代表一个Broker。每个 Broker 包含多个 Queue 进程和 Exchange 组件的消息队列；

Exchange 交换器类型
RabbitMQ 默认提供四种主要的交换器类型，每种类型都有不同的路由消息的行为。
Direct Exchange (直连交换器)：
精确匹配。它将消息路由到那些 Binding Key 完全匹配 Routing Key 的队列。它常用于单播路由(Unicasting)。

// 声明一个direct交换器
channel.exchangeDeclare("logs.direct", "direct", true);

// 声明队列并绑定，使用不同的绑定键
channel.queueDeclare("queue.error", true, false, false, null);
channel.queueBind("queue.error", "logs.direct", "error"); // 绑定键: error

channel.queueDeclare("queue.warning", true, false, false, null);
channel.queueBind("queue.warning", "logs.direct", "warning"); // 绑定键: warning

// 发送消息
channel.basicPublish("logs.direct", "error", null, "This is an ERROR log.".getBytes()); // 路由到 queue.error
channel.basicPublish("logs.direct", "warning", null, "This is a WARNING log.".getBytes()); // 路由到 queue.warning
Fanout Exchange (扇出交换器)
广播。它将所有收到的消息路由到所有与它绑定的队列上。忽略 Routing Key和 Binding Key。它用于广播路由(Broadcasting)。

// 声明一个fanout交换器
channel.exchangeDeclare("news.fanout", "fanout", true);

// 声明多个队列并绑定（无需指定绑定键）
channel.queueDeclare("queue.email", true, false, false, null);
channel.queueBind("queue.email", "news.fanout", ""); // 绑定键被忽略，可设为空字符串

channel.queueDeclare("queue.sms", true, false, false, null);
channel.queueBind("queue.sms", "news.fanout", "");

// 发送消息，路由键可任意设置（这里设为空）
channel.basicPublish("news.fanout", "", null, "Breaking News!".getBytes()); // queue.email和queue.sms都会收到
Topic Exchange (主题交换器)
模式匹配。它根据通配符模式匹配 between the Routing Keyand the Binding Key，将消息路由到一个或多个队列。它提供了极大的灵活性，是最强大也是最常用的交换器类型之一。

// 声明一个topic交换器
channel.exchangeDeclare("logs.topic", "topic", true);

// 声明队列并绑定，使用模式匹配的绑定键
channel.queueDeclare("queue.all", true, false, false, null);
channel.queueBind("queue.all", "logs.topic", "#"); // 接收所有日志

channel.queueDeclare("queue.critical", true, false, false, null);
channel.queueBind("queue.critical", "logs.topic", "*.critical"); // 接收所有.critical结尾的日志

// 发送消息
channel.basicPublish("logs.topic", "app.error", null, "An error occurred.".getBytes()); // 路由到 queue.all
channel.basicPublish("logs.topic", "server.critical", null, "Server is down!".getBytes()); // 路由到 queue.all 和 queue.critical
Headers Exchange (头交换器)
忽略 Routing Key。它根据消息的 headers属性（一个键值对表）进行匹配。在绑定时，需要指定一组匹配条件（键值对）。交换器会检查消息的头部信息是否完全匹配这些条件。它非常灵活但性能稍差，不如 topic交换器常用。

// 声明一个headers交换器
channel.exchangeDeclare("headers.exchange", "headers", true);

// 设置绑定参数：要求消息头中必须同时有 format=json 和 type=report
Map<String, Object> bindArgs = new HashMap<>();
bindArgs.put("x-match", "all"); // 必须全部匹配
bindArgs.put("format", "json");
bindArgs.put("type", "report");
channel.queueDeclare("queue.json.reports", true, false, false, null);
channel.queueBind("queue.json.reports", "headers.exchange", "", bindArgs); // 路由键被忽略

// 设置消息属性
Map<String, Object> headers = new HashMap<>();
headers.put("format", "json");
headers.put("type", "report");
AMQP.BasicProperties props = new AMQP.BasicProperties.Builder().headers(headers).build();

// 发送消息（路由键被忽略，可为空）
channel.basicPublish("headers.exchange", "", props, "JSON Report Data".getBytes()); // 消息会被路由

RabbitMQ 基本功能
延时队列：
延迟队列是指消息在发送后不会立即被消费，而是在等待一个指定的时间后，才能被消费者获取到的队列。实现方案：
TTL + 死信队列（经典方案）

// 1. 声明死信交换机与死信队列（延迟队列）
channel.exchangeDeclare("dlx.exchange", "direct", true);
channel.queueDeclare("real.delayed.queue", true, false, false, null); // 这是真正的延迟队列
channel.queueBind("real.delayed.queue", "dlx.exchange", "delayed.routing.key");

// 2. 声明业务队列，并设置TTL和死信参数
Map<String, Object> args = new HashMap<>();
// 设置死信交换机
args.put("x-dead-letter-exchange", "dlx.exchange");
// 设置死信路由键
args.put("x-dead-letter-routing-key", "delayed.routing.key");
// 设置队列消息的TTL（10秒）
args.put("x-message-ttl", 10000);

channel.queueDeclare("ttl.queue", true, false, false, args);
// 将业务队列绑定到正常的业务交换机（此处省略）

// 3. 生产者发送消息
// 消息发送到 ttl.queue 后，会等待10秒，然后被转移到 real.delayed.queue
String message = "This is a delayed message";
channel.basicPublish("", "ttl.queue", null, message.getBytes()); // 注意这里发往 ttl.queue

System.out.println(" [x] Sent '" + message + "'. It will be processed after 10 seconds.");

官方延迟消息插件（推荐方案）
RabbitMQ 官方提供了 rabbitmq_delayed_message_exchange插件，直接实现了一个支持延迟功能的交换机类型，这是目前最优雅、最灵活的解决方案。

1.安装插件并重启RabbitMQ服务后生效
# 进入 RabbitMQ 安装目录的 plugins 目录
rabbitmq-plugins enable rabbitmq_delayed_message_exchange

// 2. java代码实现
// 2.1 声明一个 x-delayed-message 类型的自定义交换机
Map<String, Object> args = new HashMap<>();
// 指定底层交换机的类型，可以是 direct, topic, fanout 等。这里用 direct。
args.put("x-delayed-type", "direct");
// 关键：交换机的类型是 "x-delayed-message"
channel.exchangeDeclare("my-delayed-exchange", "x-delayed-message", true, false, args);

// 2.2 声明一个普通队列并将其绑定到延迟交换机
channel.queueDeclare("my-queue", true, false, false, null);
channel.queueBind("my-queue", "my-delayed-exchange", "my-routing-key");

// 2.3 生产者发送消息，并设置延迟时间（单位：毫秒）
String message = "Hello, Delayed World!";
Map<String, Object> headers = new HashMap<>();
headers.put("x-delay", 5000); // 延迟 5 秒

AMQP.BasicProperties props = new AMQP.BasicProperties.Builder()
        .headers(headers)
        .build();

// 发布到延迟交换机，而不是普通交换机！
channel.basicPublish("my-delayed-exchange", "my-routing-key", props, message.getBytes());

System.out.println(" [x] Sent '" + message + "' with a 5-second delay.");

死信队列：
死信 (Dead Letter)指的是那些无法被正常消费的消息。它并不是一个特殊的消息类型，而是任何消息在满足特定条件后所进入的一种“状态”。而死信队列 (DLQ)则是一个专门用于接收和存储这些“死信”消息的普通队列。它本身没有任何特殊之处，只是被赋予了特定的用途。任何队列都可以被配置为死信队列。核心思想是当消息在原始队列中“失败”后，不要简单地丢弃，而是将其转移到一个安全的地方（死信队列）进行后续处理，如分析、重试或告警。

消息成为死信的三大原因：
消息被消费者拒绝：消费者使用 basic.reject或 basic.nack方法拒绝消息，并且设置 requeue参数为 false（即不重新放回队列）；
消息过期（TTL）：消息在队列中的存活时间超过了设定的 Time-To-Live (TTL)。TTL可以设置在消息本身上（x-message-ttl），也可以设置在队列上（expiration属性）。
队列达到最大长度：队列已满（消息数量或总字节数达到上限），新的消息到来时，会丢弃（或使旧消息死信） 队列头部的消息（即最早的消息），以便为新消息腾出空间。通过x-max-length和x-max-length-bytes设置队列最大长度。

如何配置死信队列？
死信队列的功能是通过在原始队列上设置参数来实现的。你需要为那些可能产生死信的队列（我们称之为“业务队列”）添加以下参数：
x-dead-letter-exchange（DLX）：必选，指定一个交换器。当消息成为死信后，RabbitMQ 会将其重新发布到这个指定的交换器。
x-dead-letter-routing-key：【可选】 为死信消息指定一个新的路由键。如果不设置，则死信消息将使用它原始的路由键。

// 1. 声明一个死信交换器 (Direct类型足够常用)
channel.exchangeDeclare("dlx.exchange", "direct", true);

// 2. 声明一个死信队列
channel.queueDeclare("dlq.queue", true, false, false, null);

// 3. 将死信队列绑定到死信交换器，并指定路由键
// 这里我们使用 "dlq.routing.key" 作为绑定键
channel.queueBind("dlq.queue", "dlx.exchange", "dlq.routing.key");

// 4. 声明业务队列并绑定死信参数
// 设置队列参数
Map<String, Object> args = new HashMap<>();
// 指定死信发送到的交换器
args.put("x-dead-letter-exchange", "dlx.exchange");
// (可选) 指定死信的新路由键，这里我们覆盖原路由键
args.put("x-dead-letter-routing-key", "dlq.routing.key");
// 可以同时设置其他参数，例如队列最大长度5条
args.put("x-max-length", 5);

// 声明业务队列，并传入参数
channel.queueDeclare("business.queue", true, false, false, args);

// ... 将业务队列绑定到正常的业务交换器 ...

// 5.消费者拒绝消息，使其成为死信
DeliverCallback deliverCallback = (consumerTag, delivery) -> {
    String message = new String(delivery.getBody(), "UTF-8");
    try {
        // 模拟处理消息失败...
        System.out.println(" [x] Received '" + message + "'");
        throw new RuntimeException("Oops! Processing failed!");
        // channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
    } catch (Exception e) {
        System.out.println(" [x] Rejected. Sending to DLQ.");
        // 拒绝消息，且不重新入队 (requeue = false)
        channel.basicNack(delivery.getEnvelope().getDeliveryTag(), false, false);
    }
};
channel.basicConsume("business.queue", false, deliverCallback, consumerTag -> {});

如果同一业务需要根据不同原因，写入不同死信队列时，如何实现？
使用 Topic 类型死信交换器 + 动态路由键（推荐）

// 1. 声明 Topic 死信交换器
channel.exchangeDeclare("dlx.topic", "topic", true);

// 2. 声明两个死信队列并绑定
// - 用于拒绝消息的死信队列
channel.queueDeclare("dlq.order.rejected", true, false, false, null);
channel.queueBind("dlq.order.rejected", "dlx.topic", "order.rejected"); // 路由键: order.rejected

// - 用于过期消息的死信队列
channel.queueDeclare("dlq.order.expired", true, false, false, null);
channel.queueBind("dlq.order.expired", "dlx.topic", "order.expired"); // 路由键: order.expired

// 3. 声明两个业务队列，分别设置不同的死信路由键
// 业务队列A：处理可能被拒绝的支付消息
Map<String, Object> argsReject = new HashMap<>();
argsReject.put("x-dead-letter-exchange", "dlx.topic");
argsReject.put("x-dead-letter-routing-key", "order.rejected"); // 指定死信路由键
channel.queueDeclare("queue.order.payment", true, false, false, argsReject);

// 业务队列B：处理会过期的订单消息（设置了TTL）
Map<String, Object> argsExpire = new HashMap<>();
argsExpire.put("x-dead-letter-exchange", "dlx.topic");
argsExpire.put("x-dead-letter-routing-key", "order.expired"); // 指定死信路由键
argsExpire.put("x-message-ttl", 600000); // 10分钟TTL
channel.queueDeclare("queue.order.ttl", true, false, false, argsExpire);

// 4. 生产者根据消息类型发送到不同队列
// 发送支付消息（可能被拒绝）-> queue.order.payment -> 失败后进入 dlq.order.rejected
channel.basicPublish("", "queue.order.payment", null, paymentMessage.getBytes());

// 发送订单消息（需要超时检查）-> queue.order.ttl -> 超时后进入 dlq.order.expired
channel.basicPublish("", "queue.order.ttl", null, orderMessage.getBytes());
使用 Header 交换器 + 消息属性（更灵活）

// 1. 声明 Headers 死信交换器
channel.exchangeDeclare("dlx.headers", "headers", true);

// 2. 声明死信队列并绑定，设置匹配规则
// 绑定规则：匹配 header 中 reason=rejected
Map<String, Object> bindArgsRejected = new HashMap<>();
bindArgsRejected.put("x-match", "all"); // 必须全部匹配
bindArgsRejected.put("reason", "rejected");
channel.queueDeclare("dlq.headers.rejected", true, false, false, null);
channel.queueBind("dlq.headers.rejected", "dlx.headers", "", bindArgsRejected);

// 绑定规则：匹配 header 中 reason=expired
Map<String, Object> bindArgsExpired = new HashMap<>();
bindArgsExpired.put("x-match", "all");
bindArgsExpired.put("reason", "expired");
channel.queueDeclare("dlq.headers.expired", true, false, false, null);
channel.queueBind("dlq.headers.expired", "dlx.headers", "", bindArgsExpired);

// 3. 声明一个业务队列，指向死信交换器
Map<String, Object> businessArgs = new HashMap<>();
businessArgs.put("x-dead-letter-exchange", "dlx.headers");
// 注意：这里不再需要 x-dead-letter-routing-key
channel.queueDeclare("queue.business.single", true, false, false, businessArgs);

// 4. 【关键】生产者在发送消息时，预定义死信原因头
AMQP.BasicProperties propertiesReject = new AMQP.BasicProperties.Builder()
        .headers(Collections.singletonMap("reason", "rejected")) // 预设头信息
        .build();
channel.basicPublish("", "queue.business.single", propertiesReject, messageForReject.getBytes());

AMQP.BasicProperties propertiesExpire = new AMQP.BasicProperties.Builder()
        .headers(Collections.singletonMap("reason", "expired"))
        .build();
channel.basicPublish("", "queue.business.single", propertiesExpire, messageForExpire.getBytes());
中间路由队列（最强大但最复杂）
所有死信先进入一个通用的死信队列 (dlq.general)。一个专用的消费者（通常是一个简单的应用程序）监听 dlq.general。这个消费者检查每条死信消息的 x-death头，解析出真正的死信原因（如 reason字段）。根据解析出的原因，该消费者作为生产者，将消息重新发布到另一个交换器，并路由到对应的最终死信队列 (dlq.final.rejected, dlq.final.expired)。
优先级队列：
优先级队列是一种特殊类型的队列，其中的消息拥有不同的优先级等级（一个数值）。当消费者准备消费消息时，优先级高的消息会先于优先级低的消息被投递。

// 1.声明一个优先级队列
ConnectionFactory factory = new ConnectionFactory();
        factory.setHost("localhost");
        try (Connection connection = factory.newConnection();
             Channel channel = connection.createChannel()) {

            // 设置队列参数，关键是指定最大优先级
            Map<String, Object> args = new HashMap<>();
            args.put("x-max-priority", 10); // 支持 0-10 共11个优先级级别

            // 声明一个优先级队列
            channel.queueDeclare("my-priority-queue", // 队列名
                    true,         // durable: 是否持久化
                    false,        // exclusive: 是否排他
                    false,        // autoDelete: 是否自动删除
                    args);        // arguments: 队列参数

            System.out.println(" [*] Priority queue declared.");
        }

// 2.生产者发送不同优先级的消息（如果未指定，默认是0，最低优先级）
// 发送一条高优先级消息 (priority = 10)
AMQP.BasicProperties highPriorityProps = new AMQP.BasicProperties.Builder()
        .priority(10) // 设置优先级为10（最高）
        .deliveryMode(2) // 2 表示消息持久化
        .build();

channel.basicPublish("", // 使用默认交换机
        "my-priority-queue", // 路由键为队列名
        highPriorityProps,
        "Urgent message! Priority 10.".getBytes());

// 发送一条低优先级消息 (priority = 1)
AMQP.BasicProperties lowPriorityProps = new AMQP.BasicProperties.Builder()
        .priority(1) // 设置优先级为1（较低）
        .deliveryMode(2)
        .build();

channel.basicPublish("",
        "my-priority-queue",
        lowPriorityProps,
        "Normal message. Priority 1.".getBytes());

System.out.println(" [x] Sent two messages with different priorities.");

// 3. 消费者消费
// 设置预取计数为1，以确保优先级机制的最佳效果
channel.basicQos(1);

DeliverCallback deliverCallback = (consumerTag, delivery) -> {
    String message = new String(delivery.getBody(), "UTF-8");
    Integer priority = delivery.getProperties().getPriority();
    System.out.println(" [x] Received '" + message + "' with Priority: " + priority);
    // 模拟处理工作
    try {
        doWork(message);
    } finally {
        System.out.println(" [x] Done");
        channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
    }
};

// 开始消费，关闭自动确认 (autoAck = false)
channel.basicConsume("my-priority-queue", false, deliverCallback, consumerTag -> {});
// ... 保持线程运行 ...

RabbitMQ 集群
我们可以在多个服务器上各部署一个 RabbitMQ 实例，并通过执行 RabbitMQ 提供的命令，将这些实例组成一个集群，从而解决单点故障问题。
普通的集群模式
在普通集群模式中，每个 Broker 都是一个完整功能的 RabbitMQ 实例，都能进行读写。他们之间会互相同步 Exchange 里的元数据，但不会同步 Queue 数据，即只同步数据读取方式。
对于写操作：生产者将消息写入到 Broker1 的 Queue1 后，Queue1 里的数据并不会同步给其他 broker。但如果此时 Broker1 的 Exchange 元数据有变化，则会将元数据同步到其他两个 Broker 中。
对于读操作：消费者想要读取 Queue1 数据时，如果访问的是 Broker1，则直接返回 Queue1 中的数据。如果访问的是 Broker2，Broker2 则会根据 Exchange 里的元数据，从 Broker1 那读取数据，再返回给消费者。
普通的集群模式虽然支持读写 Queue 的数量是增加了，但对于单个Queue 本身的读写能力，并没有提升。而且更重要的是，每个 Broker 依然有单点问题，Broker 之间并不同步 Queue 里的数据。某个 Queue 所在的 Broker 要是挂了，就没法读写这个 Queue 了。

镜像队列集群
镜像队列集群是在普通集群模式的基础上, 给 queue 在其他 broker 中加几个副本, 它们有主从关系，主 queue 负责读写数据，从 queue 负责同步复制主 queue 数据, 所以从 Queue 也叫镜像队列。一旦主 Queue 所在的 broker 挂了，从 Queue 就可以顶上成为新的主 Queue，实现高可用。
对于写操作：数据写入主 Queue 后，会将 Exchange 和 Queue 数据同步给其他 Broker 上。
对于读操作：消费者读取数据时，如果访问的是主 Queue所在的broker，则直接返回数据。否则，当前 broker 会从主 queue 所在的 broker 上读取数据，之后返回给消费者。
但这个方案的缺点也很明显，broker 间同步的数据量会变大，集群节点越多带宽压力越大，本质上镜像队列模式是通过牺牲吞吐量换取的高可用。反观前面的普通集群模式，虽然吞吐高但却牺牲了高可用。

Quorum 队列集群
我们可以使用更靠谱的一致性算法 raft ，来同步多个 broker 的元数据和队列数据，通过引入选举机制来解决网络分区问题，这就是所谓的 Quorum 队列集群。主要用于解决如果broker间通信断开，镜像队列可能出现多个节点都认为自己是主节点的情况，导致数据不一致，也就是所谓的脑裂问题。

## 面试总结
### 核心概念

RabbitMQ 基于 AMQP，核心对象是 Exchange、Queue、Binding、Routing Key、Producer 和 Consumer。它强调灵活路由和可靠投递。

### 面试官想考什么

面试官常问交换机类型、消息确认、死信队列、延迟队列、消费失败重试和如何避免消息丢失。

### 标准回答

生产者把消息发到 Exchange，Exchange 根据绑定规则路由到 Queue；消费者从 Queue 拉取或接收推送并 ack。可靠性依赖 publisher confirm、mandatory/return、队列和消息持久化、消费者手动 ack、重试与 DLQ。

### 深挖追问

- 如果消息处理成功但确认失败会怎样？
- 如何设计幂等键和补偿任务？
- 该方案在高并发或故障恢复时有什么边界？

### 实战场景/示例

订单创建后发送短信、积分、库存异步处理，可用 topic/direct exchange 分发到不同队列；失败消息进入死信队列后补偿。

### 易错点/总结

MQ 不是银弹。不要只说“加 MQ 解耦”，还要说明可靠投递、重复消费、顺序性、延迟、监控和补偿。

## 补充要点
### 核心概念

RabbitMQ 基于 AMQP，生产者把消息发到 Exchange，Exchange 根据类型、Binding 和 RoutingKey 路由到 Queue，消费者从 Queue 拉取或推送消费。可靠性依赖 publisher confirm、queue/message 持久化、manual ack、重试和死信队列。

### 面试官想考什么

- 是否理解 Exchange 不存储消息，Queue 才存储消息。
- 是否能区分 confirm、return、ack、nack/reject。
- 是否知道 direct、topic、fanout 的适用场景。
- 是否会设计死信、延迟和重试方案。

### 标准回答

RabbitMQ 的消息链路是 Producer → Exchange → Queue → Consumer。Exchange 负责路由，direct 按 RoutingKey 精确匹配，topic 支持通配符，fanout 广播到绑定队列。生产端开启 publisher confirm 确认 Broker 收到消息，设置 mandatory 处理不可路由消息；队列和消息都持久化才能在重启后尽量保留。消费端使用 manual ack，业务处理成功后 ack，失败时根据策略重试、nack 或进入死信队列。

### 深挖追问

- **消息如何做到可靠投递？** 生产 confirm + 持久化 + 手动 ack + 死信补偿 + 端到端对账。
- **如何实现延迟消息？** 可用 TTL + 死信交换机，或延迟消息插件。
- **prefetch 有什么作用？** 限制消费者未确认消息数量，避免单个消费者堆积过多消息。

### 示例/实战场景

用户注册后发送邮件、短信、站内信，可用 fanout 交换机广播到多个队列；订单支付超时关闭可用 TTL + DLX，让消息过期后进入取消订单队列。

### 易错点/总结

- confirm 是生产者侧确认，ack 是消费者侧确认。
- 只设置队列 durable 不够，消息也要 persistent。
- RabbitMQ 适合复杂业务路由，不适合无限堆积和超大日志流。
