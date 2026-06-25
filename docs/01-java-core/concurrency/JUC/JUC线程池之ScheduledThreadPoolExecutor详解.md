# JUC线程池之ScheduledThreadPoolExecutor详解

## 核心概念

`ScheduledThreadPoolExecutor` 是 JUC 中用于执行延时任务和周期任务的线程池。它可以看作是“线程池 + 延迟队列”的组合：任务不会立即进入普通工作队列，而是先按照触发时间排序，到期后再被工作线程执行。

它常用于：

- 延迟执行：例如 5 秒后重试一次。
- 固定频率执行：例如每 10 秒采集一次指标。
- 固定延迟执行：例如上一次任务结束 10 秒后再执行下一次。

一句话：**ScheduledThreadPoolExecutor 解决的是定时、延时、周期性任务调度问题，比 Timer 更可靠，也比手写 sleep 循环更规范。**

## 面试官想考什么

面试问 `ScheduledThreadPoolExecutor`，通常想看你是否理解：

1. 它和 `Timer` 的区别。
2. 它的核心队列为什么能按时间调度任务。
3. `scheduleAtFixedRate` 和 `scheduleWithFixedDelay` 的区别。
4. 周期任务抛异常后会发生什么。
5. 为什么不能把它当成分布式定时任务系统。

## 标准回答

可以这样回答：

> `ScheduledThreadPoolExecutor` 是 JDK 提供的定时任务线程池，支持延迟任务和周期任务。它内部使用 `DelayedWorkQueue` 保存任务，任务按照下一次执行时间排序，只有到期任务才会被线程取出执行。
>
> 它比 `Timer` 更可靠，因为 `Timer` 只有一个执行线程，某个任务执行时间过长会阻塞后续任务；任务抛出异常还可能导致整个 Timer 线程终止。而 `ScheduledThreadPoolExecutor` 可以配置多个核心线程，单个任务异常不会导致整个调度器退出。
>
> 周期调度有两种方式：`scheduleAtFixedRate` 按固定频率执行，更关注计划时间；`scheduleWithFixedDelay` 按固定延迟执行，以上一次任务结束时间为基准。生产中如果任务执行时间不稳定，通常更推荐 fixedDelay，避免任务堆积压力。

## 核心 API

### 1. 延迟执行 schedule

```java
ScheduledExecutorService executor = Executors.newScheduledThreadPool(2);

executor.schedule(() -> {
    System.out.println("5 秒后执行一次");
}, 5, TimeUnit.SECONDS);
```

`schedule` 只执行一次，适合延迟重试、超时检查、延后通知等场景。

### 2. 固定频率 scheduleAtFixedRate

```java
executor.scheduleAtFixedRate(() -> {
    System.out.println("每 10 秒按固定频率执行");
}, 0, 10, TimeUnit.SECONDS);
```

`initialDelay` 表示首次执行前的延迟，`period` 表示两次任务“计划开始时间”之间的间隔。

如果任务执行时间小于周期，下一次会按计划时间执行；如果任务执行时间超过周期，下一次不会并发执行同一个任务，而是在上一次结束后尽快补上。

### 3. 固定延迟 scheduleWithFixedDelay

```java
executor.scheduleWithFixedDelay(() -> {
    System.out.println("上一次结束后，再等待 10 秒执行");
}, 0, 10, TimeUnit.SECONDS);
```

`delay` 表示上一次任务结束到下一次任务开始之间的延迟。

这种方式更适合执行时间不稳定的任务，比如定期拉取接口、巡检状态、同步数据等。

## fixedRate 和 fixedDelay 的区别

| 对比项 | scheduleAtFixedRate | scheduleWithFixedDelay |
|---|---|---|
| 时间基准 | 上一次计划开始时间 | 上一次实际结束时间 |
| 关注点 | 固定频率 | 固定间隔 |
| 任务耗时较长时 | 结束后尽快执行下一轮 | 结束后再等待 delay |
| 是否适合耗时不稳定任务 | 谨慎使用 | 更稳妥 |
| 常见场景 | 指标采集、心跳上报 | 轮询接口、定期同步 |

面试中可以用一句话区分：**fixedRate 看表，fixedDelay 看任务结束。**

## 底层原理

### 1. DelayedWorkQueue

`ScheduledThreadPoolExecutor` 内部使用 `DelayedWorkQueue`，它是一个基于堆的无界延迟队列。任务会按照触发时间排序，越早到期的任务越靠前。

工作线程从队列取任务时，如果堆顶任务还没到执行时间，线程会等待；如果已经到期，就取出执行。

### 2. ScheduledFutureTask

提交到线程池的定时任务会被包装成 `ScheduledFutureTask`。它至少包含三类关键信息：

- `time`：下一次执行时间。
- `period`：周期任务的间隔，正负值用于区分 fixedRate 和 fixedDelay。
- `sequenceNumber`：当两个任务触发时间相同时，用序号保证先提交的任务先执行。

一次性任务执行完成后就结束；周期任务执行完成后会计算下一次执行时间，再重新放回队列。

### 3. 线程数与队列

`ScheduledThreadPoolExecutor` 主要依赖核心线程数 `corePoolSize`。由于内部队列是无界队列，`maximumPoolSize` 基本不起作用，所以不要指望通过调大最大线程数解决任务堆积问题。

