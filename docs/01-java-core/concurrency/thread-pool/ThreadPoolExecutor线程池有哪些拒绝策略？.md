# ThreadPoolExecutor线程池有哪些拒绝策略？

ThreadPoolExecutor线程池有哪些拒绝策略？
四种预置的拒绝策略：
AbortPolicy（默认策略）：直接抛出RejectedExecutionException异常，阻止系统继续运行。
CallerRunsPolicy：由调用线程（提交任务的线程）来执行被拒绝的任务，这样做会降低新任务的提交速度，给线程池一定时间来处理积压的任务。
DiscardOldestPolicy：丢弃任务队列中最旧的（也就是最早进入队列的）那个任务，然后尝试重新提交当前被拒绝的任务。
DiscardPolicy：直接丢弃被拒绝的新任务，不做任何处理，也不会抛出异常。
自定义拒绝策略：通过实现RejectedExecutionHandler接口，实现rejectedExecution()方法来自定义拒绝策略；

自定义拒绝策略步骤
实现RejectedExecutionHandler接口：该接口只有一个方法rejectedExecution(Runnable r, ThreadPoolExecutor executor)，在这个方法中定义当任务被拒绝时的具体处理逻辑；
实现rejectedExecution()方法：可以根据业务需求进行不同的处理，比如将被拒绝的任务记录到日志中、存储到其他的备份队列等待后续处理、发送通知等操作；
助记：四种预设策略：抛RejectedExecutionException异常、提交线程执行、抛弃最久、抛弃新任务； 自定义拒绝策略：实现RejectedExecutionHandler接口，实现rejectedExecution方法。

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **ThreadPoolExecutor线程池有哪些拒绝策略？**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

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

