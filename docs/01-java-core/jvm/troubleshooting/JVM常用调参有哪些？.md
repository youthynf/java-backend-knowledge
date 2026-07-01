# JVM 常用调参有哪些

## 核心概念

JVM 参数控制堆大小、收集器、GC 行为、日志、OOM 处理等。掌握常用调参是 JVM 调优和故障排查的基础。JVM 参数分三类：标准参数（`-`，所有 JVM 支持）、`-X` 参数（扩展参数，HotSpot 特定）、`-XX` 参数（高级选项，不稳定）。

生产环境推荐配置原则：`-Xms = -Xmx`（避免扩缩容抖动）、合理选择 GC、开启 GC 日志和 OOM 自动 dump、容器内留出本地内存余量。

```text
JVM 参数格式：
-XX:+Flag       布尔开关，启用
-XX:-Flag       布尔开关，关闭
-XX:key=value   键值对

JDK 版本差异：
- 永久代 → 元空间：JDK 7→8
- CMS 废弃：JDK 9，移除：JDK 14
- GC 日志参数：JDK 8 vs JDK 9+（Xlog）
- G1 默认：JDK 9+
```

## 标准回答

JVM 参数按堆内存、栈、元空间、GC 收集器、GC 日志、OOM 处理分类。生产环境必设：`-Xms=-Xmx`、合理 GC（G1/ZGC）、GC 日志（`-Xlog:gc*`）、`-XX:+HeapDumpOnOutOfMemoryError`、`-XX:+DisableExplicitGC`。JDK 版本差异要注意：JDK 8 用 `-XX:+PrintGCDetails`，JDK 9+ 用 `-Xlog:gc*`；JDK 8+ 永久代替换为元空间；JDK 9+ G1 默认，JDK 14 CMS 移除。

要点：

1. **堆参数**：`-Xms`、`-Xmx`、`-Xmn`、`-XX:NewRatio`、`-XX:SurvivorRatio`。
2. **栈参数**：`-Xss`。
3. **元空间参数**：`-XX:MetaspaceSize`、`-XX:MaxMetaspaceSize`。
4. **GC 选择**：`-XX:+UseG1GC`、`-XX:+UseZGC`、`-XX:+UseParallelGC`。
5. **G1 参数**：`-XX:MaxGCPauseMillis`、`-XX:G1HeapRegionSize`、`-XX:InitiatingHeapOccupancyPercent`。
6. **GC 日志**：JDK 8 用 `-XX:+PrintGCDetails`，JDK 9+ 用 `-Xlog:gc*`。
7. **OOM 处理**：`-XX:+HeapDumpOnOutOfMemoryError`、`-XX:HeapDumpPath`。
8. **诊断**：`-XX:+PrintFlagsFinal`、`-XX:+UnlockDiagnosticVMOptions`。

## 堆内存参数

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| `-Xms` | 堆初始大小 | 物理内存/64 | 与 `-Xmx` 相同 |
| `-Xmx` | 堆最大大小 | 物理内存/4 | 根据应用需要 |
| `-Xmn` | 新生代大小 | - | 堆的 1/3 ~ 1/2 |
| `-XX:NewRatio` | 老年代:新生代 | 2 | 2（即 1:2） |
| `-XX:SurvivorRatio` | Eden:Survivor | 8 | 6~8 |
| `-XX:MaxTenuringThreshold` | 晋升老年代年龄 | 15 | 6~15 |
| `-XX:PretenureSizeThreshold` | 大对象直接进老年代阈值 | 0 | 按需设置 |
| `-XX:+UseAdaptiveSizePolicy` | 自适应新生代大小 | G1 开启 | - |

生产建议：`-Xms` 和 `-Xmx` 设相同，避免堆动态扩缩容的开销。

## 栈内存参数

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| `-Xss` | 每个线程的栈大小 | 512K~1M | 256K~1M |

`-Xss` 影响线程数：栈越大调用深度越深，但同样物理内存下能创建的线程数越少。

## 元空间参数（JDK 8+）

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| `-XX:MetaspaceSize` | 元空间初始大小 | ~21M | 256M |
| `-XX:MaxMetaspaceSize` | 元空间最大大小 | 无限制 | 256M~512M |
| `-XX:MinMetaspaceFreeRatio` | GC 后最小空闲比例 | 40 | - |
| `-XX:MaxMetaspaceFreeRatio` | GC 后最大空闲比例 | 70 | - |

JDK 8 之前用永久代：`-XX:PermSize`、`-XX:MaxPermSize`。

