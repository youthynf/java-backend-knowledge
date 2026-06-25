# AQS 是什么？

## 核心概念

AQS，全称 `AbstractQueuedSynchronizer`，是 Java 并发包中用来构建锁和同步器的基础框架。它位于 `java.util.concurrent.locks` 包下，很多常见并发工具都基于 AQS 实现，例如：

- `ReentrantLock`
- `ReentrantReadWriteLock`
- `Semaphore`
- `CountDownLatch`
- `FutureTask`

AQS 的核心思想可以概括为：**用一个 volatile 的 int 类型 state 表示同步状态，用一个 FIFO 等待队列管理获取资源失败的线程，通过 CAS 修改 state，通过 LockSupport 挂起和唤醒线程。**

```java
private volatile int state;
```

如果线程获取同步状态成功，就继续执行；如果获取失败，就把当前线程封装成节点加入等待队列，并在合适时机阻塞，等待前驱节点释放资源后再被唤醒。

## 面试官想考什么

这道题通常想考察：

- AQS 解决了什么问题。
- `state` 和等待队列分别负责什么。
- 独占模式和共享模式有什么区别。
- `ReentrantLock`、`Semaphore`、`CountDownLatch` 如何基于 AQS 实现。
- 获取锁失败后线程如何排队、阻塞、唤醒。

## 标准回答

AQS 是 Java 并发工具的基础同步框架。它把同步器的通用逻辑抽象出来，包括同步状态管理、等待队列维护、线程阻塞和唤醒等。具体同步语义则交给子类实现，比如独占锁、共享锁、信号量、倒计时门闩等。

AQS 主要由三部分组成：

### 1. 同步状态 state

`state` 是 AQS 中最核心的状态字段。

```java
protected final int getState() {
    return state;
}

protected final void setState(int newState) {
    state = newState;
}

protected final boolean compareAndSetState(int expect, int update) {
    // CAS 修改 state
}
```

不同同步器对 `state` 的含义不同：

- `ReentrantLock`：state 表示锁重入次数。
- `Semaphore`：state 表示剩余许可证数量。
- `CountDownLatch`：state 表示还需要倒数的次数。
- `ReentrantReadWriteLock`：state 同时编码读锁数量和写锁重入次数。

### 2. FIFO 等待队列

当线程获取同步状态失败时，AQS 会把线程封装成 Node 节点，加入一个 FIFO 双向等待队列。

队列中的节点大致保存：

- 当前线程。
- 前驱节点和后继节点。
- 节点等待状态。
- 独占模式或共享模式标识。

AQS 的等待队列常被称为 CLH 队列的变体。它不是原始自旋 CLH 锁，而是结合了阻塞和唤醒机制，更适合 JVM 线程调度。

### 3. 模板方法

AQS 提供了大量模板方法，子类只需要实现关键的获取和释放逻辑。

独占模式常见方法：

```java
protected boolean tryAcquire(int arg) {
    throw new UnsupportedOperationException();
}

protected boolean tryRelease(int arg) {
    throw new UnsupportedOperationException();
}
```

共享模式常见方法：

```java
protected int tryAcquireShared(int arg) {
    throw new UnsupportedOperationException();
}

protected boolean tryReleaseShared(int arg) {
    throw new UnsupportedOperationException();
}
```

AQS 负责排队、阻塞和唤醒，子类负责判断“能不能获取资源”和“如何释放资源”。

## 获取和释放流程

### 1. 独占模式获取资源

以 `ReentrantLock` 为例，线程加锁时会尝试通过 CAS 把 `state` 从 0 改为 1。

```text
线程调用 lock()
  -> tryAcquire 尝试获取锁
  -> 成功：设置 owner，继续执行
  -> 失败：加入 AQS 队列
  -> 前驱是 head 时再次尝试获取
  -> 仍失败：park 阻塞
```

