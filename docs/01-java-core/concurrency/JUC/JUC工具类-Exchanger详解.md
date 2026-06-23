# JUC工具类-Exchanger详解

JUC工具类-Exchanger详解
一、概述
Exchanger（交换器）是Java并发包（`java.util.concurrent`）提供的一种线程间数据交换的同步工具，它允许两个线程在某个同步点交换数据。  
二、核心特点
•  成对线程协作：仅支持两个线程之间的数据交换。
•  双向数据传递：线程A可以传递数据给线程B，同时接收线程B的数据。
•  阻塞等待：如果一个线程先到达交换点，它会阻塞，直到另一个线程也到达。

三、核心原理
数据结构
Exchanger 内部采用slot（槽位）机制：
•  当一个线程调用 `exchange()` 时，它会检查是否有另一个线程在等待交换：
- 无等待线程：当前线程存入数据，并进入阻塞状态。
- 有等待线程：取出对方的数据，并唤醒对方线程。

关键方法
•  V exchange(V x)：交换数据，阻塞直到另一个线程到达；
•  V exchange(V x, long timeout, TimeUnit unit)：带超时的交换；

四、源码解析
•  内部类-Participant
Participant的作用是为每个线程保留唯一的一个Node节点，它继承ThreadLocal，说明每个线程具有不同的状态。

static final class Participant extends ThreadLocal<Node> {
    public Node initialValue() { return new Node(); }
}

•  内部类-Node

@sun.misc.Contended static final class Node {
     // arena的下标，多个槽位的时候利用
    int index; 
    // 上一次记录的Exchanger.bound
    int bound; 
    // 在当前bound下CAS失败的次数；
    int collides;
    // 用于自旋；
    int hash; 
    // 这个线程的当前项，也就是需要交换的数据；
    Object item; 
    //做releasing操作的线程传递的项；
    volatile Object match; 
    //挂起时设置线程值，其他情况下为null；
    volatile Thread parked;
}

•  核心属性

private final Participant participant;
private volatile Node[] arena;
private volatile Node slot;
Exchanger 的 arena 数组槽 是一种 并发优化设计，主要目的是解决 高竞争场景下的性能瓶颈。

多线程竞争使用Exchanger交换数据是，取数据的过程并不是简单遍历所有槽位，而是采用一种更高效的局部性哈希+自旋探测机制。简化版实现代码：

// Java 17 的 Exchanger 实现（简化）
public V exchange(V x) throws InterruptedException {
    Node node = new Node(x); // 创建携带数据的节点
    
    // 尝试哈希槽位
    int index = hash(Thread.currentThread()) % arena.length;
    Node slot = arena[index];
    
    if (slot != null && CAS(slot, null, node)) {
        // CASE 1: 找到匹配的等待节点
        Object v = spinWaitForValue(node); // 自旋等待对方填充数据
        return (V)v;
    }
    
    // CASE 2: 无等待节点，占用槽位
    if (slot == null && CAS(arena, index, null, node)) {
        return (V)await(node); // 阻塞等待配对线程
    }
    
    // CASE 3: 哈希冲突，尝试其他槽位
    index = (index + 1) % arena.length;
    // 重试逻辑...
}

五、工作流程
基本流程
•  线程A调用 `exchange(dataA)`：
- 如果线程B还未到达，线程A存入 `dataA` 并阻塞。

•  线程B调用 `exchange(dataB)`：
- 检测到线程A已在等待，取出 `dataA`，并返回给线程B。
- 线程A被唤醒，并获取 `dataB`。

示例代码

import java.util.concurrent.Exchanger;

public class ExchangerExample {
   public static void main(String[] args) {
       Exchanger<String> exchanger = new Exchanger<>();

       new Thread(() -> {
           try {
               String dataFromThread2 = exchanger.exchange("Data from Thread-1");
               System.out.println("Thread-1 收到: " + dataFromThread2);
           } catch (InterruptedException e) {
               e.printStackTrace();
           }
       }, "Thread-1").start();

       new Thread(() -> {
           try {
               String dataFromThread1 = exchanger.exchange("Data from Thread-2");
               System.out.println("Thread-2 收到: " + dataFromThread1);
           } catch (InterruptedException e) {
               e.printStackTrace();
           }
       }, "Thread-2").start();
   }
}

