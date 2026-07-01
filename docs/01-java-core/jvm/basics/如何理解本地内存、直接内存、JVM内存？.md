# 如何理解本地内存、直接内存、JVM 内存

## 核心概念

三个概念常被混为一谈，但关注点不同：

- **JVM 内存**：JVM 进程管理的、由 GC 自动回收的内存区域，即堆、方法区/元空间（部分）、栈等。
- **本地内存 Native Memory**：JVM 进程占用的、不属于 JVM 运行时数据区的内存，包括元空间（JDK 8+）、线程栈、JVM 自身 C/C++ 代码、JNI 分配的内存、DirectByteBuffer 占用的内存。
- **直接内存 Direct Memory**：本地内存的一种，通过 NIO `DirectByteBuffer` 或 `Unsafe.allocateMemory` 在堆外分配，用于零拷贝 IO。

简单说：JVM 内存 ⊂ 进程内存；本地内存 = 进程内存 - JVM 运行时数据区（含元空间/线程栈/JVM 内部）；直接内存 ⊂ 本地内存。

```text
┌─────────────────────────────────────────────────────────────┐
│                     JVM 进程内存                            │
├───────────────────────────────────────────────────────────┤
│  JVM 内存（运行时数据区）                                  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 堆 Heap（-Xmx 限制）                                │  │
│  │ 方法区/元空间 Metaspace（JDK8+ 本地内存，不在此框） │  │
│  │ 程序计数器 PC                                       │  │
│  │ 虚拟机栈 / 本地方法栈（-Xss * 线程数）              │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  本地内存 Native Memory（不属于 JVM 运行时数据区）         │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 元空间 Metaspace（JDK 8+）                          │  │
│  │ 线程栈                                              │  │
│  │ JVM 自身 C/C++ 数据结构（CodeCache、GC 数据等）     │  │
│  │ 直接内存 Direct Memory（DirectByteBuffer 占用）     │  │
│  │ JNI 调用 malloc 分配的内存                          │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 标准回答

JVM 内存是 GC 自动管理的区域（堆、栈、PC 等），主要受 `-Xmx`、`-Xss`、`-XX:MaxMetaspaceSize` 等参数控制。本地内存是 JVM 进程占用的、GC 不直接管理的内存，包括元空间、线程栈、JVM 内部数据结构、直接内存、JNI 内存。直接内存是本地内存的一种，特指通过 `DirectByteBuffer` 在堆外分配的内存，用于 NIO 零拷贝。

要点：

1. **JVM 内存**：受 GC 管理，OOM 错误是 `Java heap space`、`Metaspace` 等。
2. **本地内存**：不受 GC 直接管理，OOM 错误可能是 `Direct buffer memory` 或进程被 OOM Killer 杀掉。
3. **直接内存**：通过 `-XX:MaxDirectMemorySize` 限制，默认与 `-Xmx` 相等。
4. **元空间**：JDK 8+ 类元数据存本地内存，默认无上限，建议显式限制。
5. **进程 RSS**：等于 JVM 内存 + 本地内存，监控要关注 RSS 与堆占用差值。

## JVM 内存

JVM 内存是 JVM 规范定义的运行时数据区，由 GC 自动管理，开发者一般不需要手动释放。详见 [JVM 内存结构是什么](/01-java-core/jvm/basics/JVM内存结构是什么？.md)。

核心区域：

| 区域 | 作用 | 控制 |
|------|------|------|
| 堆 | 对象实例和数组 | `-Xms` / `-Xmx` |
| 方法区/元空间 | 类元信息、常量池 | `-XX:MaxMetaspaceSize`（JDK 8+ 在本地内存） |
| 程序计数器 | 当前字节码行号 | 不需配置 |
| 虚拟机栈 | 方法调用上下文 | `-Xss`（在本地内存） |
| 本地方法栈 | native 方法上下文 | `-Xss` |

特点：

- 自动管理：GC 自动回收。
- 分代设计：堆分新生代和老年代，优化 GC 效率。
- 易观测：jstat、jmap、JMX、Arthas 都能看。

## 本地内存

本地内存是 JVM 进程占用但不属于 JVM 运行时数据区的内存，由操作系统直接管理，不受 GC 控制。包含：

1. **元空间（JDK 8+）**：类元数据存本地内存，避免永久代 OOM。
2. **线程栈**：每个 Java 线程对应一个本地线程，栈在本地内存，受 `-Xss` 控制。
3. **JVM 内部开销**：JVM 自身 C/C++ 代码、CodeCache、GC 内部数据结构。
4. **JNI 内存**：通过 `malloc` 分配的内存，需手动释放。
5. **直接内存**：见下节。

特点：

- 不受 GC 直接管理（元空间有条件回收，直接内存依赖 Cleaner）。
- 容易泄漏，OOM 时可能进程被 OOM Killer 杀掉。
- 用 `jcmd VM.native_memory summary` 监控（需启用 NMT：`-XX:NativeMemoryTracking=summary`）。

```bash
# 启用 NMT
java -XX:NativeMemoryTracking=summary -jar app.jar

