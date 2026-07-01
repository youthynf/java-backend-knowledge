# Java 对象一定在堆上分配吗

## 核心概念

"对象在堆上分配"是 Java 的常规情况，但不是绝对。JVM 经过逃逸分析后，可以让不逃逸的对象在栈上分配（甚至标量替换为基本类型变量），从而省去堆内存压力和 GC 开销。此外，元空间存类元数据、直接内存存 NIO Buffer、TLAB 是堆内的线程私有分配缓冲，都不算"普通的堆上对象分配"。

理解这个问题的核心是分清"理论上规范要求"和"实际 JVM 优化"。JVM 规范只要求对象在堆上分配，但 HotSpot 等实现通过 JIT 优化把不逃逸对象"挪到"栈上或寄存器中。

```text
new 一个对象 →
   1. 类加载检查 →
   2. 逃逸分析（JIT 编译时） →
        ├─ 未逃逸 → 标量替换 / 栈上分配（不进堆）
        └─ 已逃逸 → 走堆分配
   3. 堆分配 →
        ├─ 优先 TLAB（Eden 内的线程私有缓冲）
        ├─ TLAB 失败 → Eden 加锁分配
        └─ 大对象 / Eden 满 → 老年代 / 触发 GC
```

## 标准回答

绝大多数对象在堆上分配，但不绝对。一句话结论：JIT 通过逃逸分析识别"不逃逸"的对象，对其做标量替换或栈上分配；TLAB 是堆内的快速分配通道；元空间、直接内存不属于堆，但也能放对象相关的数据。

要点：

1. **常规堆分配**：99% 的对象走堆，受 GC 管理。
2. **栈上分配**：JIT 通过逃逸分析，让未逃逸对象随栈帧出栈自动销毁，不进堆、不进 GC。
3. **标量替换**：把不逃逸对象拆成基本类型字段直接放栈/寄存器，连对象都不创建。
4. **TLAB**：Eden 内的线程私有分配缓冲，避免多线程分配竞争，本质还是堆。
5. **大对象直接进老年代**：避免在新生代间反复复制。
6. **元空间**：JDK 8+ 类元数据在本地内存，不在堆。
7. **直接内存**：NIO DirectByteBuffer 在堆外。

## 堆分配（常规情况）

绝大多数对象实例存储在堆中，由 GC 管理。`new` 指令触发分配时，JVM 优先在 TLAB 中分配，TLAB 失败再走 Eden 加锁分配。

## 栈上分配

逃逸分析（Escape Analysis）是 JIT 在编译时分析对象动态作用域的优化技术。如果一个对象不会逃逸出当前方法，JVM 可以把它分配在栈帧上，方法返回时栈帧出栈自动销毁，无需 GC 介入。

逃逸分析默认开启：`-XX:+DoEscapeAnalysis`（JDK 6u23+ 默认开启）。栈上分配本身在 HotSpot 中并不是真的"分配在栈上"，而是通过标量替换间接实现。

```java
public User buildUser() {
    User u = new User();   // u 不逃逸
    u.setId(1);
    u.setName("a");
    return u;              // 这里逃逸了！不能栈上分配
}

public int sum() {
    User u = new User();   // u 不逃逸
    u.setId(1);
    return u.getId();      // 真正不逃逸，可标量替换
}
```

## 标量替换

标量（Scalar）是不可再分解的值，如 int、long、reference。聚合量（Aggregate）是可以再分解的，如对象。JIT 通过逃逸分析确定对象不逃逸且可拆解时，不创建对象，而是把字段拆成独立的标量，分配在栈帧或寄存器中。

```java
// 原始代码
class Point { int x, y; }
void demo() {
    Point p = new Point(1, 2);
    System.out.println(p.x + p.y);
}

// JIT 标量替换后（伪代码）
void demo() {
    int x = 1, y = 2;       // Point 对象从未被创建
    System.out.println(x + y);
}
```

控制参数：`-XX:+EliminateAllocations`（默认开启）。

## TLAB（Thread Local Allocation Buffer）

堆是共享的，多线程并发分配对象时需要 CAS 或加锁。HotSpot 在 Eden 区为每个线程预分配一小块私有内存（TLAB），线程在 TLAB 内分配无锁，TLAB 用完才走 Eden 加锁分配。

- 默认 TLAB 占 Eden 的 1%，可通过 `-XX:TLABWasteTargetPercent` 调整。
- `-XX:+UseTLAB` 默认开启。
- TLAB 仍是堆的一部分，只是分配更高效。