## 直接内存参数

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| `-XX:MaxDirectMemorySize` | 直接内存最大值 | 与 `-Xmx` 相同 | 按需限制 |
| `-XX:+DisableExplicitGC` | 禁止 `System.gc()` | 关闭 | 生产开启 |

## GC 收集器参数

| 参数 | 选择 |
|------|------|
| `-XX:+UseSerialGC` | Serial + Serial Old |
| `-XX:+UseParNewGC` | ParNew + Serial Old（JDK 9 起废弃） |
| `-XX:+UseParallelGC` | Parallel Scavenge + Serial Old |
| `-XX:+UseParallelOldGC` | Parallel Scavenge + Parallel Old |
| `-XX:+UseConcMarkSweepGC` | ParNew + CMS + Serial Old（备用）（JDK 14 移除） |
| `-XX:+UseG1GC` | G1（JDK 9+ 默认） |
| `-XX:+UseZGC` | ZGC（JDK 15+ 生产可用） |
| `-XX:+UseShenandoahGC` | Shenandoah（JDK 12+） |

## G1 参数

| 参数 | 含义 | 默认值 | 建议值 |
|------|------|--------|--------|
| `-XX:MaxGCPauseMillis` | 目标最大停顿时间 | 200ms | 50~200ms |
| `-XX:G1HeapRegionSize` | Region 大小 | 自动计算 | 1~32M（2 的幂） |
| `-XX:InitiatingHeapOccupancyPercent` | 触发并发标记的堆占用 | 45 | 35~45 |
| `-XX:G1NewSizePercent` | 新生代最小比例 | 5 | - |
| `-XX:G1MaxNewSizePercent` | 新生代最大比例 | 60 | - |
| `-XX:G1MixedGCCountTarget` | 混合回收次数目标 | 8 | - |
| `-XX:G1ReservePercent` | 保留空间防止晋升失败 | 10 | 10~20 |

## CMS 参数（JDK 14 移除）

| 参数 | 含义 | 默认值 |
|------|------|--------|
| `-XX:CMSInitiatingOccupancyFraction` | CMS 触发阈值 | 92(JDK5)/68(JDK6+) |
| `-XX:+UseCMSCompactAtFullCollection` | Full GC 后压缩 | 开启 |
| `-XX:CMSFullGCsBeforeCompaction` | N 次 Full GC 后压缩 | 0 |
| `-XX:+CMSParallelRemarkEnabled` | 并行重新标记 | - |
| `-XX:+CMSClassUnloadingEnabled` | CMS 卸载类 | - |

## GC 日志参数

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
-Xlog:gc*                          # 所有 GC 日志
-Xlog:gc+heap=debug                # 堆详细信息
-Xlog:gc+phases=debug              # GC 阶段详情
-Xlog:gc+ergo*=debug               # 自动调节详情
-Xlog:safepoint                    # 安全点信息
```

## OOM 时自动 Dump

| 参数 | 含义 |
|------|------|
| `-XX:+HeapDumpOnOutOfMemoryError` | OOM 时生成堆 dump |
| `-XX:HeapDumpPath=/var/log/heap.hprof` | dump 文件路径 |
| `-XX:OnOutOfMemoryError="script.sh"` | OOM 时执行脚本 |
| `-XX:+ExitOnOutOfMemoryError` | OOM 时退出（避免半死状态） |
| `-XX:+CrashOnOutOfMemoryError` | OOM 时崩溃生成 core dump |

## JIT 编译参数

| 参数 | 含义 | 默认值 |
|------|------|--------|
| `-XX:+TieredCompilation` | 分层编译 | JDK 8 开启 |
| `-XX:CompileThreshold` | 方法调用次数触发编译 | 10000 |
| `-XX:+PrintCompilation` | 打印 JIT 编译信息 | 关闭 |
| `-XX:ReservedCodeCacheSize` | 代码缓存大小 | 240M |

## 常用诊断参数

| 参数 | 含义 |
|------|------|
| `-XX:+PrintFlagsFinal` | 打印所有 JVM 参数最终值 |
| `-XX:+PrintFlagsInitial` | 打印所有 JVM 参数初始值 |
| `-XX:+UnlockDiagnosticVMOptions` | 解锁诊断参数 |
| `-XX:+PrintSafepointStatistics` | 打印安全点统计 |
| `-XX:+NativeMemoryTracking=summary` | 启用本地内存跟踪 |

## 推荐配置模板

### Spring Boot 微服务（G1，JDK 11+）

```bash
java -Xms4g -Xmx4g \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=100 \
  -XX:InitiatingHeapOccupancyPercent=35 \
  -XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=256m \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/var/log/heap.hprof \
  -XX:+DisableExplicitGC \
  -Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags:filecount=10,filesize=50M \
  -jar app.jar
