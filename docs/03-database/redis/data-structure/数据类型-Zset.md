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
