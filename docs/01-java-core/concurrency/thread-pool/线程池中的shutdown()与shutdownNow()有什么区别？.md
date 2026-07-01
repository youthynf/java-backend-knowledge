# 线程池中的 shutdown 与 shutdownNow 有什么区别

## 核心概念

`shutdown()` 和 `shutdownNow()` 是 `ExecutorService` 接口提供的两个关闭线程池方法，分别对应"温和关闭"和"强制关闭"两种语义。两者的本质区别在于：是否处理队列中的剩余任务、是否中断正在执行的任务。

线程池关闭通常配合 `awaitTermination()` 使用，构成"温和等待 → 超时强制"的标准优雅停机模式。

## 标准回答

| 维度 | `shutdown()` | `shutdownNow()` |
|------|--------------|------------------|
| 线程池状态 | SHUTDOWN | STOP |
| 新任务 | 拒绝（走拒绝策略） | 拒绝（走拒绝策略） |
| 队列中的任务 | 继续执行完 | 不执行，返回未消费列表 |
| 正在执行的任务 | 不中断，让它跑完 | 尝试中断（`Thread.interrupt()`） |
| 返回值 | void | `List<Runnable>`（未执行的任务） |

简单记忆：`shutdown()` 是"关门谢客、内部消化"，`shutdownNow()` 是"立刻清场、强行中断"。

## 实现原理

### shutdown 源码

```java
public void shutdown() {
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        checkShutdownAccess();
        advanceRunState(SHUTDOWN);          // 状态切到 SHUTDOWN
        interruptIdleWorkers();             // 中断"空闲"工作线程
        onShutdown();                       // 钩子方法，ScheduledThreadPoolExecutor 用来清理延迟任务
    } finally {
        mainLock.unlock();
    }
    tryTerminate();
}
```

`interruptIdleWorkers` 只中断"空闲"线程——正在 `workQueue.take()` 阻塞等待的线程。如果线程正在执行任务（持有 Worker 锁），不会被中断。

`take()` 在被中断时会抛 `InterruptedException`，进入 `getTask` 的 catch 分支重新循环，发现状态是 SHUTDOWN 且队列为空时返回 null，工作线程退出。

### shutdownNow 源码

```java
public List<Runnable> shutdownNow() {
    List<Runnable> tasks;
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        checkShutdownAccess();
        advanceRunState(STOP);              // 状态切到 STOP
        interruptWorkers();                 // 中断所有工作线程（不区分空闲）
        tasks = drainQueue();               // 把队列剩余任务捞出来
    } finally {
        mainLock.unlock();
    }
    tryTerminate();
    return tasks;
}
```

`interruptWorkers` 调用每个 Worker 的 `interruptIfStarted`，对所有线程发中断信号。但中断只是设置中断标志，真正停下来要靠任务代码响应中断。

### getTask 对状态的处理

```java
private Runnable getTask() {
    for (;;) {
        int c = ctl.get();
        // STOP 状态：不处理队列，返回 null 让线程退出
        if (runStateAtLeast(c, STOP))
            return null;
        // SHUTDOWN 且队列空：返回 null 让线程退出
        if (runStateAtLeast(c, SHUTDOWN) && workQueue.isEmpty())
            return null;
        // SHUTDOWN 且队列非空：继续取任务执行
        // ...
    }
}
```

### awaitTermination

```java
public boolean awaitTermination(long timeout, TimeUnit unit) {
    long nanos = unit.toNanos(timeout);
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        for (;;) {
            if (runStateAtLeast(ctl.get(), TERMINATED))
                return true;            // 已彻底终止
            if (nanos <= 0)
                return false;           // 超时
            nanos = termination.awaitNanos(nanos);
        }
    } finally {
        mainLock.unlock();
    }
}
```

`termination` 是一个 `Condition`，`tryTerminate` 在所有 worker 退出后会 `signalAll`，唤醒等待者。

## 代码示例

### 标准优雅停机

