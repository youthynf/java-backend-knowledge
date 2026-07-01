# Java 问题排查工具有哪些

## 核心概念

JDK 自带一系列排查工具（jps、jstat、jmap、jstack、jcmd、jinfo），加上 Arthas、MAT、JFR、async-profiler 等，构成了 Java 问题排查的工具链。掌握这些工具是排查 OOM、CPU 高、GC 频繁、线程问题的基础。

工具分三类：JDK 命令行工具（jps/jstat/jmap/jstack/jcmd）、可视化工具（JConsole/JVisualVM/JMC）、第三方工具（Arthas/MAT/async-profiler）。生产环境以命令行工具 + Arthas 为主。

```text
排查工具速查：
- 进程/类加载：jps、jcmd
- 内存/堆：jstat、jmap、jcmd GC.heap_info
- 线程：jstack、jcmd Thread.print
- JVM 参数：jinfo、jcmd VM.flags
- 在线诊断：Arthas（dashboard、thread、watch、trace）
- 堆 dump 分析：Eclipse MAT
- 性能采样：JFR、async-profiler
```

## 标准回答

Java 问题排查工具分三类：JDK 命令行（jps/jstat/jmap/jstack/jcmd/jinfo）、可视化（JConsole/JVisualVM/JMC）、第三方（Arthas/MAT/async-profiler）。生产环境以 jcmd + Arthas 为主。jcmd 是 JDK 8+ 推荐的统一入口，能替代大部分传统工具。Arthas 提供在线诊断（dashboard、thread、watch、trace），是排查神器。MAT 用于离线分析 heap dump。

要点：

1. **jps**：列出 Java 进程。
2. **jstat**：GC 统计、类加载、编译信息。
3. **jmap**：堆信息、对象直方图、heap dump。
4. **jstack**：线程栈、死锁检测。
5. **jcmd**：JDK 8+ 统一入口，推荐使用。
6. **jinfo**：查看/修改 JVM 参数。
7. **Arthas**：在线诊断神器。
8. **MAT**：heap dump 离线分析。
9. **JFR**：JDK 11+ 生产级性能采样。

## JDK 命令行工具

### jps — 列出 Java 进程

```bash
jps                # 列出 PID 和主类名
jps -l             # 输出完整包名 / jar 路径
jps -v             # 输出 JVM 参数
jps -m            # 输出 main 方法参数
jps -q             # 只输出 PID
```

### jstat — GC 统计

```bash
# GC 概况，每 1 秒一次，共 10 次
jstat -gcutil <pid> 1000 10

# 输出：
#  S0     S1     E      O      M     CCS    YGC   YGCT   FGC  FGCT   GCT
#  0.00  45.23  67.89  34.56  95.12  91.34   123   1.234   5   0.567  1.801

# 其他选项
jstat -gc <pid>            # 各代详细大小
jstat -gccapacity <pid>    # 各代容量
jstat -class <pid>         # 类加载统计
jstat -compiler <pid>      # JIT 编译统计
```

字段含义：

- S0/S1：Survivor 0/1 使用率。
- E：Eden 使用率。
- O：老年代使用率。
- M：元空间使用率。
- YGC/YGCT：Young GC 次数/总耗时。
- FGC/FGCT：Full GC 次数/总耗时。
- GCT：GC 总耗时。

### jmap — 堆信息

```bash
# 堆概况
jmap -heap <pid>

# 对象直方图（按实例数排序）
jmap -histo <pid> | head -20

# 只看存活对象（先触发 Full GC）
jmap -histo:live <pid> | head -20

# 生成 heap dump
jmap -dump:format=b,file=/tmp/heap.hprof <pid>

# 生成存活对象的 heap dump
jmap -dump:live,format=b,file=/tmp/heap.hprof <pid>
```

注意：`jmap -histo:live` 和 `jmap -dump:live` 会触发 Full GC，生产慎用。

### jstack — 线程栈

```bash
# 基本线程栈
jstack <pid>

# 额外锁信息（推荐）
jstack -l <pid>

# 强制 dump（进程无响应）
jstack -F <pid>

# 输出到文件
jstack -l <pid> > /tmp/stack.log
```

