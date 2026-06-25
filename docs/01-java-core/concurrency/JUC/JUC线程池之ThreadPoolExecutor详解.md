# JUC线程池之ThreadPoolExecutor详解

## 核心概念

`ThreadPoolExecutor` 是 Java 并发包 `java.util.concurrent` 中最核心的线程池实现类，用来统一管理线程创建、任务排队、任务执行、线程回收和拒绝策略。它解决的核心问题不是“让代码异步执行”这么简单，而是把线程这种昂贵资源池化，避免频繁创建销毁线程，并通过队列、最大线程数和拒绝策略对系统吞吐量与稳定性做边界控制。

可以把 `ThreadPoolExecutor` 理解成三部分：

1. **一组 Worker 线程**：真正执行任务的工作线程集合。
2. **一个阻塞队列 workQueue**：暂存来不及执行的任务。
3. **一套生命周期与饱和控制机制**：包括核心线程数、最大线程数、空闲回收时间、拒绝策略、关闭状态等。

面试里最重要的一句话是：**线程池不是越大越好，队列也不是越大越安全；线程池参数本质是在吞吐、延迟、资源占用和故障保护之间做权衡。**

## 面试官想考什么

面试官问 `ThreadPoolExecutor`，通常不是让你背构造参数，而是想确认你是否具备线上并发系统的资源治理意识：

- 你是否理解任务提交后的完整执行流程；
- 你是否知道 `corePoolSize`、`maximumPoolSize`、`workQueue` 之间的关系；
- 你是否知道为什么不推荐直接使用 `Executors` 创建线程池；
- 你是否能根据 CPU 密集型、IO 密集型、突发流量等场景设计线程池；
- 你是否能定位任务堆积、线程打满、拒绝异常、OOM 等线上问题。

## 标准回答

`ThreadPoolExecutor` 的标准执行流程可以概括为四步：

1. **当前工作线程数小于 `corePoolSize`**：直接创建新的核心线程执行任务。
2. **核心线程已满，但队列未满**：任务进入阻塞队列等待执行。
3. **队列已满，但工作线程数小于 `maximumPoolSize`**：继续创建非核心线程执行任务。
4. **队列已满，线程数也达到 `maximumPoolSize`**：触发拒绝策略。

所以，线程池真正的扩容顺序是：

```text
核心线程 -> 阻塞队列 -> 非核心线程 -> 拒绝策略
```

这也是很多人容易答错的点：**不是核心线程满了就立刻扩容到最大线程数，而是先入队；只有队列满了才会创建非核心线程。**

## 构造参数详解

### corePoolSize：核心线程数

`corePoolSize` 表示线程池长期维持的基础工作线程数量。默认情况下，核心线程即使空闲也不会被回收，除非调用：

```java
threadPoolExecutor.allowCoreThreadTimeOut(true);
```

面试表达时可以说：核心线程数决定线程池的常驻并发能力，一般需要结合业务 QPS、任务耗时、CPU 核数、IO 等待比例来设置。

### maximumPoolSize：最大线程数

`maximumPoolSize` 表示线程池允许创建的最大工作线程数。它只有在**队列已满**时才会发挥作用。

如果使用无界队列，例如 `LinkedBlockingQueue` 默认容量接近 `Integer.MAX_VALUE`，队列几乎不会满，那么 `maximumPoolSize` 基本失效，任务会不断堆积到队列中，最终可能 OOM。

### workQueue：任务队列

常见阻塞队列有：

- `ArrayBlockingQueue`：数组实现的有界队列，容量固定，适合做明确的背压控制。
- `LinkedBlockingQueue`：链表实现的阻塞队列，默认近似无界，吞吐较好，但要警惕任务堆积。
- `SynchronousQueue`：不存储任务，提交任务必须直接交给工作线程，常用于快速扩容场景。
- `PriorityBlockingQueue`：优先级无界队列，适合按优先级执行任务，但同样要注意无界风险。

线上更推荐使用**有界队列**，因为有界队列能让系统在压力过大时尽早触发拒绝策略，而不是静默堆积到内存耗尽。

### keepAliveTime 与 unit：空闲线程存活时间

`keepAliveTime` 表示超过核心线程数的空闲线程能存活多久。默认只作用于非核心线程。如果开启 `allowCoreThreadTimeOut(true)`，核心线程也会按该时间回收。

