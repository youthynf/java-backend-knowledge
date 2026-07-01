# ZGC 垃圾收集器基本原理

## 核心概念

ZGC（The Z Garbage Collector）是 JDK 11 引入、JDK 15 转正、JDK 21 加入分代支持的低延迟垃圾收集器。它的核心目标是：在 TB 级堆上仍保持亚毫秒级停顿，且停顿时间不随堆大小增长。

ZGC 的三大核心技术：染色指针（Colored Pointer）、读屏障（Load Barrier）、多重映射（Multi-Mapping）。它们让 ZGC 几乎所有 GC 工作并发执行，STW 只在初始标记、再标记、初始转移三个阶段，每个都极短（< 1ms）。

```text
                  传统 GC              G1                  ZGC
堆大小            小                   中（< 64GB）         大（TB 级）
停顿时间          秒级                 100ms 级             < 1ms
停顿是否随堆增长   是                   是                   否
并发标记          部分                 是                   是
并发转移          否                   否                   是
```

## 标准回答

ZGC 是 JDK 15+ 生产可用的低延迟收集器，通过染色指针 + 读屏障 + 多重映射实现并发标记和并发转移，STW 时间 < 1ms（JDK 16+），且不随堆大小增长。ZGC 适用于 8MB~16TB 的堆，对延迟极其敏感的在线服务首选。

要点：

1. **染色指针**：把 GC 标记信息编码在 64 位指针的高 4 位，无需访问对象头。
2. **读屏障**：读取对象引用时插入，自动修正指针（自愈）。
3. **多重映射**：同一物理内存映射到 Marked0、Marked1、Remapped 三个虚拟地址。
4. **六个阶段**：初始标记 → 并发标记 → 再标记 → 并发转移准备 → 初始转移 → 并发转移。
5. **三个 STW**：初始标记、再标记、初始转移，每个 < 1ms。
6. **JDK 21 分代 ZGC**：引入分代，进一步降低开销。

## ZGC 设计目标

| 目标 | 指标 |
|------|------|
| 停顿时间 | < 10ms（JDK 11-14），< 1ms（JDK 16+） |
| 堆大小 | 8MB ~ 16TB |
| 停顿不随堆增长 | STW 只依赖 GC Roots 数量 |
| 并发执行 | 标记、转移都并发 |
| 适合大堆 | TB 级堆仍低延迟 |

## 三大核心技术

### 1. 染色指针 Colored Pointer

在 ZGC 之前，GC 标记信息存放在对象头的 Mark Word 中。访问对象才能知道标记状态。ZGC 把标记信息直接编码到 64 位指针的高 4 位：

```text
64 位指针布局（ZGC）：
┌─┬─┬─┬─┬───────────────────────────────────────┐
│0│0│0│0│        42 位对象地址（16TB）           │
└─┴─┴─┴─┴───────────────────────────────────────┘
  ↑ ↑ ↑ ↑
  │ │ │ └── Finalizable：finalize 处理
  │ │ └── Remapped：是否已重映射
  │ └── Marked1：标记周期 2
  └── Marked0：标记周期 1
```

四个标志位：

- **Marked0/Marked1**：交替用于标记周期，区分两次 GC。
- **Remapped**：表示指针已重映射到新地址。
- **Finalizable**：用于 finalize 处理。

优势：

- 无需访问对象头就能知道标记状态，提升 GC 效率。
- 标记过程变成"遍历引用图"而非"遍历对象图"。

### 2. 读屏障 Load Barrier

读屏障是 JIT 在每次从堆中读取对象引用时插入的代码。如果发现对象被转移过（指针视图与当前不一致），自动修正指针到新地址（自愈）。

```text
读屏障触发场景：
- 从堆中读取对象引用（field 访问、数组访问等）
- 不触发：局部变量赋值、基本类型读取

读屏障逻辑：
Object o = obj.fieldA;   // 触发读屏障
<Load barrier>           // 检查 o 的指针视图
                          // 如果不一致，修正指针（自愈）
Object p = o;             // 不触发（不是从堆读取）
int i = obj.fieldB;       // 不触发（不是引用类型）
```

