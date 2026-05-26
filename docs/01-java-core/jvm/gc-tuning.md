# GC 调优实战

> GC 调优不是玄学，而是基于监控数据的科学决策。核心目标：**减少 STW 停顿** 和 **提高吞吐量**。

## 调优基本原则

1. **不要过早优化**：先确保代码层面没有问题
2. **先监控，再调优**：用数据说话，不要凭感觉
3. **每次只调一个参数**：避免多个变量互相干扰
4. **理解业务场景**：延迟敏感 vs 吞吐优先，选择不同策略

---

## 1. 常用监控工具

### 命令行工具

```bash
# 查看 GC 概况
jstat -gcutil <pid> 1000  # 每秒打印一次

# 输出示例：
#  S0     S1     E      O      M     CCS    YGC   YGCT   FGC  FGCT   GCT
#  0.00  45.23  67.89  34.56  95.12  91.34   123   1.234   5   0.567  1.801

# 查看 JVM 参数
jinfo -flags <pid>
jinfo -flag UseG1GC <pid>

# 堆内存直方图
jmap -histo <pid> | head -20

# 生成堆 dump
jmap -dump:format=b,file=heap.hprof <pid>

# 线程栈信息
jstack <pid>
```

### GC 日志

```bash
# JDK 8 GC 日志参数
-XX:+PrintGCDetails
-XX:+PrintGCDateStamps
-XX:+PrintGCTimeStamps
-XX:+PrintGCApplicationStoppedTime  # 打印 STW 时间
-Xloggc:/var/log/gc.log
-XX:+UseGCLogFileRotation
-XX:NumberOfGCLogFiles=10
-XX:GCLogFileSize=50M

# JDK 9+ 统一日志参数
-Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags:filecount=10,filesize=50M
```

### GC 日志分析工具

- **GCViewer**：可视化 GC 日志
- **GCEasy**：在线分析（https://gceasy.io）
- **Eclipse MAT**：分析堆 dump

### JDK 工具

- **jvisualvm**：可视化监控（JDK 8 自带）
- **JConsole**：轻量级监控
- **Java Mission Control (JMC)**：生产级监控（JDK 11+ 免费）

---

## 2. 常见 GC 场景调优

### 场景 A：Minor GC 频繁

**现象**：YGC 次数多，每次时间短，但累计影响吞吐

**原因分析**：
- Eden 区太小，对象很快填满
- 产生大量短生命周期对象

**调优方案**：

```bash
# 增大新生代
-Xmn512m                    # 直接指定新生代大小
# 或
-XX:NewRatio=2              # 新生代:老年代 = 1:2（改小比例增大新生代）

# 增大 Eden
-XX:SurvivorRatio=6         # Eden:Survivor = 6:1:1（默认8:1:1，改小给Survivor更多空间）
```

### 场景 B：Full GC 频繁

**现象**：Full GC 频繁触发，应用明显卡顿

**原因排查**：

| 原因 | 排查方法 |
|------|---------|
| 老年代空间不足 | jstat 观察 O 列增长速度 |
| 元空间不足 | jstat 观察 M 列 |
| 显式调用 System.gc() | 检查代码，加 -XX:+DisableExplicitGC |
| 大对象直接进老年代 | 检查 -XX:PretenureSizeThreshold |
| 内存泄漏 | jmap -histo 对比前后差异，MAT 分析 dump |

```bash
# 禁止显式 GC
-XX:+DisableExplicitGC

# 增大老年代
-Xmx2g

# 增大元空间
-XX:MetaspaceSize=256m
-XX:MaxMetaspaceSize=256m
```

### 场景 C：CMS Concurrent Mode Failure

**现象**：CMS 回收期间老年代空间不足，退用 Serial Old 全量收集

**解决方案**：

```bash
# 降低 CMS 触发阈值（更早开始回收）
-XX:CMSInitiatingOccupancyFraction=70  # 默认 92%（JDK5），建议 70-80

# 开启压缩整理
-XX:+UseCMSCompactAtFullCollection
-XX:CMSFullGCsBeforeCompaction=2

# 增大老年代
-Xmx4g
```