### threadFactory：线程工厂

线程工厂用于创建线程。生产环境必须自定义线程名，方便排查问题：

```java
ThreadFactory factory = r -> {
    Thread t = new Thread(r);
    t.setName("order-worker-" + t.getId());
    t.setUncaughtExceptionHandler((thread, ex) ->
        System.err.println(thread.getName() + " failed: " + ex.getMessage())
    );
    return t;
};
```

### handler：拒绝策略

当队列满且线程数达到最大值时，会触发 `RejectedExecutionHandler`。JDK 内置四种策略：

- `AbortPolicy`：默认策略，直接抛出 `RejectedExecutionException`。
- `CallerRunsPolicy`：由提交任务的线程自己执行任务，能降低提交速度，形成一定背压。
- `DiscardPolicy`：直接丢弃新任务，不抛异常。
- `DiscardOldestPolicy`：丢弃队列中最旧任务，再尝试提交当前任务。

生产环境经常会自定义拒绝策略，例如记录日志、打监控、写入补偿队列、返回降级结果等。

## 关键源码机制

`ThreadPoolExecutor` 使用一个 `AtomicInteger ctl` 同时表示线程池运行状态和工作线程数量：

```java
private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));
private static final int COUNT_BITS = Integer.SIZE - 3;
private static final int CAPACITY   = (1 << COUNT_BITS) - 1;

private static final int RUNNING    = -1 << COUNT_BITS;
private static final int SHUTDOWN   =  0 << COUNT_BITS;
private static final int STOP       =  1 << COUNT_BITS;
private static final int TIDYING    =  2 << COUNT_BITS;
private static final int TERMINATED =  3 << COUNT_BITS;

private static int runStateOf(int c)     { return c & ~CAPACITY; }
private static int workerCountOf(int c)  { return c & CAPACITY; }
private static int ctlOf(int rs, int wc) { return rs | wc; }
```

`ctl` 的高 3 位表示线程池状态，低 29 位表示 Worker 数量。这样做的好处是可以用一次 CAS 同时维护状态和线程数，降低并发竞争。

线程池的主要状态有：

- `RUNNING`：接收新任务并处理队列任务；
- `SHUTDOWN`：不接收新任务，但继续处理队列任务；
- `STOP`：不接收新任务，不处理队列任务，并中断正在执行的任务；
- `TIDYING`：所有任务结束，工作线程数为 0，准备执行 `terminated()`；
- `TERMINATED`：终止完成。

## Executors 四种常见线程池

### newFixedThreadPool

```java
public static ExecutorService newFixedThreadPool(int nThreads) {
    return new ThreadPoolExecutor(
        nThreads, nThreads,
        0L, TimeUnit.MILLISECONDS,
        new LinkedBlockingQueue<Runnable>()
    );
}
```

固定线程数，使用无界 `LinkedBlockingQueue`。问题是任务提交速度大于处理速度时，队列可能无限堆积，导致 OOM；同时 `maximumPoolSize` 和拒绝策略基本失效。

### newSingleThreadExecutor

```java
public static ExecutorService newSingleThreadExecutor() {
    return new ThreadPoolExecutor(
        1, 1,
        0L, TimeUnit.MILLISECONDS,
        new LinkedBlockingQueue<Runnable>()
    );
}
```

只有一个工作线程，能保证任务顺序执行。如果线程异常退出，会重新创建线程继续处理任务。风险同样是无界队列导致任务堆积。

### newCachedThreadPool

```java
public static ExecutorService newCachedThreadPool() {
    return new ThreadPoolExecutor(
        0, Integer.MAX_VALUE,
        60L, TimeUnit.SECONDS,
        new SynchronousQueue<Runnable>()
    );
}
```

没有核心线程，最大线程数接近无限，使用 `SynchronousQueue`。任务多时可能创建大量线程，导致 CPU 上下文切换严重，甚至耗尽系统资源。

### newScheduledThreadPool

```java
public static ScheduledExecutorService newScheduledThreadPool(int corePoolSize) {
    return new ScheduledThreadPoolExecutor(corePoolSize);
}
```

用于延迟任务和周期任务，内部使用无界延迟队列。周期任务执行时间过长或者提交过多时，也可能导致任务堆积。

## 实战场景

### 场景一：接口异步处理

