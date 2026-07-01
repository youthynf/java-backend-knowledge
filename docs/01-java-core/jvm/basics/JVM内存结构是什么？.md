# JVM 内存结构是什么

## 核心概念

JVM 内存结构是 JVM 规范定义的运行时数据区划分，规定 Java 程序运行时内存如何分区、各区域存什么、谁私有谁共享、什么时候回收。它解决的问题是：让 GC、JIT、解释器、线程调度都基于统一的内存视图工作，让一份字节码在不同 JVM 实现上行为一致。

JVM 内存结构 ≠ Java 内存模型（JMM）。前者描述"内存怎么分区"，后者描述"多线程怎么和主存交互、什么时候可见"。两者只在名字上像，关注点完全不同。

整体布局一句话：线程私有区域（程序计数器、虚拟机栈、本地方法栈）+ 线程共享区域（堆、方法区）+ 直接内存（堆外，不在 JVM 规范里但常用）。

```text
┌──────────────────────────────────────────────────────────────┐
│                    JVM 运行时数据区                          │
├──────────────────────┬───────────────────────────────────────┤
│   线程私有           │   线程共享                            │
│  ┌────────────────┐  │  ┌────────────────────────────────┐  │
│  │ 程序计数器 PC  │  │  │   堆 Heap                      │  │
│  ├────────────────┤  │  │  ┌──────────┬─────────────────┐│  │
│  │ 虚拟机栈       │  │  │  │ 新生代   │  老年代         ││  │
│  │ (栈帧 Stack    │  │  │  │Eden+S0+S1│                 ││  │
│  │  Frame)        │  │  │  └──────────┴─────────────────┘│  │
│  ├────────────────┤  │  └────────────────────────────────┘  │
│  │ 本地方法栈     │  │  ┌────────────────────────────────┐  │
│  └────────────────┘  │  │ 方法区/元空间 Metaspace        │  │
│                      │  └────────────────────────────────┘  │
├──────────────────────┴───────────────────────────────────────┤
│   直接内存 Direct Memory（NIO DirectByteBuffer，堆外）        │
└──────────────────────────────────────────────────────────────┘
```

## 标准回答

JVM 内存结构是 JVM 在运行时把进程内存划分成若干区域，每个区域有不同用途、可见性和回收策略。面试回答时按"五区 + 一外"组织：

1. **程序计数器**：线程私有，记录当前线程执行的字节码行号；执行 native 方法时为 undefined；唯一不会 OOM 的区域。
2. **虚拟机栈**：线程私有，存放方法调用的栈帧（局部变量表、操作数栈、动态链接、返回地址）；递归过深抛 `StackOverflowError`，栈空间不足抛 `OutOfMemoryError`。
3. **本地方法栈**：为 native 方法服务，HotSpot 与虚拟机栈合二为一。
4. **堆**：线程共享，存放对象实例和数组，是 GC 主战场；分新生代（Eden + 2 个 Survivor，比例 8:1:1）和老年代（比例 1:2）。
5. **方法区 / 元空间**：线程共享，存类元信息、运行时常量池、静态变量、JIT 代码缓存。JDK 7 前是永久代（堆内），JDK 8+ 是元空间（本地内存）。
6. **直接内存**：NIO `DirectByteBuffer` 用的堆外内存，不受 `-Xmx` 限制，但受物理内存和 `-XX:MaxDirectMemorySize` 限制。

## 各区域详解

### 程序计数器（PC Register）

CPU 切换线程后恢复执行需要知道下一条指令地址。每条线程一个 PC，互不影响。执行 Java 方法时记录字节码偏移量，执行 native 方法时为 undefined。这块内存极小，JVM 规范明确规定不会 OOM。

### 虚拟机栈（VM Stack）

每个方法调用创建一个栈帧，方法返回时弹出。栈帧结构：

```text
┌─────────────────────────────────┐
│ 局部变量表 Local Variables      │  Slot 为单位，long/double 占 2 个
│  [0] this  [1] arg1  [2] var1   │  实例方法 Slot 0 是 this
├─────────────────────────────────┤
│ 操作数栈 Operand Stack          │  计算中间结果，栈深编译期确定
├─────────────────────────────────┤
│ 动态链接 Dynamic Linking        │  指向运行时常量池的方法引用
├─────────────────────────────────┤
│ 返回地址 Return Address         │  方法退出后回到调用者哪一行
└─────────────────────────────────┘
```

