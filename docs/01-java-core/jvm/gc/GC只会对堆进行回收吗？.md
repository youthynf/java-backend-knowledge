# GC 只会对堆进行回收吗

## 核心概念

"GC 只回收堆"是常见误解。实际上 GC 主要回收堆（对象实例），但也会回收方法区/元空间（废弃常量、无用类），直接内存则依赖 Cleaner 触发。理解 GC 的回收范围能帮助排查"堆不大但进程 RSS 很高"的问题。

JVM 规范允许 JVM 实现不对方法区进行垃圾回收，但 HotSpot 仍会回收。直接内存不属于 JVM 运行时数据区，其释放依赖 `Cleaner`（PhantomReference）+ GC 触发。

```text
GC 回收范围：
├─ 堆（主要）：对象实例、数组
├─ 方法区/元空间（次要）：废弃常量、无用类
└─ 直接内存（间接）：通过 Cleaner 触发，依赖 GC
```

## 标准回答

GC 主要回收堆中的对象实例，但不是只回收堆。方法区/元空间中的废弃常量、无用类也会被回收（满足三个条件）。直接内存不属于 JVM 运行时数据区，但其释放依赖 `Cleaner` + GC 触发，所以 GC 间接帮助释放直接内存。生产环境遇到"堆不大但进程 RSS 很高"，要排查元空间、直接内存、线程栈、JNI 内存。

要点：

1. **堆**：GC 主要工作区，对象实例和数组。
2. **方法区/元空间**：回收废弃常量和满足三条件的无用类。
3. **直接内存**：依赖 Cleaner + GC 触发，非直接管理。
4. **类卸载三条件**：所有实例回收、ClassLoader 回收、Class 对象无引用。
5. **OOM 类型**：Java heap space、Metaspace、Direct buffer memory 排查方向不同。

## 堆回收

堆是 GC 的主要工作区，存放对象实例和数组。分代收集中：

- 新生代：Eden + 2 个 Survivor，复制算法。
- 老年代：标记-清除 / 标记-整理。

具体 GC 行为见 [常用的垃圾回收算法有哪些](常用的垃圾回收算法有哪些？.md) 和 [常用的垃圾收集器概述](常用的垃圾收集器概述.md)。

## 方法区/元空间回收

方法区（JDK 8+ 元空间）的回收率远低于新生代，但 JVM 仍会回收两类内容：

### 1. 废弃常量

常量池中的字面量（如字符串）没有任何地方引用时，可被回收。

```java
// 假设常量池有 "abc"
String s = "abc";
s = null;
// "abc" 在常量池中无引用，可被回收
```

### 2. 无用类

类被卸载需要同时满足三个条件：

1. **该类所有实例都已被回收**：堆中不存在该类及子类的实例。
2. **加载该类的 ClassLoader 已被回收**：这个条件除非精心设计（OSGi、JSP 重加载），否则通常难达成。
3. **该类对应的 Class 对象没有在任何地方被引用**：无法通过反射访问。

满足三个条件后 JVM **允许**卸载，但不一定立即卸载。HotSpot 通过 `-Xnoclassgc` 控制是否对类进行卸载。

### 元空间回收的特殊性

元空间在本地内存，不在堆。元空间的"回收"实际是：

- 类元数据被标记为可回收。
- 元空间 chunk 被释放回操作系统（`-XX:MaxMetaspaceFreeRatio` 控制）。
- 元空间大小可动态调整。

在大量使用反射、动态代理（CGLIB）、JSP、OSGi 的场景，类卸载非常重要，否则元空间持续增长。

## 直接内存

直接内存不属于 JVM 运行时数据区，由 NIO `DirectByteBuffer` 通过 `Unsafe.allocateMemory` 分配。

### 回收机制

`DirectByteBuffer` 对象本身在堆里受 GC 管理。它引用的堆外内存通过 `Cleaner`（PhantomReference 子类）触发释放：

```text
DirectByteBuffer 对象（堆）→ 引用堆外内存
                                ↑
                 Cleaner（PhantomReference）
                                ↑
              GC 回收 DirectByteBuffer 时触发 Cleaner.run()
                                ↓
                 释放堆外内存（Unsafe.freeMemory）
```

### GC 的间接作用

GC 不直接管理堆外内存，但：

