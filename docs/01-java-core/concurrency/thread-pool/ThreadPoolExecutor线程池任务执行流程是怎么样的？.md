# ThreadPoolExecutor 线程池任务执行流程是怎么样的

## 核心概念

`ThreadPoolExecutor` 是 Java 线程池的核心实现。提交任务后，它按"核心线程 → 阻塞队列 → 非核心线程 → 拒绝策略"四步顺序处理。这个顺序是它和很多其他线程池实现（如 Tomcat）最大的区别：核心线程满后**先入队**，而不是直接扩容到最大线程数。

任务提交入口有两个：`execute(Runnable)` 无返回值，`submit(Callable/Runnable)` 有返回值。`submit` 内部最终也会调用 `execute`，只是额外把任务包装成 `FutureTask` 用于返回结果。

## 标准回答

`execute(Runnable command)` 的执行流程可以浓缩为四步：

1. 工作线程数 `< corePoolSize`：创建新的核心线程执行任务（即使有空闲线程也新建）。
2. 工作线程数 `≥ corePoolSize`：尝试把任务放入阻塞队列。
3. 队列已满且线程数 `< maximumPoolSize`：创建非核心线程执行任务。
4. 队列已满且线程数 `≥ maximumPoolSize`：执行拒绝策略。

助记口诀：**核心满 → 入队列 → 队列满 → 扩到 max → 再满 → 拒绝**。

## 实现原理

### execute 方法源码骨架

```java
public void execute(Runnable command) {
    if (command == null) throw new NullPointerException();
    int c = ctl.get();

    // 步骤 1：少于核心线程，新增 worker
    if (workerCountOf(c) < corePoolSize) {
        if (addWorker(command, true))   // true 表示核心线程
            return;
        c = ctl.get();
    }

    // 步骤 2：进入 RUNNING 状态且成功入队
    if (isRunning(c) && workQueue.offer(command)) {
        int recheck = ctl.get();
        // 二次校验：入队后线程池可能被关闭，需移除并执行拒绝策略
        if (!isRunning(recheck) && remove(command))
            reject(command);
        else if (workerCountOf(recheck) == 0)
            addWorker(null, false);      // 兜底：保证至少有一个线程消费队列
    }
    // 步骤 3：队列满，尝试创建非核心线程
    else if (!addWorker(command, false))
        // 步骤 4：达到 maximumPoolSize，执行拒绝策略
        reject(command);
}
```

### addWorker 的关键逻辑

`addWorker(Runnable firstTask, boolean core)` 做两件事：

1. CAS 增加 `ctl` 中的 worker 计数（`core=true` 上限是 `corePoolSize`，`false` 上限是 `maximumPoolSize`）。
2. 加锁创建 `Worker` 对象，构造 `Thread` 并 `start()`。`firstTask` 作为这个线程的第一个任务，避免新线程再去队列里抢任务。

### Worker 的运行循环

`Worker` 实现了 `Runnable`，被线程 `start` 后进入 `runWorker`：

```java
final void runWorker(Worker w) {
    Thread wt = Thread.currentThread();
    Runnable task = w.firstTask;
    w.firstTask = null;
    w.unlock(); // 允许中断
    try {
        while (task != null || (task = getTask()) != null) {
            w.lock();
            // 状态检查：STOP 状态需要中断当前线程
            if (runStateAtLeast(ctl.get(), STOP) &&
                (Thread.interrupted() || runStateAtLeast(ctl.get(), STOP)))
                wt.interrupt();
            try {
                beforeExecute(wt, task);
                task.run();           // 真正执行任务
                afterExecute(task, null);
            } catch (Throwable ex) {
                afterExecute(task, ex);
            } finally {
                task = null;
                w.completedTasks++;
                w.unlock();
            }
        }
    } finally {
        processWorkerExit(w, false);   // 线程退出处理
    }
}
```

### getTask 与线程回收

`getTask()` 是工作线程从队列取任务的入口，也是非核心线程超时回收的触发点：

```java
private Runnable getTask() {
    boolean timedOut = false;
    for (;;) {
        int c = ctl.get();
        // SHUTDOWN 且队列空 → 返回 null，线程退出
        // STOP → 返回 null，线程退出
        // ...
        int wc = workerCountOf(c);
        // allowCoreThreadTimeOut=true 或当前是非核心线程 → timed=true
        boolean timed = allowCoreThreadTimeOut || wc > corePoolSize;

        // 超时且还能减线程 → 返回 null 让线程退出
        if ((wc > maximumPoolSize || (timed && timedOut))
            && (wc > 1 || workQueue.isEmpty())) {
            return null;
        }
        try {
            Runnable r = timed ?
                workQueue.poll(keepAliveTime, TimeUnit.NANOSECONDS) :
                workQueue.take();      // 核心线程阻塞等待
            if (r != null) return r;
            timedOut = true;
        } catch (InterruptedException retry) {
            timedOut = false;
        }
    }
}
```

