# JUC锁之LockSupport详解

## 核心概念

`LockSupport` 是 JUC 中非常底层的线程阻塞与唤醒工具类，核心方法是 `park()` 和 `unpark(Thread)`。它不像 `synchronized`、`wait/notify` 那样直接提供锁语义，而是提供一种更基础的“线程许可证”机制：线程调用 `park()` 时如果没有许可证就阻塞；其他线程调用 `unpark(thread)` 会给目标线程发放一个许可证，让它可以继续执行。

可以把 `LockSupport` 理解成很多高级并发工具的地基：`AQS`、`ReentrantLock`、`Semaphore`、`CountDownLatch`、线程池中的部分等待唤醒逻辑，都离不开类似的阻塞/唤醒能力。

面试里需要记住一句话：**LockSupport 解决的是线程级别的阻塞与唤醒问题，比 wait/notify 更灵活，因为 unpark 可以先于 park 调用，而且不要求持有对象监视器。**

## 面试官想考什么

面试官问 `LockSupport`，通常想考这些点：

- 你是否知道 `LockSupport` 是 AQS 的底层支撑；
- 你是否理解 `park/unpark` 的“许可证”模型；
- 你是否能说清楚它和 `wait/notify` 的区别；
- 你是否知道 `park()` 可能会被中断、超时或伪唤醒影响；
- 你是否理解为什么阻塞后通常要放在循环中重新判断条件。

## 标准回答

`LockSupport` 提供了一组静态方法用于阻塞和唤醒线程：

- `park()`：阻塞当前线程；
- `park(Object blocker)`：阻塞当前线程，并记录阻塞原因，便于排查；
- `parkNanos(long nanos)`：阻塞指定纳秒时间；
- `parkUntil(long deadline)`：阻塞到指定时间点；
- `unpark(Thread thread)`：唤醒指定线程，或者提前给它一个许可证。

它的核心机制是“每个线程最多持有一个许可证”：

1. 如果线程调用 `park()` 时已经有许可证，会立即消费许可证并返回；
2. 如果没有许可证，线程会阻塞；
3. 其他线程调用 `unpark(thread)` 会给目标线程发放许可证；
4. 多次 `unpark()` 不会累积多个许可证，许可证最多只有一个。

因此，`unpark()` 可以发生在 `park()` 之前，这一点比 `wait/notify` 更不容易丢信号。

## 工作原理

### 许可证模型

`LockSupport` 的许可证不是计数器，而是一个二值状态：有或没有。

```text
初始状态：无许可证
unpark(thread)：变为有许可证
park()：如果有许可证则消费并立即返回；如果无许可证则阻塞
```

连续调用两次 `unpark(thread)`，也只会保留一个许可证；随后第一次 `park()` 会立即返回，第二次 `park()` 仍然会阻塞。

### blocker 的作用

推荐使用 `park(Object blocker)` 而不是裸 `park()`，因为 blocker 会记录线程为什么被阻塞。排查线程 dump 时，可以通过 `LockSupport.getBlocker(thread)` 或 jstack 信息看到阻塞对象。

例如 AQS 中常见做法是把同步器对象作为 blocker，方便定位线程卡在哪个锁或哪个同步组件上。

### 中断与返回条件

`park()` 返回不一定代表拿到了你想要的条件，它可能因为以下原因返回：

- 被其他线程 `unpark()`；
- 当前线程被中断；
- 发生伪唤醒；
- 使用了带超时的 `parkNanos/parkUntil` 并到期。

所以正确写法通常是：**while 循环检查条件，不满足再 park**。

## 代码示例

### 基础使用

```java
import java.util.concurrent.locks.LockSupport;

public class LockSupportDemo {
    public static void main(String[] args) throws InterruptedException {
        Thread worker = new Thread(() -> {
            System.out.println("worker 准备 park");
            LockSupport.park("waiting for main thread");
            System.out.println("worker 被唤醒");
        }, "worker-thread");

        worker.start();

        Thread.sleep(1000);
        System.out.println("main 调用 unpark");
        LockSupport.unpark(worker);
    }
}
```

### unpark 先于 park

```java
Thread worker = new Thread(() -> {
    // 因为 main 已经提前 unpark，第一次 park 会直接返回
    LockSupport.park();
    System.out.println("park 立即返回");
});

LockSupport.unpark(worker);
worker.start();
```

