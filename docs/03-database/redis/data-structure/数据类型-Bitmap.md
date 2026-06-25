# 数据类型-Bitmap

## 核心概念

Bitmap 严格来说不是 Redis 新的数据结构，而是基于 String 的位操作能力：一个 bit 表示一个二值状态，适合签到、活跃标记、布隆过滤器底层位数组等场景。原有要点：String 最大 512MB，因此一个 Bitmap 最多可表示约 2^32 个 bit；Redis 通过 `SETBIT`、`GETBIT`、`BITCOUNT`、`BITOP`、`BITPOS` 等命令操作位。

Bitmap 的优势是内存极省：如果用 userId 作为 offset，1 亿用户的每日签到状态理论上约 12MB 就能表示。但它要求 offset 可控且不能过度稀疏，否则最高 offset 决定底层字符串长度，会造成内存浪费。

## 面试官想考什么

- 是否知道 Bitmap 是 String 的位操作，不是独立容器。
- 是否能说出签到、活跃统计、布隆过滤器等典型场景。
- 是否理解 offset 稀疏导致内存膨胀。
- 是否知道 `BITCOUNT`、`BITOP` 这类统计命令的复杂度风险。

## 标准回答

Bitmap 用一个 bit 表示一个用户或对象的布尔状态，例如某天是否签到、某功能是否开启。写入时 `SETBIT key offset 1`，查询时 `GETBIT key offset`，统计时 `BITCOUNT key`。它非常节省内存，适合状态只有 0/1 且 ID 可以映射为连续 offset 的场景。

如果用户 ID 是长整型且非常稀疏，不能直接当 offset，应该做映射、分桶或改用 Set。Bitmap 只适合布尔状态；如果要保存数量、时间、对象详情，应该选择 Hash、String 或 ZSet。

## 深挖追问

1. **Bitmap 最大能多大？** 受 String 最大 512MB 限制，约 2^32 bit。
2. **为什么稀疏 ID 有问题？** Redis 会扩展字符串到最高 offset，对一个很大的 offset 置位可能直接申请大量内存。
3. **如何统计连续签到？** 可按用户维度存月份 Bitmap，然后位移或逐位判断；也可按天维度统计活跃人数。
4. **Bitmap 和 Set 怎么选？** 用户集合稀疏、需要保存具体成员时用 Set；连续 ID 的布尔状态用 Bitmap 更省内存。

## 实战场景 / 代码示例

```bash
# 2026-06-24 用户 1001 签到
SETBIT sign:20260624 1001 1
GETBIT sign:20260624 1001
BITCOUNT sign:20260624

# 统计两天都活跃的用户数
BITOP AND active:both active:20260623 active:20260624
BITCOUNT active:both
```

## 易错点 / 总结

- 不能把稀疏大 ID 直接作为 offset。
- `BITCOUNT` 对大 Bitmap 是 O(N)，不要在高峰期频繁全量统计。
- Bitmap 表达的是 0/1 状态，无法保存复杂业务信息。
- 需要清理历史 key，避免按天/月生成后无限堆积。
- 总结：Bitmap 的关键词是**String 位操作、布尔状态、极致省内存、offset 风险**。
