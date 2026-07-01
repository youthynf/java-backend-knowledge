# CLH 队列锁是什么

## 核心概念

CLH（Craig, Landin, and Hagersten）队列锁是一种基于 FIFO 等待队列的自旋锁。它的核心思路是：每个竞争锁的线程不再一起抢同一个共享变量，而是把自己包装成一个节点排到队尾，然后只观察前驱节点的状态。前驱释放锁后把自己的状态改成"已释放"，后继线程看到这个变化后继续执行。

这类设计解决的是传统 TAS/Test-And-Set 自旋锁在高并发下的热点问题：所有线程都对同一个锁变量反复 CAS 或读取，会造成严重的缓存一致性流量。CLH 把竞争分散到"每个线程关注自己的前驱"，让排队更公平，缓存抖动更小。

一句话：**CLH 是基于虚拟队列的公平自旋锁，线程入队后自旋等待前驱节点释放；AQS 使用的是 CLH 思想的变体，通过双向队列和 `park/unpark` 把忙等改造成阻塞等待。**

## 标准回答

CLH 锁通常包含一个尾指针 `tail` 和线程本地保存的节点。每个节点里有一个状态位 `locked`，表示当前节点对应的线程是否仍在等待或持有锁。

加锁流程：

1. 当前线程创建自己的节点，并把 `locked` 置为 `true`。
2. 通过原子操作（`getAndSet`）把自己的节点交换到队尾，拿到原来的队尾作为前驱。
3. 当前线程自旋读取前驱节点的 `locked`。
4. 当前驱节点 `locked=false`，说明前驱已释放锁，当前线程获得锁。

解锁流程：

1. 当前线程把自己节点的 `locked` 改成 `false`。
2. 后继线程正在观察这个字段，因此可以感知释放并退出自旋。

CLH 适合高并发竞争场景，但原始实现是纯自旋，临界区较长时会浪费 CPU。

## 实现原理

### 简化实现

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
            Thread.onSpinWait(); // JDK 9+ 提示 CPU 减少功耗
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

### 为什么 CLH 缓存友好

在传统 TAS 自旋锁中，所有线程反复读取或 CAS 同一个 `lock` 变量。一旦持锁线程释放，所有等待线程的本地缓存行同时失效，需要重新从主内存读取，造成缓存一致性流量爆发。

CLH 中每个线程只自旋读取自己的前驱节点的 `locked` 字段。前驱释放时，只有一个后继线程的缓存行失效，竞争压力大幅降低。线程之间通过队列形成一条"接力"链路。

## 和 AQS 的关系

AQS 的同步队列经常被称为 CLH 变体。它保留了"线程排队、前驱控制后继"的思想，但和原始 CLH 有明显不同：

| 维度 | 原始 CLH | AQS |
|------|----------|-----|
| 链表结构 | 隐式（每个线程本地持有前驱引用） | 显式双向链表（Node 带 prev/next） |
| 等待方式 | 纯自旋 | 短暂自旋后 `park` 阻塞 |
| 节点状态 | 简单 `locked` 布尔 | `waitStatus`（SIGNAL/CANCELLED/CONDITION/PROPAGATE） |
| 模式 | 仅互斥 | 独占 + 共享 |
| 取消处理 | 不支持 | 支持节点取消、跳过无效节点 |
| 唤醒机制 | 后继自旋感知 | 前驱释放时 `unpark` 后继 |

更准确的说法是：**AQS 借鉴 CLH 队列的排队思想，并结合阻塞唤醒、中断取消、共享传播等机制做了工程化增强，不是原始 CLH 锁。**

## 代码示例

CLH 的核心思想是"前驱通知后继"。下面这个简化例子演示两个线程的接力：

```java
import java.util.concurrent.atomic.AtomicReference;

public class CLHLockDemo {
    static class Node {
        volatile boolean locked = false;
    }

    private static final AtomicReference<Node> tail = new AtomicReference<>(new Node());

    public static void main(String[] args) throws InterruptedException {
        Node a = new Node();
        Node b = new Node();

        // 线程 A 入队
        a.locked = true;
        Node aPrev = tail.getAndSet(a);

        // 线程 B 入队，前驱是 A
        b.locked = true;
        Node bPrev = tail.getAndSet(b);

        // A 自旋等前驱（aPrev.locked = false 立即通过）
        new Thread(() -> {
            while (aPrev.locked) { Thread.onSpinWait(); }
            System.out.println("A 拿到锁");
            try { Thread.sleep(50); } catch (InterruptedException ignored) {}
            a.locked = false; // 释放
        }).start();

        // B 自旋等 A 释放
        new Thread(() -> {
            while (bPrev.locked) { Thread.onSpinWait(); }
            System.out.println("B 拿到锁");
            b.locked = false;
        }).start();
    }
}
```