```

### 大内存在线服务（ZGC，JDK 21+）

```bash
java -Xms16g -Xmx16g \
  -XX:+UseZGC \
  -XX:SoftMaxHeapSize=12g \
  -XX:MetaspaceSize=512m -XX:MaxMetaspaceSize=512m \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/var/log/heap.hprof \
  -XX:+DisableExplicitGC \
  -Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags:filecount=10,filesize=100M \
  -jar app.jar
```

### 容器化部署（注意 cgroup 限制）

```bash
java -XX:+UseContainerSupport \      # JDK 10+ 默认开启
  -XX:MaxRAMPercentage=70.0 \         # 堆占容器内存 70%
  -XX:InitialRAMPercentage=70.0 \
  -XX:+UseG1GC \
  -jar app.jar
```

## 实战场景

| 场景 | 调优方向 | 参数 |
|------|---------|------|
| Full GC 频繁 | 增大堆，降低 IHOP | `-Xmx8g -XX:InitiatingHeapOccupancyPercent=35` |
| Young GC 频繁 | 增大新生代 | `-Xmn2g` 或 `-XX:NewRatio=2` |
| 元空间 OOM | 增大元空间 | `-XX:MaxMetaspaceSize=512m` |
| 接口卡顿 | 降低停顿 | `-XX:MaxGCPauseMillis=100` |
| 容器 OOM Killed | 留出余量 | `-XX:MaxRAMPercentage=70.0` |

## 深挖追问

### -Xms 和 -Xmx 为什么建议设成一样？

避免堆动态扩缩容的开销。堆扩容需要向 OS 申请内存并可能触发 Full GC，缩容后再次扩容又要重复。固定大小省去这些开销。配合 `-XX:+AlwaysPreTouch` 启动时预分配物理内存，减少运行时抖动。

### 怎么查看 JVM 当前参数？

```bash
# 查看所有参数最终值
java -XX:+PrintFlagsFinal -version | grep -i "G1GC\|MaxHeapSize"

# 查看运行中 JVM 的参数
jcmd <pid> VM.flags
jinfo -flags <pid>
```

### 容器内 -Xmx 怎么设？

JDK 10+ 默认开启 `-XX:+UseContainerSupport`，JVM 自动识别 cgroup 限制。推荐用 `-XX:MaxRAMPercentage=70.0` 让堆占容器内存 70%，留 30% 给元空间、直接内存、线程栈、JVM 自身。不要直接 `-Xmx` 设到容器内存上限，会被 OOM Killer 杀掉。

### 怎么动态修改 JVM 参数？

`jinfo` 可以动态修改部分标记为 `manageable` 的参数：

```bash
jinfo -flag +PrintGC <pid>           # 开启 GC 日志
jinfo -flag MaxGCPauseMillis=100 <pid>  # 修改停顿目标
```

但大多数参数（如 `-Xmx`）不能动态修改，需要重启 JVM。JDK 11+ 的 JFR 和 Management API 支持更多动态配置。

## 易错点

- 把 `-Xms` 和 `-Xmx` 设不同，导致运行时堆扩缩容抖动。
- 容器内 `-Xmx` 设到容器内存上限，被 OOM Killer 杀掉。
- JDK 8 用 `-Xlog:gc*`，应改用 `-XX:+PrintGCDetails`。
- 忘记开 `-XX:+HeapDumpOnOutOfMemoryError`，OOM 后没现场。
- 把 `-XX:+DisableExplicitGC` 关闭，导致业务代码 `System.gc()` 触发 Full GC。

## 总结

JVM 参数分堆、栈、元空间、GC 收集器、GC 日志、OOM 处理等几类。生产环境必设：`-Xms=-Xmx`、合理 GC、GC 日志、OOM 自动 dump、`DisableExplicitGC`。JDK 版本差异要注意：JDK 8 用 `-XX:+PrintGCDetails`，JDK 9+ 用 `-Xlog:gc*`；JDK 8+ 永久代替换为元空间；JDK 9+ G1 默认。容器化部署用 `-XX:MaxRAMPercentage=70.0` 留出余量。

## 参考资料

- [HotSpot JVM Options](https://www.oracle.com/java/technologies/javase/vmoptions-jsp.html)
- [Java 17 GC Tuning Guide](https://docs.oracle.com/en/java/javase/17/gctuning/)
- [JEP 291: Deprecate the Concurrent Mark Sweep (CMS) Garbage Collector](https://openjdk.org/jeps/291)

---

[← 返回故障排查目录](/01-java-core/jvm/troubleshooting/)