参数控制：`-Xss` 设置单线程栈大小，JDK 8 默认 1MB。栈越大调用深度越深，但同样物理内存下能创建的线程数越少。

```java
// 递归过深导致 StackOverflowError
public class StackOverflowDemo {
    private static int depth = 0;
    public static void recursion() {
        depth++;
        recursion();
    }
    public static void main(String[] args) {
        try { recursion(); }
        catch (StackOverflowError e) {
            System.out.println("depth=" + depth); // 默认约 5000~10000
        }
    }
}
```

### 堆（Heap）

堆是 JVM 管理的最大一块内存，几乎所有对象实例和数组都在堆上分配，也是 GC 主要工作区。分代是为了配合"不同生命周期对象用不同算法"。

```text
┌──────────────────────────────────────────────────────────┐
│                         堆                               │
├────────────────────────┬─────────────────────────────────┤
│   新生代 (1/3)         │   老年代 (2/3)                  │
│ ┌──────┬──────┬──────┐ │                                 │
│ │ Eden │ S0   │ S1   │ │                                 │
│ │ 8    │ 1    │ 1    │ │                                 │
│ └──────┴──────┴──────┘ │                                 │
└────────────────────────┴─────────────────────────────────┘
  NewRatio=2  SurvivorRatio=8
```

关键参数：

| 参数 | 含义 | 示例 |
|------|------|------|
| `-Xms` | 堆初始大小 | `-Xms4g` |
| `-Xmx` | 堆最大大小 | `-Xmx4g` |
| `-Xmn` | 新生代大小 | `-Xmn2g` |
| `-XX:NewRatio` | 老年代:新生代 | `-XX:NewRatio=2` |
| `-XX:SurvivorRatio` | Eden:Survivor | `-XX:SurvivorRatio=8` |
| `-XX:MaxTenuringThreshold` | 晋升老年代年龄 | `-XX:MaxTenuringThreshold=15` |

生产环境强烈建议 `-Xms` 与 `-Xmx` 设成一样，避免堆动态扩缩容引发额外 Full GC 和性能抖动。

### 方法区 / 元空间

方法区是 JVM 规范定义的逻辑区域，存类元信息、运行时常量池、静态变量、JIT 代码缓存。HotSpot 的实现经历过重要演进：

| JDK 版本 | 实现 | 存储位置 | 大小限制 |
|----------|------|---------|---------|
| JDK 7 及以前 | 永久代 PermGen | JVM 进程堆内 | `-XX:MaxPermSize`，默认 64M~82M |
| JDK 8 及以后 | 元空间 Metaspace | 本地内存 | 默认无上限，可 `-XX:MaxMetaspaceSize` 限制 |

字符串常量池和静态变量在 JDK 7 起从永久代移到堆中，原因是永久代太小，频繁 `intern` 容易 OOM。

```java
// 元空间 OOM：大量动态生成类（如 CGLIB 代理）
// -XX:MaxMetaspaceSize=32m
while (true) {
    Enhancer enhancer = new Enhancer();
    enhancer.setSuperclass(MetaspaceOOM.class);
    enhancer.setUseCache(false);
    enhancer.setCallback((MethodInterceptor) (obj, m, args, proxy) ->
        proxy.invokeSuper(obj, args));
    enhancer.create();
}
```

### 直接内存

不属于 JVM 运行时数据区，但 NIO 频繁使用。`DirectByteBuffer` 通过 `Unsafe.allocateMemory` 调用操作系统 malloc 分配堆外内存，避免 Java 堆与 native 堆之间的数据拷贝，适合大文件 IO、网络通信（Netty 大量使用）。

```java
ByteBuffer direct = ByteBuffer.allocateDirect(1024 * 1024 * 100); // 100MB 堆外
ByteBuffer heap   = ByteBuffer.allocate(1024 * 1024 * 100);        // 100MB 堆内
```

回收依赖 `Cleaner`（PhantomReference 触发），不是实时，所以直接内存泄漏排查难度大。

| 对比项 | 直接内存 | 堆内存 |
|--------|---------|--------|
| 分配方式 | Unsafe / DirectByteBuffer | new / ByteBuffer.allocate |
| IO 性能 | 少一次拷贝，IO 场景更快 | 需要在 JVM 堆和 OS 之间拷贝 |
| 回收方式 | Cleaner + GC 触发 | GC 自动回收 |
| 受 -Xmx 限制 | 否 | 是 |
| 适合场景 | 大文件 IO、网络通信 | 普通对象存储 |