- GC 回收 `DirectByteBuffer` 对象时，触发 Cleaner 释放堆外内存。
- 如果 `DirectByteBuffer` 长期不被回收（如被缓存持有），堆外内存也不释放。

所以"GC 间接帮助释放直接内存"。

### 排查直接内存泄漏

- 监控进程 RSS 与堆占用的差值。
- `-XX:NativeMemoryTracking=summary` 启用 NMT。
- `jcmd <pid> VM.native_memory summary` 查看本地内存。
- 检查 Netty / NIO 的 DirectByteBuffer 使用。

## 不同 OOM 类型的排查方向

| OOM 类型 | 排查方向 |
|---------|---------|
| `Java heap space` | 内存泄漏 / 对象过多 / 堆太小 |
| `Metaspace` | 大量动态生成类 / 类加载器泄漏 |
| `GC overhead limit exceeded` | 持续 Full GC 但回收少 |
| `Direct buffer memory` | NIO 堆外内存泄漏 |
| `Unable to create new native thread` | 线程数过多 / OS 限制 |

## 代码示例

监控各区域：

```bash
# 堆统计
jcmd <pid> GC.heap_info
jstat -gcutil <pid> 1000

# 元空间统计
jcmd <pid> GC.class_histogram

# 本地内存统计（需启用 NMT）
jcmd <pid> VM.native_memory summary

# 直接内存监控
jcmd <pid> VM.native_memory summary | grep -i "Direct"
```

## 实战场景

| 场景 | 排查方向 | 工具 |
|------|---------|------|
| 堆不大但 RSS 高 | 元空间、直接内存、线程栈、JNI | NMT、pmap |
| 元空间持续增长 | 动态生成类、类加载器泄漏 | jcmd、jmap |
| 直接内存增长 | Netty、NIO DirectByteBuffer | NMT、pmap |
| 频繁 Full GC 但堆不大 | 元空间触发 Full GC | GC 日志 |

## 深挖追问

### 元空间 OOM 和堆 OOM 有什么区别？

堆 OOM 通常是对象实例过多或泄漏；元空间 OOM 常见于动态生成类过多（CGLIB、JSP）、类加载器泄漏、热部署不彻底。排查方向不同：堆 OOM 看 heap dump，元空间 OOM 看 class_histogram 和类加载器。

### 类卸载为什么比较难发生？

只要类加载器、类的实例、`Class` 对象仍可达，类元数据就不能安全卸载。Tomcat 重新部署 WebApp 时，如果旧的 ClassLoader 没被回收（典型是 ThreadLocal、线程池、静态日志器持有），就会导致元空间泄漏。

### 直接内存怎么排查？

关注 `-XX:MaxDirectMemorySize`、NIO/Netty Buffer 使用、Native Memory Tracking、进程 RSS 和堆占用是否不匹配。如果堆稳定但 RSS 持续增长，大概率是直接内存或 native 内存泄漏。

### GC 会回收栈吗？

不会。栈是线程私有的，随线程生死自动管理，不需要 GC。方法返回时栈帧出栈，线程结束时整个栈销毁。

## 易错点

- 以为 GC 只回收堆，方法区/元空间也会回收。
- 把元空间当作堆的一部分，实际在本地内存。
- 以为直接内存受 GC 完全管理，实际依赖 Cleaner。
- 看到 OOM 不分类型就调大堆，元空间 OOM 调堆无效。
- 忽略类卸载条件，以为不用的类会被立即回收。

## 总结

GC 主要回收堆中的对象实例，但也会回收方法区/元空间中的废弃常量和满足三条件的无用类。直接内存不属于 JVM 运行时数据区，但通过 Cleaner + GC 触发释放，所以 GC 间接帮助回收。生产环境遇到"堆不大但 RSS 高"，要排查元空间、直接内存、线程栈、JNI 内存。不同 OOM 类型排查方向不同：Java heap space 看堆 dump，Metaspace 看类加载器，Direct buffer memory 看 NIO。

## 参考资料

- [HotSpot Virtual Machine Garbage Collection Tuning Guide](https://docs.oracle.com/en/java/javase/17/gctuning/)
- 《深入理解 Java 虚拟机》周志明 第 3 章
- [Native Memory Tracking](https://docs.oracle.com/en/java/javase/17/manage/diagnostic-tools.html)

---

[← 返回 GC 目录](/01-java-core/jvm/gc/)
