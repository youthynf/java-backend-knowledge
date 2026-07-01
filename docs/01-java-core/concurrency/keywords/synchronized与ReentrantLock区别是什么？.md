# synchronized 与 ReentrantLock 区别是什么

## 核心概念

`synchronized` 和 `ReentrantLock` 都是 Java 的可重入互斥锁，目的相同——保护临界区。区别在实现层级和功能丰富度：`synchronized` 是 JVM 内置关键字，靠 `monitorenter`/`monitorexit` 字节码和 Monitor 实现，语法简单但功能有限；`ReentrantLock` 是 JDK 类（`java.util.concurrent.locks.ReentrantLock`），基于 AQS（AbstractQueuedSynchronizer）实现，提供可中断、超时、公平、多条件队列等高级特性。

一句话区分：**简单同步选 synchronized，需要高级功能选 ReentrantLock**。JDK 6 之后 synchronized 经过锁升级优化，性能和 ReentrantLock 接近，选型不再以性能为决定因素，而是看功能需求。

## 标准回答

| 维度 | synchronized | ReentrantLock |
|------|--------------|---------------|
| 实现层级 | JVM 关键字，monitorenter/monitorexit | JDK 类，基于 AQS |
| 加锁/解锁 | 自动（代码块结束或异常时） | 手动 `lock()` / `unlock()`，必须 finally |
| 可中断 | 不支持 | `lockInterruptibly()` 支持 |
| 超时获取 | 不支持 | `tryLock(timeout, unit)` 支持 |
| 公平锁 | 仅非公平 | 支持公平/非公平（构造参数） |
| 条件变量 | 单一（`wait/notify`） | 多个 `Condition` |
| 锁状态查询 | 不支持 | `isLocked()` / `getHoldCount()` / `hasQueuedThreads()` |
| 锁释放保证 | 异常时自动释放 | 必须手动 unlock，遗漏会死锁 |
| 性能（JDK 6+） | 与 ReentrantLock 接近 | 高竞争下略优 |
| 适用场景 | 简单同步 | 需要可中断/超时/公平/多条件 |

二者都保证互斥性、可见性、可重入性。synchronized 通过 unlock happens-before 后续 lock 保证可见性；ReentrantLock 通过 AQS 的 state 和 volatile 队列保证。

## 实现原理

### synchronized 的实现

synchronized 基于 JVM Monitor，每个对象关联一个 ObjectMonitor。字节码层面：

- 修饰代码块：插入 `monitorenter` / `monitorexit`。
- 修饰方法：方法表 `ACC_SYNCHRONIZED` 标志。

JDK 6 后引入锁升级（无锁→偏向锁→轻量级锁→重量级锁），性能大幅提升。详细机制见 [synchronized基本原理是什么？](/01-java-core/concurrency/keywords/synchronized基本原理是什么？.md)。

### ReentrantLock 的实现

ReentrantLock 基于 AQS（`AbstractQueuedSynchronizer`）实现：

- **state 字段（volatile int）**：记录锁状态。0 是未持有，>0 是持有次数（重入计数）。
- **exclusiveOwnerThread**：记录持锁线程。
- **CLH 队列**：双向链表，等待锁的线程在此排队。
- **Node**：封装等待线程和等待状态。

加锁简化流程（非公平）：

```java
// ReentrantLock.NonfairSync
final boolean nonfairTryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();
    if (c == 0) {
        if (compareAndSetState(0, acquires)) {     // CAS 抢锁
            setExclusiveOwnerThread(current);
            return true;
        }
    } else if (current == getExclusiveOwnerThread()) {  // 重入
        setState(c + acquires);
        return true;
    }
    return false;
}
```

抢锁失败的线程封装成 Node 入 CLH 队列，调用 `LockSupport.park()` 阻塞。前驱节点释放锁时 `unpark` 后继节点。

详细 AQS 实现见 [AQS是什么？](/01-java-core/concurrency/JUC/AQS是什么？.md)。

### 核心差异的实现原理

#### 可中断性

- synchronized：`monitorenter` 等待锁时不响应 interrupt，只能等拿到锁。
- ReentrantLock 的 `lockInterruptibly()`：AQS 的 `doAcquireInterruptibly()` 在 park 醒来后检查中断状态，被中断时抛 `InterruptedException` 并取消节点。

#### 超时获取