读屏障的作用：

- 标记阶段：把 Remapped 视图的对象切换到 Marked0/1。
- 转移阶段：把 Marked0/1 视图的对象转移到新地址，视图切回 Remapped。
- 自愈：应用线程访问转移中的对象时，自动修正指针。

### 3. 多重映射 Multi-Mapping

ZGC 把同一块物理内存映射到三个虚拟地址空间：Marked0、Marked1、Remapped。同一时间只有一个视图有效。

```text
虚拟地址空间：       物理内存：
Marked0  ─────────┐
Marked1  ─────────┼──→  同一物理内存
Remapped ─────────┘
```

通过切换视图，ZGC 实现并发的标记和转移。这种"空间换时间"用的是虚拟地址空间，不占额外物理内存。

## 内存布局

ZGC 基于 Region 分配，但与 G1 不同：Region 大小动态，且不固定分代（JDK 21 引入分代）。

| Region 类型 | 大小 | 用途 |
|------------|------|------|
| Small | 2MB | < 256KB 的小对象 |
| Medium | 32MB | 256KB~4MB 的中对象 |
| Large | 可变（≥ 4MB） | ≥ 4MB 的大对象，每个 Large Region 只放一个对象 |

## GC 过程

ZGC 的 GC 周期分六个阶段：

| 阶段 | STW | 说明 |
|------|-----|------|
| 初始标记 Initial Mark | 是 | 标记 GC Roots 直接引用对象，STW 极短 |
| 并发标记 Concurrent Mark | 否 | 从 Roots 遍历引用链，与应用并发 |
| 再标记 Remark | 是 | 修正并发标记的不一致，< 1ms |
| 并发转移准备 Concurrent Prepare for Relocate | 否 | 扫描所有 Region，确定重分配集 |
| 初始转移 Initial Relocate | 是 | 转移 GC Roots 直接引用对象，STW 极短 |
| 并发转移 Concurrent Relocate | 否 | 转移存活对象到新 Region |

只有三个 STW 阶段，每个只与 GC Roots 数量成正比，与堆大小无关。

### 标记阶段细节

- 初始进入标记阶段时视图为 Marked0（或 Marked1 交替）。
- GC 线程访问对象时，把 Remapped 视图切换到 Marked0。
- 应用线程通过读屏障同样切换视图。
- 标记结束后，Marked0 视图的对象是存活的，Remapped 视图的对象是垃圾。

### 转移阶段细节

- 转移阶段视图切回 Remapped。
- GC 线程把 Marked0 视图的对象转移到新地址，视图设为 Remapped。
- 应用线程通过读屏障访问转移中的对象时，自动修正指针（自愈）。
- 旧的虚拟地址通过多重映射仍可访问，避免悬挂指针。

## JDK 版本演进

| 版本 | 改进 |
|------|------|
| JDK 11 | 实验性引入 ZGC，停顿 < 10ms |
| JDK 13 | 增加取消未使用内存归还 |
| JDK 15 | 转正为生产可用 |
| JDK 16 | 停顿 < 1ms，支持就地转移（不预留内存） |
| JDK 21 | 引入分代 ZGC，性能进一步提升 |

## 关键参数

```bash
# JDK 11-14（实验性）
-XX:+UnlockExperimentalVMOptions -XX:+UseZGC

# JDK 15+
-XX:+UseZGC

# 重要参数
-XX:ConcGCThreads=2          # 并发 GC 线程数（默认 CPU 的 12.5%）
-XX:ParallelGCThreads=6      # STW GC 线程数（默认 CPU 的 60%）
-XX:ZCollectionInterval=0    # GC 最小间隔（秒），0=按需
-XX:ZAllocationSpikeTolerance=2  # 分配尖峰容忍度，越大越早触发
-XX:SoftMaxHeapSize=4g       # 软最大堆（尽力不超过）
-XX:+ZProactive             # 主动 GC（默认开启）
```

## 触发时机

ZGC 多种 GC 触发机制：

