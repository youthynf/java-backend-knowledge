# JUC锁之ReentrantLock详解

## 核心概念

`ReentrantLock` 是 JUC 提供的可重入互斥锁，功能上和 `synchronized` 都可以用来保护临界区，但它比 `synchronized` 更灵活：支持公平锁、非公平锁、可中断获取锁、超时获取锁，以及多个条件队列 `Condition`。

“可重入”的意思是：同一个线程已经持有锁后，可以再次获取这把锁而不会被自己阻塞。锁内部会维护一个重入次数，线程每成功 `lock()` 一次，计数加一；每 `unlock()` 一次，计数减一；只有计数降到 0，锁才真正释放。

面试里可以这样概括：**ReentrantLock 是基于 AQS 实现的显式锁，适合需要更强控制能力的并发场景；简单同步优先用 synchronized，复杂同步再考虑 ReentrantLock。**

## 面试官想考什么

面试官问 `ReentrantLock`，通常想考：

- 你是否理解可重入锁的含义；
- 你是否知道 `ReentrantLock` 底层基于 AQS；
- 你是否能说清公平锁和非公平锁的区别；
- 你是否知道 `lock()`、`tryLock()`、`lockInterruptibly()` 的使用场景；
- 你是否能正确使用 `try/finally` 释放锁；
- 你是否能比较 `ReentrantLock` 和 `synchronized`。

## 标准回答

`ReentrantLock` 是一个显式互斥锁，使用方式如下：

```java
ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    // 临界区代码
} finally {
    lock.unlock();
}
```

它的底层实现依赖 AQS：

- AQS 的 `state` 表示锁重入次数；
- 当 `state == 0` 时，说明锁未被占用；
- 线程获取锁成功后，AQS 会把当前线程设置为独占线程，并将 `state` 加一；
- 同一线程重复获取锁时，只增加 `state`；
- 释放锁时 `state` 减一，减到 0 才真正释放锁并唤醒队列中的后继线程。

`ReentrantLock` 默认是非公平锁，也可以通过构造方法创建公平锁：

```java
ReentrantLock fairLock = new ReentrantLock(true);
ReentrantLock nonFairLock = new ReentrantLock(false);
```

生产中多数情况下使用默认非公平锁，因为吞吐量更好；只有在特别强调等待顺序、防止饥饿时才考虑公平锁。

## 核心特性

### 1. 可重入

同一个线程可以多次获取同一把锁：

```java
lock.lock();
try {
    lock.lock();
    try {
        // 同一线程重复进入
    } finally {
        lock.unlock();
    }
} finally {
    lock.unlock();
}
```

注意：获取了几次锁，就必须释放几次锁，否则锁不会真正释放。

### 2. 公平锁与非公平锁

公平锁会尽量按照线程等待顺序获取锁，非公平锁允许新来的线程直接尝试抢锁。

- **公平锁**：等待时间更可控，不容易饥饿，但吞吐量较低；
- **非公平锁**：可能插队，吞吐量较高，是默认策略。

非公平锁吞吐更高的原因是减少线程挂起和唤醒带来的上下文切换。如果刚好锁空闲，新线程可以直接获取，不必唤醒队列中的老线程。

### 3. 可中断获取锁

`lockInterruptibly()` 允许线程在等待锁时响应中断：

```java
try {
    lock.lockInterruptibly();
    try {
        // 临界区
    } finally {
        lock.unlock();
    }
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();
}
```

这在需要避免死等、支持任务取消的场景非常有用。

### 4. 超时获取锁

`tryLock()` 可以避免线程无限等待：

```java
if (lock.tryLock(100, TimeUnit.MILLISECONDS)) {
    try {
        // 获取锁成功
    } finally {
        lock.unlock();
    }
} else {
    // 获取锁失败，执行降级逻辑
}
```

适合接口请求、缓存刷新、资源抢占等不能无限阻塞的场景。

### 5. 多条件队列 Condition

`Condition` 类似于 `wait/notify`，但一把 `ReentrantLock` 可以创建多个条件队列：

```java
Condition notEmpty = lock.newCondition();
Condition notFull = lock.newCondition();
```

这比对象监视器只有一个等待队列更灵活。阻塞队列等组件内部就会使用不同条件队列区分“队列非空”和“队列未满”。

## 代码示例

### 基础计数器

```java
import java.util.concurrent.locks.ReentrantLock;

public class Counter {
    private final ReentrantLock lock = new ReentrantLock();
    private int count = 0;

    public void increment() {
        lock.lock();
        try {
            count++;
        } finally {
            lock.unlock();
        }
    }

    public int get() {
        lock.lock();
        try {
            return count;
        } finally {
            lock.unlock();
        }
    }
}
```