- synchronized：无超时 API。
- ReentrantLock 的 `tryLock(timeout, unit)`：AQS 的 `doAcquireNanos()` 用 `LockSupport.parkNanos()` 限时阻塞，超时取消节点。

#### 公平锁

- synchronized：永远非公平。
- ReentrantLock 公平锁：`tryAcquire()` 先调 `hasQueuedPredecessors()` 检查队列有没有先来的线程，有就排队，不抢。
- ReentrantLock 非公平锁：直接 CAS 抢，不管队列。

#### 多条件队列

- synchronized：只有一个 wait set，`wait/notify` 无法精准唤醒某类线程。
- ReentrantLock：每个 `Condition` 有自己的等待队列。`await()` 入队、`signal()` 把队首节点转移到 CLH 队列。一把锁可以 newCondition() 出多个 Condition，实现"等待不同条件"的精准唤醒。

`ArrayBlockingQueue` 就用 `notEmpty` 和 `notFull` 两个 condition：

```java
private final Condition notFull = lock.newCondition();
private final Condition notEmpty = lock.newCondition();

public void put(E e) throws InterruptedException {
    lock.lockInterruptibly();
    try {
        while (count == items.length) notFull.await();
        enqueue(e);
        notEmpty.signal();          // 精准唤醒等待 notEmpty 的线程
    } finally { lock.unlock(); }
}
```

#### 锁释放保证

- synchronized：JVM 在异常时自动 `monitorexit`，不会锁泄漏。
- ReentrantLock：必须 `finally { lock.unlock(); }`，遗漏或异常没走到 finally 会死锁。

## 代码示例

### synchronized 用法

```java
public class SyncDemo {
    private int count;

    public synchronized void inc() {          // 锁 this
        count++;
    }

    public void batchInc() {
        synchronized (this) {                  // 显式指定锁对象
            for (int i = 0; i < 100; i++) count++;
        }
    }                                          // 自动释放锁
}
```

### ReentrantLock 基本用法

```java
import java.util.concurrent.locks.ReentrantLock;

public class LockDemo {
    private final ReentrantLock lock = new ReentrantLock();
    private int count;

    public void inc() {
        lock.lock();
        try {
            count++;                           // 临界区
        } finally {
            lock.unlock();                     // 必须 finally 释放
        }
    }
}
```

### 可中断锁

```java
public void interruptibleLock() throws InterruptedException {
    lock.lockInterruptibly();                  // 等待时被中断会抛 InterruptedException
    try {
        // 临界区
    } finally {
        lock.unlock();
    }
}
```

### 超时获取

```java
import java.util.concurrent.TimeUnit;

public boolean tryWithTimeout() throws InterruptedException {
    if (lock.tryLock(3, TimeUnit.SECONDS)) {   // 最多等 3 秒
        try {
            // 临界区
            return true;
        } finally {
            lock.unlock();
        }
    } else {
        return false;                           // 超时未拿到，执行降级
    }
}
```

### 多 Condition 实现生产者-消费者

```java
import java.util.concurrent.locks.*;

public class BoundedBuffer<T> {
    private final Object[] items;
    private int putIdx, takeIdx, count;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();
    private final Condition notEmpty = lock.newCondition();

    public BoundedBuffer(int cap) { items = new Object[cap]; }

    @SuppressWarnings("unchecked")
    public T take() throws InterruptedException {
        lock.lockInterruptibly();
        try {
            while (count == 0) notEmpty.await();
            T x = (T) items[takeIdx];
            items[takeIdx] = null;
            if (++takeIdx == items.length) takeIdx = 0;
            count--;
            notFull.signal();
            return x;
        } finally { lock.unlock(); }
    }

    public void put(T x) throws InterruptedException {
        lock.lockInterruptibly();
        try {
            while (count == items.length) notFull.await();
            items[putIdx] = x;
            if (++putIdx == items.length) putIdx = 0;
            count++;
            notEmpty.signal();
        } finally { lock.unlock(); }
    }
}
```

### 公平锁

```java
ReentrantLock fairLock = new ReentrantLock(true);   // 公平锁
ReentrantLock unfairLock = new ReentrantLock(false); // 非公平锁（默认）
```

## 实战场景

