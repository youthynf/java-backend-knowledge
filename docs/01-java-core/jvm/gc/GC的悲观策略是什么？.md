# GC 的悲观策略是什么

## 核心概念

GC 悲观策略（Pessimistic Policy）是 Parallel Scavenge 和 Serial GC 在 Minor GC 前的预测机制：如果预测"Minor GC 后老年代无法容纳晋升对象"，直接触发 Full GC 而不是 Minor GC，避免"Minor GC 后还要 Full GC"的双重停顿。

悲观策略是 JVM 在"冒险 Minor GC"和"直接 Full GC"之间的取舍。它解决的问题是：分代回收中，老年代作为新生代的"担保方"，如果担保不足，应该提前 Full GC 而不是事后补救。

```text
Minor GC 前检查：
1. 老年代可用空间 < 新生代历次晋升平均大小？
   ├─ 是 → 触发 Full GC（悲观策略）
   └─ 否 → 继续 Minor GC
2. 老年代可用空间 < 新生代所有对象总大小？
   ├─ 是 + 不允许冒险 → Full GC
   ├─ 是 + 允许冒险 + 历次晋升平均大小 < 老年代 → 尝试 Minor GC
   └─ 否 → Minor GC
```

## 标准回答

GC 悲观策略是 Parallel Scavenge 和 Serial GC 的预测机制：Minor GC 前预测老年代是否能容纳晋升对象，不能则直接 Full GC。它避免了"Minor GC 后还要 Full GC"的双重停顿。触发条件：老年代可用空间小于历次晋升平均大小，或老年代无法容纳新生代所有对象。G1 用 IHOP + 并发标记代替悲观策略，更主动。

要点：

1. **触发条件 1**：老年代可用空间 < 历次晋升平均大小。
2. **触发条件 2**：老年代可用空间 < 新生代所有对象总大小。
3. **目的**：避免双重停顿（Minor GC + Full GC）。
4. **适用**：Parallel Scavenge、Serial GC。
5. **G1 替代**：IHOP + 并发标记，更主动。

## 悲观策略的触发条件

Parallel Scavenge 和 Serial GC 在 Minor GC 前检查两个条件：

### 条件 1：历次晋升平均大小

老年代可用空间 < 新生代历次晋升到老年代的平均大小。

JVM 维护"历次 Minor GC 晋升到老年代的对象平均大小"统计。如果当前老年代剩余空间 < 平均晋升大小，预测本次 Minor GC 晋升后老年代会满，直接 Full GC。

### 条件 2：新生代总大小

老年代可用空间 < 新生代所有对象总大小（最坏情况：所有新生代对象都晋升）。

如果连最坏情况都容纳不下，且不允许冒险（`-XX:-HandlePromotionFailure`），直接 Full GC。

### HandlePromotionFailure

`-XX:+HandlePromotionFailure`（JDK 6 后默认开启）允许冒险：

- 即使老年代 < 新生代总大小，只要 ≥ 历次晋升平均大小，仍尝试 Minor GC。
- Minor GC 后 Survivor 装不下，通过空间分配担保进老年代。
- 老年代也装不下，触发 Full GC（事后补救）。

## 悲观策略的目的

避免"Minor GC + Full GC"双重停顿。

```text
无悲观策略：
1. Minor GC（停顿 100ms）
2. 晋升对象进老年代失败
3. Full GC（停顿 1s）
总停顿：1.1s

有悲观策略：
1. 预测老年代不够
2. 直接 Full GC（停顿 1s）
总停顿：1s
```

省下的 100ms 看似不多，但在延迟敏感场景下能减少抖动。

## 与 G1 的对比

G1 不用悲观策略，用更主动的方式：

- **IHOP**：`-XX:InitiatingHeapOccupancyPercent=45`，老年代占用 45% 触发并发标记。
- **并发标记**：标记存活对象，识别垃圾多的 Region。
- **Mixed GC**：选择回收价值高的 Region，可预测停顿。

