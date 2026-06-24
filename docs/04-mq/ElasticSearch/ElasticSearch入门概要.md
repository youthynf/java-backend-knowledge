# ElasticSearch入门概要

ElasticSearch入门概要
一、概述
ElasticSearch是一款非常强大的、基于Lucene的开源搜索及分析引擎；它是一个实时的分布式搜索分析引擎，它能让你以前所未有的速度和规模，去探索你的数据。除了搜索，结合Kibana、Logstash、Beats开源产品，Elastic Stack（简称ELK）还被广泛运用在大数据近实时分析领域，包括：日志分析、指标监控、信息安全等。它可以帮助你探索海量结构化、非结构化数据，按需创建可视化报表，对监控数据设置报警阈值，通过使用机器学习，自动识别异常状况。
ElasticSearch是基于Restful WebApi，使用Java语言开发的搜索引擎库类，并作为Apache许可条款下的开放源码发布，是当前流行的企业级搜索引擎。其客户端在Java、C#、PHP、Python等许多语言中都是可用的。
二、ElasticSearch的基础概念
核心概念
•  Near Realtime（NRT） ：近实时。数据提交索引后，立马就可以搜索到。
•  Index（索引）：类似数据库的表，存储相关文档。
•  Type 类型：指在一个索引中，可以索引不同类型的文档，如用户数据、博客数据。从6.0.0 版本起已废弃，一个索引中只存放一类数据。
•  Document文档：索引的基本信息单元，以JSON格式来表示，如一条用户记录。
•  Shard（分片）：索引的分区，分为PrimaryShard（主分片）和ReplicaShard（副分片）；
•  Node（节点）：一个ES运行实例，存储数据并参与集群；
•  Cluster（集群）：多个Node组成的分布式系统，一个集群由一个唯一的名字标识，默认为“elasticsearch”。集群名称非常重要，具有相同集群名的节点才会组成一个集群。集群名称可以在配置文件中指定。

节点角色
•  Master Node：管理集群状态，如创建、删除索引，分片分配；
•  Data Node：存储索引数据，执行搜索、聚合操作；
•  Coordinating Node：接受客户端请求，转发到其他节点并汇总结果，默认节点都是Coordinating Node；
•  Ingest Node：数据预处理（如解析、转换）；

三、Elastic Stack生态
Elastic Stack组合：Beats + Logstash + ElasticSearch + Kibana。
Beats
Beats是一个面向轻量型采集器的平台，这些采集器可以从边缘机器向Logstash、ElasticSearch发送数据，它是由Go语言进行开发的，运行效率方面比较快。Beats存在多种套件，不同的Beats套件面向不同的数据源，如FileBeat、Packetbeat、Winlogbeat、Metricbeat、Heartbeat、Auditbeat、Functionbeat、Journalbeat等。
Logstash
Logstash是动态数据收集管道，拥有可扩展的插件生态系统，支持从不同来源采集数据，转换数据，并将数据发送到不同的存储库中。其能够与ElasticSearch产生强大的协同作用，后被Elastic公司在2013年收购。它具有如下特性：
•  实时解析和转换数据；
•  可扩展，具有200多个插件；
•  可靠性、安全性。Logstash会通过持久化队列来保证至少将运行中的事件送达一次，同时将数据进行传输加密；
•  监控；

ElasticSearch
ElasticSearch对数据进行搜索、分析和存储，其是基于JSON的分布式搜索和分析引擎，专门为实现水平可扩展性、高可靠性和管理便捷性而设计的。它的实现原理主要分为以下几个步骤：
•  首先用户将数据提交到ElasticSearch数据库中；
•  再通过分词控制器将对应的语句分词；
•  将分词结果及其权重一并存入，以备用户在搜索数据时，根据权重将结果排名和打分，将返回结果呈现给用户；

