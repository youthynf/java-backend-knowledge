# GC 日志怎么看

## 核心概念

GC 日志是 JVM 输出的垃圾回收活动记录，包含 GC 类型、触发原因、回收前后各区域大小、耗时等。看 GC 日志是排查 GC 问题的基础：通过日志能判断是 Minor GC 还是 Full GC、为什么触发、回收效率如何、停顿多长。

JDK 9+ 引入统一日志框架（Xlog），取代 JDK 8 的 `-XX:+PrintGCDetails` 等参数。生产环境一定要开启 GC 日志，配合 GCEasy / GCViewer 等工具分析。

```text
GC 日志关注点：
1. GC 类型：Young GC / Full GC / Mixed GC
2. 触发原因：Allocation Failure / System.gc() / Metadata GC Threshold
3. 回收前后各区域大小：Eden / Survivor / Old / Metaspace
4. 耗时：real / user / sys
5. 频率：通过时间戳看间隔
```

## 标准回答

GC 日志记录每次 GC 的类型、触发原因、回收前后内存变化、耗时。看日志关注五点：GC 类型、触发原因、回收前后大小、耗时、频率。JDK 8 用 `-XX:+PrintGCDetails`，JDK 9+ 用 `-Xlog:gc*`。分析工具：GCEasy（在线）、GCViewer（本地）、Eclipse MAT（dump 分析）。

要点：

1. **日志参数**：JDK 8 用 `-XX:+PrintGCDetails`，JDK 9+ 用 `-Xlog:gc*`。
2. **关注字段**：GC 类型、触发原因、回收前后大小、耗时、频率。
3. **健康模式**：Young GC 频繁但快，Full GC 极少。
4. **泄漏迹象**：老年代持续增长，Full GC 后不降。
5. **新生代配置不合理**：Young GC 太频繁或存活对象多。

## 如何开启 GC 日志

### JDK 8

```bash
-XX:+PrintGCDetails
-XX:+PrintGCDateStamps
-XX:+PrintGCTimeStamps
-XX:+PrintGCApplicationStoppedTime    # 打印 STW 时间
-XX:+PrintGCCause                     # 打印 GC 原因
-Xloggc:/var/log/gc.log
-XX:+UseGCLogFileRotation             # 日志轮转
-XX:NumberOfGCLogFiles=10
-XX:GCLogFileSize=50M
```

### JDK 9+

```bash
-Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags:filecount=10,filesize=50M
```

常用日志标签：

```bash
-Xlog:gc*                          # 所有 GC 日志
-Xlog:gc+heap=debug                # 堆详细信息
-Xlog:gc+phases=debug              # GC 阶段详情
-Xlog:gc+ergo*=debug               # 自动调节详情
-Xlog:safepoint                    # 安全点信息
```

## GC 日志解读

### Young GC 日志示例（JDK 8）

```text
2024-01-01T10:00:00.123+0800: 1.234: [GC (Allocation Failure)
  [PSYoungGen: 65536K->8192K(76288K)] 65536K->8192K(251392K), 0.0023456 secs]
  [Times: user=0.00 sys=0.00, real=0.00 secs]
```

字段含义：

| 字段 | 含义 |
|------|------|
| `2024-01-01T10:00:00.123+0800` | 时间戳 |
| `1.234` | JVM 启动后秒数 |
| `GC (Allocation Failure)` | GC 类型（Young GC），触发原因是分配失败 |
| `PSYoungGen` | 年轻代收集器（Parallel Scavenge） |
| `65536K->8192K(76288K)` | 年轻代：GC 前 65536K → GC 后 8192K（总容量 76288K） |
| `65536K->8192K(251392K)` | 整堆：GC 前 65536K → GC 后 8192K（总容量 251392K） |
| `0.0023456 secs` | GC 持续时间 |
| `user=0.00 sys=0.00, real=0.00` | CPU 时间（user 用户态，sys 内核态，real 实际） |