# 查看本地内存占用
jcmd <pid> VM.native_memory summary
```

## 直接内存

直接内存是通过 `DirectByteBuffer` 在堆外分配的内存，底层调用 `Unsafe.allocateMemory` → 操作系统 `malloc`。主要用于 NIO 零拷贝，避免 Java 堆与 OS 内核缓冲区之间反复拷贝。

### 实现原理

- `ByteBuffer.allocateDirect(capacity)` 创建 `DirectByteBuffer` 对象（在堆上）。
- 底层通过 `Unsafe.allocateMemory` 分配堆外内存。
- 通过 `Cleaner`（PhantomReference）+ GC 触发释放，不是实时。

```java
ByteBuffer buffer = ByteBuffer.allocateDirect(1024 * 1024 * 100); // 100MB 堆外
```

### 优势与不足

| 优势 | 不足 |
|------|------|
| 减少数据拷贝（IO 场景） | 分配/回收成本高（系统调用） |
| 突破堆内存限制 | 内存泄漏风险（依赖 Cleaner） |
| 提升 IO 性能（Netty、NIO） | 难以调试，无法用 JVM 工具直接观测 |

### 限制与调优

- 默认大小：与 `-Xmx` 相等。
- 显式限制：`-XX:MaxDirectMemorySize=2g`。
- OOM：`OutOfMemoryError: Direct buffer memory`。

## JVM 内存 vs 本地内存 vs 直接内存

| 维度 | JVM 内存 | 本地内存 | 直接内存 |
|------|---------|---------|---------|
| 包含关系 | JVM 运行时数据区 | 进程内存 - JVM 内存 | 本地内存的子集 |
| GC 管理 | 是 | 否（元空间有条件回收） | 否（依赖 Cleaner 触发） |
| 控制参数 | `-Xmx`、`-Xss` 等 | `-XX:MaxMetaspaceSize`、`-XX:NativeMemoryTracking` | `-XX:MaxDirectMemorySize` |
| 典型场景 | 普通对象 | 类元数据、线程栈 | NIO、Netty |
| OOM 表现 | `Java heap space`、`Metaspace` | 进程 RSS 持续增长、被 OOM Killer 杀 | `Direct buffer memory` |
| 监控工具 | jstat、jmap、JMX | NMT、`top`、`pmap` | NMT、`pmap` |

## 代码示例

观察三种内存的差异：

```java
// 1. JVM 堆内存
byte[] heapBytes = new byte[100 * 1024 * 1024]; // 100MB 在堆

// 2. 直接内存
ByteBuffer directBuffer = ByteBuffer.allocateDirect(100 * 1024 * 1024); // 100MB 堆外

// 3. 本地内存（通过 JNI/Unsafe 不直接暴露，元空间是典型）
// 元空间通过 -XX:MaxMetaspaceSize 限制
```

监控命令：

```bash
# 查看 JVM 进程 RSS
ps -p <pid> -o rss,vsz,cmd

