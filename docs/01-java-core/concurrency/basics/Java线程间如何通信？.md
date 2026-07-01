# Java 线程间如何通信

## 核心概念

线程通信的本质是"一个线程改了状态，另一个线程能感知到"。Java 的线程之间没有"直接发消息"的语法，所有通信方式都建立在两个底层机制之上：**共享内存**和**等待-唤醒**。共享内存要解决可见性问题（要 volatile 或 synchronized 保证）；等待-唤醒要解决"什么时候通知"问题（`wait/notify`、`Condition`、`park/unpark`、`BlockingQueue`）。

工程上通信方式可以分四类：基于 `Object.wait/notify` 的低层 API、基于 `Condition` 的灵活版、基于 `BlockingQueue` 的生产者-消费者、基于同步工具类（`CountDownLatch` / `CyclicBarrier` / `Semaphore`）的协调。理解每种方式适合什么场景，是写出正确并发代码的前提。

## 标准回答

Java 线程通信的常用方式按抽象层级从低到高：

1. **`volatile` 共享变量**：最轻量，保证可见性，适合"一写多读"的状态标记（如 `running = false`）。
2. **`wait/notify` + synchronized**：经典等待-唤醒，必须在 synchronized 块内调用，依赖对象 monitor。
3. **`Condition` + `ReentrantLock`**：`wait/notify` 的升级版，支持多个条件队列、可中断、可超时。
4. **`BlockingQueue`**：生产者-消费者最常用，无需手写同步。
5. **同步工具类**：`CountDownLatch` 等多线程就位、`CyclicBarrier` 多线程同步起跑、`Semaphore` 限流。
6. **管道流**：`PipedInputStream` / `PipedOutputStream`，字节流通信，少用。

## 实现原理

### wait/notify 的对象 monitor 模型

每个 Java 对象在 JVM 内部关联一个 monitor（监视器锁）。monitor 维护三个集合：

- **owner**：当前持有锁的线程。
- **entry list**：等锁的线程（`BLOCKED` 状态）。
- **wait set**：调用了 `wait()` 的线程（`WAITING` 状态）。

`wait()` 的语义：释放 monitor，当前线程进入 wait set；`notify()` 把 wait set 中一个线程移到 entry list；`notifyAll()` 把所有线程移过去。被移走的线程要重新竞争锁才能继续执行。

### Condition 的多条件队列

`Condition` 是 `ReentrantLock` 的伴生 API。一把锁可以 `newCondition()` 出多个 `Condition` 对象，每个对象有自己的等待队列。这样就能精准唤醒"等待某个条件"的线程，而不是 `notifyAll` 一锅端。

经典例子是 `ArrayBlockingQueue`：用 `notEmpty` 和 `notFull` 两个 condition，put 时唤醒 notEmpty、take 时唤醒 notFull。

### BlockingQueue 的内部实现

`ArrayBlockingQueue` 用一个 `ReentrantLock` + 两个 `Condition` 实现：

```java
public void put(E e) throws InterruptedException {
    final ReentrantLock lock = this.lock;
    lock.lockInterruptibly();
    try {
        while (count == items.length)
            notFull.await();        // 满了等
        enqueue(e);
        notEmpty.signal();          // 唤醒一个取的线程
    } finally {
        lock.unlock();
    }
}

public E take() throws InterruptedException {
    final ReentrantLock lock = this.lock;
    lock.lockInterruptibly();
    try {
        while (count == 0)
            notEmpty.await();       // 空了等
        E x = dequeue();
        notFull.signal();           // 唤醒一个放的线程
        return x;
    } finally {
        lock.unlock();
    }
}
```

### CountDownLatch vs CyclicBarrier

| 维度 | CountDownLatch | CyclicBarrier |
|------|----------------|----------------|
| 计数方向 | 减到 0 | 累加到 parties |
| 复用 | 不可重用 | 可 reset 重用 |
| 触发者 | 任意线程 countDown | 等待线程自己 await |
| 典型场景 | 主线程等多线程就位 | 多线程同步起跑 |

## 代码示例

### wait/notify 实现"等待条件"

```java
public class WaitNotifyDemo {
    private final Object lock = new Object();
    private boolean ready = false;

    public void waitForReady() throws InterruptedException {
        synchronized (lock) {
            while (!ready) {       // 必须 while，防虚假唤醒
                lock.wait();
            }
            System.out.println("go");
        }
    }

    public void markReady() {
        synchronized (lock) {
            ready = true;
            lock.notifyAll();
        }
    }
}
```

### Condition 多条件队列（生产者-消费者）

```java
import java.util.concurrent.locks.*;

public class BoundedBuffer<T> {
    private final Object[] items;
    private int putIdx, takeIdx, count;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();
    private final Condition notEmpty = lock.newCondition();

    public BoundedBuffer(int capacity) { this.items = new Object[capacity]; }

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

### BlockingQueue 实现生产者-消费者

```java
import java.util.concurrent.*;

public class ProducerConsumer {
    private static final BlockingQueue<String> queue = new ArrayBlockingQueue<>(10);