释放锁时会减少 state。如果 state 变成 0，说明锁完全释放，AQS 会唤醒队列中的后继节点。

### 2. 共享模式获取资源

以 `Semaphore` 为例，线程获取许可证时会尝试减少 state。只要许可证数量足够，多个线程可以同时获取成功。

`CountDownLatch` 也是共享模式。等待线程调用 `await()` 时，如果 state 不为 0，就进入等待队列；其他线程调用 `countDown()` 让 state 减 1；当 state 变成 0 时，所有等待线程都可以继续执行。

## 深挖追问

### 1. AQS 为什么既有独占模式又有共享模式？

因为不同同步器的资源占用语义不同。

独占模式表示同一时刻只能有一个线程持有资源，例如 `ReentrantLock` 的写锁。共享模式表示多个线程可以同时获取资源，例如 `Semaphore` 的多个许可证，或 `CountDownLatch` 达到条件后多个线程同时通过。

### 2. ReentrantLock 如何实现可重入？

`ReentrantLock` 使用 state 记录重入次数。如果当前锁没有被持有，线程通过 CAS 把 state 从 0 改为 1，并设置 owner。若当前线程已经是 owner，再次加锁时只需要把 state 加 1。

释放时 state 减 1，只有减到 0 时才真正释放锁并唤醒后继线程。

### 3. AQS 如何避免线程一直自旋浪费 CPU？

AQS 不会让失败线程长期空转。线程进入等待队列后，如果短暂尝试仍无法获取资源，会通过 `LockSupport.park()` 挂起。释放资源的线程再通过 `LockSupport.unpark()` 唤醒后继节点。

这样既保留了队列化竞争的公平性基础，也避免了大量线程忙等消耗 CPU。

### 4. 公平锁和非公平锁在 AQS 中有什么区别？

公平锁获取锁前会检查等待队列中是否已有前驱节点，如果有，就排队等待。非公平锁则允许线程先尝试抢锁，即使队列中已有等待线程，也可能插队成功。

`ReentrantLock` 默认是非公平锁，因为吞吐量通常更高；如果业务要求严格先来先服务，可以使用公平锁。

## 实战场景

### 场景 1：ReentrantLock

```java
Lock lock = new ReentrantLock();

lock.lock();
try {
    // 临界区
} finally {
    lock.unlock();
}
```

底层通过 AQS 独占模式维护 state 和等待队列。

### 场景 2：CountDownLatch

```java
CountDownLatch latch = new CountDownLatch(3);

for (int i = 0; i < 3; i++) {
    new Thread(() -> {
        try {
            // 执行任务
        } finally {
            latch.countDown();
        }
    }).start();
}

latch.await();
System.out.println("all done");
```

这里 state 初始值为 3，每次 `countDown()` 减 1，减到 0 时唤醒所有等待线程。

### 场景 3：Semaphore 限流

```java
Semaphore semaphore = new Semaphore(10);

semaphore.acquire();
try {
    // 最多 10 个线程同时执行
} finally {
    semaphore.release();
}
```

Semaphore 通过 AQS 共享模式控制许可证数量，适合做并发访问控制。

## 易错点

- AQS 不是具体锁，而是构建锁和同步器的框架。
- state 的含义由具体同步器定义，不一定只表示“锁是否被占用”。
- AQS 队列是 CLH 思想的变体，不是简单的普通链表。
- 获取失败的线程不会一直忙等，而是会 park 阻塞。
- 非公平锁不等于完全无序，它只是允许新线程先尝试抢锁。

## 总结

AQS 是 JUC 的核心基础设施，它用 state 表示同步状态，用 FIFO 队列管理等待线程，用 CAS 保证状态修改的原子性，用 park/unpark 完成阻塞唤醒。面试回答时要抓住“state + 队列 + CAS + 模板方法 + 独占/共享模式”这条主线，再结合 ReentrantLock、Semaphore、CountDownLatch 举例说明。
