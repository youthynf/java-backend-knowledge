# JUC线程池之Fork-Join框架详解

## 核心概念

Fork-Join 是 JUC 提供的一套并行计算框架，核心思想是“分而治之”：把一个大任务拆成多个小任务并行执行，最后把小任务结果合并成最终结果。

它主要由三部分组成：

- `ForkJoinPool`：执行 Fork-Join 任务的线程池。
- `ForkJoinTask`：可被拆分、调度和合并的任务抽象。
- 工作窃取算法：让空闲线程从其他工作线程队列中“偷”任务执行，提高 CPU 利用率。

一句话：**Fork-Join 适合 CPU 密集型、可递归拆分、子任务相对独立、最终需要汇总结果的并行计算场景。**

## 面试官想考什么

面试问 Fork-Join，一般不是只问 API，而是考这些点：

1. 是否理解分治思想和任务拆分边界。
2. 是否知道 `ForkJoinPool` 与普通 `ThreadPoolExecutor` 的差异。
3. 是否理解工作窃取算法为什么能提升并行效率。
4. 是否知道 `RecursiveTask` 与 `RecursiveAction` 的区别。
5. 是否能说出 Fork-Join 的适用场景和不适用场景。

## 标准回答

可以这样回答：

> Fork-Join 是 Java 7 引入的并行计算框架，位于 JUC 包中。它把一个大任务递归拆成多个小任务，小任务并行执行后再合并结果。它的核心线程池是 `ForkJoinPool`，任务抽象是 `ForkJoinTask`，常用子类有返回结果的 `RecursiveTask` 和无返回结果的 `RecursiveAction`。
>
> Fork-Join 的一个关键优化是工作窃取。每个工作线程维护自己的双端队列，自己通常从队尾取任务执行；当某个线程空闲时，会从其他线程队列的队头偷任务执行，这样可以减少线程空闲，提高 CPU 利用率。
>
> 它适合 CPU 密集型、能拆分、子任务独立的计算，比如数组求和、排序、树遍历。不适合大量阻塞 IO、任务拆分过细、子任务强依赖或需要严格顺序的场景。

## 核心组件

### 1. ForkJoinPool

`ForkJoinPool` 是执行 Fork-Join 任务的线程池。它和普通线程池最大的区别是：普通线程池通常从共享阻塞队列取任务，而 ForkJoinPool 中每个工作线程都有自己的工作队列，并配合工作窃取提升负载均衡能力。

常用提交方式：

```java
ForkJoinPool pool = new ForkJoinPool();
Long result = pool.invoke(new SumTask(array, 0, array.length));
```

`invoke()` 会同步等待任务完成并返回结果。也可以使用 `submit()` 异步提交任务，返回 `ForkJoinTask`。

### 2. ForkJoinTask

`ForkJoinTask` 是任务抽象，常用子类包括：

- `RecursiveTask<V>`：有返回值的递归任务。
- `RecursiveAction`：无返回值的递归任务。
- `CountedCompleter`：更复杂的异步完成任务，使用门槛较高。

使用时通常继承 `RecursiveTask` 或 `RecursiveAction`，重写 `compute()` 方法。

### 3. fork 与 join

- `fork()`：把子任务异步提交到当前工作线程的队列中。
- `join()`：等待子任务执行完成并获取结果。

常见写法是拆分为左右两个子任务：

```java
left.fork();
long rightResult = right.compute();
long leftResult = left.join();
return leftResult + rightResult;
```

这种写法让当前线程直接计算其中一个分支，减少不必要的任务入队和调度开销。

## 工作窃取算法

ForkJoinPool 的每个工作线程维护一个双端队列。正常情况下，线程从自己队列尾部以 LIFO 顺序取任务，这样有利于局部性；当线程空闲时，会从其他线程队列头部以 FIFO 顺序窃取任务，减少竞争。

工作窃取带来的好处：

1. 减少所有线程争抢同一个全局队列的竞争。
2. 空闲线程可以主动找活干，提高 CPU 利用率。
3. LIFO 执行本地任务有利于递归任务尽快向下拆分。
4. FIFO 窃取较老任务有利于偷到更大的任务块。

但它不是万能的。如果任务会频繁阻塞，工作线程被卡住，窃取算法也无法充分发挥作用。

## 代码示例：并行数组求和

```java
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.RecursiveTask;

public class ForkJoinSumDemo {
    static class SumTask extends RecursiveTask<Long> {
        private static final int THRESHOLD = 10_000;
        private final int[] array;
        private final int start;
        private final int end;

        SumTask(int[] array, int start, int end) {
            this.array = array;
            this.start = start;
            this.end = end;
        }

        @Override
        protected Long compute() {
            int length = end - start;
            if (length <= THRESHOLD) {
                long sum = 0;
                for (int i = start; i < end; i++) {
                    sum += array[i];
                }
                return sum;
            }

            int middle = start + length / 2;
            SumTask left = new SumTask(array, start, middle);
            SumTask right = new SumTask(array, middle, end);

            left.fork();
            long rightResult = right.compute();
            long leftResult = left.join();
            return leftResult + rightResult;
        }
    }

    public static void main(String[] args) {
        int[] array = new int[1_000_000];
        for (int i = 0; i < array.length; i++) {
            array[i] = 1;
        }

        ForkJoinPool pool = new ForkJoinPool();
        long result = pool.invoke(new SumTask(array, 0, array.length));
        System.out.println(result);
    }
}
```