| 场景 | 推荐 | 理由 |
|------|------|------|
| 简单同步块 | synchronized | 语法简洁、自动释放、JIT 优化好 |
| 需要可中断（如优雅停机） | ReentrantLock `lockInterruptibly` | synchronized 不响应中断 |
| 需要超时（避免死等） | ReentrantLock `tryLock(timeout)` | synchronized 不支持 |
| 生产者-消费者 | ReentrantLock + 多 Condition | synchronized 的 wait/notify 无法精准唤醒 |
| 顺序调度（避免饥饿） | ReentrantLock 公平锁 | synchronized 只能非公平 |
| 死锁检测 | ReentrantLock `tryLock` 探测 | 拿不到锁就回退，避免死锁 |
| 高竞争简单临界区 | synchronized | JDK 6+ 性能足够，避免忘记 unlock |

## 深挖追问

### JDK 6 之后 synchronized 性能真的追上 ReentrantLock 了吗？

基本追上。JDK 6 引入偏向锁、轻量级锁、自适应自旋、锁消除、锁粗化等优化后，synchronized 在低中竞争场景下和 ReentrantLock 差距很小。极端高竞争下 ReentrantLock 略优（CLH 队列调度更精细），但实际项目中差异往往被业务 IO 开销淹没。所以选型应看功能需求，而非性能微差。

### 为什么 synchronized 不能精准唤醒？

synchronized 只有一个 wait set，`notify()` 从 set 中随机挑一个线程唤醒，无法区分"等待不同条件的线程"。比如生产者-消费者，生产者要唤醒消费者，但 `notify()` 可能唤醒的是另一个生产者，造成效率问题或死等。ReentrantLock 的多 Condition 让每类等待线程独立成队，`signal()` 只唤醒本队，精准。

### ReentrantLock 忘了 unlock 会怎样？

锁永久持有，其他线程 `lock()` 全部阻塞，业务瘫痪。如果异常没走到 finally（比如 finally 之前就 `return` 了），同样泄漏。所以使用 ReentrantLock 必须严格 `try-finally` 模板。

### ReentrantLock 是公平锁一定不会饥饿吗？

不一定。"公平"只保证"按申请顺序获取锁"，但如果某个线程一直不释放锁（死循环或长时间持锁），其他线程仍然饥饿。公平锁解决的是"插队"问题，不解决"持锁过长"问题。

### 为什么 synchronized 不能查询锁状态？

synchronized 的设计哲学是"简单"——程序员不关心锁状态，JVM 自动管理。ReentrantLock 暴露 `isLocked()` / `getHoldCount()` / `hasQueuedThreads()` 等方法，是为了支持更复杂的业务（如死锁检测、监控、限流）。两者设计取舍不同。

### ReentrantLock 和 ReentrantReadWriteLock 什么关系？

`ReentrantLock` 是独占锁（一个线程持有）；`ReentrantReadWriteLock` 是读写锁（读读共享、读写/写写互斥），内部用两个内部类 `ReadLock` 和 `WriteLock`，都基于 AQS。读多写少场景 `ReentrantReadWriteLock` 比 `ReentrantLock` 吞吐高得多。

## 易错点

- ReentrantLock `unlock()` 不放 finally——异常时锁泄漏。
- 用 `lock.lock()` 拿锁后立即判断"是否拿到"——`lock()` 是阻塞式，拿不到就等，不会返回 false。要非阻塞用 `tryLock()`。
- 在持有 ReentrantLock 时调 `Object.wait()`——抛 `IllegalMonitorStateException`，要用 `Condition.await()`。
- 公平锁场景下用 `tryLock()` 插队——`tryLock()` 不遵守公平策略，会插队。要遵守公平用 `tryLock(0, TimeUnit.NANOSECONDS)`。
- synchronized 锁可变对象引用 `synchronized (obj)` 后 `obj = newObj`——锁对象变了，锁失效。

## 总结

synchronized 是 JVM 内置关键字，自动加解锁、语法简单，JDK 6+ 性能接近 ReentrantLock；ReentrantLock 是 JDK 类，基于 AQS，提供可中断、超时、公平、多条件队列、锁状态查询等高级特性。简单同步优先 synchronized，需要可中断/超时/公平/精准唤醒选 ReentrantLock。ReentrantLock 必须 `try-finally` 释放锁，synchronized 异常时自动释放。生产者-消费者、死锁探测、限流隔离等场景 ReentrantLock 的多 Condition 和 tryLock 是关键能力。

## 参考资料

- [ReentrantLock 官方文档](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html)
- [Java Concurrency in Practice 第 13 章](https://jcip.net/)
- [AQS 详解——Java Doomsday](https://github.com/farmerjohngit/myblog/issues/12)

---