// 输出
Thread-1 收到: Data from Thread-2
Thread-2 收到: Data from Thread-1

六、底层实现（Java 7+优化）
Java 7之前：基于 Lock + Condition
•  使用 `ReentrantLock` 和 `Condition` 实现线程阻塞和唤醒。
•  适用于低竞争场景，但高并发时性能较差。

Java 7+：基于 CAS（无锁优化）
•  采用 `sun.misc.Unsafe`的 `CAS`（Compare-And-Swap）操作，避免锁竞争。
•  使用 “arena（竞技场）”模式，减少争用：
•  默认情况下，仍使用单槽位交换。
•  高并发时，动态扩展为多槽位（类似 `ConcurrentHashMap` 的分段锁机制）。

七、适用场景
✅ 生产者-消费者模式（双缓冲交换）  
✅ 管道式数据处理（线程A处理完交给线程B）  
✅ 双线程协作计算（如遗传算法、并行排序） 
八、示例：双缓冲数据交换

import java.util.concurrent.Exchanger;

public class DoubleBufferExample {
   public static void main(String[] args) {
       Exchanger<StringBuilder> exchanger = new Exchanger<>();
       // 生产者线程
       new Thread(() -> {
           StringBuilder buffer = new StringBuilder();
           try {
               while (true) {
                   buffer.append("Data-");
                   Thread.sleep(1000);
                   buffer = exchanger.exchange(buffer); // 交换缓冲区
                   buffer.setLength(0); // 清空旧缓冲区
               }
           } catch (InterruptedException e) {
               e.printStackTrace();
           }
       }).start();

       // 消费者线程
       new Thread(() -> {
           StringBuilder buffer = new StringBuilder();
           try {
               while (true) {
                   buffer = exchanger.exchange(buffer); // 获取新数据
                   System.out.println("消费: " + buffer);
               }
           } catch (InterruptedException e) {
               e.printStackTrace();
           }
       }).start();
   }
}

// 输出
消费: Data-
消费: Data-Data-
消费: Data-Data-Data-

九、与其他同步工具对比
•  Exchanger：严格2个线程，数据双向交换，使用域成对线程数据交换；
•  BlockingQueue：多生产者/消费者，数据单向交换，使用于任务队列；
•  CyclicBarrier：支持N个线程，无数据交换，仅实现同步屏障；

十、注意事项
⚠️ 死锁风险：如果只有一个线程调用exchange()，会永久阻塞。  
⚠️ 性能问题：高并发时，Java 7+ 的arena优化能提升吞吐量。  
⚠️ 数据一致性：交换的对象需是线程安全的（如String、ConcurrentHashMap）。  

十一、总结
•  Exchanger是双线程数据交换的高效工具。
•  底层通过CAS + 槽位机制实现无锁优化。
•  适用于生产者-消费者、双缓冲交换等场景。
•  比 `BlockingQueue` 更轻量，但仅支持两个线程。

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **JUC工具类-Exchanger详解**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

JUC 相关问题要说明它解决的并发痛点：减少手写同步代码、提供高性能线程安全容器、原子类、锁、同步器和任务编排工具。回答时需要把 API 用法和底层机制联系起来，例如 CAS、AQS、队列、阻塞/唤醒、弱一致性迭代等。

## 深挖追问

- AQS 的 state、同步队列、独占/共享模式分别是什么作用？
- CAS 的 ABA、自旋开销、只能保护单变量等问题如何处理？
- JUC 容器和 `Collections.synchronizedXxx` 的适用场景有什么区别？
- 公平锁和非公平锁在吞吐、延迟、饥饿风险上如何取舍？

## 实战场景/代码示例

```java
AtomicInteger counter = new AtomicInteger();
int value = counter.incrementAndGet(); // 适合简单计数；复杂临界区仍应使用锁
```

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

