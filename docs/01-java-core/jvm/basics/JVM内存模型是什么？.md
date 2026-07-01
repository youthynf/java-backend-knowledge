# JVM 内存模型是什么

## 核心概念

Java 内存模型（Java Memory Model，JMM）是 JSR-133 定义的多线程语义规范，规定一个线程对共享变量的写何时对其他线程可见，以及在什么条件下编译器、CPU 可以对指令进行重排序。它解决的问题是：在多核 CPU、多级缓存、写缓冲的硬件环境下，如何让正确同步的多线程程序在不同平台上拥有一致的行为。

JMM ≠ JVM 内存结构。前者是并发编程规范（happens-before、volatile、synchronized、final 语义），后者是运行时数据区划分（堆、栈、方法区）。两者名字像，但完全不是一回事。

JMM 的核心抽象：每条线程有自己的本地内存（涵盖 CPU 缓存、写缓冲、寄存器），线程之间的共享变量存储在主内存中。线程读写共享变量都先在本地内存进行，由 JMM 通过内存屏障控制何时刷回主存、何时从主存刷新。

```text
Thread A                     Main Memory                   Thread B
┌──────────────┐             ┌──────────────┐             ┌──────────────┐
│ 本地内存     │ ←read/load── │ 共享变量     │ ──read/load→│ 本地内存     │
│  var = 1     │              │  var         │              │  var = 0     │
│              │ ──write/store→             │ ←write/store│              │
└──────────────┘             └──────────────┘             └──────────────┘
```

## 标准回答

JMM 是 Java 并发的规范层，定义了线程与主存的交互规则，目的是在"性能优化（重排序）"和"内存可见性（正确性）"之间取得平衡。一句话结论：正确同步的多线程程序在任意平台上行为一致，未同步的程序只保证最小安全性（读到的是默认值或之前写入的值）。

掌握 JMM 的三个核心点：

1. **重排序**：编译器、指令级并行、内存系统都会重排序，单线程下遵守 as-if-serial，多线程下可能破坏可见性。
2. **happens-before**：JMM 提供给程序员的可见性契约，满足规则就保证前操作对后操作可见。
3. **内存屏障**：JMM 在字节码生成时插入 LoadLoad、LoadStore、StoreStore、StoreLoad 屏障，禁止特定重排序。

## 重排序

从源码到最终执行，可能经历三层重排序：

```text
源代码 → 编译器重排序 → 指令级并行重排序 → 内存系统重排序 → 实际执行
```

- 编译器重排序：在单线程语义不变前提下重排语句。
- 指令级并行（ILP）：处理器把多条指令重叠执行，无数据依赖就可重排。
- 内存系统重排序：CPU 缓存和写缓冲导致 load/store 看上去乱序。

数据依赖性约束：写后读、写后写、读后写存在依赖，编译器和处理器不会重排（同一变量、同一处理器、同一线程内）。as-if-serial 语义保证单线程程序执行结果不被重排序改变。

经典多线程可见性问题：

```java
// 可能输出 0,0 或 1,1 或 1,0，但不应该出现 0,1
// 但在重排序下，ready=true 可能先于 number=1 执行
int number = 0;
boolean ready = false;

// Thread A
number = 1;
ready = true;

// Thread B
if (ready) System.out.println(number);
```

## happens-before

JMM 用 happens-before 关系阐述可见性。如果一个操作的结果要对另一个操作可见，必须存在 happens-before。规则：

- **程序顺序规则**：同一线程内，前面操作 happens-before 后续操作。
- **监视器锁规则**：unlock happens-before 后续对同一锁的 lock。
- **volatile 规则**：volatile 写 happens-before 后续 volatile 读。
- **线程启动规则**：`Thread.start()` happens-before 该线程的所有操作。
- **线程终止规则**：线程所有操作 happens-before `Thread.join()` 返回。
- **传递性**：A happens-before B，B happens-before C，则 A happens-before C。

注意：happens-before 不要求前一个操作"必须"先执行，只要求结果对后一个操作可见且按顺序可见。JMM 仍允许重排序，只要不破坏可见性保证。

## 内存屏障

JMM 把内存屏障分四类：

| 屏障 | 含义 | 作用 |
|------|------|------|
| LoadLoad | Load1; LoadLoad; Load2 | Load1 完成后才执行 Load2 |
| StoreStore | Store1; StoreStore; Store2 | Store1 刷回主存后才执行 Store2 |
| LoadStore | Load1; LoadStore; Store2 | Load1 完成后才执行 Store2 |
| StoreLoad | Store1; StoreLoad; Load2 | Store1 刷回主存后才执行 Load2，全能屏障，开销最大 |

`volatile` 写之前插入 StoreStore，写之后插入 StoreLoad；`volatile` 读之后插入 LoadLoad 和 LoadStore。`synchronized` 在 monitor enter/exit 处插入屏障，保证临界区内代码不外泄。