    public static void main(String[] args) {
        new Thread(() -> {
            try {
                for (int i = 0; i < 100; i++) queue.put("msg-" + i); // 满了阻塞
            } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }, "producer").start();

        new Thread(() -> {
            try {
                while (true) System.out.println(queue.take()); // 空了阻塞
            } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }, "consumer").start();
    }
}
```

### CountDownLatch 协调多线程就位

```java
import java.util.concurrent.*;

public class LatchDemo {
    public static void main(String[] args) throws InterruptedException {
        int n = 3;
        CountDownLatch ready = new CountDownLatch(n);
        CountDownLatch start = new CountDownLatch(1);

        for (int i = 0; i < n; i++) {
            new Thread(() -> {
                System.out.println(Thread.currentThread().getName() + " ready");
                ready.countDown();
                try { start.await(); } catch (InterruptedException ignored) {}
                System.out.println(Thread.currentThread().getName() + " run");
            }, "t-" + i).start();
        }

        ready.await();       // 等所有 worker 准备好
        start.countDown();   // 统一发令
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 优雅停机 | `volatile boolean running` 配合轮询 | 用 `volatile` 保证可见性，不要靠普通变量 |
| 生产者-消费者 | `ArrayBlockingQueue` / `LinkedBlockingQueue` | 队列要有界，无界队列高并发易 OOM |
| 多线程同步起跑 | `CyclicBarrier` 或 `CountDownLatch` | 注意超时和重置 |
| 限流 | `Semaphore.tryAcquire(timeout)` | 释放要放 finally |
| 任务编排 | `CompletableFuture.thenApply` | 比手写 `Condition` 简洁很多 |
| 精准唤醒 | `Condition.signal()` 配合多个 condition | 别用 `notify()`，随机唤醒容易出问题 |

## 深挖追问

### notify 和 notifyAll 怎么选？

`notify()` 只唤醒一个，但 JVM 不保证唤醒哪一个，所以只有"所有等待线程逻辑等价"时才安全。生产实践几乎都用 `notifyAll()`——代价是会有惊群效应，但不会出错。要精准唤醒用 `Condition.signal()`。

### wait/notify 为什么必须在 synchronized 块内？

`wait()` 释放 monitor 的前提是当前线程持有 monitor。JVM 在 `wait()` 入口检查 owner，不是当前线程就抛 `IllegalMonitorStateException`。`notify()` 同理——它要操作 wait set，必须持有 monitor。

### Condition 和 wait/notify 的核心区别？

1. **多条件队列**：`Condition` 支持一把锁多个等待队列，可以精准唤醒；`wait/notify` 只有一个等待队列。
2. **不依赖 synchronized**：`Condition` 配合 `ReentrantLock`，支持可中断、超时、不响应中断三种 await。
3. **`Condition.await()` 是 `WAITING`，不会进入 `BLOCKED`**。

### BlockingQueue 的 put/take 和 offer/poll 有什么区别？

| 方法 | 队列满/空时行为 |
|------|------------------|
| `put` / `take` | 阻塞 |
| `offer` / `poll` | 立即返回 false/null |
| `offer(timeout)` / `poll(timeout)` | 阻塞指定时间 |
| `add` / `remove` | 抛 `IllegalStateException` / `NoSuchElementException` |

### LockSupport.park() 比 wait() 好在哪？

1. **不需要锁**：`park()` 直接阻塞当前线程，不依赖任何 monitor。
2. **精准唤醒**：`unpark(thread)` 唤醒指定线程，而 `notify()` 是随机唤醒。
3. **许可机制**：`unpark` 可以先于 `park` 调用，许可会被缓存，`park` 时直接放行不会阻塞。这避免了 `wait/notify` 容易出现的"先 notify 后 wait 导致永久阻塞"问题。

## 易错点

- `wait()` 用 `if` 不是 `while`——虚假唤醒或 `notifyAll` 后条件未满足，会误执行。
- `notify()` 唤醒"同类"等待线程——若多类线程在同一个 wait set 上等待，`notify` 可能唤醒错的，应改用 `Condition`。
- `BlockingQueue` 用无界队列——`LinkedBlockingQueue` 默认 `Integer.MAX_VALUE`，堆积任务 OOM。
- `CountDownLatch` 期望重用——它不能 reset，要重用得换 `CyclicBarrier`。
- 在 `Lock` 里调 `Object.wait()`——抛 `IllegalMonitorStateException`，`Condition` 才是 `ReentrantLock` 的伴生。

## 总结

Java 线程通信按抽象层级递进：`volatile` 共享变量最轻量适合状态标记，`wait/notify` 是底层等待-唤醒，`Condition` 提供多条件队列和更灵活的中断/超时，`BlockingQueue` 把生产者-消费者封装成开箱即用，`CountDownLatch` / `CyclicBarrier` / `Semaphore` 处理协调问题，`LockSupport.park/unpark` 是底层基石。`wait()` 必须 `while` 循环、`notifyAll` 比 `notify` 安全、有界队列比无界队列稳妥，这三条是实战底线。

## 参考资料

- [Condition 官方文档](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/locks/Condition.html)
- [BlockingQueue 官方文档](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/BlockingQueue.html)
- [Java Concurrency in Practice 第 14 章](https://jcip.net/)

---