实际业务代码不会自研 CLH 锁，但理解它有助于看懂 AQS 源码和线程 Dump 中 `AbstractQueuedSynchronizer.acquire` 的栈帧。

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 看线程 Dump | 识别 `AbstractQueuedSynchronizer.acquire` 栈帧，确认线程在 AQS 队列等待 | 链路里大量线程阻塞同一锁，应检查临界区是否过大 |
| 理解 AQS 排队 | CLH 思想是 AQS 的基础，掌握后能快速理解 `prev/next/waitStatus` 的设计 | AQS 不是纯 CLH，多了 park/unpark 和双向链表 |
| 自旋锁优化 | 短临界区可考虑自旋，长临界区必须阻塞 | `Thread.onSpinWait()`（JDK 9+）能降低自旋功耗 |

例如订单库存扣减时，如果把"查库存、调用远程风控、写库、发消息"全部放入一把锁内，等待队列会快速堆积。更好的做法是缩小锁范围，只保护必须互斥的内存状态，外部 IO 放到锁外。

## 深挖追问

### 1. CLH 为什么比普通自旋锁更适合高并发？

普通自旋锁中，所有线程都反复读取或 CAS 同一个锁变量，锁释放时会触发大量线程同时争抢，导致缓存行频繁失效。CLH 中每个线程只观察自己的前驱节点，竞争被队列化，缓存一致性压力更小，并且天然接近 FIFO 公平。

### 2. CLH 一定比 synchronized 好吗？

不一定。CLH 是锁算法思想，原始实现可能持续自旋，临界区较长时会浪费 CPU。`synchronized` 和 AQS 锁在 JVM/框架层面做了阻塞、唤醒、偏向/轻量级锁等优化。实际选型要看临界区长度、竞争强度、是否需要可中断、超时、公平性和条件队列。

### 3. 为什么 AQS 不直接使用纯自旋？

Java 业务线程的临界区可能涉及 IO、RPC、数据库访问或复杂计算。如果等待线程一直自旋，会白白消耗 CPU。AQS 的做法是短暂竞争失败后进入队列，必要时 `park` 挂起，由释放锁的线程 `unpark` 后继，从而更适合通用业务场景。

### 4. MCS 锁和 CLH 锁有什么区别？

MCS（Mellor-Crummey and Scott）队列锁也是基于链表的自旋锁，但和 CLH 相反：MCS 中每个节点自旋读取自己的 `locked` 字段，前驱释放时显式修改后继节点的 `locked`。CLH 则是后继自旋读取前驱的 `locked`。MCS 在 NUMA 架构上更友好（每个线程只访问本地节点），CLH 在缓存一致性总线上的流量更小。

## 易错点

- 不要把 CLH 和 AQS 完全画等号；AQS 是 CLH 思想的变体。
- 不要忽略自旋成本；等待时间长时，阻塞唤醒通常比纯自旋更合适。
- 不要只说"公平"；还要能解释 FIFO 队列和观察前驱节点的机制。
- 不要在业务代码里随手自研锁；优先使用 JDK 已验证的同步工具。

## 总结

CLH 队列锁的关键是"排队 + 观察前驱 + FIFO 公平"。它把锁竞争从全局热点变量转移到前驱节点状态，降低高并发下的竞争开销。AQS 借鉴这一思想，并通过双向队列、节点 `waitStatus`、`park/unpark` 阻塞唤醒和取消处理，把算法改造成适合 Java 通用并发框架的同步基础。

## 参考资料

- A. Craig, T. S. Craig, B. D. Marsh, et al. "Building FIFO and Priority-Queuing Spin Locks from Atomic Swap"
- [JDK AbstractQueuedSynchronizer 源码注释](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/locks/AbstractQueuedSynchronizer.html)