Kibana
Kibana实现数据可视化，其作用就是在ElasticSearch中进行民航。Kibana能够以图表的形式呈现数据，并且具有可扩展的用户界面，可以全方位的配置和管理ElasticSearch。Kibana最早的时候是基于Logstash创建的工具，后被Elastic公司在2013年收购。
•  Kibana可以提供各种可视化的图表；
•  可以通过机器学习的技术，对异常情况进行检测，用于提前发现可疑问题；

四、ELK演变
Beats + Logstash + ElasticSearch + Kibana框架是在Beats + ElasticSearch + Kibana框架的基础上引入了logstash。
引入logstash带来的好处如下：
•  Logstash具有基于磁盘的自适应缓冲系统，该系统将吸收传入的吞吐量，从而减轻背压。
•  从其他数据源（例如数据库，S3或消息传递队列）中提取。
•  将数据发送到多个目的地，例如S3，HDFS或写入文件。
•  使用条件数据流逻辑组成更复杂的处理管道。

beats结合logstash带来的优势：
•  水平可扩展性，高可用性和可变负载处理：beats和logstash可以实现节点之间的负载均衡，多个logstash可以实现logstash的高可用
•  消息持久性与至少一次交付保证：使用beats或Winlogbeat进行日志收集时，可以保证至少一次交付。从Filebeat或Winlogbeat到Logstash以及从Logstash到Elasticsearch的两种通信协议都是同步的，并且支持确认。Logstash持久队列提供跨节点故障的保护。对于Logstash中的磁盘级弹性，确保磁盘冗余非常重要。
•  具有身份验证和有线加密的端到端安全传输：从Beats到Logstash以及从 Logstash到Elasticsearch的传输都可以使用加密方式传递 。与Elasticsearch进行通讯时，有很多安全选项，包括基本身份验证，TLS，PKI，LDAP，AD和其他自定义领域；
•  增加更多的数据源，比如：TCP，UDP和HTTP协议是将数据输入Logstash的常用方法。

五、基本原理
数据写入原理
1.1 写入流程
•  客户端请求：想Coordination Node发送写入请求。
•  路由计算：根据文档_id的哈希值决定写入那个分片：

shard_num = hash(_id) % num_primary_shards
•  写入主分片：数据先写入内核缓冲区，同时追加到事务日志，用于崩溃恢复；
•  Refresh（可搜索）：默认每1秒，内核缓冲区的数据生成新的Segment（不可变），并打开供搜索（近实时）；
•  Flush（持久化）：每隔30分钟或事务日志达到512MB，触发Lucene Commit，将内核缓冲区清空，将Segment写入磁盘，清空事务日志；

1.2 关键机制
•  Refresh：是数据可搜索，默认1秒一次；
•  Flush：持久化数据到磁盘，事务日志大小大于512MB或30分钟；
•  Translog事务日志：主要用于崩溃恢复，每次写入数据都会追加；

数据搜索原理
2.1 数据搜索流程
•  Query Phase（查询阶段）：Coordination Node将查询广播到所有相关分片（主分片或副本），每个分片在本地执行查询，返回文档ID和排序值（如_score）；
•  Fetch Phase（取回阶段）：Coordination Node合并排序结果，取TopN，根据文档ID去对应的分片拉去完整数据。

2.2 倒排索引
•  核心结构：词项Term与文档列表Postings List的映射关系；
•  优化技术：使用FST压缩词项字典；使用Roaring Bitmaps搞笑存储文档ID集合；

2.3 相关打分（TF-IDF/BM25）
•  TF-IDF：TF（词频）表示词在文档中出现的次数；IDF逆文档频率，即词所在文档中的罕见程度；
•  BM25（ES默认算法）：改进版IF-IDF，对长文档更友好。

六、集群管理与分布式原理
分片分配与平衡
1.1 分片分配策略：
•  主分片和副本分片不会分配在同一节点。
•  新索引的分片均匀分布。

1.2 故障恢复：
•  Master Node 检测到节点离线后，重新分配其分片。

