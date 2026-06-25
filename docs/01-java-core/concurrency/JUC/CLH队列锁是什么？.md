# CLH 队列锁是什么？

## 核心概念

CLH（Craig, Landin, and Hagersten）队列锁是一种基于 FIFO 等待队列的自旋锁。它的核心思路是：每个竞争锁的线程不再一起抢同一个共享变量，而是把自己包装成一个节点排到队尾，然后只观察前驱节点的状态。前驱释放锁后，把自己的状态改成“已释放”，后继线程看到这个变化后继续执行。

这类设计解决的是传统 TAS/Test-And-Set 自旋锁在高并发下的热点问题：所有线程都对同一个锁变量反复 CAS 或读取，会造成严重缓存一致性流量。CLH 把竞争分散到“每个线程关注自己的前驱”，让排队更公平，也让缓存抖动更小。

## 面试官想考什么

面试里问 CLH，通常不是让你手写一个锁，而是考三件事：

1. 是否理解公平排队锁的基本思想：FIFO、前驱通知后继。
2. 是否能说清楚它和普通自旋锁的差异：不是所有线程盯着同一个变量，而是盯着前驱节点。
3. 是否知道 AQS 和 CLH 的关系：AQS 借鉴了 CLH 队列思想，但做了大量工程化改造，不是原始纯自旋 CLH。

一句话回答：CLH 是一种基于虚拟队列的公平自旋锁，线程入队后自旋等待前驱节点释放；AQS 使用的是 CLH 思想的变体，通过双向队列和 park/unpark 把忙等改造成阻塞等待。

## 标准回答

CLH 锁通常包含一个尾指针 `tail` 和线程本地保存的节点。每个节点里有一个状态位，例如 `locked`，表示当前节点对应的线程是否仍在等待或持有锁。

加锁流程：

1. 当前线程创建自己的节点，并把 `locked` 置为 `true`。
2. 通过原子操作把自己的节点交换到队尾，拿到原来的队尾作为前驱节点。
3. 当前线程自旋读取前驱节点的 `locked`。
4. 当前驱节点 `locked=false`，说明前驱已释放锁，当前线程获得锁。

解锁流程：

1. 当前线程把自己节点的 `locked` 改成 `false`。
2. 后继线程正在观察这个字段，因此可以感知释放并退出自旋。

简化示例：

```java
class CLHLock {
    static class Node {
        volatile boolean locked;
    }

    private final AtomicReference<Node> tail = new AtomicReference<>(new Node());
    private final ThreadLocal<Node> current = ThreadLocal.withInitial(Node::new);
    private final ThreadLocal<Node> prev = new ThreadLocal<>();

    public void lock() {
        Node node = current.get();
        node.locked = true;
        Node predecessor = tail.getAndSet(node);
        prev.set(predecessor);
        while (predecessor.locked) {
            // 自旋等待前驱释放
        }
    }

    public void unlock() {
        Node node = current.get();
        node.locked = false;
        current.set(prev.get()); // 复用前驱节点，减少对象创建
    }
}
```

这段代码只用于理解思想。真实生产锁还要处理取消、超时、中断、CPU 空转、内存回收等复杂问题。

## 和 AQS 的关系

AQS 的同步队列经常被称为 CLH 变体。它保留了“线程排队、前驱控制后继”的思想，但和原始 CLH 有明显不同：

- 原始 CLH 更偏向自旋等待；AQS 主要使用 `LockSupport.park/unpark` 阻塞和唤醒线程。
- 原始 CLH 可以是隐式链表；AQS 使用带 `prev/next` 的双向队列，方便取消节点、跳过无效节点和唤醒后继。
- 原始节点状态比较简单；AQS 节点有 `waitStatus`，用于表达 `SIGNAL`、`CANCELLED`、`CONDITION`、`PROPAGATE` 等状态。
- 原始 CLH 通常用于互斥锁；AQS 同时支持独占模式和共享模式，例如 `ReentrantLock`、`Semaphore`、`CountDownLatch`。

所以面试时不要简单说“AQS 就是 CLH 锁”。更准确的说法是：AQS 借鉴 CLH 队列的排队思想，并结合阻塞唤醒、中断取消、共享传播等机制做了工程化增强。

## 深挖追问

**追问 1：CLH 为什么比普通自旋锁更适合高并发？**

普通自旋锁中，所有线程都反复读取或 CAS 同一个锁变量，锁释放时会触发大量线程同时争抢，导致缓存行频繁失效。CLH 中每个线程只观察自己的前驱节点，竞争被队列化，缓存一致性压力更小，并且天然接近 FIFO 公平。

**追问 2：CLH 一定比 synchronized 好吗？**

不一定。CLH 是锁算法思想，原始实现可能持续自旋，临界区较长时会浪费 CPU。`synchronized` 和 AQS 锁在 JVM/框架层面做了阻塞、唤醒、偏向/轻量级锁等优化。实际选型要看临界区长度、竞争强度、是否需要可中断、超时、公平性和条件队列。

**追问 3：为什么 AQS 不直接使用纯自旋？**

Java 业务线程的临界区可能涉及 IO、RPC、数据库访问或复杂计算。如果等待线程一直自旋，会白白消耗 CPU。AQS 的做法是短暂竞争失败后进入队列，必要时 `park` 挂起，由释放锁的线程 `unpark` 后继，从而更适合通用业务场景。

## 实战场景

在业务开发中很少直接实现 CLH 锁，但理解它有助于排查 JUC 锁问题：

- 看到大量线程阻塞在 `AbstractQueuedSynchronizer.acquire`，说明线程正在 AQS 同步队列中等待。
- `ReentrantLock` 公平锁会更强调排队顺序，吞吐可能低于非公平锁，但饥饿风险更小。
- 如果线程 Dump 中大量线程等待同一把锁，要进一步检查临界区是否过大、是否把远程调用放在锁内、是否锁粒度过粗。

例如订单库存扣减时，如果把“查库存、调用远程风控、写库、发消息”全部放入一把锁内，等待队列会快速堆积。更好的做法是缩小锁范围，只保护必须互斥的内存状态，外部 IO 放到锁外。

## 易错点

- 不要把 CLH 和 AQS 完全画等号；AQS 是 CLH 思想的变体。
- 不要忽略自旋成本；等待时间长时，阻塞唤醒通常比纯自旋更合适。
- 不要只说“公平”；还要能解释 FIFO 队列和观察前驱节点的机制。
- 不要在业务代码里随手自研锁；优先使用 JDK 已验证的同步工具。

## 总结

CLH 队列锁的关键是“排队 + 观察前驱 + FIFO 公平”。它把锁竞争从全局热点变量转移到前驱节点状态，降低高并发下的竞争开销。AQS 借鉴这一思想，并通过双向队列、节点状态、阻塞唤醒和取消处理，把算法改造成适合 Java 通用并发框架的同步基础。
