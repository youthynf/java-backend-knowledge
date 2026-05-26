# JVM 排障实战

> 生产环境的 JVM 问题排查是后端工程师的必备技能。本章覆盖最常见的三类问题：OOM、CPU 飙高、GC 频繁。

## 排障工具速查

| 工具 | 用途 | 示例 |
|------|------|------|
| jps | 查看 Java 进程 | jps -lv |
| jstat | GC 统计 | jstat -gcutil pid 1000 |
| jmap | 堆信息/dump | jmap -histo pid |
| jstack | 线程栈 | jstack pid |
| jinfo | JVM 参数 | jinfo -flags pid |
| arthas | 在线诊断神器 | java -jar arthas-boot.jar |
| MAT | 分析堆 dump | Eclipse MAT |

---

## 1. OOM 排查

### OOM 类型与原因

| OOM 类型 | 原因 | 排查方向 |
|----------|------|---------|
| Java heap space | 堆内存不足 | 内存泄漏 / 对象过多 |
| Metaspace | 元空间不足 | 大量动态生成类 |
| GC overhead limit exceeded | GC 回收比例过低 | 堆太小 / 内存泄漏 |
| Direct buffer memory | 直接内存不足 | NIO 堆外内存泄漏 |
| Unable to create new native thread | 无法创建新线程 | 线程数过多 / OS 限制 |
| Out of swap space | 交换空间不足 | 物理内存不足 |

### 排查步骤

```bash
# Step 1: 确认 OOM 类型
# 查看应用日志中的 OOM 错误信息

# Step 2: 获取堆 dump（推荐提前配置自动 dump）
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/var/log/heap.hprof

# 如果已经 OOM，尝试手动 dump
jmap -dump:format=b,file=heap.hprof <pid>

# Step 3: 分析 dump
# 方案 A: jmap 快速查看
jmap -histo <pid> | head -30
# 输出：
#  num  #instances  #bytes  class name
#  1:   12345678    987654321  com.example.LeakObject
#  2:   876543      12345678   java.lang.String

# 方案 B: Eclipse MAT 深度分析
# 1. 打开 heap.hprof
# 2. 查看 Leak Suspects Report
# 3. 分析 Dominator Tree
# 4. 找到 GC Roots 引用链
```

### 常见内存泄漏场景

**① ThreadLocal 泄漏**

```java
// 错误用法：线程池中 ThreadLocal 不清理
private static ThreadLocal<User> userThreadLocal = new ThreadLocal<>();

public void handle(Request req) {
    userThreadLocal.set(req.getUser());
    // 处理业务...
    // 忘记 remove()！线程池中的线程被复用，ThreadLocal 中的对象不会被 GC
}

// 正确用法
public void handle(Request req) {
    try {
        userThreadLocal.set(req.getUser());
        // 处理业务...
    } finally {
        userThreadLocal.remove(); // 必须清理
    }
}
```

**② 静态集合泄漏**

```java
// 错误：静态 Map 只增不减
private static Map<String, byte[]> cache = new HashMap<>();

public void put(String key, byte[] data) {
    cache.put(key, data); // 永远不移除，持续增长
}

// 正确：使用 WeakHashMap 或带过期策略的缓存
private static Cache<String, byte[]> cache = Caffeine.newBuilder()
    .maximumSize(10000)
    .expireAfterWrite(30, TimeUnit.MINUTES)
    .build();
```

**③ 资源未关闭**

```java
// 错误：流未关闭
public void read(String file) {
    InputStream is = new FileInputStream(file); // 不关闭
    // ...
}

// 正确
public void read(String file) {
    try (InputStream is = new FileInputStream(file)) {
        // ...
    }
}
```

---

## 2. CPU 飙高排查

### 排查步骤

```bash
# Step 1: 找到 CPU 高的 Java 进程
top -c
# 找到 PID，例如 12345

# Step 2: 找到进程中 CPU 高的线程
top -Hp 12345
# 找到线程 TID，例如 12350

# Step 3: 线程 ID 转十六进制
printf "%x\n" 12350
# 输出: 303e

# Step 4: 查看线程栈
jstack 12345 | grep 303e -A 30
```

### 使用 Arthas 排查（更方便）

```bash
# 安装并启动 Arthas
curl -O https://arthas.aliyun.com/arthas-boot.jar
java -jar arthas-boot.jar

# 查看最忙的线程
thread -n 3

# 查看特定线程
thread <thread-id>

# 反编译类
jad com.example.MyClass

# 监控方法执行
monitor com.example.MyService myMethod -c 10

# 查看方法参数和返回值
watch com.example.MyService myMethod "{params, returnObj}" -x 2
```

### 常见 CPU 高的原因

| 原因 | 特征 | 解决 |
|------|------|------|
| 死循环 | 单线程 CPU 100% | jstack 找到循环代码 |
| 频繁 GC | 多个 GC 线程 CPU 高 | jstat 查看 GC 频率 |
| 正则回溯 | 单线程 CPU 高，StackOverflow | 检查正则表达式 |
| 线程竞争 | 多线程等待/阻塞 | jstack 查看线程状态 |
| 加密/序列化 | 单线程 CPU 高 | 优化算法/异步化 |

---

## 3. GC 频繁排查

### 排查步骤

