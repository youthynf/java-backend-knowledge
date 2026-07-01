# Happens-Before 原则是什么

## 核心概念

Happens-Before 是 Java 内存模型（JMM）的核心概念，定义"一个操作的结果对另一个操作可见"的逻辑关系。它**不是**时间顺序——"A happens-before B"不意味着 A 在物理时间上先于 B 执行；它的真实语义是"JMM 保证 A 操作的结果对 B 可见，且 A 的重排序不会被排到 B 之后"。

JMM 的设计目标是：在不破坏"as-if-serial"单线程语义的前提下，允许编译器和 CPU 做重排序优化，但通过 Happens-Before 规则给程序员一组"可见性保证"。程序员只要按规则写代码，就不用关心底层缓存一致性、指令重排序细节。

经典场景：线程 A 写普通变量 `int x = 1`，然后写 `volatile boolean flag = true`；线程 B 读 `flag` 看到 true，那么 B 读 `x` 一定能看到 1。这就是"volatile 写 happens-before 后续 volatile 读"+ "传递性"两条规则联合作用的结论。

## 标准回答

Happens-Before 是 JMM 定义的"操作可见性"规则，共 8 条（也常被概括为"六大规则+两条传递"）。只要两个操作之间存在 happens-before 关系，前一个操作的结果对后一个可见。

JSR-133 规定的 8 大规则：

1. **程序顺序规则**：同一线程中，按代码顺序前面的操作 happens-before 后面的操作。
2. **监视器锁规则**：对同一个 monitor 的 unlock 操作 happens-before 后续的 lock 操作。
3. **volatile 变量规则**：对 volatile 变量的写操作 happens-before 后续的读操作。
4. **线程启动规则**：`Thread.start()` happens-before 该线程的所有操作。
5. **线程终止规则**：线程的所有操作 happens-before 其他线程检测到该线程终止（`Thread.join()` 返回、`isAlive()` 返回 false）。
6. **线程中断规则**：`Thread.interrupt()` 调用 happens-before 被中断线程检测到中断事件（`InterruptedException` 抛出、`isInterrupted()` 返回 true）。
7. **对象终结规则**：对象的构造方法执行结束 happens-before 它的 `finalize()` 方法开始。
8. **传递性**：若 A happens-before B，且 B happens-before C，则 A happens-before C。

"满足 happens-before"不是要求物理时间上先后执行，而是 JMM 给程序员的可见性承诺。

## 实现原理

### JMM 的抽象结构

JMM 把内存分为"主内存"和"工作内存"（每线程一份）。线程对变量的操作必须经过"工作内存"中转：

- read/load：主内存 → 工作内存
- use/assign：工作内存 ↔ 线程
- store/write：工作内存 → 主内存

普通变量何时同步回主内存不确定，因此出现可见性问题。JMM 通过 volatile、synchronized、final 等关键字，在底层插入内存屏障，强制建立"读写主内存"的顺序约束，从而实现 happens-before 语义。

### Happens-Before 与重排序的关系

JMM 允许编译器和 CPU 做重排序，但有约束：**只要不改变单线程语义（as-if-serial），且不破坏 happens-before 关系，就可以重排序**。具体分两类：

- **改变 happens-before 关系的重排序**：JMM 禁止。
- **不改变 happens-before 关系的重排序**：JMM 允许。

举例：线程 A 内有 `x = 1; y = 2`，线程 B 读到 y=2 不代表能读到 x=1——因为这两个写之间没有 happens-before 关系，编译器可能把它们重排。但如果改成 `x = 1; volatile y = 2`，线程 B 读到 y=2 就保证能读到 x=1——因为"程序顺序规则"+"volatile 规则"+"传递性"建立了 happens-before 链。

### volatile 规则的底层实现

volatile 写在字节码层面没有特殊指令，靠 JVM 插入内存屏障实现：

- volatile 写前插 StoreStore，写后插 StoreLoad。
- volatile 读后插 LoadLoad + LoadStore。