G1 的优势：

- 不需要"悲观预测"，而是主动触发并发标记。
- 并发标记与用户线程并发，不影响吞吐。
- Mixed GC 可控停顿，避免单次 Full GC 的长停顿。

## 代码示例

观察悲观策略触发：

```bash
# JDK 8 Parallel Scavenge
-Xms1g -Xmx1g -Xmn512m -XX:+UseParallelGC \
-XX:+PrintGCDetails -XX:+PrintGCCause

# 当老年代接近满时，Minor GC 可能升级为 Full GC
# 日志中会看到：
# GC (Allocation Failure) [PSYoungGen: ...] 
# 后跟 Full GC
```

## 实战场景

| 场景 | 表现 | 调优 |
|------|------|------|
| Full GC 频繁但老年代未满 | 悲观策略触发 | 增大老年代，避免晋升波动 |
| Survivor 装不下 | 触发空间分配担保 | 增大 SurvivorRatio |
| G1 Mixed GC 慢 | Region 选择不合理 | 调整 IHOP 和 MixedGCCountTarget |

## 深挖追问

### 悲观策略是好是坏？

是 JVM 的取舍。好处：避免双重停顿，减少抖动。坏处：可能误判，本可以 Minor GC 的却触发 Full GC。生产环境如果频繁因悲观策略触发 Full GC，说明老年代配置不合理或对象晋升波动大，应增大老年代或调整 SurvivorRatio。

### G1 为什么不用悲观策略？

G1 用并发标记 + Mixed GC 代替悲观策略。并发标记在后台运行，提前识别垃圾多的 Region，Mixed GC 按回收价值排序回收。这种主动方式不需要"悲观预测"，且能控制停顿时间。G1 的设计目标就是"可预测停顿"，悲观策略与这个目标冲突。

### 怎么避免悲观策略触发 Full GC？

- 增大老年代：让历次晋升平均大小相对老年代变小。
- 增大 Survivor：减少直接晋升老年代的对象。
- 调小 MaxTenuringThreshold：让对象在 Survivor 多复制，减少晋升。
- 控制对象分配速率：减少大对象和长期对象。
- 用 G1：避免悲观策略。

### HandlePromotionFailure 在 JDK 6 后为什么默认开启？

JDK 6 之前默认关闭，导致老年代 < 新生代总大小就触发 Full GC，过于保守。JDK 6 后默认开启，允许冒险，减少不必要的 Full GC。统计表明，绝大多数 Minor GC 的实际晋升大小远小于新生代总大小，冒险成功率高。

## 易错点

- 把悲观策略当作 G1 的特性，实际是 Parallel Scavenge 和 Serial GC 的。
- 以为悲观策略能消除 Full GC，只是减少双重停顿。
- 把 HandlePromotionFailure 和悲观策略混淆，前者控制是否冒险，后者是预测机制。
- 以为 G1 也有悲观策略，G1 用 IHOP + 并发标记代替。
- 忽略历次晋升平均大小，只看当前老年代使用率。

## 总结

GC 悲观策略是 Parallel Scavenge 和 Serial GC 的预测机制：Minor GC 前预测老年代是否容纳晋升对象，不能则直接 Full GC，避免双重停顿。触发条件：老年代 < 历次晋升平均大小，或老年代 < 新生代总大小。HandlePromotionFailure 控制是否冒险。G1 用 IHOP + 并发标记代替悲观策略，更主动。生产环境如果频繁因悲观策略触发 Full GC，说明老年代配置不合理。

## 参考资料

- [HotSpot Virtual Machine Garbage Collection Tuning Guide](https://docs.oracle.com/en/java/javase/17/gctuning/)
- 《深入理解 Java 虚拟机》周志明 第 3 章
- [Parallel GC Ergonomics](https://docs.oracle.com/en/java/javase/17/gctuning/parallel-collector1.html)

---

[← 返回 GC 目录](/01-java-core/jvm/gc/)
