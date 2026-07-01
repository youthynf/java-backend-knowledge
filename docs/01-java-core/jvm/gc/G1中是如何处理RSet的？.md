# G1 中是如何处理 RSet 的

## 核心概念

RSet（Remembered Set，已记忆集合）是 G1 垃圾收集器的核心数据结构，记录"哪些其他 Region 引用了当前 Region 的对象"。它解决了"分代回收时不需要全堆扫描"的问题：回收某个 Region 时，只需查它的 RSet 找到外部引用方，配合 GC Roots 即可确定存活对象。

RSet 本质是反向索引：Point-Out 记录"我引用了谁"，Point-In 记录"谁引用了我"。G1 用 Point-In，因为回收时高效（不需要全堆扫描）。

```text
Region A 引用 Region B 的对象
       │ Point-Out（A 的视角）
       │
       ▼
Region B 的 RSet 记录: "Region A 引用了我"  ← Point-In（B 的视角）

回收 B 时：扫 B 的 RSet → 找到 A → 检查 A 中引用 B 的 Card → 标记存活
```

## 标准回答

RSet 是 G1 中每个 Region 维护的反向引用索引，记录"哪些其他 Region 引用了当前 Region 的对象"。它用 Point-In 方式（被引用方记录引用方），回收某 Region 时只扫 RSet 而非全堆。RSet 用稀疏/细粒度/粗粒度三种粒度存储，平衡空间和精度。维护通过写后屏障 + Refine 线程异步完成。G1 严格控制哪些引用需要记录（只记录跨 Region 的老年代相关引用），避免 RSet 膨胀。

要点：

1. **Point-In 方向**：被引用方记录引用方，回收时高效。
2. **三种粒度**：稀疏（哈希表）、细粒度（位图按 Card）、粗粒度（位图按 Region）。
3. **维护机制**：写后屏障捕获引用变化，加入 DCQ，Refine 线程消费。
4. **三不记原则**：同区引用、新生代 → 新生代、新生代 → 老年代 不记。
5. **两必记原则**：老年代 → 老年代、老年代 → 新生代 必记。

## 为什么需要 RSet

### 问题背景

JVM 用根对象可达性分析标记存活对象。分代回收时，如果只回收新生代，理论上需要扫描老年代找"老年代引用新生代"的对象，否则新生代中"被老年代引用"的对象会被错误回收。但全堆扫描代价大，违背分代回收的初衷。

### 解决方案

RSet 记录每个 Region 的入向引用（哪些其他 Region 引用了自己）。回收某 Region 时：

1. 扫描 GC Roots 直接引用的对象。
2. 扫描该 Region 的 RSet，找到外部引用方。
3. 标记这些引用方指向当前 Region 的对象为存活。

这样就避免了全堆扫描，只需扫描 RSet 中记录的 Region。

## Point-Out vs Point-In

| 方向 | 含义 | 维护 | 标记时 |
|------|------|------|--------|
| Point-Out | 我引用了谁 | 简单 | 需全量扫描检查 |
| Point-In | 谁引用了我 | 复杂 | 高效，直接看 RSet |

G1 用 Point-In：维护复杂（每次引用变化都要更新被引用方的 RSet），但回收时高效（直接看 RSet）。

## 三种粒度

RSet 用 Per Region Table（PRT）记录，按引用密度分三种粒度：

| 模式 | 适用场景 | 记录方式 | 精度 | 速度 |
|------|---------|---------|------|------|
| 稀少 Sparse | 极少引用 | 哈希表，key=Region ID + Card 索引 | 对象级 | 最快 |
| 细粒度 Fine | 几十到几百 Card | 位图，每 bit 对应一个 Card（512B） | Card 级 | 中 |
| 粗粒度 Coarse | 大量引用 | 位图，每 bit 对应一个 Region | Region 级 | 最慢 |

G1 根据引用密度自动切换粒度，避免"受欢迎"Region 的 RSet 占用过多空间。

## RSet 维护

### 写后屏障

每次引用变化（如 `a.field = b`）触发写后屏障：

```text
def post_write_barrier(src, field, new_value):
    if 跨 Region 引用:
        card = get_card(src, field)
        mark_card_dirty(card)
        dcq.add(card)   # 加入 Dirty Card Queue
```

### Refine 线程

Refine 线程是 G1 的后台线程池，消费 DCQ 中的脏 Card，更新对应 Region 的 RSet。

- 默认线程数：`-XX:G1ConcRefinementThreads`（默认等于 `-XX:ParallelGCThreads`）。
- 三档调度：绿区/黄区/红区，DCQ 增长过快时启用更多线程。
- 极端情况下让 Mutator 线程（应用线程）帮助处理，会导致 STW，要避免。