这个例子里，阈值 `THRESHOLD` 很关键。阈值太大，并行度不够；阈值太小，任务拆分和调度成本可能超过计算收益。

## 实战场景

### 场景一：大数组或集合并行计算

比如批量计算订单金额、统计指标、批量评分等，只要每个元素计算相对独立，就可以考虑 Fork-Join 或并行流。

关键是保证任务主要消耗 CPU，而不是大量等待数据库、Redis、HTTP 接口。

### 场景二：递归结构遍历

目录扫描、树形结构聚合、组织架构统计等天然适合递归拆分。每个节点可以拆成多个子节点任务，再汇总结果。

如果遍历过程中包含大量 IO，需要谨慎使用默认公共池，避免阻塞影响其他并行任务。

### 场景三：并行排序或分治算法

归并排序、快速排序、矩阵运算等分治算法可以用 Fork-Join 表达。但生产中应优先评估 JDK 或成熟库已有实现，避免重复造轮子。

## 和 ThreadPoolExecutor 的区别

| 对比项 | ForkJoinPool | ThreadPoolExecutor |
|---|---|---|
| 典型场景 | 分治并行计算 | 通用异步任务执行 |
| 队列模型 | 每个工作线程一个双端队列 | 通常一个共享阻塞队列 |
| 调度机制 | 工作窃取 | 从任务队列取任务 |
| 任务特点 | 可拆分、可合并、CPU 密集 | IO、业务任务、后台任务都可 |
| 常用任务 | `RecursiveTask` / `RecursiveAction` | `Runnable` / `Callable` |

总结：**通用业务异步优先用 `ThreadPoolExecutor`；递归分治计算才优先考虑 Fork-Join。**

## 和 parallelStream 的关系

Java 8 的并行流底层默认使用公共的 `ForkJoinPool.commonPool()`。这意味着：

1. 多处并行流可能共享同一个公共池，互相影响。
2. 如果并行流中执行阻塞 IO，可能拖慢其他使用公共池的任务。
3. 并行流不一定比串行流快，小集合或轻量操作反而可能更慢。

面试中可以补一句：并行流写起来简单，但生产中要关注公共池竞争、阻塞操作和可观测性问题。

## 高频追问

### 1. RecursiveTask 和 RecursiveAction 有什么区别？

`RecursiveTask<V>` 有返回值，适合求和、统计、计算结果等场景；`RecursiveAction` 没有返回值，适合并行处理文件、批量更新内存结构等场景。

### 2. fork 多个任务后为什么要 join？

`fork()` 只是提交子任务，不代表子任务已经完成。`join()` 用于等待子任务完成并获取结果。如果只 fork 不 join，父任务无法正确合并结果，也可能让异常被延后或隐藏。

### 3. Fork-Join 适合 IO 密集型任务吗？

通常不适合。Fork-Join 的默认并行度接近 CPU 核数，目标是让 CPU 忙起来。如果任务大量阻塞 IO，工作线程会被占住，整体吞吐下降。IO 密集型任务更适合普通线程池、异步 IO 或响应式模型。

### 4. 阈值怎么设置？

没有固定答案，需要结合任务成本、数据量、CPU 核数和压测结果。原则是：单个子任务要足够大，能抵消拆分和调度成本；同时子任务数量要足够多，能让多个核心并行工作。

### 5. ForkJoinPool.commonPool 有什么风险？

公共池是 JVM 级共享资源，parallelStream、CompletableFuture 默认异步方法等都可能使用它。如果在公共池里执行阻塞任务，可能影响其他模块。生产中重要任务建议使用自定义线程池或明确指定执行器。

## 易错点

1. 任务拆得过细，调度成本超过并行收益。
2. 在 ForkJoinPool 中执行大量阻塞 IO，导致工作线程被占满。
3. 不理解 `fork()` 和 `join()` 的顺序，造成性能变差或结果错误。
4. 盲目使用 parallelStream，以为并行一定更快。
5. 共享可变状态没有保护，导致并行任务出现数据竞争。

## 总结

Fork-Join 是 JUC 中面向分治并行计算的框架。它的核心优势是递归拆分、结果合并和工作窃取。面试回答时要抓住三个关键词：**分治、工作窃取、CPU 密集型**。生产使用时则要重点关注任务粒度、是否阻塞、公共池竞争和压测效果。
