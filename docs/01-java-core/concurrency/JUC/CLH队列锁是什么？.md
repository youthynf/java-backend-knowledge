# CLH队列锁是什么？

CLH队列锁是什么？
一、概述
CLH锁是一种 基于队列的公平自旋锁，由 Craig、Landin 和 Hagersten 提出，广泛应用于 Java 并发框架（如 AQS 的部分实现）。它的核心思想是 通过链表实现线程排队，每个线程自旋监听前驱节点的状态，避免全局竞争，提高并发性能。
二、核心特征
数据结构特性
CLH 锁是一个 隐式的 FIFO 队列，每个等待线程通过以下结构组成链表：

class CLHNode {
    volatile boolean locked; // true=需要获取锁，false=已释放锁
}
其中locked为true表示该节点对应线程正在等待或持有锁，false则表示节点对应的线程已经释放锁。
关键变量
•  tail：原子引用，指向队列的尾部节点（新线程通过 CAS 加入队列）。
•  ThreadLocal<CLHNode>：每个线程保存自己的节点和前驱节点。

运行机制特点
•  本地变量自旋：每个新加入者在前驱节点的locked字段上自旋;
•  去中心化检测：仅需检测直接前驱的状态变化;
•  低开销通知：前驱释放只会使后继节点的缓存失效;
三、工作原理
工作流程
1.1 加锁（lock）

void lock() {
    CLHNode node = new CLHNode();      // 1. 创建新节点
    node.locked = true;                // 2. 标记为等待锁
    CLHNode pred = tail.getAndSet(node); // 3. CAS 加入队列尾部
    while (pred.locked) {              // 4. 自旋等待前驱节点释放锁
        // 空转（或可插入 Thread.yield() 减少 CPU 占用）
    }
    // 5. 成功获取锁（前驱节点的 locked=false）
}
过程解析：
•  每个线程创建一个CLHNode，并设置locked=true。
•  通过AtomicReference.getAndSet()将节点加入队列尾部，并获取前驱节点pred。
•  自旋监听前驱节点的locked字段，直到pred.locked=false（表示前驱线程释放锁）。
•  退出自旋，当前线程成功获取锁。

1.2 解锁（unlock）

void unlock() {
    currentNode.locked = false;        // 1. 标记当前节点为已释放
    currentNode = pred;                // 2. 重置当前节点（可选优化）
}
过程解析：
•  将当前线程的 CLHNode.locked 设为 false，通知后继线程。
•  复用前驱节点以减少对象创建开销（需处理内存可见性），该步骤可选

在AQS中的改进
•  数据结构升级 : 从单向→双向链表(Node.prev/next)
•  等待机制变更 : 自旋→阻塞唤醒(LockSupport.park/unpark)
•  状态扩展 : 新增waitStatus(CANCELLED/SIGNAL等)

四、应用场景：Java生态中的应用
•  AQS基础架构 : 所有基于AbstractQueuedSynchronizer的实现都依赖改造版CLQ.
•  ReentrantLock : 公平模式直接使用,非公平模式混合使用.
•  CountDownLatch : 共享模式下维护等待者.
五、优势分析
•  严格公平性 : 杜绝饥饿现象.
•  低竞争开销 : 仅需修改tail指针(CAS).
•  NUMA友好 : 本地化内存访问模式.
六、局限性及优化
•  空间消耗 : 每个等待者需独立Node对象.
•  优化方案 : 引入超时机制/适应性自旋策略.
"Doug Lea在设计AQS时指出:改造后的CLQ既保留了原始算法的公平性优势,又通过阻塞机制大幅降低了CPU空转消耗。"

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **CLH队列锁是什么？**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

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