关键点：核心线程调用 `take()` 无限期阻塞；非核心线程调用 `poll(keepAliveTime)`，超时未拿到任务返回 null，工作线程随之退出。

## 代码示例

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
        2,                                  // corePoolSize
        4,                                  // maximumPoolSize
        30L, TimeUnit.SECONDS,              // 非核心线程空闲存活时间
        new ArrayBlockingQueue<>(2),        // 容量 2 的有界队列
        Executors.defaultThreadFactory(),
        new ThreadPoolExecutor.AbortPolicy());

// 依次提交 7 个任务，观察步骤
for (int i = 1; i <= 7; i++) {
    final int idx = i;
    try {
        executor.execute(() -> {
            System.out.println("任务 " + idx + " 由 " + Thread.currentThread().getName() + " 执行");
            try { TimeUnit.SECONDS.sleep(2); } catch (InterruptedException ignored) {}
        });
        System.out.println("任务 " + idx + " 提交成功，队列大小=" + executor.getQueue().size());
    } catch (RejectedExecutionException e) {
        System.out.println("任务 " + idx + " 被拒绝");
    }
}
```

执行结果：任务 1、2 创建核心线程；任务 3、4 入队；任务 5、6 触发非核心线程创建到 4；任务 7 队列满且线程到 max，触发 AbortPolicy 拒绝。

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 限流削峰 | 大流量接口 + 有界队列 + 拒绝策略 | 队列不能无界，否则 OOM |
| 突发流量应对 | 较小核心 + 较大 max + 较小队列 | 队列小才会触发扩容到 max |
| 低延迟快速失败 | 小队列 + AbortPolicy | 任务被拒绝时通过降级返回默认值 |
| 串行消费 | core=max=1 + LinkedBlockingQueue | 单线程顺序处理 |

## 深挖追问

### 为什么核心线程满后先入队，而不是直接创建到 max？

复用已有线程成本远低于新建线程；同时避免瞬时流量导致线程数过早膨胀。详见 [为什么核心线程池满了之后是先加入阻塞队列而不是直接创建线程？](为什么核心线程池满了之后是先加入阻塞队列而不是直接创建线程？.md)。

### 核心线程有空闲时还会创建新核心线程吗？

会。只要工作线程数 `< corePoolSize`，即使有空闲线程也直接创建。这是源码 `workerCountOf(c) < corePoolSize` 分支决定的，不检查空闲状态。

### prestartAllCoreThreads 是干什么的？

`prestartAllCoreThreads()` 提前创建所有核心线程并让它们阻塞在队列上，避免冷启动时第一批任务被串行创建线程的延迟影响。

### submit 和 execute 的区别？

`submit` 把 `Runnable/Callable` 包装成 `FutureTask` 后调用 `execute`；返回 `Future` 用于获取结果或捕获异常。`execute` 直接执行 `Runnable`，异常会冒到 `UncaughtExceptionHandler`。

## 易错点

- 误以为"有空闲线程就复用，否则新建"。前 `corePoolSize` 个任务无论空闲与否都会新建线程。
- 用了无界队列（如默认 `LinkedBlockingQueue`），`maximumPoolSize` 永远不会触发，相当于固定大小线程池。
- `submit` 提交的任务抛异常时不会打印到控制台，必须 `future.get()` 才能看到。
- `allowCoreThreadTimeOut(true)` 后核心线程也会被回收，可能让"常态有核心线程兜底"的假设失效。

## 总结

`execute` 的四步流程是线程池最核心的面试点，关键在于理解"先入队再扩容"的设计动机。结合 `Worker.runWorker` 的取任务循环、`getTask` 中 `take` 与 `poll` 的差异，可以解释线程复用、空闲回收、优雅关闭等一系列行为。

## 参考资料

- [JDK ThreadPoolExecutor 源码](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/ThreadPoolExecutor.java)
- [Java 并发编程的艺术](https://book.douban.com/subject/26591326/)
- [美团技术团队 - Java 线程池实现原理及其在美团业务中的实践](https://tech.meituan.com/2020/04/02/java-pooling-pratice-in-meituan.html)

---