```java
public void gracefulShutdown(ExecutorService executor) {
    executor.shutdown();                              // 第一步：温和关闭
    try {
        if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
            List<Runnable> dropped = executor.shutdownNow();  // 第二步：超时强制
            log.warn("线程池强制停止，丢弃 {} 个未执行任务", dropped.size());
            if (!executor.awaitTermination(10, TimeUnit.SECONDS)) {
                log.error("线程池无法停止");
            }
        }
    } catch (InterruptedException e) {
        executor.shutdownNow();
        Thread.currentThread().interrupt();
    }
}
```

### Spring Bean 销毁时关闭

```java
@Bean(destroyMethod = "shutdown")
public ThreadPoolExecutor orderExecutor() {
    return new ThreadPoolExecutor(8, 16, 60L, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(200));
}

// 或手动实现 DisposableBean
@Component
public class OrderExecutorHolder implements DisposableBean {
    private final ThreadPoolExecutor executor;

    public void destroy() throws Exception {
        executor.shutdown();
        if (!executor.awaitTermination(30, TimeUnit.SECONDS)) {
            executor.shutdownNow();
        }
    }
}
```

## 实战场景

| 场景 | 方法 | 注意点 |
|------|------|--------|
| 应用优雅停机 | shutdown + awaitTermination + shutdownNow | 必须设超时，配合 Spring ShutdownHook |
| 临时线程池用完即关 | shutdown + awaitTermination | 短任务用 shutdownNow 也行 |
| 强制止损（如下游故障） | shutdownNow | 任务不响应中断时仍会跑完 |
| 拒绝服务排查 | isShutdown 判断后再提交 | shutdown 后 execute 会触发拒绝策略 |

## 深挖追问

### shutdownNow 能保证立刻停止所有线程吗？

不能。它只是发中断信号。如果任务在 `Thread.sleep`、`Object.wait`、`BlockingQueue.take` 等可中断方法上阻塞，会抛 `InterruptedException` 退出；但如果任务在 CPU 循环里跑且不检查中断标志，会一直跑完。

### shutdown 后还能提交任务吗？

不能。`execute` 开头检查到非 RUNNING 状态会走拒绝策略，默认 `AbortPolicy` 抛 `RejectedExecutionException`。`submit` 同理。

### shutdown 会等队列里的任务执行完吗？

会。`shutdown` 后工作线程继续从队列取任务执行，直到队列空、工作线程数为 0，状态进入 TIDYING 再 TERMINATED。可以用 `awaitTermination` 等待这个过程结束。

### 为什么不直接 stop 一个线程？

`Thread.stop()` 已被废弃。它会在任意位置强制终止线程，可能破坏对象状态和锁保护的不变量，导致数据不一致。中断机制是协作式的，由任务自己决定何时退出，更安全。

### 优雅停机时如何让正在执行的任务也能感知？

任务代码主动检查中断标志：

```java
executor.submit(() -> {
    while (!Thread.currentThread().isInterrupted() && hasMoreWork()) {
        doOneBatch();
    }
    cleanup();
});
```

并在可中断阻塞方法上响应 `InterruptedException`，重新设置中断标志后退出。

## 易错点

- 调用 `shutdown()` 后没等 `awaitTermination` 就退出 JVM，正在执行的任务被强杀。
- `shutdownNow()` 以为能强制中断所有任务，结果任务不响应中断，依然跑了几分钟。
- 优雅停机没设超时，进程退出时一直挂在 `awaitTermination` 上。
- Spring Bean 没声明 `destroyMethod`，容器关闭时线程池仍在跑，进程退不掉。

## 总结

`shutdown` 与 `shutdownNow` 是温和与强制两种关闭语义：前者处理完队列再退，后者立即停止并返回未处理任务。生产环境的标准优雅停机模式是 `shutdown → awaitTermination(timeout) → shutdownNow → awaitTermination`。理解中断是协作式而非强制的，是判断"强制关闭"边界的关键。

## 参考资料

- [JDK ThreadPoolExecutor 源码](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/ThreadPoolExecutor.java)
- [Java 并发编程的艺术](https://book.douban.com/subject/26591326/)

---