jstack 自动检测死锁，在输出末尾报告 `Found one Java-level deadlock`。

### jcmd — JDK 8+ 统一入口

jcmd 是推荐使用的统一工具，能替代大部分传统工具：

```bash
# 列出所有 Java 进程
jcmd -l

# 列出指定 JVM 支持的命令
jcmd <pid> help

# 堆信息
jcmd <pid> GC.heap_info

# 对象直方图
jcmd <pid> GC.class_histogram

# 生成 heap dump
jcmd <pid> GC.heap_dump /tmp/heap.hprof

# 线程栈
jcmd <pid> Thread.print

# 查看 JVM 参数
jcmd <pid> VM.flags
jcmd <pid> VM.system_properties

# 查看 JVM 版本和系统信息
jcmd <pid> VM.version
jcmd <pid> VM.uptime

# 本地内存跟踪（需启用 NMT）
jcmd <pid> VM.native_memory summary

# 触发 GC
jcmd <pid> GC.run
jcmd <pid> GC.run_finalization
```

### jinfo — 查看/修改 JVM 参数

```bash
# 查看所有参数
jinfo -flags <pid>

# 查看指定参数
jinfo -flag UseG1GC <pid>

# 动态修改参数（仅 manageable 标记的参数）
jinfo -flag +PrintGC <pid>
jinfo -flag MaxGCPauseMillis=100 <pid>

# 查看系统属性
jinfo -sysprops <pid>
```

## 可视化工具

### JConsole

JDK 自带，轻量级监控：

- 内存（堆、非堆、各代）。
- 线程（状态、栈）。
- 类加载。
- GC 概况。
- MBean 操作。

```bash
jconsole <pid>   # 直接连接指定进程
jconsole          # 选择进程连接
```

### JVisualVM

功能更丰富的可视化工具（JDK 9+ 需单独下载）：

- 实时监控（CPU、内存、线程、类）。
- 线程可视化（状态、栈、死锁检测）。
- 堆 dump 分析（内置）。
- 插件扩展（Visual GC 等）。

```bash
jvisualvm
```

### Java Mission Control (JMC)

JDK 11+ 免费，生产级监控：

- JFR（Java Flight Recorder）录制。
- 实时监控。
- 堆分析。

## 第三方工具

### Arthas

阿里开源的在线诊断神器，无需重启应用：

```bash
# 安装并启动
curl -O https://arthas.aliyun.com/arthas-boot.jar
java -jar arthas-boot.jar
```

常用命令：

| 命令 | 用途 |
|------|------|
| `dashboard` | 实时面板（线程/内存/GC） |
| `thread -n 5` | 最忙的 5 个线程 |
| `thread -b` | 查找死锁 |
| `thread --state BLOCKED` | 查看阻塞线程 |
| `jad 类名` | 反编译 |
| `watch 方法 "{params,returnObj}"` | 观察方法入参返回值 |
| `trace 方法` | 调用链路耗时 |
| `stack 方法` | 方法调用栈 |
| `monitor 方法 -c 10` | 方法执行统计 |
| `heapdump /tmp/dump.hprof` | 导出堆 dump |
| `vmtool` | 查询堆中对象 |
| `logger --name x --level DEBUG` | 动态调整日志级别 |
| `ognl` | 执行 OGNL 表达式 |
| `profiler start --event cpu` | CPU 火焰图 |

### Eclipse MAT

Eclipse Memory Analyzer Tool，离线分析 heap dump：

- Leak Suspects Report：自动分析泄漏点。
- Dominator Tree：对象保留内存大小排序。
- Histogram：对象数量和大小统计。
- Path to GC Roots：对象为什么没被回收。
- OQL：对象查询语言。

### async-profiler

低开销性能采样工具，生成火焰图：

```bash
# CPU 采样
./profiler.sh -d 30 -f cpu.html <pid>

# 内存分配采样
./profiler.sh -d 30 -e alloc -f alloc.html <pid>
```

## 代码示例

完整排查示例：