## volatile 语义

volatile 在 JDK 5（JSR-133）后语义增强，写-读具有和锁释放-获取相同的内存语义：

- 可见性：写 volatile 变量立即刷回主存，读 volatile 变量从主存加载。
- 禁止重排序：通过 StoreStore + StoreLoad 屏障实现。
- 不保证原子性：`volatile int i; i++` 仍然不是原子的，因为 i++ 是读-改-写三步。

```java
// 经典单例的双重检查锁，必须 volatile
public class Singleton {
    private static volatile Singleton instance;
    public static Singleton getInstance() {
        if (instance == null) {
            synchronized (Singleton.class) {
                if (instance == null) {
                    instance = new Singleton();
                    // new 实际是 1.分配内存 2.初始化 3.赋值
                    // 没 volatile，可能重排成 1.3.2，其他线程拿到未初始化对象
                }
            }
        }
        return instance;
    }
}
```

## final 语义

JSR-133 增强 final 语义，提供初始化安全性保证：在构造函数中写入 final 字段，随后把构造对象引用赋给其他线程，其他线程一定能看到 final 字段的正确值。这要求构造函数不能让 this 引用逃逸。

## 代码示例

用 volatile 实现轻量级状态标志，用 synchronized 实现复合操作：

```java
// volatile 适合"一个线程写、多个线程读"的标志位
public class Server {
    private volatile boolean running = true;
    public void shutdown() { running = false; }
    public void run() { while (running) { /* ... */ } }
}

// 复合操作必须 synchronized 或用 AtomicXxx
public class Counter {
    private final AtomicInteger count = new AtomicInteger();
    public int incr() { return count.incrementAndGet(); }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 双重检查锁单例 | `volatile` 修饰实例字段 | 必须 volatile，防止 new 对象重排序 |
| 状态标志 | `volatile boolean running` | 适合一写多读；复合操作不能只用 volatile |
| 阻塞队列 | `ArrayBlockingQueue` 内部用 ReentrantLock + Condition | 锁释放 happens-before 后续锁获取，保证可见性 |
| 配置热更新 | `volatile` 引用 + 不可变配置对象 | 配合 AtomicReference 更稳妥 |

## 深挖追问

### happens-before 和"时间上先发生"是一回事吗？

不是。happens-before 是可见性规则，不是时序规则。一个操作 happens-before 另一个，只要求前者对后者可见且按顺序可见，实际执行中可能后者先完成。反之，两个不在 happens-before 关系中的操作，即使时间上 A 先于 B，JMM 也不保证 A 对 B 可见。

### 为什么 i++ 不能用 volatile 保证原子性？

i++ 是"读 i、加 1、写回"三步操作，volatile 只保证读写可见性和有序性，不保证三个原子操作组合起来原子。多线程下可能丢更新。必须用 `synchronized`、`AtomicInteger` 或 `LongAdder`。

### volatile 和 synchronized 的区别？

- volatile 只能修饰字段，synchronized 可修饰方法或代码块。
- volatile 不保证原子性，synchronized 互斥保证原子性。
- volatile 不会阻塞线程，synchronized 会。
- volatile 提供 happens-before 可见性，synchronized 也提供，且更强。

### 为什么 JMM 要"放宽"顺序一致性模型？

完全的顺序一致性模型会禁止大量编译器和 CPU 优化，性能损失巨大。JMM 在保证"正确同步的多线程程序与顺序一致性模型一致"的前提下，允许未同步程序重排序，这是性能与正确性的平衡。

## 易错点

- 把 JMM 和 JVM 内存结构混淆，导致面试答非所问。
- 认为 `volatile` 能保证原子性，对 `i++` 直接用 volatile 还以为安全。
- 双重检查锁忘记加 `volatile`，导致生产环境偶发 NPE。
- 以为 `synchronized` 只是互斥，不知道它也提供 happens-before 可见性保证。
- 在构造函数中让 `this` 逃逸，破坏 final 的初始化安全性。

## 总结

JMM 是 Java 并发的规范层，定义了 happens-before 规则和内存屏障，让正确同步的多线程程序在不同 CPU 架构上行为一致。重排序、可见性、原子性是 JMM 的三条主线，volatile/synchronized/final 是面向程序员的三种语义保证。理解 JMM 是写出无 bug 并发程序和阅读 JUC 源码的前提。和 JVM 内存结构相比：前者讲"线程如何看内存"，后者讲"内存如何分区域"。

## 参考资料

- [JSR-133: Java Memory Model and Thread Specification](https://www.jcp.org/en/jsr/detail?id=133)
- [The Java Memory Model](https://www.cs.umd.edu/~pugh/java/memoryModel/)
- 《Java 并发编程的艺术》方腾飞

---

[← 返回 JVM 基础目录](/01-java-core/jvm/basics/)
