# ThreadPoolExecutor线程池任务执行流程是怎么样的？

ThreadPoolExecutor线程池任务执行流程是怎么样的？
ThreadPoolExecutor提供了有返回值和无返回值的执行任务的方法：
void execute(Runnable command)：无返回值的任务提交
Future submit(Runnable task)：提交Runnable任务，获取执行结果
Future submit(Runnable task, T result)：提交Runnable任务并指定执行结果
Future submit(Callabletask)：提交Callable任务
其中submit实际上最终还是调用execute方法，只是增加返回一个Future对象，用来获取任务执行结果。

execute(Runnable command)方法执行步骤：
提交Runnable时，不管当前线程是否存在空闲线程，只要线程数量小于核心线程数，则创建新的线程，否则加入等待队列；
如果等待队列已满，则判断当前线程数是否小于最大线程数，如果是则创建新的线程执行，并将当前Runnable作为线程的第一个执行任务；
如果线程数大于等于最大线程数，且等待队列已满，则新增的Runnable任务将会执行指定的拒绝策略。
助记：优先创建核心线程，不管线程是否空闲，直到达到核心线程数；其次加入阻塞队列，直到队列已满；再次创建线程，直到达到最大线程数；最后执行拒绝策略。

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **ThreadPoolExecutor线程池任务执行流程是怎么样的？**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

线程池相关问题要围绕 `ThreadPoolExecutor` 的核心参数、任务提交流程和生命周期来回答：先看核心线程数、最大线程数、阻塞队列、拒绝策略，再看任务执行过程中线程如何复用、如何退出、异常如何处理。生产中不建议无脑使用 `Executors` 的快捷方法，应根据业务类型配置有界队列、命名线程工厂、拒绝策略和监控指标。

## 深挖追问

- `execute()` 和 `submit()` 在异常表现、返回值上的区别是什么？
- 核心线程、非核心线程分别什么时候创建和回收？
- 阻塞队列选择无界、有界、同步移交队列时，对吞吐和稳定性有什么影响？
- 拒绝策略应该如何和降级、限流、告警结合？

## 实战场景/代码示例

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
        8,
        16,
        60, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(1000),
        r -> new Thread(r, "biz-worker-" + r.hashCode()),
        new ThreadPoolExecutor.CallerRunsPolicy()
);

try {
    executor.execute(() -> {
        // 业务逻辑：注意捕获异常、设置超时、避免无限阻塞
    });
} finally {
    // 应用停止时再统一 shutdown，不要每提交一个任务就关闭线程池
}
```

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