## 代码示例

最小化复现各类 OOM：

```java
// 1. 堆 OOM
List<byte[]> list = new ArrayList<>();
while (true) list.add(new byte[1024 * 1024]);

// 2. 栈溢出
void recursion() { recursion(); }

// 3. 直接内存 OOM（受 -XX:MaxDirectMemorySize 限制）
List<ByteBuffer> buffers = new ArrayList<>();
while (true) buffers.add(ByteBuffer.allocateDirect(1024 * 1024));
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 微服务堆设置 | `-Xms2g -Xmx2g -XX:+UseG1GC` | 容器内必须留出 native 内存余量，避免 OOM Killer |
| 元空间调优 | `-XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=512m` | 启动初期设大 MetaspaceSize 避免触发频繁 Full GC |
| 高 IO 服务 | NIO DirectByteBuffer + `-XX:MaxDirectMemorySize=2g` | 慎用，泄漏难查；监控进程 RSS 与堆差值 |
| 线程数极限 | 减小 `-Xss=256k` 提升并发线程数 | 栈过小容易 StackOverflow，特别是递归调用 |

## 深挖追问

### 堆、栈、方法区分别存什么？

堆存对象实例和数组；栈存方法调用的局部变量、操作数栈、动态链接、返回地址；方法区/元空间存类元信息、运行时常量池、静态变量、JIT 代码缓存。静态变量本身在 JDK 7+ 移到堆中，引用的对象也在堆中。

### 为什么 JDK 8 把永久代替换成元空间？

永久代固定大小容易 OOM，特别是动态生成类（CGLIB、JSP、Groovy）场景；元空间用本地内存，受限于物理内存，给类元数据更大的发挥空间；同时把字符串常量池、静态变量挪到堆中，让它们能和普通对象一样被 GC。

### 栈、堆都会 OOM，区别是什么？

栈 OOM 是无法分配新栈或栈深度超限，主要场景是递归过深或线程数过多；堆 OOM 是对象过多/内存泄漏，需要 dump 分析。栈溢出错误是 `StackOverflowError`，堆溢出是 `OutOfMemoryError: Java heap space`。

### 直接内存为什么会 OOM？

直接内存不受 `-Xmx` 限制，但受物理内存和 `-XX:MaxDirectMemorySize` 限制。`DirectByteBuffer` 回收依赖 Cleaner + GC，如果 GC 不及时，分配速度超过回收速度，就会抛 `OutOfMemoryError: Direct buffer memory`。

## 易错点

- 把"JVM 内存结构"和"Java 内存模型 JMM"混为一谈，前者讲分区，后者讲多线程可见性。
- 认为方法区就是永久代。方法区是规范，永久代/元空间是 HotSpot 的实现，JDK 8 后只有元空间。
- 以为静态变量在方法区。JDK 7+ 静态变量本身就在堆中，只有引用关系在类元信息里。
- 容器内 `-Xmx` 直接设到物理内存上限，忽略了 JVM 自身、元空间、直接内存、线程栈也要内存，最终被 OOM Killer 杀掉。
- 把 `-Xss` 设过大（如 8MB），导致单机几千线程就耗尽进程虚拟内存。

## 总结

JVM 内存结构是理解 GC、调参、排查 OOM 的基础。线程私有的 PC、栈、本地方法栈随线程生死，不需要 GC；线程共享的堆、方法区是 GC 主战场。JDK 8 是分水岭：永久代→元空间、字符串常量池→堆。直接内存是 NIO 的高速通道，但要单独限流。理解每个区域的存储内容、回收策略、参数控制，是后续所有 GC 和故障排查知识的前置条件。

## 参考资料

- [The Java Virtual Machine Specification - Runtime Data Areas](https://docs.oracle.com/javase/specs/jvms/se17/html/jvms-2.html#jvms-2.5)
- [Java Platform, Standard Edition HotSpot Virtual Machine Garbage Collection Tuning Guide](https://docs.oracle.com/en/java/javase/17/gctuning/)
- 《深入理解 Java 虚拟机：JVM 高级特性与最佳实践》周志明

---

[← 返回 JVM 基础目录](/01-java-core/jvm/basics/)
