# JVM 参数速查表

> JVM 参数众多，这里按类别整理最常用的参数，方便快速查阅。

## 参数格式说明

| 格式 | 说明 | 示例 |
|------|------|------|
| -Xxx | 标准参数，所有 JVM 都支持 | -Xms, -Xmx |
| -XX:+Flag | 布尔开关，启用 | -XX:+UseG1GC |
| -XX:-Flag | 布尔开关，关闭 | -XX:-UseCompressedOops |
| -XX:key=value | 键值对 | -XX:MaxGCPauseMillis=100 |

---

## 1. 堆内存参数

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| -Xms | 堆初始大小 | 物理内存/64 | 与 -Xmx 相同 |
| -Xmx | 堆最大大小 | 物理内存/4 | 根据应用需要 |
| -Xmn | 新生代大小 | - | 堆的 1/3 ~ 1/2 |
| -XX:NewRatio | 老年代/新生代比例 | 2 | 2（即1:2） |
| -XX:SurvivorRatio | Eden/Survivor比例 | 8 | 6~8 |
| -XX:MaxTenuringThreshold | 对象晋升老年代年龄 | 15 | 6~15 |
| -XX:PretenureSizeThreshold | 大对象直接进老年代的阈值 | 0（不限制） | 按需设置 |
| -XX:+UseAdaptiveSizePolicy | 自适应新生代大小 | G1开启 | - |

## 2. 栈内存参数

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| -Xss | 每个线程的栈大小 | 512K~1M | 256K~1M |

## 3. 元空间参数

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| -XX:MetaspaceSize | 元空间初始大小 | ~21M | 256M |
| -XX:MaxMetaspaceSize | 元空间最大大小 | 无限制 | 256M~512M |
| -XX:MinMetaspaceFreeRatio | GC后最小空闲比例 | 40 | - |
| -XX:MaxMetaspaceFreeRatio | GC后最大空闲比例 | 70 | - |

## 4. 直接内存参数

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| -XX:MaxDirectMemorySize | 直接内存最大值 | 与-Xmx相同 | 按需限制 |
| -XX:+DisableExplicitGC | 禁止System.gc() | 关闭 | 生产开启 |

## 5. GC 收集器参数

| 参数 | 选择 |
|------|------|
| -XX:+UseSerialGC | Serial + Serial Old |
| -XX:+UseParNewGC | ParNew + Serial Old |
| -XX:+UseParallelGC | Parallel Scavenge + Serial Old |
| -XX:+UseParallelOldGC | Parallel Scavenge + Parallel Old |
| -XX:+UseConcMarkSweepGC | ParNew + CMS + Serial Old(备用) |
| -XX:+UseG1GC | G1（JDK 9+ 默认） |
| -XX:+UseZGC | ZGC（JDK 15+） |
| -XX:+UseShenandoahGC | Shenandoah（JDK 12+） |

## 6. G1 参数

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| -XX:MaxGCPauseMillis | 目标最大停顿时间 | 200ms | 50~200ms |
| -XX:G1HeapRegionSize | Region 大小 | 自动计算 | 1~32M（2的幂） |
| -XX:InitiatingHeapOccupancyPercent | 触发并发标记的堆占用 | 45 | 35~45 |
| -XX:G1NewSizePercent | 新生代最小比例 | 5 | - |
| -XX:G1MaxNewSizePercent | 新生代最大比例 | 60 | - |
| -XX:G1MixedGCCountTarget | 混合回收次数目标 | 8 | - |
| -XX:G1ReservePercent | 保留空间防止晋升失败 | 10 | - |

## 7. CMS 参数

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| -XX:CMSInitiatingOccupancyFraction | CMS触发阈值 | 92(JDK5)/68(JDK6+) | 70~80 |
| -XX:+UseCMSCompactAtFullCollection | Full GC后压缩 | 开启 | 开启 |
| -XX:CMSFullGCsBeforeCompaction | N次Full GC后压缩 | 0 | 2~5 |
| -XX:CMSInitiatingOccupancyFraction | 触发CMS的堆占用率 | - | 70~80 |
| -XX:+CMSParallelRemarkEnabled | 并行重新标记 | - | 开启 |
| -XX:+CMSClassUnloadingEnabled | CMS卸载类 | - | 开启 |