| 触发方式 | 日志关键字 | 说明 |
|---------|-----------|------|
| 阻塞分配触发 | Allocation Stall | 堆满时阻塞分配，应避免 |
| 自适应算法 | Allocation Rate | 主流方式，按分配速率预测 |
| 固定间隔 | Timer | 应对流量突增 |
| 主动触发 | Proactive | ZGC 自行算时机 |
| 预热 | Warmup | 启动初期 |
| System.gc() | System.gc() | 外部触发 |
| 元数据触发 | Metadata GC Threshold | 元空间不足 |

## 推荐配置

```bash
# JDK 21 大堆低延迟
-Xms16g -Xmx16g \
-XX:+UseZGC \
-XX:SoftMaxHeapSize=12g \
-XX:+HeapDumpOnOutOfMemoryError \
-XX:HeapDumpPath=/var/log/heap.hprof \
-XX:ConcGCThreads=4 \
-XX:ParallelGCThreads=12 \
-XX:+DisableExplicitGC \
-Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags:filecount=10,filesize=100M
```

## 实战场景

| 场景 | ZGC 优势 |
|------|---------|
| 大堆（16GB+） | 停顿不随堆增长 |
| 延迟敏感在线服务 | < 1ms 停顿 |
| 实时交易系统 | 几乎无感知的 GC |
| 大数据分析 | TB 级堆仍可管理 |

## 深挖追问

### ZGC 为什么能做到亚毫秒级停顿？

ZGC 把几乎所有 GC 工作并发执行：并发标记、并发转移。STW 只在初始标记、再标记、初始转移，每个只依赖 GC Roots 数量（通常几万个），与堆大小无关。染色指针 + 读屏障让对象转移时不需要 STW 更新引用，应用线程通过读屏障自愈。

### ZGC 的读屏障开销大吗？

读屏障在每次从堆读取引用时插入，理论上开销大。但 JIT 通过硬件优化（预测加载、寄存器缓存）降低实际开销。生产实测读屏障开销约 5%~10% 吞吐量损失，换来 < 1ms 停顿。

### JDK 21 的分代 ZGC 有什么改进？

分代 ZGC 引入分代假设（新生代、老年代），减少扫描全堆的开销。年轻代对象多但存活短，单独回收年轻代可以更快释放内存，降低 Old Region 的扫描压力。实测分代 ZGC 吞吐量提升 10%~20%，停顿时间不变。

### ZGC 和 G1 怎么选？

- 堆 < 16GB：G1 足够，参数成熟，文档丰富。
- 堆 16GB~64GB：G1 仍可用，但停顿开始增长。
- 堆 > 64GB 或对延迟极致要求：ZGC。
- JDK 8：ZGC 不可用，只能用 G1/CMS。

## 易错点

- 以为 ZGC 完全无 STW，实际有 3 个 STW 阶段，只是极短（< 1ms）。
- 把染色指针当作"指针压缩"，染色指针是 GC 标记编码，指针压缩是缩小指针大小。
- 以为读屏障对每次变量访问都触发，只对从堆读取引用触发。
- 以为 ZGC 适合所有场景，小堆场景 G1/Serial 更合适。
- 在 JDK 11/14 用 ZGC 忘记加 `-XX:+UnlockExperimentalVMOptions`。

## 总结

ZGC 是 JDK 15+ 生产可用的低延迟收集器，通过染色指针 + 读屏障 + 多重映射实现并发标记和并发转移，STW 时间 < 1ms 且不随堆增长。适用于 8MB~16TB 的堆，对延迟极其敏感的在线服务首选。JDK 21 引入分代 ZGC，进一步提升性能。理解 ZGC 的三大核心技术是阅读其源码和调优大堆应用的基础。

## 参考资料

- [JEP 377: ZGC: A Scalable Low-Latency Garbage Collector](https://openjdk.org/jeps/377)
- [JEP 439: Generational ZGC](https://openjdk.org/jeps/439)
- 《新一代垃圾回收器 ZGC 设计与实现》彭成寒

---

[← 返回 GC 目录](/01-java-core/jvm/gc/)