这保证了 volatile 写之前的所有普通写，在 volatile 写之前已刷主内存；volatile 读之后的所有普通读，不会跑到 volatile 读之前。所以"volatile 写 happens-before 后续 volatile 读"的同时，volatile 写之前的普通变量修改也对后续读线程可见。

详见 [volatile基本原理是什么？](/01-java-core/concurrency/keywords/volatile基本原理是什么？.md)。

### 监视器锁规则的底层实现

synchronized 通过 `monitorenter` / `monitorexit` 实现：

- 加锁时清空工作内存，强制从主内存读。
- 解锁时把工作内存刷回主内存。

所以"unlock happens-before 后续 lock"的语义就是：上一个持锁线程对共享变量的修改，对下一个持锁线程全部可见。详见 [synchronized基本原理是什么？](/01-java-core/concurrency/keywords/synchronized基本原理是什么？.md)。

### 线程启动规则的底层实现

`Thread.start()` 内部会建立 happens-before 屏障：父线程在 start() 之前的所有修改，对子线程可见。实现上 `Thread.start()` 在 JVM 层面会插入内存屏障，保证父线程的写对子线程可见。这就是为什么"父线程把数据准备好，再 start 子线程"是安全的。

```java
int data;
Thread t = new Thread(() -> {
    System.out.println(data); // 一定能看到 1，不依赖 volatile
});
data = 1;
t.start();
```

### 线程终止规则的底层实现

`Thread.join()` 内部是 `wait()` 循环，等子线程结束。子线程结束时 JVM 会在 Thread 对象上 `notifyAll()`，这个同步过程天然建立了 happens-before——子线程的所有操作 happens-before join() 返回。所以主线程 join 后读子线程修改的普通变量也是安全的。

## 代码示例

### 程序顺序规则 + 传递性

```java
// 在线程 A 内
int a = 1;          // A1
int b = 2;          // A2
volatile boolean ready = true;  // A3

// 在线程 B 内
if (ready) {        // B1
    System.out.println(a);   // 一定能看到 1
    System.out.println(b);   // 一定能看到 2
}
```

happens-before 链：A1/A2 → A3（程序顺序规则）；A3 → B1（volatile 规则）；A1/A2 → B1（传递性）。

### 监视器锁规则

```java
public class MonitorHB {
    private int x;
    private final Object lock = new Object();

    public void write() {
        synchronized (lock) {
            x = 1;                  // unlock 隐含 happens-before 后续 lock
        }
    }

    public void read() {
        synchronized (lock) {
            if (x == 1) {
                System.out.println("see x=1");   // 一定能看到
            }
        }
    }
}
```

### 线程启动规则

```java
public class StartHB {
    private int data;

    public void run() {
        data = 42;                  // 父线程修改
        Thread t = new Thread(() -> {
            System.out.println(data);   // 子线程一定能看到 42
        });
        t.start();                  // start() 建立 happens-before
    }
}
```

### 线程终止规则

```java
public class JoinHB {
    private int result;

    public void run() throws InterruptedException {
        Thread t = new Thread(() -> {
            result = compute();     // 子线程修改普通变量
        });
        t.start();
        t.join();                   // join 返回后，主线程能看到 result 的修改
        System.out.println(result);
    }
}
```

## 实战场景

| 场景 | 应用的规则 | 说明 |
|------|-----------|------|
| 状态标记 + 数据发布 | volatile 规则 + 传递性 | 写数据后写 volatile 标记，读标记后读数据 |
| 同步块保护临界区 | 监视器锁规则 | unlock 后下一个 lock 能看到所有修改 |
| 父线程准备数据后 start 子线程 | 线程启动规则 | 不需要额外同步 |
| 主线程 join 后读子线程结果 | 线程终止规则 | 不需要额外同步 |
| 配置初始化后启动业务线程 | 线程启动规则 | 配置写完后 start 业务线程 |
| 单例 DCL | volatile 规则 + 传递性 | instance 必须 volatile 防半初始化 |

## 深挖追问