## 元空间和直接内存

JDK 8+ 类元数据存在元空间（本地内存），不在堆。运行时常量池在元空间，字符串常量池在堆。

直接内存通过 `ByteBuffer.allocateDirect` 或 `Unsafe.allocateMemory` 分配，绕过 JVM 堆管理，用于 NIO 零拷贝。不受 `-Xmx` 限制，受 `-XX:MaxDirectMemorySize` 和物理内存限制。

## 大对象直接进老年代

大对象（如长数组、超大字符串）需要连续内存，在新生代反复复制代价高。`-XX:PretenureSizeThreshold` 设置阈值，超过直接进老年代。该参数只对 Serial 和 ParNew 有效，G1 用 Humongous Region 处理。

## 代码示例

验证栈上分配和标量替换：

```java
// -XX:+PrintAssembly 太重，用 GC 行为侧面验证
// 关闭逃逸分析：-XX:-DoEscapeAnalysis -XX:+PrintGC
public class EscapeTest {
    static class User { int id; String name; }

    // 不逃逸，应被标量替换，不分配堆对象
    public static void noEscape() {
        User u = new User();
        u.id = 1;
        u.name = "a";
    }

    public static void main(String[] args) {
        for (int i = 0; i < 1_000_000; i++) noEscape();
        // 开启逃逸分析：几乎不触发 GC
        // 关闭逃逸分析：会触发多次 Minor GC
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 高频创建临时对象 | 让对象不逃逸，享受栈上分配 | 避免在循环里返回临时对象 |
| 大对象 | 控制对象大小或用流式处理 | 大对象直接进老年代，触发 Full GC |
| 多线程高并发分配 | TLAB 已默认开启，无需手动调 | 调大 `-XX:TLABSize` 可能反而增加 Eden 压力 |
| 直接内存 | NIO + Netty 场景 | 必须监控进程 RSS，与堆差值要解释清楚 |

## 深挖追问

### 栈上分配真的存在吗？

HotSpot 没有真正实现"对象直接分配在栈帧上"的代码路径，而是通过标量替换间接达到效果：JIT 分析对象不逃逸且可拆解时，直接把字段拆成标量，连对象都不创建。从结果看，等同于"栈上分配"，但实现机制是标量替换。

### 逃逸分析什么时候会失效？

对象逃逸的情况：作为方法返回值、被赋给静态字段、被传入其他方法、被异步任务持有、被注册为监听器。只要对象引用可能离开当前方法或线程，就不能栈上分配。

### TLAB 是堆还是栈？

TLAB 在堆的 Eden 区中，本质是堆内存。但它对线程私有，分配时无需 CAS 或加锁。可以理解为"堆内的高速缓存"。

### 直接内存分配的对象受 GC 管理吗？

`DirectByteBuffer` 对象本身在堆里受 GC 管理，但它引用的堆外内存通过 `Cleaner`（PhantomReference）触发释放。GC 不直接管理堆外内存，所以如果 `DirectByteBuffer` 没被回收，堆外内存就一直占用，容易 OOM。

## 易错点

- 以为栈上分配是 JVM 强制行为，实际上依赖 JIT 编译和逃逸分析，需要预热。
- 以为关闭逃逸分析后程序就出错，只是性能略差，堆压力增加。
- 把 TLAB 当作"栈"，它本质还是堆。
- 以为 `final` 字段一定在栈上，存储位置由 JVM 实现决定。
- 把直接内存当作"不受任何限制"，其实受物理内存和 `-XX:MaxDirectMemorySize` 限制。

## 总结

Java 对象分配以堆为主，但不绝对。逃逸分析和标量替换让"不逃逸"的对象不进堆，TLAB 让堆分配无锁化，元空间和直接内存绕开堆存储特殊数据。理解这些机制能帮助写出更易被 JIT 优化的代码（短小、不逃逸、循环内创建），并在排查 OOM 时区分堆、元空间、直接内存。

## 参考资料

- [OpenJDK HotSpot Escape Analysis](https://wiki.openjdk.org/display/HotSpot/EscapeAnalysis)
- 《深入理解 Java 虚拟机》周志明 第 11 章
- [JEP 245: G1 Around the Heap](https://openjdk.org/jeps/245)

---

[← 返回 JVM 基础目录](/01-java-core/jvm/basics/)
