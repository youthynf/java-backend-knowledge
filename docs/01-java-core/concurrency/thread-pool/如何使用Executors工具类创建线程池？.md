# 如何使用 Executors 工具类创建线程池

## 核心概念

`Executors` 是 `java.util.concurrent` 包提供的线程池工厂类，通过静态方法快速创建常用配置的线程池。它本质上是 `ThreadPoolExecutor` 构造方法的封装，把"核心数、最大数、队列、拒绝策略"等参数预设成几种典型组合。

阿里 Java 开发手册**强制**禁用 `Executors` 创建线程池，要求直接用 `ThreadPoolExecutor`。原因是 `Executors` 的几种预设都隐藏了 OOM 风险：要么用无界队列，要么用 `Integer.MAX_VALUE` 作为最大线程数。理解 `Executors` 的实现细节，本质上是理解"为什么不该用它"。

## 标准回答

`Executors` 提供 4 种常用线程池：

| 方法 | core | max | 队列 | 风险 |
|------|------|-----|------|------|
| `newFixedThreadPool(n)` | n | n | `LinkedBlockingQueue`（无界） | 队列堆积导致 OOM |
| `newSingleThreadExecutor()` | 1 | 1 | `LinkedBlockingQueue`（无界） | 队列堆积导致 OOM |
| `newCachedThreadPool()` | 0 | `Integer.MAX_VALUE` | `SynchronousQueue` | 线程数无上限导致 OOM |
| `newScheduledThreadPool(n)` | n | `Integer.MAX_VALUE` | `DelayedWorkQueue`（无界） | 队列堆积导致 OOM |

阿里规范要求直接用 `ThreadPoolExecutor` 显式声明所有参数，让开发同学"看见"队列容量和最大线程数。

## 实现原理

### newFixedThreadPool

```java
public static ExecutorService newFixedThreadPool(int nThreads) {
    return new ThreadPoolExecutor(nThreads, nThreads,
                                  0L, TimeUnit.MILLISECONDS,
                                  new LinkedBlockingQueue<Runnable>());
}
```

特点：core = max = n，所以永远不会触发非核心线程创建；`LinkedBlockingQueue` 默认容量 `Integer.MAX_VALUE`，相当于无界。任务提交速度大于处理速度时，队列无限增长，最终 OOM。

### newSingleThreadExecutor

```java
public static ExecutorService newSingleThreadExecutor() {
    return new FinalizableDelegatedExecutorService
        (new ThreadPoolExecutor(1, 1,
                                0L, TimeUnit.MILLISECONDS,
                                new LinkedBlockingQueue<Runnable>()));
}
```

特点：单线程串行执行，保证任务按提交顺序处理。包裹了 `FinalizableDelegatedExecutorService`，在 GC 时自动 `shutdown`。队列同样无界，OOM 风险与 `FixedThreadPool` 相同。

### newCachedThreadPool

```java
public static ExecutorService newCachedThreadPool() {
    return new ThreadPoolExecutor(0, Integer.MAX_VALUE,
                                  60L, TimeUnit.SECONDS,
                                  new SynchronousQueue<Runnable>());
}
```

特点：core = 0，所有线程都是非核心，空闲 60 秒自动回收；`SynchronousQueue` 没有容量，必须有消费者在 `take` 才能 `offer` 成功，否则 `execute` 走到 `addWorker` 直接创建新线程。max = `Integer.MAX_VALUE` 等于没有上限，突发流量下创建大量线程，可能耗尽进程内存或 OS 线程数限制。

### newScheduledThreadPool

```java
public static ScheduledExecutorService newScheduledThreadPool(int corePoolSize) {
    return new ScheduledThreadPoolExecutor(corePoolSize);
}

// ScheduledThreadPoolExecutor 构造
public ScheduledThreadPoolExecutor(int corePoolSize) {
    super(corePoolSize, Integer.MAX_VALUE,
          0, NANOSECONDS,
          new DelayedWorkQueue());
}
```

特点：用 `DelayedWorkQueue`（基于堆的延迟队列）支持定时和周期任务；max 是 `Integer.MAX_VALUE`，但实际几乎不会扩容——`DelayedWorkQueue` 是无界的，任务都能入队。同样有无界队列 OOM 风险。

