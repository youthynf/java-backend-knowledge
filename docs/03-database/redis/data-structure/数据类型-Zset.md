# 数据类型-Zset

## 核心概念

ZSet（Sorted Set，有序集合）是在 Set 去重基础上，为每个 member 绑定一个 score，并按 score 排序的数据结构。原有要点需要保留并修正：Redis 早期在元素较少且元素较小时使用压缩列表 ziplist，否则使用跳表 skiplist + 字典；Redis 7.0 中 ziplist 已废弃，紧凑编码由 listpack 承担。常见阈值是元素个数小于 `zset-max-ziplist-entries`（旧版本默认 128）且 member 小于 `zset-max-ziplist-value`（旧版本默认 64 字节）。

ZSet 的典型命令有 `ZADD`、`ZREM`、`ZSCORE`、`ZRANK`、`ZREVRANK`、`ZRANGE`、`ZREVRANGE`、`ZRANGEBYSCORE`、`ZINCRBY`。跳表使范围查询、排名查询通常是 O(logN + M)，字典提供按 member 查 score 的 O(1) 能力。

## 面试官想考什么

- 是否知道 ZSet 既去重又按分数排序。
- 是否理解底层为什么是 skiplist + dict，而不是单纯一棵树。
- 是否能说出排行榜、延迟队列、权重排序等场景。
- 是否知道 score 精度、同分排序、大 Key 和范围查询的风险。

## 标准回答

ZSet 适合需要“唯一成员 + 排序”的场景，比如排行榜、热门文章、延迟任务队列。每个 member 唯一，score 可更新；按 score 排序可以做 TopN、区间查询，按 member 又能快速查分数。小数据用紧凑编码节省内存，数据变大后转为 skiplist + dict：dict 用于快速定位成员，skiplist 用于按 score 有序遍历。

如果面试问为什么不用 List 做排行榜，回答是：List 按位置访问和插入维护排名成本高，无法高效按 score 更新；ZSet 更新分数和查询排名更适配。

## 深挖追问

1. **score 相同怎么排序？** Redis 会按 member 字典序作为次序，因此同分排名要根据业务补充时间戳或二级排序策略。
2. **ZSet 能做延迟队列吗？** 可以用执行时间作为 score，消费者轮询 `ZRANGEBYSCORE` 取到期任务，再用 Lua 保证取出和删除原子性。
3. **为什么需要 dict？** 只用 skiplist 查 member 不够快；dict 可以 O(1) 找 member 对应 score。
4. **score 精度有什么坑？** score 是 double，超大整数或需要精确金额时不能直接用浮点表达。

## 实战场景 / 代码示例

```bash
# 游戏排行榜
ZADD rank:game 1001 user:1 990 user:2
ZREVRANGE rank:game 0 9 WITHSCORES
ZREVRANK rank:game user:1
ZINCRBY rank:game 10 user:2

# 延迟队列：score 为毫秒时间戳
ZADD delay:order 1782260000000 order:1001
ZRANGEBYSCORE delay:order -inf 1782260000000 LIMIT 0 10
```

延迟队列取任务建议用 Lua：先查到期 member，再 `ZREM`，只有删除成功的消费者才处理，避免并发重复消费。

## 易错点 / 总结

- ZSet 不是按插入顺序排序，而是按 score 排序。
- 排行榜要限制窗口，例如只保留最近一周或 TopN，避免无限增长。
- `ZRANGE 0 -1` 拉全量大 ZSet 风险很高。
- 延迟队列要处理重复消费、失败重试和任务幂等，Redis 不是完整 MQ。
- 总结：ZSet 的关键词是**唯一成员、score 排序、范围查询、排行榜/延迟队列**；面试要补充底层 skiplist + dict 与大 Key 风险。

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

