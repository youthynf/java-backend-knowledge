# JVM 参数速查表

> JVM 参数众多，这里按类别整理最常用的参数，方便快速查阅。

## 参数格式说明

| 格式 | 说明 | 示例 |
|------|------|------|
| -JVM 参数速查表 | 标准参数，所有 JVM 都支持 | -Xms, -Xmx |
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

## 面试总结

围绕「JVM 参数速查表」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

### 核心回答

1. JVM 相关问题要从运行时数据区、类加载、对象布局、执行引擎和 GC 协同理解。
2. 面试重点不是背名词，而是能解释对象如何创建、访问、回收，以及参数/工具如何验证判断。
3. 线上问题通常表现为内存异常、频繁 GC、类加载冲突、线程阻塞或性能抖动。

### 高频追问

- 堆、栈、方法区/元空间分别存什么？
- 类加载的加载、验证、准备、解析、初始化分别做什么？
- 如何用 jcmd、jmap、jstat、MAT 验证你的判断？

### 实战落地

- **排查类问题**：先收集监控、日志和 JVM 现场信息，再用工具验证假设，避免凭经验改参数。
- **调优类问题**：先明确目标是降低停顿、提升吞吐还是减少内存，再选择收集器、堆大小和业务代码优化。
- **面试表达**：用“现象 → 原理 → 工具验证 → 解决方案 → 风险边界”的链路回答。

### 易错点

- 不要把 JVM 内存结构和 Java 内存模型混为一谈。
- 不要脱离 JDK 版本讨论永久代/元空间、字符串常量池等细节。