### 为什么阿里规范禁用

直接用 `ThreadPoolExecutor`：

```java
// ❌ 阿里规范禁止
ExecutorService pool = Executors.newFixedThreadPool(10);

// ✅ 显式声明
ThreadPoolExecutor pool = new ThreadPoolExecutor(
        10, 20, 60L, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(500),   // 显式有界
        new ThreadPoolExecutor.CallerRunsPolicy());
```

强制显式声明带来的好处：

1. 队列容量可见，强制思考"满了怎么办"。
2. 拒绝策略必须显式选择，不会被默认 `AbortPolicy` 偷偷抛异常。
3. 线程命名可控（配合 `ThreadFactory`），便于线程 dump 排查。

## 代码示例

```java
// 显式声明的标准写法
public ThreadPoolExecutor orderExecutor() {
    int cpu = Runtime.getRuntime().availableProcessors();
    return new ThreadPoolExecutor(
            cpu * 2, cpu * 4, 60L, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(500),
            r -> {
                Thread t = new Thread(r);
                t.setName("order-worker-" + t.getId());
                t.setUncaughtExceptionHandler((thread, ex) ->
                    log.error("线程 {} 异常", thread.getName(), ex));
                return t;
            },
            new ThreadPoolExecutor.CallerRunsPolicy());
}
```

## 实战场景

| 场景 | 是否用 Executors | 原因 |
|------|-----------------|------|
| 业务线程池 | 否，用 `ThreadPoolExecutor` | 必须显式有界队列 + 命名 + 拒绝策略 |
| 测试代码 / Demo | 可以用 `Executors.newFixedThreadPool` | 快速验证逻辑，无生产压力 |
| 单元测试中临时线程池 | 可以用 `Executors.newSingleThreadExecutor` | 用完即 shutdown |
| 定时任务调度 | 否，用 `ScheduledThreadPoolExecutor` 显式构造 | 避免任务堆积 |

## 深挖追问

### newWorkStealingPool 是什么？

`Executors.newWorkStealingPool()` 返回 `ForkJoinPool`，使用工作窃取算法，每个线程有自己的双端队列，空闲时从其他线程队列尾部窃取任务。它的并发度默认是 CPU 核数，适合分治任务。

### FixedThreadPool 为什么把 core 和 max 设成相同值？

设计意图就是"固定大小线程池"——核心线程都常驻，不创建非核心线程，不回收。但因为队列无界，max 永远不会触发，所以"固定大小"实际只是"固定核心数"。

### newSingleThreadExecutor 和直接 new Thread 比有什么好处？

线程复用：第二个任务能复用第一个任务的线程，不用反复创建销毁；任务排队保证顺序；提供了 shutdown 等管理能力。但单线程池的队列无界问题依然存在。

### Executors 真的不能在生产用吗？

不是绝对。如果业务能严格保证任务提交速率有上限（如内部定时任务、低频管理操作），用 `Executors` 也不会出事。但工程实践中"明天可能变成高并发"是不可控的，所以规范一刀切禁用。规范的本质是"防止意外"，不是"代码有 bug"。

## 易错点

- 把 `Executors.newFixedThreadPool` 当默认选择，没意识到队列无界。
- 用 `newCachedThreadPool` 处理突发外部请求，瞬时创建数千线程压垮进程。
- 没有自定义 `ThreadFactory`，线程名是 `pool-1-thread-1`，线上 thread dump 无法区分业务。
- 用 `newSingleThreadExecutor` 跑耗时任务且不限制提交速率，队列堆爆。

## 总结

`Executors` 是"快捷方式"，背后隐藏了 OOM 风险。理解四种预设的源码——无界队列、`Integer.MAX_VALUE` 最大线程数——就能明白为什么阿里规范强制禁用。生产代码应该用 `ThreadPoolExecutor` 显式声明核心数、最大数、有界队列、命名线程工厂和拒绝策略，把每个决策暴露在代码里。

## 参考资料

- [JDK Executors 源码](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/Executors.java)
- [阿里巴巴 Java 开发手册 - 并发处理](https://developer.aliyun.com/special/tech-java)
- [JavaGuide - 线程池详解](https://javaguide.cn/java/concurrent/java-thread-pool.html)

---