### 使用 Condition 实现简单阻塞队列

```java
import java.util.ArrayDeque;
import java.util.Queue;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class SimpleBlockingQueue<T> {
    private final Queue<T> queue = new ArrayDeque<>();
    private final int capacity;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();
    private final Condition notEmpty = lock.newCondition();

    public SimpleBlockingQueue(int capacity) {
        this.capacity = capacity;
    }

    public void put(T value) throws InterruptedException {
        lock.lock();
        try {
            while (queue.size() == capacity) {
                notFull.await();
            }
            queue.offer(value);
            notEmpty.signal();
        } finally {
            lock.unlock();
        }
    }

    public T take() throws InterruptedException {
        lock.lock();
        try {
            while (queue.isEmpty()) {
                notEmpty.await();
            }
            T value = queue.poll();
            notFull.signal();
            return value;
        } finally {
            lock.unlock();
        }
    }
}
```

关键点是：`await()` 必须放在 while 循环中判断条件，防止虚假唤醒。

## 实战场景

### 场景一：避免长时间等待锁

接口请求中如果某段逻辑需要抢占共享资源，但不能无限阻塞，可以使用 `tryLock(timeout)`。获取不到锁时返回降级结果，避免请求线程被拖死。

### 场景二：支持任务取消

后台任务等待锁时，如果系统要关闭或任务被取消，`lockInterruptibly()` 可以让线程响应中断，避免一直卡在锁等待上。

### 场景三：多个等待条件

实现阻塞队列、连接池、资源池时，通常既有“资源为空”的等待，又有“资源已满”的等待。`Condition` 能把不同等待条件拆开，避免无效唤醒。

## 深挖追问

### 1. ReentrantLock 和 synchronized 有什么区别？

- `synchronized` 是 JVM 内置锁，自动加锁释放；`ReentrantLock` 是 JUC 显式锁，需要手动释放；
- `ReentrantLock` 支持公平锁，`synchronized` 不支持显式公平策略；
- `ReentrantLock` 支持 `tryLock()` 和 `lockInterruptibly()`，`synchronized` 不支持；
- `ReentrantLock` 支持多个 `Condition`，`synchronized` 每个对象只有一个 wait set；
- 简单场景优先用 `synchronized`，复杂控制场景使用 `ReentrantLock`。

### 2. 为什么 ReentrantLock 必须在 finally 中释放？

因为 `ReentrantLock` 不会像 `synchronized` 那样在退出代码块时自动释放。如果临界区代码抛异常且没有执行 `unlock()`，锁会一直被占用，其他线程会永久等待，形成线上死锁事故。

### 3. 公平锁一定更好吗？

不一定。公平锁减少插队，更符合先来先服务，但吞吐量通常更低；非公平锁可能让新线程直接获取刚释放的锁，减少上下文切换，所以性能更好。只有在业务强烈要求顺序或确实出现饥饿问题时，才考虑公平锁。

### 4. Condition 的 await 和 Object.wait 有什么共同点？

它们都会释放当前持有的锁，并让线程进入等待状态；被唤醒后，需要重新竞争锁，拿到锁后才继续执行。二者都应该配合 while 循环检查条件，防止虚假唤醒或条件被其他线程改变。

### 5. ReentrantLock 的底层如何唤醒等待线程？

等待线程获取锁失败后，会进入 AQS 同步队列并被 `LockSupport.park()` 挂起。持锁线程释放锁后，如果 `state` 变为 0，会通过 AQS 唤醒后继节点，后继线程再尝试 CAS 获取锁。

## 易错点总结

1. **lock 后必须 finally unlock，不能只在正常流程释放。**
2. **可重入不等于可以少释放锁，获取几次就要释放几次。**
3. **默认是非公平锁，不是公平锁。**
4. **公平锁不一定性能更好，通常吞吐更低。**
5. **Condition.await() 要放在 while 中检查条件，不能用 if。**
6. **await 会释放锁，但 LockSupport.park 不会自动释放锁。**
7. **简单同步场景没必要强行使用 ReentrantLock。**

## 总结

`ReentrantLock` 是 JUC 中非常重要的显式锁，底层基于 AQS 实现。它比 `synchronized` 提供更丰富的控制能力，适合公平性、超时、中断、多个条件队列等复杂并发场景。面试时重点讲清楚可重入、AQS state、公平/非公平、try/finally 释放锁，以及和 `synchronized` 的取舍。

## 参考资料

- JDK `ReentrantLock` 源码
- JDK `AbstractQueuedSynchronizer` 源码
- Java Concurrency in Practice