### Full GC 日志示例（JDK 8）

```text
2024-01-01T10:05:00.456+0800: 301.567: [Full GC (Metadata GC Threshold)
  [PSYoungGen: 10240K->0K(143360K)]
  [ParOldGen: 297876K->289123K(307200K)] 308116K->289123K(450560K),
  [Metaspace: 178543K->178543K(182272K)], 1.234567 secs]
  [Times: user=2.34 sys=0.12, real=1.23 secs]
```

关键字段：

- `Full GC`：全局回收，STW 暂停所有应用线程。
- `Metadata GC Threshold`：触发原因是元空间达到阈值。
- 各区域：PSYoungGen（年轻代）、ParOldGen（老年代）、Metaspace（元空间）。
- 耗时 `1.234567 secs`：对延迟敏感应用是灾难性的。

### G1 GC 日志示例（JDK 9+）

```text
[0.123s][info][gc,start ] GC(0) Pause Young (Normal) (G1 Evacuation Pause)
[0.123s][info][gc,task  ] GC(0) Using 4 workers of 4 for evacuation
[0.146s][info][gc,phases] GC(0)   Pre Evacuate Collection Set: 0.1ms
[0.146s][info][gc,phases] GC(0)   Evacuate Collection Set: 22.3ms
[0.146s][info][gc,phases] GC(0)   Post Evacuate Collection Set: 0.5ms
[0.146s][info][gc,phases] GC(0)   Other: 0.2ms
[0.146s][info][gc,heap  ] GC(0) Eden regions: 50->0(45)
[0.146s][info][gc,heap  ] GC(0) Survivor regions: 0->5(5)
[0.146s][info][gc,heap  ] GC(0) Old regions: 0->3
[0.146s][info][gc,heap  ] GC(0) Humongous regions: 0->0
[0.146s][info][gc,metaspace] GC(0) Metaspace: 20M->20M(64M)
[0.146s][info][gc       ] GC(0) Pause Young (Normal) (G1 Evacuation Pause) 23M->3M(256M) 22.567ms
```

G1 日志更详细，能看到：

- GC 阶段耗时（Pre Evacuate / Evacuate / Post Evacuate）。
- 各类 Region 数量变化（Eden / Survivor / Old / Humongous）。
- 总耗时和停顿时间。

## GC 日志模式识别

### 健康模式

- Young GC 频繁但每次很快（< 100ms）。
- Full GC 极少发生（几天一次甚至更少）。
- 老年代使用率在 GC 后下降。

### 内存泄漏迹象

- 老年代使用率随时间持续增长，Full GC 后也不下降。
- Full GC 频率逐渐增加。
- GC overhead limit exceeded。

### 新生代配置不合理

- Young GC 非常频繁（每分钟几次）。
- 每次 Young GC 后存活对象过多，过早晋升老年代。

### 直接内存或元空间问题

- Full GC 原因是 `Metadata GC Threshold`，看元空间使用。
- 进程 RSS 增长但堆稳定，看直接内存。

## 分析工具

### GCEasy

- 在线工具：https://gceasy.io
- 上传 GC 日志，自动分析。
- 提供吞吐量、停顿时间分布、内存趋势等图表。
- 适合快速分析生产环境日志。

### GCViewer

- 开源工具，本地运行。
- 可视化 GC 日志，生成 CSV 报告。
- 适合安全要求高的环境。

### jstat

```bash
jstat -gcutil <pid> 1000 10
# 每秒输出一次 GC 统计，共 10 次
```

输出：

```text
 S0     S1     E      O      M     CCS    YGC   YGCT   FGC  FGCT   GCT
 0.00  45.23  67.89  34.56  95.12  91.34   123   1.234   5   0.567  1.801
```

- S0/S1：Survivor 0/1 使用率。
- E：Eden 使用率。
- O：老年代使用率。
- M：元空间使用率。
- YGC/YGCT：Young GC 次数/总耗时。
- FGC/FGCT：Full GC 次数/总耗时。
- GCT：GC 总耗时。