### Happens-Before 和"时间先后"有什么区别？

- **时间先后**：物理时钟上 A 先于 B 发生。但 A 的修改可能还在 CPU 缓存里没刷主内存，B 可能看不到。
- **Happens-Before**：JMM 保证 A 的结果对 B 可见。即使物理时间上 B 在 A 之前执行，只要存在 happens-before 关系，JMM 也会保证可见性（实际通常表现为 A 在 B 之前完成刷主内存）。

举例：A 线程 `volatile x = 1`，B 线程读 x。即使 CPU 调度让 B 先跑，B 也必须等 A 写完才能读到 1——这就是 happens-before 的强制力。

### 为什么需要"传递性"？

单独的 volatile 规则只能保证"A 写 volatile v → B 读 v"的可见性，没法保证"A 写普通变量 x → B 读 x"。但加上传递性后：A 写 x → A 写 v（程序顺序）→ B 读 v（volatile 规则）→ B 读 x（程序顺序），传递得到 A 写 x → B 读 x。这就是 volatile 能"传递普通变量可见性"的根源。

### final 字段有 happens-before 规则吗？

final 字段的初始化安全是独立的规则，不直接列入 happens-before 8 条，但 JMM 保证：对象的构造方法结束 happens-before 该对象的 finalize 方法（对象终结规则）。final 字段的可见性靠"final 域 StoreStore 屏障"实现，详见 [final重排序规则是什么？](/01-java-core/concurrency/keywords/final重排序规则是什么？.md)。

### 一个操作"不 happens-before"另一个操作意味着什么？

意味着 JMM 不做任何可见性保证——A 的修改可能对 B 可见，也可能不可见，结果不确定。例如线程 A 写普通变量 `x=1`，B 读 `x`，没有同步关系，B 可能读到 0 也可能读到 1。这种代码就是有 bug 的，必须加 volatile/synchronized。

### Thread.interrupt() 也是 happens-before 吗？

是。线程中断规则：`A 调用 B.interrupt()` happens-before `B 检测到中断`（抛 InterruptedException 或 isInterrupted 返回 true）。所以 worker 线程在 sleep/wait 中被中断时，能看到中断线程之前的所有修改（前提是有同步关系）。

### 为什么"自增 i++"加 volatile 也不安全？

volatile 只保证"读"和"写"各自的可见性，不保证"读-改-写"整体原子。happens-before 也只是可见性保证，不是原子性保证。两个线程都读到 i=1 各自 +1 写回 2，丢失一次更新。要用 `AtomicInteger` 或 `synchronized`。

## 易错点

- 把 happens-before 当时间顺序——它是可见性保证，不是物理时序。
- 以为没有 happens-before 关系也能保证可见性——普通变量无同步，跨线程可能读到旧值。
- 误以为 volatile 解决一切——它只解决可见性 + 有序性，不解决原子性。
- final 字段不加 volatile 以为不安全——final 有独立的初始化安全保证。
- 忽略传递性——只看单条规则，看不到"通过中间变量传递"的链条。

## 总结

Happens-Before 是 JMM 定义的"操作可见性"规则，共 8 条：程序顺序、监视器锁、volatile、线程启动、线程终止、线程中断、对象终结、传递性。它的本质是"JMM 给程序员的可见性承诺"，不是物理时间顺序。理解 happens-before 的关键是用传递性把多个规则串起来——例如"写普通变量 + 写 volatile 标记"组合，让普通变量借 volatile 获得跨线程可见性。volatile、synchronized、final、Thread API 都是 happens-before 的实现载体。

## 参考资料

- [JSR-133 FAQ](https://www.cs.umd.edu/~pugh/java/memoryModel/jsr-133-faq.html)
- [Java Language Specification §17.4.5 Happens-Before](https://docs.oracle.com/javase/specs/jls/se17/html/jls-17.html#jls-17.4.5)
- [深入理解 Java 内存模型——程晓明](https://www.infoq.cn/article/java-memory-model-1)

---
