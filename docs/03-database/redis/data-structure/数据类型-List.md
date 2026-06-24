# 数据类型-List

## 核心概念

List 是 Redis 的字符串列表，按照插入顺序保存元素，可以从头部或尾部插入、弹出。原有内容需要保留：列表最大长度是 2^32 - 1；早期 List 底层可能使用双向链表或压缩列表 ziplist，当元素个数小于 512 且单个元素小于 64 字节时使用 ziplist，否则使用双向链表；但从 Redis 3.2 起，List 底层统一使用 **quicklist**，它可以理解为“链表 + listpack/ziplist”的折中结构，兼顾两端操作效率和内存局部性。

常用命令包括 `LPUSH`、`RPUSH`、`LPOP`、`RPOP`、`BLPOP`、`BRPOP`、`LRANGE`、`LTRIM`。两端 push/pop 通常 O(1)，按下标访问或中间插入删除是 O(N)。

## 面试官想考什么

- 是否知道 List 适合队列、栈、时间线等顺序场景。
- 是否知道 Redis 3.2 后底层是 quicklist。
- 是否理解 `LRANGE 0 -1`、大 List、阻塞弹出的风险。
- 是否能区分 List、Stream、ZSet 在消息/排序场景的边界。

## 标准回答

List 是有序、可重复的线性结构，适合从两端操作：左进右出可以做队列，左进左出可以做栈，`BLPOP/BRPOP` 可以做简单阻塞队列。底层 quicklist 把多个紧凑列表节点串起来，避免纯链表指针开销大，也避免纯连续内存扩容成本高。

如果只是轻量任务队列且允许简单消费，List 可以胜任；但如果需要消息 ID、消费组、ACK、重试和历史消息，应该优先考虑 Redis Stream 或专业 MQ。

## 深挖追问

1. **List 能做可靠消息队列吗？** 只能做简单队列；可用 `BRPOPLPUSH`/`BLMOVE` 做处理中队列，但 ACK、重试、堆积管理都要自己实现。
2. **为什么 quicklist 替代 ziplist + linkedlist？** 它在内存占用和两端操作之间折中，减少链表节点过多的指针开销。
3. **List 和 ZSet 时间线怎么选？** 严格按插入顺序且只从两端操作用 List；需要按时间戳分页、去重或排序用 ZSet。
4. **List 可以按下标分页吗？** 可以 `LRANGE`，但深分页仍是 O(N) 级别，不适合超大列表。

## 实战场景 / 代码示例

```bash
# 简单队列：生产者右进，消费者左出
RPUSH queue:email msg1 msg2
BLPOP queue:email 5

# 只保留最新 100 条动态
LPUSH feed:user:1001 post:9
LTRIM feed:user:1001 0 99
LRANGE feed:user:1001 0 19
```

Java 消费要注意超时和幂等：

```java
ListOperations<String, String> ops = redisTemplate.opsForList();
String msg = ops.leftPop("queue:email", Duration.ofSeconds(5));
if (msg != null) {
    // 业务处理必须幂等，失败要有重试或补偿
}
```

## 易错点 / 总结

- 不要把 List 当万能 MQ；可靠投递、ACK、消费组更适合 Stream/Kafka/RabbitMQ。
- 不要对超大 List 执行 `LRANGE 0 -1`。
- 中间位置操作和深分页不是 List 强项。
- 用作时间线时要配合 `LTRIM` 控制长度，避免无限增长。
- 总结：List 的关键词是**有序、可重复、两端高效、quicklist**；面试要说清它和 Stream/ZSet 的适用边界。

---

## 面试版详细讲解

### 核心概念

这道题属于 **Redis 数据结构** 的高频考点，核心要抓住：redisObject、dict、SDS、listpack、quicklist、intset、skiplist。Redis 会根据数据规模选择紧凑或高性能编码。回答时按类型语义、底层结构、复杂度、应用场景、风险治理展开。

### 面试官想考什么

面试官通常不是只想听定义，而是想确认你能否说明：类型语义、底层编码、复杂度、场景选择和 big key 风险；还能否把它和真实业务里的性能、可靠性、可维护性联系起来。

### 标准回答

Redis 会根据数据规模选择紧凑或高性能编码。回答时按类型语义、底层结构、复杂度、应用场景、风险治理展开。

答题时建议用“三段式”：

1. 先给结论，明确适用前提；
2. 再解释底层机制或执行过程；
3. 最后补充业务取舍、风险点和排查手段。

### 深挖追问

- 这个结论在高并发或大数据量下是否仍然成立？
- 它依赖哪些版本、配置、索引/编码或业务一致性要求？
- 线上异常时应该看哪些命令、日志、指标或执行计划？

### 示例 / 实战场景

用户资料整体读写用 String，字段更新用 Hash，去重用 Set，排行榜用 Zset，签到用 Bitmap，消息流用 Stream。

```bash
# 先小范围验证命令复杂度和返回量，避免线上直接扫大 key
redis-cli --scan --pattern 'biz:*' | head
redis-cli --bigkeys
```

### 易错点

- 只背概念，不说明适用场景、代价和边界。
- 忽略数据量、并发量、版本差异和线上配置，给出绝对化结论。
- 没有把问题落到可观测手段：执行计划、慢日志、监控指标、客户端超时或错误日志。

### 一句话总结

这类题的面试核心不是“知道名词”，而是能说清 **机制 + 取舍 + 落地排查**。先给稳定结论，再讲底层原因，最后结合业务场景说明如何使用和如何避免坑。