例如订单系统中，下单主流程完成后，需要异步发送消息、记录日志、刷新缓存。可以使用有界线程池：

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    8,
    16,
    60,
    TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(1000),
    factory,
    new ThreadPoolExecutor.CallerRunsPolicy()
);
```

这样在突发流量下，线程最多扩到 16，队列最多积压 1000 个任务，超过后由调用线程执行，降低提交速度，避免无限堆积。

### 场景二：CPU 密集型任务

CPU 密集型任务主要消耗计算资源，线程数一般设置为：

```text
CPU 核数 + 1
```

线程过多不会提升吞吐，反而会增加上下文切换。

### 场景三：IO 密集型任务

IO 密集型任务大量时间在等待网络、磁盘或数据库返回，可以设置更多线程：

```text
线程数 ≈ CPU 核数 * (1 + IO等待时间 / CPU计算时间)
```

实际生产中通常结合压测、监控和下游承载能力调整。

## 代码示例

```java
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class ThreadPoolDemo {
    public static void main(String[] args) {
        AtomicInteger index = new AtomicInteger(1);

        ThreadFactory threadFactory = r -> {
            Thread thread = new Thread(r);
            thread.setName("biz-pool-" + index.getAndIncrement());
            return thread;
        };

        RejectedExecutionHandler handler = (task, executor) -> {
            // 生产环境可以记录日志、打监控、写补偿队列
            System.err.println("task rejected, active=" + executor.getActiveCount()
                    + ", queue=" + executor.getQueue().size());
            throw new RejectedExecutionException("thread pool is full");
        };

        ThreadPoolExecutor executor = new ThreadPoolExecutor(
                4,
                8,
                60,
                TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(100),
                threadFactory,
                handler
        );

        executor.execute(() -> System.out.println(Thread.currentThread().getName() + " running"));
        executor.shutdown();
    }
}
```

## 深挖追问

### 1. 为什么阿里规约不建议使用 Executors？

因为 `Executors` 的几个快捷方法隐藏了关键参数，容易创建无界队列或无限线程数：

- `newFixedThreadPool` 和 `newSingleThreadExecutor` 使用无界队列，可能 OOM；
- `newCachedThreadPool` 最大线程数是 `Integer.MAX_VALUE`，可能创建过多线程；
- `newScheduledThreadPool` 使用无界延迟队列，任务可能堆积。

所以生产环境更推荐直接使用 `ThreadPoolExecutor`，显式设置线程数、队列容量、线程名和拒绝策略。

### 2. execute 和 submit 有什么区别？

- `execute` 提交 `Runnable`，没有返回值，异常通常会暴露给线程的异常处理器；
- `submit` 返回 `Future`，异常会被包装进 `Future`，调用 `get()` 时才抛出。

如果使用 `submit` 后从不调用 `Future.get()`，任务异常可能被“吞掉”，这在线上排查时非常坑。

### 3. shutdown 和 shutdownNow 有什么区别？

- `shutdown()`：不再接收新任务，但会继续执行队列中的已有任务；
- `shutdownNow()`：尝试中断正在执行的任务，并返回队列中尚未执行的任务。

是否能真正停止正在执行的任务，取决于任务代码是否响应中断。

### 4. 如何排查线程池任务堆积？

可以从以下几个指标入手：

- `activeCount`：活跃线程数是否接近最大线程数；
- `queue.size()`：任务队列是否持续增长；
- `completedTaskCount`：完成任务数是否增长缓慢；
- 线程 dump：查看线程是否阻塞在数据库、Redis、HTTP 调用或锁等待上；
- 下游监控：检查是否是依赖服务变慢导致线程被占满。

## 易错点总结

1. **核心线程满后先入队，不是立刻扩容到最大线程数。**
2. **无界队列会让 `maximumPoolSize` 和拒绝策略基本失效。**
3. **线程池参数不能拍脑袋设置，必须结合任务类型、耗时、QPS 和下游能力。**
4. **生产环境必须设置有意义的线程名，否则线程 dump 难以排查。**
5. **拒绝策略不是异常情况，而是系统保护机制的一部分。**
6. **使用 `submit` 时要注意异常被封装进 `Future`。**
7. **线程池关闭依赖任务响应中断，不能假设 `shutdownNow()` 一定能立即停止任务。**

## 参考资料

- JDK `ThreadPoolExecutor` 源码
- Java Concurrency in Practice
- 阿里巴巴 Java 开发手册
