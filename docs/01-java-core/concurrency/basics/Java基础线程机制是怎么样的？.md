# Java 基础线程机制是怎么样的

## 核心概念

Java 线程机制围绕三个问题展开：怎么造线程、怎么调度线程、怎么让线程协作。线程的创建方式在另一篇专门讲，本篇聚焦"基础机制"——线程生命周期管理中常用 API：`sleep()` / `yield()` / `join()` / `interrupt()` / `setDaemon()`，以及线程池 `Executor` 框架的最小使用。

理解这一篇的关键是区分"调度建议"和"强制控制"：`yield()` 是建议调度器让出 CPU，调度器可以不理；`sleep()` 是当前线程休眠指定时间，但不释放锁；`join()` 是当前线程等目标线程结束。`interrupt()` 只是设置中断标志，是否响应由目标线程决定。

## 标准回答

Java 基础线程机制由 Thread 类提供的 API 和 Executor 框架两部分组成。Thread 类的常用控制方法：`sleep()` 让当前线程休眠不释放锁；`yield()` 建议让出 CPU；`join()` 等待目标线程结束；`interrupt()` 设置中断标志；`setDaemon(true)` 设置为守护线程。

1. **sleep()**：当前线程阻塞指定毫秒，不释放任何锁，会响应中断抛 `InterruptedException`。
2. **yield()**：提示调度器让出 CPU，仅是建议，调度器可以忽略；不会释放锁。
3. **join()**：当前线程等待目标线程执行结束，本质是在目标线程上 `wait()`。
4. **interrupt()**：协作式中断，只设置标志位；如果目标线程在 `sleep/wait/join` 中，会抛 `InterruptedException` 并清除标志。
5. **Daemon**：守护线程在所有非守护线程结束后被 JVM 强制终止，`setDaemon()` 必须在 `start()` 前调用。
6. **Executor**：用线程池管理线程生命周期，生产环境替代 `new Thread`。

## 实现原理

### sleep() vs wait() 的本质区别

| 维度 | Thread.sleep() | Object.wait() |
|------|----------------|---------------|
| 所属类 | Thread | Object |
| 是否释放锁 | 不释放 | 释放 monitor 锁 |
| 使用前提 | 任意位置 | 必须持有该对象 monitor（synchronized 块内） |
| 唤醒方式 | 超时 / 中断 | notify / notifyAll / 超时 / 中断 |
| 用途 | 简单延时 | 线程间协作 |

`sleep()` 是 Thread 类的静态方法，让当前线程进入 `TIMED_WAITING`；`wait()` 是 Object 方法，让当前线程进入 `WAITING` 并释放锁。

### yield() 的真实行为

`Thread.yield()` 在 HotSpot 上对应 `os::naked_yield()`，Linux 上调用 `sched_yield()` 系统调用，把当前线程从 running 切回 ready 队列。调度器可以选择立刻再调度它，也可以调度其他线程。`yield()` 不释放锁，因此用 `yield()` 做同步协作会死锁。

### join() 的实现

`join()` 内部是个带超时的 `wait()` 循环：

```java
// java.lang.Thread 简化版
public final synchronized void join(long millis) throws InterruptedException {
    long base = System.currentTimeMillis();
    long now = 0;
    while (isAlive()) {
        long delay = millis - now;
        if (delay <= 0) break;
        wait(delay);     // 在 this(Thread 对象) 上 wait
        now = System.currentTimeMillis() - base;
    }
}
```

线程结束时 JVM 会自动调用 `this.notifyAll()`，唤醒所有 `join()` 等待的线程。这也解释了为什么 `join()` 要 synchronized——`wait()` 必须持有 monitor。

### interrupt() 的协作语义

`interrupt()` 只设置中断标志位 `interruptFlag = true`，不强行停止线程。响应方式分两种：

- 线程在 `sleep/wait/join` 等可中断阻塞中：抛 `InterruptedException`，并清除中断标志。
- 线程在正常运行：仅设置标志，由业务代码通过 `Thread.currentThread().isInterrupted()` 主动检查。

正确处理中断的模板：

```java
public void run() {
    try {
        while (!Thread.currentThread().isInterrupted()) {
            // 业务逻辑
        }
    } catch (InterruptedException e) {
        // sleep/wait 抛出的异常，标志位已被清
        Thread.currentThread().interrupt(); // 恢复中断状态，让上层感知
    }
}
```

### Executor 框架

`Executor` 接口解耦"任务提交"和"任务执行"。`ExecutorService` 是核心接口，`ThreadPoolExecutor` 是生产实现。JUC 还提供 `Executors` 工厂方法，但生产环境禁止用它的 `newFixedThreadPool` / `newCachedThreadPool` / `newSingleThreadExecutor`——队列或线程数无界，容易 OOM。

```java
// 生产推荐写法
ExecutorService pool = new ThreadPoolExecutor(
        4, 8, 60L, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(200),
        new ThreadFactoryBuilder().setNameFormat("biz-pool-%d").build(),
        new ThreadPoolExecutor.CallerRunsPolicy());
```

## 代码示例

### sleep() 响应中断