如果周期任务执行慢，真正要做的是：

1. 缩短任务耗时。
2. 拆分调度器，避免互相影响。
3. 增加核心线程数。
4. 对任务做超时和降级。

## 代码示例：安全的周期任务

```java
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class ScheduledExecutorDemo {
    public static void main(String[] args) {
        ScheduledExecutorService executor = Executors.newScheduledThreadPool(2);

        executor.scheduleWithFixedDelay(() -> {
            try {
                syncData();
            } catch (Exception e) {
                // 周期任务必须自己兜底异常，否则后续调度会停止
                System.err.println("sync failed: " + e.getMessage());
            }
        }, 0, 10, TimeUnit.SECONDS);
    }

    private static void syncData() {
        System.out.println("sync data...");
        // 调用远程接口、同步数据等
    }
}
```

关键点是：周期任务内部要捕获异常。否则一次异常可能让这个周期任务后续不再执行。

## 和 Timer 的区别

| 对比项 | Timer | ScheduledThreadPoolExecutor |
|---|---|---|
| 执行线程 | 单线程 | 可多线程 |
| 异常影响 | 任务异常可能导致 Timer 线程终止 | 单个任务异常不影响线程池整体 |
| 任务阻塞 | 一个任务慢会拖住后续所有任务 | 可通过多核心线程并行处理 |
| 时间基准 | 依赖系统时间 | 使用纳秒级相对时间，受系统时间调整影响更小 |
| 生产推荐 | 不推荐 | 推荐 |

所以在生产代码里，一般不再推荐使用 `Timer`，而是优先使用 `ScheduledThreadPoolExecutor` 或更成熟的调度框架。

## 实战场景

### 场景一：本机定时巡检

比如每隔 30 秒检查一次本机缓存状态、连接池状态、磁盘占用等。这种任务只影响当前 JVM，用 `ScheduledThreadPoolExecutor` 很合适。

### 场景二：延迟重试

某个操作失败后，不想立即重试，可以使用 `schedule` 做一次延迟重试。但如果需要可靠重试、持久化、失败补偿，应该用 MQ 延迟队列或任务表，而不是只依赖内存线程池。

### 场景三：定期同步

例如每分钟从配置中心拉取配置、刷新本地缓存。建议使用 `scheduleWithFixedDelay`，并给远程调用设置超时时间，避免任务卡住。

## 不适合的场景

`ScheduledThreadPoolExecutor` 是单 JVM 内存级调度，不适合这些场景：

1. 分布式环境下只允许一个节点执行的任务。
2. 任务必须持久化，进程重启后不能丢。
3. 需要错过补偿、失败重试、可视化管理。
4. 大规模复杂任务编排。

这些场景应考虑 XXL-JOB、ElasticJob、Quartz 集群模式、MQ 延迟消息或数据库任务表。

## 高频追问

### 1. 周期任务抛异常后还会继续执行吗？

不会。对于 `scheduleAtFixedRate` 和 `scheduleWithFixedDelay` 提交的周期任务，如果某次执行抛出未捕获异常，后续执行会被取消。因此周期任务内部一定要 `try-catch`，避免因为一次异常导致定时任务悄悄停掉。

### 2. scheduleAtFixedRate 会并发执行同一个任务吗？

不会。同一个周期任务不会因为上一次没执行完就并发启动下一次。如果任务执行时间超过 period，下一次会在上一次结束后尽快执行，但不会重叠执行。

### 3. 为什么 maximumPoolSize 基本无效？

因为 `ScheduledThreadPoolExecutor` 使用无界的 `DelayedWorkQueue`，任务通常会进入队列等待触发，而不是触发扩容到 `maximumPoolSize` 的逻辑。实际可用并发主要由 `corePoolSize` 决定。

### 4. 线程池关闭后延迟任务会怎样？

可以通过策略控制，例如：

- `setExecuteExistingDelayedTasksAfterShutdownPolicy`：关闭后是否继续执行已有延迟任务。
- `setContinueExistingPeriodicTasksAfterShutdownPolicy`：关闭后是否继续执行已有周期任务。
- `setRemoveOnCancelPolicy`：取消任务后是否从队列移除，避免大量取消任务堆积。

### 5. 为什么不用 while(true) + sleep？

手写循环可读性差、异常处理容易遗漏、关闭不优雅，也不方便统一管理线程池。`ScheduledThreadPoolExecutor` 提供了标准的调度、取消、关闭和 Future 管理能力，更适合工程代码。

## 易错点

1. 不捕获周期任务异常，导致任务执行一次失败后永久停止。
2. 混淆 fixedRate 和 fixedDelay，导致任务压力不可控。
3. 认为调大 `maximumPoolSize` 可以提升并发，忽略核心线程数才关键。
4. 把本机内存级调度当成分布式可靠调度使用。
5. 定时任务里调用外部接口却不设置超时，导致工作线程被长期占用。
6. 使用 `Executors.newScheduledThreadPool` 但不给线程命名，线上排查困难。

## 总结

`ScheduledThreadPoolExecutor` 是 Java 中执行延迟和周期任务的标准工具。面试回答要抓住三点：**延迟队列、fixedRate/fixedDelay 区别、异常会终止周期任务**。生产使用时则要关注异常兜底、任务耗时、线程隔离、优雅关闭以及是否需要分布式可靠调度。
