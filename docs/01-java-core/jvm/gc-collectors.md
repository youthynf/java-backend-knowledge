# GC 收集器

> 不同场景需要不同的 GC 收集器。理解各收集器的特点，才能做出正确的选择。

## 收集器全景图

```
      新生代收集器                    老年代收集器
  ┌──────────────┐              ┌───────────────────┐
  │    Serial    │──────搭配────│   Serial Old(MSC) │
  └──────────────┘              └───────────────────┘
  ┌──────────────┐              ┌───────────────────┐
  │  ParNew      │──────搭配────│      CMS          │
  └──────────────┘              └───────────────────┘
  ┌──────────────┐
  │  Parallel    │              ┌───────────────────┐
  │  Scavenge    │──────搭配────│   Parallel Old    │
  └──────────────┘              └───────────────────┘
  
  ┌──────────────────────────────────────────────────────┐
  │                    G1 (整堆收集)                      │
  │           新生代 + 老年代，分区管理                     │
  └──────────────────────────────────────────────────────┘
  
  ┌──────────────────────────────────────────────────────┐
  │                   ZGC / Shenandoah                    │
  │            超低延迟收集器（JDK 11+/12+）               │
  └──────────────────────────────────────────────────────┘
```

---

## 1. Serial 收集器

- **单线程**收集，STW 时只使用一个 GC 线程
- 新生代用复制算法，老年代用标记-整理
- **简单高效**，无多线程交互开销

```bash
# 启用参数
-XX:+UseSerialGC
```

**适用场景**：
- 客户端模式（桌面应用）
- 微服务中几十 MB 的小堆

> 虽然名字叫"Serial"，但它仍然是 JVM 的"兜底"收集器。

---

## 2. ParNew 收集器

- **Serial 的多线程版本**，使用多个 GC 线程进行新生代收集
- 老年代仍使用 Serial Old 或 CMS
- 是 CMS 收集器的默认新生代搭档

```bash
# 启用参数
-XX:+UseParNewGC          # ParNew + Serial Old（JDK 9 起废弃）
-XX:+UseConcMarkSweepGC   # CMS + ParNew（推荐写法）
-XX:ParallelGCThreads=4   # GC 线程数
```

**适用场景**：
- 配合 CMS 使用
- 中等堆大小服务端应用

---

## 3. Parallel Scavenge 收集器

- **吞吐量优先**的收集器
- 新生代复制算法，多线程收集
- 目标是达到一个可控制的吞吐量

```bash
# 启用参数
-XX:+UseParallelGC        # Parallel Scavenge + Serial Old
-XX:+UseParallelOldGC     # Parallel Scavenge + Parallel Old
-XX:MaxGCPauseMillis=200  # 最大 GC 停顿时间目标（尽力而为）
-XX:GCTimeRatio=99        # 吞吐量大小（99 = 1/(1+99)=1% 时间用于 GC）
-XX:+UseAdaptiveSizePolicy # 自适应调节策略（开启后不需要手动设 -Xmn 等）
```

**与 ParNew 的区别**：
- ParNew：配合 CMS，关注延迟
- Parallel Scavenge：关注吞吐量，自适应调节

**适用场景**：
- 后台计算型任务（批处理、离线分析）
- 不太关注延迟的场景

---

## 4. CMS 收集器（Concurrent Mark Sweep）

> **目标：最短回收停顿时间**。第一款真正意义上的并发收集器。

### 四个阶段

```
时间线:
──1.初始标记──2.并发标记──3.重新标记──4.并发清除──
   STW        并发        STW        并发
   短                     稍长
```

| 阶段 | STW？ | 说明 |
|------|-------|------|
| 初始标记 | ✅ | 标记 GC Roots 直接关联对象，速度很快 |
| 并发标记 | ❌ | 从 GC Roots 遍历整棵引用链，与用户线程并发 |
| 重新标记 | ✅ | 修正并发标记期间变动的引用（增量更新），比初始标记稍长 |
| 并发清除 | ❌ | 清除未标记对象，与用户线程并发 |

### CMS 的三个致命问题

**① CPU 敏感**
- 并发阶段占 CPU 资源，默认启动 (CPU数+3)/4 个 GC 线程
- CPU 核心数少时影响用户线程吞吐

