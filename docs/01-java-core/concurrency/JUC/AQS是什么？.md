# AQS 是什么

## 核心概念

AQS 全称 `AbstractQueuedSynchronizer`，是 JUC 中用来构建锁和同步器的基础框架。它位于 `java.util.concurrent.locks` 包下。`ReentrantLock`、`ReentrantReadWriteLock`、`Semaphore`、`CountDownLatch`、`FutureTask` 都基于 AQS 实现。

AQS 的核心思想可以一句话概括：**用一个 `volatile int state` 表示同步状态，用一个 FIFO 双向队列管理获取资源失败的线程，通过 CAS 修改 state，通过 `LockSupport` 挂起和唤醒线程。**

如果线程获取同步状态成功，就继续执行；如果获取失败，就把当前线程封装成 Node 节点加入等待队列，并在合适时机阻塞，等待前驱节点释放资源后再被唤醒。

## 标准回答

AQS 是 Java 并发工具的基础同步框架，把同步器的通用逻辑抽象出来——同步状态管理、等待队列维护、线程阻塞和唤醒——具体同步语义则交给子类实现。

AQS 三件套：

1. **`volatile int state`**：同步状态，含义由子类定义。
2. **FIFO 双向队列**：获取失败的线程被封装成 Node 排队等待。
3. **模板方法**：子类实现 `tryAcquire/tryRelease` 或 `tryAcquireShared/tryReleaseShared`，AQS 负责排队、阻塞和唤醒。

不同同步器对 `state` 的语义不同：

| 同步器 | state 含义 | 模式 |
|--------|------------|------|
| `ReentrantLock` | 锁重入次数 | 独占 |
| `ReentrantReadWriteLock` | 高 16 位读锁数量，低 16 位写锁重入次数 | 共享 + 独占 |
| `Semaphore` | 剩余许可证数量 | 共享 |
| `CountDownLatch` | 剩余倒数次数 | 共享 |

## 实现原理

### 同步状态 state

```java
private volatile int state;

protected final int getState() { return state; }
protected final void setState(int newState) { state = newState; }
protected final boolean compareAndSetState(int expect, int update) {
    return unsafe.compareAndSwapInt(this, stateOffset, expect, update);
}
```

`state` 用 `volatile` 保证可见性，CAS 保证原子修改。

### FIFO 双向队列（CLH 变体）

线程获取失败后会被封装成 `Node` 加入队列：

```java
static final class Node {
    volatile int waitStatus;      // CANCELLED=1, SIGNAL=-1, CONDITION=-2, PROPAGATE=-3
    volatile Node prev;
    volatile Node next;
    volatile Thread thread;
    Node nextWaiter;              // Condition 队列的下一个节点 / 共享标记
}
```

`waitStatus` 取值含义：

- `SIGNAL (-1)`：后继线程需要被唤醒。
- `CANCELLED (1)`：节点因超时或中断被取消。
- `CONDITION (-2)`：节点在 Condition 等待队列上。
- `PROPAGATE (-3)`：共享模式下传播唤醒。
- `0`：默认初始状态。

AQS 队列常被称为 CLH 队列的变体，但它和原始 CLH 不同：原始 CLH 是隐式单向链表 + 自旋，AQS 是显式双向链表 + park/unpark 阻塞唤醒。

### 模板方法

独占模式：

```java
protected boolean tryAcquire(int arg) { throw new UnsupportedOperationException(); }
protected boolean tryRelease(int arg) { throw new UnsupportedOperationException(); }
```

共享模式：

```java
protected int tryAcquireShared(int arg) { throw new UnsupportedOperationException(); }
protected boolean tryReleaseShared(int arg) { throw new UnsupportedOperationException(); }
```

`tryAcquireShared` 返回值含义：

- 负数：获取失败。
- 0：获取成功，但后续无法继续传播。
- 正数：获取成功，且后续可以传播唤醒。

## 获取和释放流程

### 独占模式 acquire

```java
public final void acquire(int arg) {
    if (!tryAcquire(arg) &&
        acquireQueued(addWaiter(Node.EXCLUSIVE), arg))
        selfInterrupt();
}
```

`ReentrantLock.lock()` 的执行路径：

```text
线程调用 lock()
  -> tryAcquire 尝试 CAS 把 state 从 0 改为 1
  -> 成功：设置 owner，继续执行
  -> 失败：addWaiter 包装成 Node 入队
  -> acquireQueued 自旋检查前驱是否 head
  -> 是：再试一次 tryAcquire
  -> 仍失败：park 阻塞
  -> 前驱释放锁时 unpark 当前线程
```

释放锁时 `state` 减 1，减到 0 时唤醒后继节点。

### 共享模式 acquireShared

```java
public final void acquireShared(int arg) {
    if (tryAcquireShared(arg) < 0)
        doAcquireShared(arg);
}
```

`Semaphore.acquire()` 通过 CAS 把 `state` 减 1；只要许可证足够，多个线程可同时获取成功。

`CountDownLatch.await()` 调用 `tryAcquireShared`，判断 `state == 0`：是则通过，否则进入队列等待；其他线程 `countDown()` 把 `state` 减 1，减到 0 时唤醒所有等待线程。

### ConditionObject