## 三不记两必记

### 不需要记录的引用（三不记）

1. **同 Region 内引用**：扫描时自然覆盖。
2. **新生代 → 新生代**：YGC 全量扫描新生代，自然覆盖。
3. **新生代 → 老年代**：YGC 不扫老年代；Mixed GC 用新生代作根；FGC 全堆扫描。都不需要 RSet。

### 需要记录的引用（两必记）

1. **老年代 → 老年代**：Mixed GC 时只回收部分老年代 Region，需要知道哪些其他老年代 Region 引用了自己。
2. **老年代 → 新生代**：YGC 时新生代是回收目标，需要找老年代对新生代的引用，否则被老年代引用的新生代对象会被错误回收。

## 代码示例

理解引用记录的判断：

```java
// 假设 a 在 Region A，b 在 Region B
public class RSetDemo {
    Object a, b;

    public void test() {
        // 假设 a 在 OldA，b 在 OldB（跨 Region 老年代引用）
        a.field = b;  // 触发写屏障 → DCQ → Refine → 更新 OldB 的 RSet 记录 OldA

        // 假设 a 在 EdenA，b 在 EdenB
        a.field = b;  // 新生代 → 新生代，不记录

        // 假设 a 在 Old，b 在 Eden
        a.field = b;  // 老年代 → 新生代，记录到 Eden 所在 Region 的 RSet
    }
}
```

## 实战场景

| 场景 | 关注点 | 调优 |
|------|--------|------|
| RSet 占用过大 | 老年代大量跨 Region 引用 | 适当合并对象到同 Region |
| Refine 线程 CPU 高 | DCQ 增长过快 | 增大 `-XX:G1ConcRefinementThreads` |
| YGC 停顿长 | RSet 扫描慢 | 减少跨 Region 引用 |
| Full GC 频繁 | RSet 维护跟不上 | 增大堆或减小 IHOP |

## 深挖追问

### RSet 占用多少内存？

典型场景 RSet 占用堆的 1%~20%。如果一个 Region 被很多其他 Region 引用（"受欢迎" Region），RSet 会很大。G1 通过粗粒度模式降低空间占用，但代价是扫描时需要全 Region 扫描。

### 为什么不用 Card Table 替代 RSet？

Card Table 只能记录 Card 是否被修改（脏），不能直接告诉 GC"哪些 Region 引用了我"。RSet 是 Card Table 之上的反向索引，专门解决跨 Region 引用查找问题。两者配合：Card Table 是底层存储，RSet 是上层索引。

### Point-In 为什么比 Point-Out 好？

Point-In 维护复杂（每次引用变化都要更新被引用方的 RSet），但回收时高效（直接看 RSet 找到引用方）。Point-Out 维护简单，但回收时要全量扫描检查每个引用是否指向回收目标。GC 是读多写少的场景（回收频繁，引用变化也频繁但相对少），Point-In 整体更优。

### RSet 维护失败会怎样？

如果 Refine 线程跟不上 DCQ 增长，Mutator 线程会被拉入帮助处理，导致应用暂停。极端情况下 G1 会触发 Full GC 重新整理堆。生产环境要监控 Refine 线程的 CPU 占用，必要时增大 `-XX:G1ConcRefinementThreads`。

## 易错点

- 把 RSet 当作"我引用了谁"的索引，实际是"谁引用了我"。
- 以为所有引用都要记录，只有跨 Region 的老年代相关引用需要。
- 以为 RSet 是同步更新的，实际通过 DCQ + Refine 线程异步更新。
- 把 RSet 和 Card Table 混淆，Card Table 是底层存储，RSet 是上层索引。
- 以为 RSet 占用很小，"受欢迎" Region 的 RSet 可能占用 Region 自身的 5%~50%。

## 总结

RSet 是 G1 的核心数据结构，记录"哪些 Region 引用了当前 Region"，避免全堆扫描。用 Point-In 方向、三种粒度（稀疏/细粒度/粗粒度）平衡空间和精度。维护通过写后屏障 + DCQ + Refine 线程异步完成。三不记两必记原则控制 RSet 大小。理解 RSet 是理解 G1 YGC、Mixed GC、并发标记的基础。

## 参考资料

- [G1 Garbage Collector Implementation - Remembered Sets](https://openjdk.org/groups/hotspot/docs/HotSpotG1.html)
- 《深入理解 Java 虚拟机》周志明 第 3 章
- [G1 GC and RSet](https://plugins.jetbrains.com/plugin/9172-jvm-debugger-memory-view)

---

[← 返回 GC 目录](/01-java-core/jvm/gc/)