**② 浮动垃圾**
- 并发清理阶段用户线程产生的新垃圾，只能下次 GC 清理
- 需要预留空间给用户线程，-XX:CMSInitiatingOccupancyFraction（默认 92% JDK5, 68% JDK6+）
- 预留不足 → Concurrent Mode Failure → 退用 Serial Old 全量收集（很慢！）

**③ 内存碎片**
- 标记-清除算法产生碎片
- -XX:+UseCMSCompactAtFullCollection：Full GC 后做压缩整理（默认开启）
- -XX:CMSFullGCsBeforeCompaction=0：多少次 Full GC 后做压缩（默认0，每次都压缩）

```bash
# CMS 参数
-XX:+UseConcMarkSweepGC
-XX:CMSInitiatingOccupancyFraction=75   # 老年代使用75%时触发
-XX:+UseCMSCompactAtFullCollection       # Full GC 后压缩
-XX:CMSFullGCsBeforeCompaction=2         # 2次 Full GC 后压缩
-XX:+CMSParallelRemarkEnabled            # 并行重新标记
```

> **JDK 9 起 CMS 被标记为废弃（Deprecated），JDK 14 正式移除。**

---

## 5. G1 收集器（Garbage First）

> **JDK 9 起默认收集器**。面向服务端，追求停顿时间可控。

### 核心设计：Region 分区

```
┌────┬────┬────┬────┬────┬────┬────┬────┐
│ E  │ S  │ O  │ H  │ E  │ O  │ E  │ O  │
│    │    │    │    │    │    │    │    │
├────┼────┼────┼────┼────┼────┼────┼────┤
│ O  │ E  │ E  │ O  │ S  │ E  │ O  │ E  │
│    │    │    │    │    │    │    │    │
└────┴────┴────┴────┴────┴────┴────┴────┘

E = Eden区  S = Survivor区  O = Old区  H = Humongous(大对象)
```

- 将堆划分为多个大小相等的 Region（1~32MB，默认约 2048 个）
- 每个 Region 可以是 Eden / Survivor / Old / Humongous
- 大对象（超过 Region 50%）直接分配在 Humongous Region

### 四个阶段

| 阶段 | STW？ | 说明 |
|------|-------|------|
| 初始标记 | ✅ | 标记 GC Roots 直接关联对象 |
| 并发标记 | ❌ | 从 Roots 遍历引用链，使用 SATB 快照 |
| 最终标记 | ✅ | 处理 SATB 缓冲区残留引用 |
| 筛选回收 | ✅ | 按回收价值排序 Region，优先回收收益高的 |

### G1 的优势

1. **停顿时间可预测**：-XX:MaxGCPauseMillis=200（默认200ms），G1 会尽量满足
2. **无内存碎片**：整体基于"标记-整理"，局部基于"复制"
3. **不需要连续空间**：Region 化，大对象也能灵活处理

```bash
# G1 参数
-XX:+UseG1GC
-XX:MaxGCPauseMillis=200     # 目标停顿时间
-XX:G1HeapRegionSize=4m      # Region 大小
-XX:InitiatingHeapOccupancyPercent=45  # 触发并发标记的堆占用阈值
-XX:G1NewSizePercent=5       # 新生代最小比例
-XX:G1MaxNewSizePercent=60   # 新生代最大比例
```

### G1 vs CMS

| 对比项 | CMS | G1 |
|--------|-----|-----|
| 算法 | 标记-清除 | 标记-整理/复制 |
| 碎片 | 有 | 无 |
| 停顿预测 | 不可控 | 可控（MaxGCPauseMillis） |
| 堆大小 | 建议 < 6GB | 建议 > 6GB |
| 内存布局 | 分代连续 | Region 化 |
| JDK 版本 | ≤ 8 | ≥ 9（默认） |

---

## 6. ZGC 收集器（JDK 11+）

> **超低延迟**：停顿时间 < 10ms，且不随堆大小增加而增长。

### 核心技术

| 技术 | 作用 |
|------|------|
| 染色指针 | 在指针中存储 GC 标记信息，无需额外 Map |
| 读屏障 | 在对象引用被读取时执行，修正指针（自愈） |
| 多重映射 | 同一物理内存映射到不同虚拟地址，配合染色指针 |

### 阶段

| 阶段 | STW？ | 耗时 |
|------|-------|------|
| 初始标记 | ✅ | 极短（< 1ms） |
| 并发标记 | ❌ | - |
| 再标记 | ✅ | 极短 |
| 并发转移准备 | ❌ | - |
| 初始转移 | ✅ | 极短 |
| 并发转移 | ❌ | - |