```java
public class SleepDemo {
    public static void main(String[] args) throws InterruptedException {
        Thread t = new Thread(() -> {
            try {
                Thread.sleep(5000);
                System.out.println("woke up");
            } catch (InterruptedException e) {
                System.out.println("interrupted during sleep");
                Thread.currentThread().interrupt();
            }
        });
        t.start();
        Thread.sleep(100);
        t.interrupt(); // 1 秒后中断，t 抛 InterruptedException
    }
}
```

### join() 等待子线程

```java
public class JoinDemo {
    public static void main(String[] args) throws InterruptedException {
        Thread t1 = new Thread(() -> {
            try { Thread.sleep(300); } catch (InterruptedException ignored) {}
            System.out.println("t1 done");
        });
        Thread t2 = new Thread(() -> {
            try { Thread.sleep(500); } catch (InterruptedException ignored) {}
            System.out.println("t2 done");
        });
        t1.start(); t2.start();
        t1.join(); t2.join(); // 主线程等 t1、t2 都结束
        System.out.println("all done");
    }
}
```

### yield() 让出 CPU

```java
public class YieldDemo {
    public static void main(String[] args) {
        Thread producer = new Thread(() -> {
            for (int i = 0; i < 5; i++) {
                System.out.println("produce " + i);
                Thread.yield(); // 建议让 consumer 跑
            }
        });
        Thread consumer = new Thread(() -> {
            for (int i = 0; i < 5; i++) {
                System.out.println("consume " + i);
            }
        });
        consumer.start();
        producer.start();
    }
}
```

### 守护线程

```java
public class DaemonDemo {
    public static void main(String[] args) {
        Thread daemon = new Thread(() -> {
            while (true) {
                try { Thread.sleep(1000); } catch (InterruptedException e) { break; }
                System.out.println("daemon tick");
            }
        });
        daemon.setDaemon(true); // 必须在 start 前
        daemon.start();

        try { Thread.sleep(3000); } catch (InterruptedException ignored) {}
        System.out.println("main exit, JVM will kill daemon");
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 限流 / 退避 | `Thread.sleep(backoff)` | 用 `TimeUnit.SECONDS.sleep(1)` 更可读，要捕获中断 |
| 等待子线程汇总 | `thread.join(timeout)` | 必须设超时，避免子线程死循环拖垮主流程 |
| 后台监控任务 | `daemon = true` | 不要在守护线程里做关键资源清理，JVM 终止时不保证 finally 执行 |
| 优雅停机 | `executor.shutdown()` + `awaitTermination()` | 配合 `interrupt()` 让任务主动退出 |
| 长任务取消 | `future.cancel(true)` | 任务要响应中断才有效，忽略中断的任务无法取消 |

## 深挖追问

### sleep(0) 有什么用？

`Thread.sleep(0)` 让当前线程主动让出 CPU 一次，等价于 `yield()`。在某些忙等场景下用于降低 CPU 占用，但不释放锁。

### 为什么 wait/notify 必须在 synchronized 块内？

`wait()` 释放锁的前提是当前线程持有锁，否则没有锁可释放，因此 JVM 在 `wait()` 入口检查 `monitor`，没持有就抛 `IllegalMonitorStateException`。这也是 `wait/notify` 设计上的硬约束。

### interrupted() 和 isInterrupted() 的区别？

两者都返回中断标志，但 `Thread.interrupted()`（静态方法）会**清除**标志位，`isInterrupted()`（实例方法）**不清除**。线程池里的 worker 用 `interrupted()` 来消费中断信号。

### join() 为什么是 synchronized 的？

`join()` 内部调用 `wait()`，而 `wait()` 要求当前线程持有调用对象的 monitor。`join()` 把自己声明为 synchronized 方法，等价于 `synchronized(this) { ... }`，从而保证 `wait()` 合法。

### 守护线程的 finally 会执行吗？

不保证。JVM 在所有非守护线程结束后会立即退出，守护线程被强制终止，`finally` 块可能不会执行。所以不要在守护线程里写关键资源释放逻辑。

## 易错点

- 用 `Thread.sleep()` 代替同步协作——sleep 不释放锁，做轮询会浪费 CPU 且无法及时响应。
- `wait/notify` 不在 synchronized 块内——抛 `IllegalMonitorStateException`。
- `setDaemon()` 在 `start()` 之后调用——抛 `IllegalThreadStateException`。
- 吞掉 `InterruptedException` 不恢复中断标志——上层无法感知中断，破坏协作机制。
- 用 `Thread.stop()` / `Thread.suspend()` 强行停止线程——已废弃，可能导致锁不释放或数据不一致。

## 总结

Java 基础线程机制围绕 Thread API 和 Executor 框架展开。`sleep` 不释放锁、`wait` 释放锁、`yield` 仅建议让出 CPU、`join` 本质是 wait、`interrupt` 是协作式标志——这五点是面试核心。生产环境用线程池替代 `new Thread`，禁用 `Executors` 工厂方法。正确处理中断、避免 `Thread.stop` 这类废弃 API，是工程化的基本要求。

## 参考资料

- [Thread 类官方文档](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Thread.html)
- [Java Concurrency in Practice 第 5、7 章](https://jcip.net/)
- [为什么 Thread.stop 被废弃](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Thread.html#stop())

---