## 8. GC 日志参数

### JDK 8

```bash
-XX:+PrintGCDetails
-XX:+PrintGCDateStamps
-XX:+PrintGCTimeStamps
-XX:+PrintGCApplicationStoppedTime
-XX:+PrintHeapAtGC
-Xloggc:/var/log/gc.log
-XX:+UseGCLogFileRotation
-XX:NumberOfGCLogFiles=10
-XX:GCLogFileSize=50M
```

### JDK 9+

```bash
-Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags:filecount=10,filesize=50M
```

### JDK 9+ 常用日志标签

```bash
-Xlog:gc*                          # 所有GC日志
-Xlog:gc+heap=debug                # 堆详细信息
-Xlog:gc+phases=debug              # GC阶段详情
-Xlog:gc+ergo*=debug               # 自动调节详情
-Xlog:safepoint                    # 安全点信息
```

## 9. OOM 时自动 Dump

| 参数 | 含义 |
|------|------|
| -XX:+HeapDumpOnOutOfMemoryError | OOM 时生成堆 dump |
| -XX:HeapDumpPath=/var/log/heap.hprof | dump 文件路径 |
| -XX:OnOutOfMemoryError="script.sh" | OOM 时执行脚本 |

## 10. JIT 编译参数

| 参数 | 含义 | 默认值 |
|------|------|--------|
| -XX:+TieredCompilation | 分层编译 | JDK 8 开启 |
| -XX:CompileThreshold | 方法调用次数触发编译 | 10000(C1)/10000(C2) |
| -XX:+PrintCompilation | 打印JIT编译信息 | 关闭 |
| -XX:ReservedCodeCacheSize | 代码缓存大小 | 240M |

## 11. 常用诊断参数

| 参数 | 含义 |
|------|------|
| -XX:+PrintFlagsFinal | 打印所有JVM参数最终值 |
| -XX:+PrintFlagsInitial | 打印所有JVM参数初始值 |
| -XX:+UnlockDiagnosticVMOptions | 解锁诊断参数 |
| -XX:+PrintSafepointStatistics | 打印安全点统计 |
| -XX:+LogVMOutput | 记录VM输出 |

---

## 常用配置模板

### Spring Boot 微服务（G1，JDK 11+）

```bash
java -Xms2g -Xmx2g \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=100 \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/var/log/heap.hprof \
  -XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=256m \
  -XX:+DisableExplicitGC \
  -Xlog:gc*:file=/var/log/gc.log:time,uptime:filecount=5,filesize=50M \
  -jar app.jar
```

### 大内存在线服务（ZGC，JDK 21+）

```bash
java -Xms16g -Xmx16g \
  -XX:+UseZGC \
  -XX:SoftMaxHeapSize=12g \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/var/log/heap.hprof \
  -XX:MetaspaceSize=512m -XX:MaxMetaspaceSize=512m \
  -XX:+DisableExplicitGC \
  -Xlog:gc*:file=/var/log/gc.log:time,uptime:filecount=10,filesize=100M \
  -jar app.jar
```

---

[← 返回 JVM 目录](/01-java-core/jvm/README.md)

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **JVM 参数速查表**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

回答时先明确概念边界，再结合 JVM 或并发体系说明原理，最后落到实际使用、监控和排查方法。对于和 JDK 版本、垃圾收集器实现相关的内容，要说明适用前提。

## 深挖追问

- 这个知识点解决什么问题？不使用它会有什么风险？
- 它和相近概念的区别是什么？
- 生产环境中如何验证它是否生效或是否成为瓶颈？

## 实战场景/代码示例

结合业务压测、日志、监控和 JVM 工具验证结论，不建议只凭经验调整参数或下判断。

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