```bash
# Step 1: 查看 GC 概况
jstat -gcutil <pid> 1000 10
# 关注：YGC 频率、FGC 次数、O（老年代使用率）、FGCT（Full GC 总时间）

# Step 2: 分析 GC 日志
# 关注：GC 原因、各阶段耗时、回收前后堆大小变化

# Step 3: 查看对象统计
jmap -histo <pid> | head -20
# 关注：实例数最多的类

# Step 4: 如果怀疑内存泄漏，做 dump 分析
jmap -dump:format=b,file=heap.hprof <pid>
```

### GC 频繁的常见原因

| 现象 | 原因 | 方案 |
|------|------|------|
| Minor GC 频繁 | Eden 太小 | 增大新生代 |
| Full GC 频繁 | 老年代不足 | 增大堆 / 排查内存泄漏 |
| Full GC 频繁 | 元空间不足 | 增大元空间 / 排查动态类生成 |
| CMS Mode Failure | CMS 回收速度 < 分配速度 | 降低触发阈值 / 增大堆 |
| G1 混合回收慢 | Region 中垃圾占比低 | 调整 -XX:G1MixedGCLiveThresholdPercent |

### 一个完整的 GC 分析案例

```
# GC 日志示例（G1）
[Pause Young (G1 Evacuation Pause), 0.0234567 secs]
   [Eden: 256.0M(256.0M)->0.0B(230.0M) 
    Survivors: 0.0B->26.0M 
    Heap: 512.0M(1024.0M)->258.0M(1024.0M)]
 [Times: user=0.08 sys=0.01, real=0.02 secs]

# 分析：
# - YGC 耗时 23ms，正常
# - Eden 从 256M 降到 0，Survivor 从 0 升到 26M
# - 堆从 512M 降到 258M，回收了 254M
# - 本次 YGC 效率不错
```

---

## 4. 线程问题排查

### 死锁

```bash
# jstack 自动检测死锁
jstack <pid>
# 输出：
# Found one Java-level deadlock:
# =============================
# "Thread-1":
#   waiting to lock monitor 0x0000000xxx (object 0x0000000yyy, a java.lang.Object),
#   which is held by "Thread-0"
# "Thread-0":
#   waiting to lock monitor 0x0000000zzz (object 0x0000000www, a java.lang.Object),
#   which is held by "Thread-1"
```

### 线程状态

| 状态 | 含义 | 可能的问题 |
|------|------|-----------|
| RUNNABLE | 运行中/就绪 | CPU 高 |
| BLOCKED | 等待锁 | 死锁/锁竞争 |
| WAITING | 无限期等待 | 未被 notify |
| TIMED_WAITING | 有限期等待 | sleep/wait(timeout) |
| TERMINATED | 已终止 | - |

### Arthas 线程分析

```bash
# 查看死锁
thread -b

# 查看等待状态的线程
thread --state WAITING

# 查看阻塞状态的线程
thread --state BLOCKED
```

---

## 5. 在线诊断利器 Arthas 常用命令

| 命令 | 用途 |
|------|------|
| dashboard | 实时面板（线程/内存/GC） |
| thread -n 3 | 最忙的3个线程 |
| thread -b | 查找死锁 |
| jad 类名 | 反编译 |
| watch 方法 "{params,returnObj}" | 观察方法入参返回值 |
| trace 方法 | 调用链路耗时 |
| stack 方法 | 方法调用栈 |
| monitor 方法 -c 10 | 方法执行统计 |
| heapdump /tmp/dump.hprof | 导出堆 dump |
| vmtool | 查询堆中对象 |
| logger | 动态调整日志级别 |
| ognl | 执行 OGNL 表达式 |

```bash
# 示例：追踪方法调用耗时
trace com.example.OrderService createOrder

# 示例：观察方法参数和返回值
watch com.example.OrderService createOrder "{params, returnObj, throwExp}" -x 3

# 示例：动态修改日志级别
logger --name com.example --level DEBUG
```

---

## 面试高频问题

### Q1: 线上 OOM 怎么排查？

> 1. 看日志确认 OOM 类型；2. 用 jmap -histo 看对象分布；3. 如果有 dump 用 MAT 分析 Leak Suspects；4. 找到 GC Roots 引用链确定泄漏源；5. 修复代码并验证。

### Q2: CPU 飙高怎么排查？

> 1. top 找到高 CPU 进程 PID；2. top -Hp 找到高 CPU 线程 TID；3. printf 转十六进制；4. jstack 查看线程栈定位代码。用 Arthas 更方便：thread -n 3 直接看最忙线程。

### Q3: 如何判断是内存泄漏还是内存溢出？

> 内存泄漏：对象无法被回收，持续占用内存（dump 分析发现大量对象可达）。内存溢出：确实需要这么多内存，只是堆不够大（调大堆或优化对象使用）。判断方法：多次 jmap -histo 对比，如果某类对象持续增长且不被回收，大概率是泄漏。

### Q4: Arthas 有哪些常用命令？

> dashboard 实时面板、thread 线程分析、jad 反编译、watch 观察方法、trace 调用耗时、stack 调用栈、monitor 方法统计、heapdump 堆转储。核心优势是无需重启应用，在线诊断。

---

[← 返回 JVM 目录](./README.md)