# 查看本地内存细分（需 NMT）
jcmd <pid> VM.native_memory summary

# 查看堆占用
jcmd <pid> GC.heap_info
jstat -gcutil <pid> 1000

# 查看直接内存
jcmd <pid> VM.native_memory summary | grep -i "Direct"
```

## 实战场景

| 场景 | 关注点 | 工具 |
|------|--------|------|
| 容器内 OOM Killed | RSS 接近容器内存限制，但堆不大 | NMT、`top`、cgroup |
| Netty 高并发直接内存泄漏 | RSS 持续增长，堆稳定 | NMT、pmap |
| 元空间 OOM | 大量动态生成类（CGLIB、JSP） | jcmd、jmap |
| JNI 内存泄漏 | native 库 malloc 不释放 | valgrind、NMT |

## 深挖追问

### 元空间属于 JVM 内存还是本地内存？

按 JVM 规范的方法区是逻辑概念，HotSpot 在 JDK 8+ 用元空间实现，元空间在本地内存中。所以从实现上看，元空间属于本地内存；从规范上看，方法区属于 JVM 运行时数据区。面试回答时通常说"元空间在本地内存"。

### 直接内存为什么能提升 IO 性能？

传统 IO：用户态 buffer（堆）→ 内核态 buffer → 磁盘/网络。NIO + DirectByteBuffer：直接在堆外分配 buffer，避免用户态到内核态的数据拷贝（零拷贝）。Netty 的 PooledByteBufAllocator 大量使用直接内存。

### 容器内 -Xmx 设到容器内存上限，为什么还会被 OOM Killer 杀掉？

因为 JVM 进程内存 = JVM 内存（堆、元空间、栈等）+ 本地内存（直接内存、JNI、CodeCache 等）+ JVM 自身开销。`-Xmx` 只限制堆，元空间、直接内存、线程栈都不受 `-Xmx` 限制。容器内存上限 = 堆 + 元空间 + 直接内存 + 栈 + CodeCache + JVM 自身。建议 `-Xmx` 设到容器内存的 60%~70%，留出余量。

### 如何排查"堆不大但进程 RSS 很高"？

依次排查：

1. 元空间：`-XX:MaxMetaspaceSize` 是否过大，是否有类加载器泄漏。
2. 直接内存：Netty、NIO 是否泄漏，监控 `-XX:MaxDirectMemorySize`。
3. 线程栈：线程数是否过多，`-Xss * 线程数` 是否过大。
4. CodeCache：`-XX:ReservedCodeCacheSize` 是否过大。
5. JNI：是否有 native 库 malloc 不释放。

## 易错点

- 把"JVM 内存"和"进程内存"混淆，进程内存包含本地内存。
- 以为 `-Xmx` 限制了 JVM 进程所有内存，其实只限制堆。
- 把元空间当作 JVM 堆的一部分，实际在本地内存。
- 以为 DirectByteBuffer 受 GC 完全管理，实际依赖 Cleaner。
- 容器内只设 `-Xmx` 不留余量，被 OOM Killer 杀掉后还以为是 JVM bug。

## 总结

JVM 内存是 GC 自动管理的运行时数据区，本地内存是 JVM 进程中不受 GC 直接管理的部分（元空间、线程栈、JNI、直接内存等），直接内存是本地内存的子集，用于 NIO 零拷贝。三者的关键差异在于"是否受 GC 管理"和"控制参数"。容器化部署时尤其要关注进程 RSS 与堆占用的差值，留出足够余量给元空间、直接内存、线程栈。

## 参考资料

- [Native Memory Tracking](https://docs.oracle.com/en/java/javase/17/manage/diagnostic-tools.html)
- [JEP 247: Compile Direct Buffer Support into NIO](https://openjdk.org/jeps/247)
- 《深入理解 Java 虚拟机》周志明 第 12 章

---

[← 返回 JVM 基础目录](/01-java-core/jvm/basics/)