```bash
# ZGC 参数
-XX:+UnlockExperimentalVMOptions -XX:+UseZGC   # JDK 11-14
-XX:+UseZGC                                      # JDK 15+
-XX:ZCollectionInterval=0       # GC 间隔（0=按需）
-XX:ZAllocationSpikeTolerance=2 # 分配尖峰容忍度
-XX:SoftMaxHeapSize=4g          # 软最大堆（尽力不超过）
```

**适用场景**：
- 超大堆（TB 级）
- 对延迟极其敏感的在线服务
- JDK 21 引入分代 ZGC，进一步优化

---

## 7. Shenandoah 收集器（JDK 12+）

> RedHat 开发的低延迟收集器，目标停顿 < 10ms。

### 与 ZGC 的对比

| 对比项 | Shenandoah | ZGC |
|--------|-----------|-----|
| 开发者 | RedHat | Oracle |
| 指针技术 | Brooks Pointer（对象头额外字段） | 染色指针（指针本身编码） |
| 读屏障 | 有（修正转发指针） | 有（自愈染色指针） |
| 并发整理 | 对象移动与用户线程并发 | 对象移动与用户线程并发 |
| 平台支持 | 较广 | 最初仅 Linux/x64，后扩展 |

---

## 收集器选择指南

```
你的需求是什么？
│
├── 吞吐量优先（批处理/离线分析）
│   └── Parallel Scavenge + Parallel Old
│
├── 延迟敏感（在线服务）
│   ├── JDK 8
│   │   └── CMS（+ ParNew）
│   ├── JDK 9-14
│   │   └── G1
│   └── JDK 15+
│       ├── G1（通用）
│       ├── ZGC（超低延迟，大堆）
│       └── Shenandoah（超低延迟，RedHat）
│
├── 小堆（< 512MB）
│   └── Serial / G1
│
└── 默认选择
    ├── JDK 8  → Parallel Scavenge + Parallel Old
    └── JDK 9+ → G1
```

---

## 面试高频问题

### Q1: CMS 和 G1 的区别？

> CMS 用标记-清除算法，有内存碎片问题；G1 用 Region 分区 + 复制算法，无碎片。CMS 停顿时间不可控，G1 可以通过 MaxGCPauseMillis 设定目标。CMS 需要连续的堆空间，G1 的 Region 化更灵活。JDK 9 起 G1 成为默认，CMS 在 JDK 14 被移除。

### Q2: G1 的 "Garbage First" 是什么意思？

> G1 在筛选回收阶段，会根据每个 Region 中的垃圾占比（回收价值）排序，优先回收垃圾最多的 Region，这就是 "Garbage First" 的含义。

### Q3: ZGC 为什么能做到亚毫秒级停顿？

> ZGC 将几乎所有的 GC 工作都并发执行（标记、转移），只在初始标记和初始转移时短暂 STW。核心是染色指针 + 读屏障技术，使得对象移动时用户线程可以通过读屏障自动修正指针（自愈），不需要 STW 来更新引用。

### Q4: 如何选择 GC 收集器？

> 看场景：吞吐优先用 Parallel，延迟敏感用 G1/ZGC。JDK 8 默认 Parallel，JDK 9+ 默认 G1。堆大于 6GB 建议用 G1。对延迟要求极致（< 10ms）且堆较大的，用 ZGC。

---

[← 返回 JVM 目录](/01-java-core/jvm/README.md)

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **GC 收集器**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

GC 问题建议按“对象如何分配 → 如何判断存活 → 使用什么算法/收集器 → 什么时候触发 → 如何观察和调优”回答。不要只说某个收集器名称，要说明它的目标是吞吐、低延迟还是内存效率，以及它在不同代、不同阶段的行为。

## 深挖追问

- 可达性分析为什么比引用计数更适合 Java？
- Minor GC、Mixed GC、Full GC 的触发和影响有什么区别？
- CMS/G1/ZGC 等收集器的目标和典型适用场景是什么？
- GC 日志中如何判断是分配速率过高、晋升失败、内存泄漏还是参数不合理？

## 实战场景/代码示例

```bash
# 常见排查思路：先看进程参数，再看 GC 日志和堆使用趋势
jcmd <pid> VM.flags
jcmd <pid> GC.heap_info
jcmd <pid> GC.class_histogram
```

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