## 代码示例

完整 GC 日志配置：

```bash
# JDK 8
java -Xms4g -Xmx4g -XX:+UseG1GC \
  -XX:+PrintGCDetails -XX:+PrintGCDateStamps -XX:+PrintGCCause \
  -XX:+PrintGCApplicationStoppedTime \
  -Xloggc:/var/log/gc.log \
  -XX:+UseGCLogFileRotation -XX:NumberOfGCLogFiles=10 -XX:GCLogFileSize=50M \
  -jar app.jar

# JDK 9+
java -Xms4g -Xmx4g -XX:+UseG1GC \
  -Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags:filecount=10,filesize=50M \
  -jar app.jar
```

## 实战场景

| 场景 | 关注点 | 工具 |
|------|--------|------|
| 接口偶发卡顿 | Young GC 停顿长 | GCEasy 看停顿分布 |
| Full GC 频繁 | 老年代增长快 | jstat + GC 日志 |
| 元空间增长 | Full GC 原因是 Metadata | GC 日志看 Metaspace |
| 容器 OOM Killed | 直接内存 | NMT + GC 日志 |

## 深挖追问

### user、sys、real 时间有什么区别？

- `user`：用户态 CPU 时间（GC 线程在用户态执行的总和）。
- `sys`：内核态 CPU 时间（系统调用）。
- `real`：实际墙钟时间。

并行 GC 时 `user` 可能大于 `real`（多核叠加）。如果 `real` 远大于 `user` + `sys`，说明 GC 受 IO 或 swap 影响。

### 怎么判断 GC 是否健康？

- **吞吐量**：GC 时间占总运行时间比例 < 5% 健康，> 10% 需调优。
- **停顿时间**：Young GC < 100ms，Full GC < 1s。
- **频率**：Young GC 间隔取决于业务，Full GC 应极少。
- **回收效率**：每次 GC 回收 80% 以上目标区域。

### G1 日志和 CMS 日志有什么不同？

G1 日志更详细，按阶段输出（Pre Evacuate / Evacuate / Post Evacuate），能看到每个阶段耗时。G1 还有 Mixed GC 日志，能看到回收的老年代 Region 数。CMS 日志按四个阶段（Initial Mark / Concurrent Mark / Remark / Concurrent Sweep）输出。

### GC 日志可以用来定位内存泄漏吗？

可以侧面判断。如果 Full GC 后老年代使用率仍很高且持续增长，是泄漏迹象。但要确认泄漏源，需要 heap dump + MAT 分析。GC 日志只能告诉你"有泄漏"，dump 才能告诉你"泄漏源在哪"。

## 易错点

- 把 `user` 时间当作实际停顿，实际停顿看 `real`。
- 只看一次 GC 日志就下结论，应该看一段时间趋势。
- 忽略触发原因，只看耗时。
- 把 GC 日志和 heap dump 混淆，前者是 GC 活动记录，后者是堆快照。
- JDK 9+ 还用 `-XX:+PrintGCDetails`，应改用 `-Xlog:gc*`。

## 总结

GC 日志是排查 GC 问题的基础，记录每次 GC 的类型、触发原因、回收前后大小、耗时。JDK 8 用 `-XX:+PrintGCDetails`，JDK 9+ 用 `-Xlog:gc*`。看日志关注 GC 类型、触发原因、回收前后大小、耗时、频率。健康模式：Young GC 频繁但快，Full GC 极少。分析工具：GCEasy（在线）、GCViewer（本地）、jstat（实时）。生产环境一定要开启 GC 日志。

## 参考资料

- [HotSpot Virtual Machine Garbage Collection Tuning Guide](https://docs.oracle.com/en/java/javase/17/gctuning/)
- [GCEasy](https://gceasy.io)
- [GCViewer](https://github.com/chewiebug/GCViewer)

---

[← 返回 GC 目录](/01-java-core/jvm/gc/)