```bash
# 1. 找到 Java 进程
jps -lv

# 2. 看 GC 概况
jstat -gcutil <pid> 1000 10

# 3. 看堆信息
jcmd <pid> GC.heap_info

# 4. 看对象直方图
jmap -histo <pid> | head -20

# 5. 抓线程栈
jstack -l <pid> > /tmp/stack.log

# 6. 生成 heap dump（OOM 时）
jcmd <pid> GC.heap_dump /tmp/heap.hprof

# 7. 用 MAT 分析
# 打开 heap.hprof → Leak Suspects Report
```

## 实战场景

| 场景 | 工具组合 |
|------|---------|
| CPU 高 | top -Hp + jstack / Arthas thread -n |
| OOM | jmap / jcmd heap_dump + MAT |
| 死锁 | jstack -l / Arthas thread -b |
| GC 频繁 | jstat -gcutil + GC 日志 |
| 类加载冲突 | jcmd VM.classloader_stats |
| 内存泄漏 | 多次 jmap -histo 对比 + MAT |

## 深挖追问

### jcmd 和传统工具有什么区别？

jcmd 是 JDK 8+ 推荐的统一入口，能替代大部分传统工具：

- `jcmd <pid> GC.heap_info` ≈ `jmap -heap <pid>`
- `jcmd <pid> GC.class_histogram` ≈ `jmap -histo <pid>`
- `jcmd <pid> GC.heap_dump` ≈ `jmap -dump`
- `jcmd <pid> Thread.print` ≈ `jstack <pid>`
- `jcmd <pid> VM.flags` ≈ `jinfo -flags <pid>`

jcmd 更安全（统一接口）、功能更全（支持 NMT、JFR 等）。

### Arthas 为什么是排查神器？

Arthas 提供在线诊断能力，无需重启应用：

- `watch` 看方法参数和返回值。
- `trace` 看调用链路耗时。
- `jad` 反编译类（验证部署版本）。
- `monitor` 方法执行统计。
- `profiler` 生成火焰图。

生产环境排查问题不用重启应用，是 Arthas 的核心价值。

### jmap -histo:live 有什么风险？

`-histo:live` 会先触发 Full GC，然后统计存活对象。Full GC 会暂停应用，可能导致短时间不可用。生产环境慎用，建议在低峰期执行，或用 `jcmd <pid> GC.class_histogram`（不触发 GC）。

### JFR 和 async-profiler 怎么选？

- JFR：JDK 11+ 内置，生产可用，低开销，商业功能免费。适合长期监控和事后分析。
- async-profiler：开源，更灵活，支持 CPU/内存/锁采样，生成火焰图直观。适合临时排查。

两者可以配合使用：JFR 长期录制，async-profiler 临时深挖。

## 易错点

- 在生产环境用 `jmap -histo:live`，触发 Full GC 影响业务。
- 用 `kill -9` 抓 dump，应该用 `kill -3` 或 `jstack`。
- 忽略 jcmd，还在用 jmap/jstack 等老工具。
- 用 Arthas 但不知道 `watch`、`trace` 等高级命令。
- 生成 heap dump 后不用 MAT 分析，只看对象数量。

## 总结

Java 问题排查工具分 JDK 命令行（jps/jstat/jmap/jstack/jcmd/jinfo）、可视化（JConsole/JVisualVM/JMC）、第三方（Arthas/MAT/async-profiler）三类。jcmd 是 JDK 8+ 推荐的统一入口。Arthas 是在线诊断神器，无需重启应用。MAT 用于离线分析 heap dump。生产环境排查：CPU 高用 top -Hp + jstack/Arthas，OOM 用 jmap + MAT，死锁用 jstack/Arthas thread -b，GC 频繁用 jstat + GC 日志。

## 参考资料

- [JDK 17 Troubleshooting Tools](https://docs.oracle.com/en/java/javase/17/troubleshoot/)
- [Arthas Documentation](https://arthas.aliyun.com/doc/)
- [Eclipse MAT](https://www.eclipse.org/mat/)

---

[← 返回故障排查目录](/01-java-core/jvm/troubleshooting/)
