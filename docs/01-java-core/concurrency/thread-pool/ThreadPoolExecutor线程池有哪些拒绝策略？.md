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

## 面试总结

围绕「ThreadPoolExecutor线程池有哪些拒绝策略？」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

### 核心回答

1. 线程池通过复用线程降低创建销毁成本，并用队列、拒绝策略和参数控制并发压力。
2. 核心参数要结合任务类型、RT、吞吐、下游容量和机器资源一起评估。
3. 线上重点关注活跃线程数、队列积压、拒绝次数、任务耗时和异常吞噬。

### 高频追问

- 为什么不建议直接使用 Executors 默认工厂？
- CPU 密集型和 IO 密集型线程数如何估算？
- 队列满、线程满、下游慢时如何降级和止血？

### 实战落地

- **选型前**：先判断是互斥访问、线程协作、任务编排，还是限流隔离。
- **编码时**：控制共享变量范围，明确锁对象、超时策略、异常处理和资源释放。
- **上线后**：观察线程数、队列长度、阻塞时间、拒绝次数和 RT 抖动，必要时用线程 Dump 验证。

### 易错点

- 不要使用无界队列掩盖流量问题。
- 异步任务要显式处理异常、超时和上下文传递。