AQS 还提供 `ConditionObject` 实现 `Condition` 接口。每个 `Condition` 维护一个独立的等待队列（单向链表），调用 `await()` 时线程被包装成 Node 移到 Condition 队列，调用 `signal()` 时再移回主同步队列重新竞争锁。这比 `synchronized` 每个对象只有一个 wait set 更灵活。

## 代码示例

### ReentrantLock 基于 AQS

```java
ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    // 临界区
} finally {
    lock.unlock();
}
```

底层：`NonfairSync.tryAcquire` 先 CAS 把 `state` 从 0 改为 1，成功后设置 `setExclusiveOwnerThread`。若 `state != 0` 且 owner 是当前线程，则 `state` 加 1（可重入）。否则 `acquireQueued` 入队等待。

### CountDownLatch 基于 AQS 共享模式

```java
CountDownLatch latch = new CountDownLatch(3);
for (int i = 0; i < 3; i++) {
    new Thread(() -> {
        try { doWork(); } finally { latch.countDown(); }
    }).start();
}
latch.await();
System.out.println("all done");
```

`state` 初始 3，`countDown()` 通过 CAS 减 1，减到 0 时 `tryReleaseShared` 返回 true，触发 `doReleaseShared` 唤醒所有等待线程。

### Semaphore 基于 AQS 共享模式

```java
Semaphore semaphore = new Semaphore(10);
semaphore.acquire();
try {
    // 最多 10 个线程同时执行
} finally {
    semaphore.release();
}
```

`tryAcquireShared` 中通过 CAS 把 `state` 减 1，结果非负则获取成功。

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 互斥保护共享状态 | `ReentrantLock` + AQS 独占模式 | 必须 `finally` 释放锁 |
| 多线程等待初始化完成 | `CountDownLatch` + AQS 共享模式 | `countDown` 放 `finally`，配合超时 `await` |
| 限流 | `Semaphore` 共享模式 | 单 JVM 限流，多实例需网关或 Redis |
| 读写分离 | `ReentrantReadWriteLock` 共享 + 独占 | 注意锁降级顺序，避免写锁饥饿 |
| 多条件队列 | `ReentrantLock.newCondition()` | `await` 必须 `while` 检查条件防虚假唤醒 |

## 深挖追问

### 1. AQS 为什么既有独占模式又有共享模式？

不同同步器的资源占用语义不同。独占模式表示同一时刻只有一个线程持有资源（`ReentrantLock` 写锁）；共享模式表示多个线程可以同时获取资源（`Semaphore` 多个许可证、`CountDownLatch` 归零后多线程同时通过、`ReentrantReadWriteLock` 读锁）。

### 2. ReentrantLock 如何实现可重入？

`state` 记录重入次数。锁未持有时，CAS 把 `state` 从 0 改为 1 并设置 owner；同一线程再次 `lock()` 时只把 `state` 加 1；`unlock()` 时 `state` 减 1，减到 0 才真正释放锁并唤醒后继线程。

### 3. AQS 如何避免线程一直自旋浪费 CPU？

线程入队后不会长期空转。如果短暂尝试仍无法获取资源，会通过 `LockSupport.park()` 挂起。释放资源的线程通过 `LockSupport.unpark()` 唤醒后继节点。这样既保留了排队公平性，又避免了忙等。

### 4. 公平锁和非公平锁在 AQS 中有什么区别？

公平锁 `tryAcquire` 前先调用 `hasQueuedPredecessors()` 检查队列中是否有前驱节点，有则排队等待。非公平锁直接 CAS 抢锁，即使队列中有等待线程也可能插队成功。`ReentrantLock` 默认非公平，吞吐量更高。

### 5. Condition 的 await 和 Object.wait 有什么共同点？

二者都释放当前持有的锁，让线程进入等待状态；被唤醒后需要重新竞争锁。都应配合 `while` 循环检查条件，防止虚假唤醒。区别：`Condition` 由 AQS 实现，可绑定多个等待队列；`Object.wait` 由对象监视器实现，每个对象只有一个 wait set。

## 易错点

- AQS 不是具体锁，而是构建锁和同步器的框架。
- `state` 的含义由具体同步器定义，不一定只表示锁是否被占用。
- AQS 队列是 CLH 思想的变体，不是原始纯自旋 CLH。
- 获取失败的线程不会一直忙等，而是会 `park` 阻塞。
- 非公平锁不等于完全无序，它只是允许新线程先尝试抢锁。

## 总结

AQS 是 JUC 的核心基础设施，用 `volatile int state` 表示同步状态，FIFO 双向队列管理等待线程，CAS 保证状态修改原子性，`park/unpark` 完成阻塞唤醒。它通过模板方法把排队、阻塞、唤醒的通用逻辑抽象出来，子类只需实现 `tryAcquire/tryRelease`（独占）或 `tryAcquireShared/tryReleaseShared`（共享）。掌握 AQS 就掌握了 `ReentrantLock`、`Semaphore`、`CountDownLatch`、`ReentrantReadWriteLock` 的共同原理。

## 参考资料

- [JDK AbstractQueuedSynchronizer 源码](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/locks/AbstractQueuedSynchronizer.html)
- Java Concurrency in Practice