这说明 `LockSupport` 不像 `notify` 那样容易因为“先通知、后等待”而丢失信号。

### 正确的条件等待写法

```java
class OneShotLatch {
    private volatile boolean open = false;
    private Thread waiter;

    public void await() {
        waiter = Thread.currentThread();
        while (!open) {
            LockSupport.park(this);
        }
    }

    public void signal() {
        open = true;
        LockSupport.unpark(waiter);
    }
}
```

重点是 `while (!open)`，不能因为 `park()` 返回就直接认为条件已经满足。

## 实战场景

### 场景一：AQS 线程阻塞唤醒

`ReentrantLock`、`Semaphore`、`CountDownLatch` 等组件底层都依赖 AQS。AQS 在线程获取锁失败时，会把线程封装成节点加入同步队列，然后通过 `LockSupport.park()` 挂起线程；当前驱节点释放锁或状态变化时，再通过 `LockSupport.unpark()` 唤醒后继节点。

### 场景二：自定义轻量级同步工具

如果需要实现一个非常简单的一次性门闩、限流等待器、异步结果等待器，可以用 `LockSupport` 实现线程挂起和唤醒。但生产中不建议轻易手写复杂锁，优先使用 JDK 成熟组件。

### 场景三：定位线程阻塞问题

当使用 `park(Object blocker)` 时，线程 dump 中能看到阻塞对象，有助于判断线程是在等待哪个锁、哪个队列或哪个同步器。相比直接 `park()`，可观测性更好。

## 深挖追问

### 1. LockSupport 和 wait/notify 有什么区别？

- `wait/notify` 必须在 `synchronized` 代码块中使用，`LockSupport` 不要求持有监视器；
- `notify` 先于 `wait` 会丢信号，`unpark` 先于 `park` 不会丢，因为许可证会保留；
- `wait` 会释放对象监视器，`park` 不会自动释放任何锁；
- `notify` 随机唤醒等待该对象监视器的线程，`unpark` 可以精确唤醒指定线程；
- `wait` 抛出 `InterruptedException`，`park` 不抛异常，但会因为中断返回，并保留中断标记。

### 2. LockSupport 和 Thread.sleep 有什么区别？

- `sleep` 主要用于让当前线程休眠固定时间；
- `park` 可以被 `unpark` 精确唤醒，也可以设置 blocker；
- `sleep` 不会消耗许可证，`park` 与许可证模型相关；
- 二者都不会自动释放已经持有的锁。

### 3. park 被中断会怎样？

线程在 `park()` 阻塞时，如果被中断，`park()` 会返回，但不会抛出 `InterruptedException`，线程的中断标记仍然存在。后续再次调用 `park()` 时，如果中断标记未清除，也可能立即返回。

如果业务需要响应中断，应该显式判断：

```java
if (Thread.currentThread().isInterrupted()) {
    // 清理资源或退出
}
```

### 4. 为什么 park 返回后要重新判断条件？

因为 `park()` 返回可能是被唤醒、中断、超时或伪唤醒导致的，并不等价于业务条件成立。同步工具通常都使用循环判断，防止线程错误地继续执行。

## 易错点总结

1. **unpark 可以先于 park 调用，不会丢信号。**
2. **许可证最多只有一个，多次 unpark 不会累积多个许可。**
3. **park 不会释放锁，持锁 park 很容易造成死锁或长时间阻塞。**
4. **park 返回不代表条件满足，必须配合循环判断条件。**
5. **park 被中断不会抛异常，而是直接返回并保留中断标记。**
6. **推荐使用 park(Object blocker)，方便线程 dump 排查问题。**
7. **业务开发通常不直接使用 LockSupport 实现复杂锁，优先使用 AQS 系列成熟组件。**

## 总结

`LockSupport` 是 JUC 中非常底层但非常重要的工具。它通过许可证模型提供线程阻塞与唤醒能力，支撑了 AQS 以及大量高级并发组件。面试时要重点讲清楚 `park/unpark` 的许可证机制、和 `wait/notify` 的区别、以及为什么 park 返回后必须重新检查条件。

## 参考资料

- JDK `LockSupport` 源码
- JDK `AbstractQueuedSynchronizer` 源码
- Java Concurrency in Practice
