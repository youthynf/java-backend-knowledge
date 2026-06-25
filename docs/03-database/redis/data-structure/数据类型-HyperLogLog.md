# 数据类型-HyperLogLog

## 核心概念

HyperLogLog 是 Redis 用于基数统计（去重计数）的概率型数据结构，常用于 UV、独立访客、搜索词去重数量等场景。原有要点：它的优势是占用内存极低，每个 key 标准稠密结构约 12KB，就可以估算非常大的基数；缺点是有误差，Redis HyperLogLog 标准误差约 0.81%。

常用命令只有几个：`PFADD` 添加元素，`PFCOUNT` 统计估算基数，`PFMERGE` 合并多个 HyperLogLog。它不能返回具体元素，也不能判断某个元素是否存在，只能做“去重后的数量估算”。

## 面试官想考什么

- 是否知道 HyperLogLog 是概率统计结构，有误差但省内存。
- 是否能区分 HyperLogLog、Set、Bitmap 的场景。
- 是否理解它只能计数，不能取成员列表。
- 是否能说明 UV 统计如何按天、按页面设计 key。

## 标准回答

HyperLogLog 适合海量数据去重计数，比如统计每天网站 UV。使用 Set 也能精确去重，但用户量很大时内存会随元素数线性增长；HyperLogLog 内存基本固定，但结果是近似值。面试中可以强调：如果业务能接受 1% 左右误差，HyperLogLog 很合适；如果必须精确或需要回查具体用户，就不能用它。

典型设计是按日期和业务维度建 key，例如 `uv:home:20260624`，访问时 `PFADD` 用户标识，报表时 `PFCOUNT`，多天统计时 `PFMERGE` 后再计数。

## 深挖追问

1. **HyperLogLog 能删除元素吗？** 不能。它不是保存元素集合，而是维护概率统计寄存器。
2. **为什么不能判断用户是否访问过？** 因为原始成员不可逆，结构只保留估算所需状态。
3. **和 Bitmap 比怎么选？** Bitmap 适合连续用户 ID 的精确 0/1 状态；HLL 适合任意标识的大规模近似 UV。
4. **多页面总 UV 怎么算？** 可以 `PFMERGE uv:all uv:page1 uv:page2`，再 `PFCOUNT uv:all`。

## 实战场景 / 代码示例

```bash
# 记录首页 UV
PFADD uv:index:20260624 user:1001 user:1002
PFADD uv:index:20260624 user:1001
PFCOUNT uv:index:20260624

# 合并一周 UV
PFMERGE uv:index:2026w26 uv:index:20260624 uv:index:20260625 uv:index:20260626
PFCOUNT uv:index:2026w26
```

## 易错点 / 总结

- HyperLogLog 有误差，不能用于金额、库存、权限这类必须精确的场景。
- 不能取出成员，不能删除成员，不能做存在性判断。
- 小数据量或必须精确时 Set 更直接。
- key 要按时间分区，并设置保留周期，避免报表 key 无限增长。
- 总结：HyperLogLog 的关键词是**基数统计、近似去重、固定内存、不可回查成员**。