选举与脑裂问题
2.1 Master 选举：
•  基于 Zen Discovery 模块，通过 discovery.zen.minimum_master_nodes 防止脑裂（ES 7.x 后改用内置选举算法）。

2.2 脑裂（Split Brain）：
•  多个 Master 节点导致数据不一致。
•  解决方案：设置 minimum_master_nodes = (master_eligible_nodes / 2) + 1。

CAP 权衡
•  AP 系统（高可用 + 分区容忍）：默认优先可用性，但可通过 write_consistency 调整一致性级别。

七、总结
•  近实时搜索：依赖 Refresh 机制（默认 1 秒）。
•  分布式存储：分片（Shard）是数据的基本单元。
•  高可用：副本分片 + Master 选举。
•  性能关键：倒排索引、FST 压缩、BM25 算法。
Elasticsearch 的强大能力源于其 分布式设计 和 Lucene 的优化，合理使用需结合业务特点调整参数和架构。

<!-- 面试复习补充 -->

## 面试复习补充

### 核心概念

Elasticsearch 是基于倒排索引的分布式搜索和分析引擎，适合全文检索、日志检索和近实时聚合，不适合做强一致事务主库。

### 面试官想考什么

面试官常考倒排索引、分片副本、写入和搜索流程、refresh 近实时、深分页、数据同步一致性。

### 标准回答

ES 以 Index、Document、Shard、Replica 为核心。写入后需 refresh 才能被搜索，所以是近实时；业务主数据通常仍在数据库，ES 作为搜索视图，通过 MQ、Binlog 或定时任务同步。

### 深挖追问

- 如果消息处理成功但确认失败会怎样？
- 如何设计幂等键和补偿任务？
- 该方案在高并发或故障恢复时有什么边界？

### 实战场景/示例

商品搜索由 MySQL 维护主数据，变更后同步到 ES；同步失败要有补偿任务，否则搜索结果会与主库不一致。

### 易错点/总结

MQ 不是银弹。不要只说“加 MQ 解耦”，还要说明可靠投递、重复消费、顺序性、延迟、监控和补偿。

<!-- 面试复习强化 -->

## 面试复习强化

### 核心概念

ElasticSearch 是分布式搜索引擎，底层基于 Lucene。核心能力来自倒排索引：把词项映射到文档列表，适合全文检索。Index 类似逻辑库，Document 是文档，Mapping 定义字段类型，Shard/Replica 负责分片和高可用。

### 面试官想考什么

- 是否理解倒排索引、分词、相关性评分。
- 是否知道写入的 refresh、flush、translog 和 segment。
- 是否能解释深分页、冷热数据、mapping 设计和集群调优。

### 标准回答

ES 写入时文档先路由到主分片，写入内存 buffer 和 translog，再复制到副本；refresh 后生成可搜索 segment，所以 ES 是近实时搜索。查询时先在各分片执行 query phase 找到候选 doc id 和评分，再 fetch phase 拉取文档内容。优化上要提前设计 mapping，区分 keyword/text，控制分片数量，批量写入，调整 refresh_interval，避免 from+size 深分页，使用 search_after 或 scroll。

### 深挖追问

- **text 和 keyword 区别？** text 会分词用于全文检索，keyword 不分词用于精确匹配、排序、聚合。
- **为什么深分页慢？** 每个分片都要取大量候选再全局排序，越往后内存和 CPU 越大。
- **refresh 和 flush 区别？** refresh 让数据可搜索；flush 将内存和 translog 状态持久化，减少恢复成本。

### 示例/实战场景

商品搜索中商品名用 text + 中文分词，品牌、类目、状态用 keyword，价格用数值类型；搜索接口限制最大页数，超过用 search_after，并为热门查询做缓存和降级。

### 易错点/总结

- ES 不是强一致数据库，不适合替代交易库。
- 分片不是越多越好，小索引过多会拖垮集群元数据和内存。
- 聚合和排序字段要注意 doc_values 和字段基数。