### 场景 D：G1 停顿时间过长

**现象**：G1 的 STW 超过目标值

**调优方案**：

```bash
# 调整目标停顿时间（注意不能太小）
-XX:MaxGCPauseMillis=100  # 默认200ms，设太小会增加GC频率

# 调整 Region 大小
-XX:G1HeapRegionSize=8m   # 大堆建议增大Region

# 调整并发标记触发时机
-XX:InitiatingHeapOccupancyPercent=40  # 默认45，更早触发

# 减少 Humongous 对象分配
# 尽量让大对象 < RegionSize * 50%
```

---

## 3. G1 调优实战案例

### 案例：8GB 堆的在线服务

**问题**：偶尔出现 500ms+ 的停顿

**初始配置**：
```bash
-Xms8g -Xmx8g -XX:+UseG1GC
```

**调优步骤**：

```bash
# Step 1: 设定合理的停顿目标
-XX:MaxGCPauseMillis=100

# Step 2: 设置 Region 大小（8GB / 2048 ≈ 4MB）
-XX:G1HeapRegionSize=4m

# Step 3: 调整并发标记触发阈值
-XX:InitiatingHeapOccupancyPercent=40

# Step 4: 增大新生代范围，减少 YGC 频率
-XX:G1NewSizePercent=5
-XX:G1MaxNewSizePercent=50

# 最终配置
-Xms8g -Xmx8g -XX:+UseG1GC \
-XX:MaxGCPauseMillis=100 \
-XX:G1HeapRegionSize=4m \
-XX:InitiatingHeapOccupancyPercent=40
```

---

## 4. 通用调优建议

### 堆大小设置

| 应用类型 | 堆大小建议 | 说明 |
|---------|-----------|------|
| 微服务 | 1-4GB | G1 即可 |
| 中型应用 | 4-16GB | G1 优先 |
| 大型应用 | 16-64GB | G1 或 ZGC |
| 超大堆 | 64GB+ | ZGC |

### 推荐配置模板

**JDK 8 CMS 配置**：
```bash
-Xms4g -Xmx4g -XX:+UseConcMarkSweepGC \
-XX:+UseCMSCompactAtFullCollection \
-XX:CMSInitiatingOccupancyFraction=75 \
-XX:+CMSParallelRemarkEnabled \
-XX:+DisableExplicitGC \
-XX:+PrintGCDetails -Xloggc:/var/log/gc.log
```

**JDK 11+ G1 配置**：
```bash
-Xms4g -Xmx4g -XX:+UseG1GC \
-XX:MaxGCPauseMillis=100 \
-XX:InitiatingHeapOccupancyPercent=40 \
-XX:+DisableExplicitGC \
-Xlog:gc*:file=/var/log/gc.log:time,uptime:filecount=10,filesize=50M
```

**JDK 21+ ZGC 配置**：
```bash
-Xms8g -Xmx8g -XX:+UseZGC \
-XX:SoftMaxHeapSize=6g \
-XX:+DisableExplicitGC \
-Xlog:gc*:file=/var/log/gc.log:time,uptime:filecount=10,filesize=50M
```

---

## 面试高频问题

### Q1: GC 调优的通用思路？

> 1. 确定优化目标（延迟 vs 吞吐）；2. 开启 GC 日志，用工具分析；3. 定位问题（频繁 YGC？Full GC？停顿长？）；4. 针对性调整参数；5. 压测验证，观察是否改善。

### Q2: 你遇到过什么 GC 问题？怎么解决的？

> （结合实际经验回答，框架：问题现象 → 排查过程 → 根因 → 解决方案 → 效果）

### Q3: 为什么 -Xms 和 -Xmx 建议设成一样？

> 避免堆动态扩缩容时的性能抖动。堆扩容需要向 OS 申请内存并可能触发 Full GC，缩容后再次扩容又需要重复这个过程。固定大小省去这些开销。

---

[← 返回 JVM 目录](README.md)
