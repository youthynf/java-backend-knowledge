# JUC线程池之ScheduledThreadPoolExecutor详解

JUC线程池之ScheduledThreadPoolExecutor详解
一、概述
ScheduledThreadPoolExecutor是Java并发包 (java.util.concurrent) 提供的定时任务线程池，用于执行延迟任务和周期性任务。它继承自ThreadPoolExecutor，并基于优先级队列和任务调度算法实现高效的任务调度。

二、核心特性
支持两种任务调度：
•  延迟任务（schedule）：在指定延迟后执行一次。
•  周期性任务（scheduleAtFixedRate/scheduleWithFixedDelay）：按固定间隔或固定延迟重复执行。

底层数据结构：
•  使用DelayedWorkQueue（优先级队列）管理任务，确保任务按执行时间排序。

线程池优化：
•  继承ThreadPoolExecutor，但核心线程数固定（不会回收），适合长期运行的定时任务。

三、核心源码分析
任务封装：ScheduledFutureTask
ScheduledThreadPoolExecutor将任务封装为ScheduledFutureTask，包含：
•  任务执行时间（time）：基于System.nanoTime()计算。
•  周期（period）：
- > 0：固定频率（scheduleAtFixedRate）。
- < 0：固定延迟（scheduleWithFixedDelay）。
- = 0：一次性任务（schedule）。

private class ScheduledFutureTask<V> extends FutureTask<V> implements RunnableScheduledFuture<V> {
   private long time;          // 任务执行时间（纳秒）
   private final long period;  // 周期（纳秒）
   // ...
}

任务队列：DelayedWorkQueue
•  基于堆结构（类似PriorityQueue）实现，按任务的time排序。
•  队首任务总是最先执行的任务。
•  插入/取出操作时间复杂度为 O(log n)。

static class DelayedWorkQueue extends AbstractQueue<Runnable> implements BlockingQueue<Runnable> {
   private RunnableScheduledFuture<?>[] queue; // 堆数组
   // ...
}

任务调度流程
•  提交任务（schedule/scheduleAtFixedRate/scheduleWithFixedDelay）

public ScheduledFuture<?> schedule(Runnable command, long delay, TimeUnit unit) {
   // 封装为 ScheduledFutureTask
   ScheduledFutureTask<Void> task = new ScheduledFutureTask<>(command, null, triggerTime(delay, unit));
   // 添加到延迟队列
   delayedExecute(task);
   return task;
}

•  执行任务（delayedExecute）

private void delayedExecute(RunnableScheduledFuture<?> task) {
   if (isShutdown()) {
       reject(task); // 线程池已关闭，拒绝任务
   } else {
       super.getQueue().add(task); // 加入 DelayedWorkQueue
       if (isShutdown() && !canRunInShutdown(task)) {
           task.cancel(false); // 检查线程池状态
       } else {
           ensurePrestart(); // 确保至少有一个线程在运行
       }
   }
}

工作线程（Worker）从队列获取任务
•  工作线程调用DelayedWorkQueue.take()，阻塞等待队首任务到达执行时间。
•  执行任务后，周期性任务会重新计算下次执行时间并重新入队。

public RunnableScheduledFuture<?> take() throws InterruptedException {
   for (;;) {
       RunnableScheduledFuture<?> first = queue[0];
       if (first == null) {
           available.await(); // 队列空，等待
       } else {
           long delay = first.getDelay(NANOSECONDS);
           if (delay <= 0) {
               return finishPoll(first); // 任务到期，取出执行
           }
           available.awaitNanos(delay); // 未到期，阻塞等待
       }
   }
}

四、两种周期性任务的区别
scheduleAtFixedRate（固定频率）
•  按任务开始时间 + period 计算下次执行时间。
•  如果某次执行超时，后续任务会追赶进度（可能连续执行多次）。
适用场景：需要严格按固定间隔执行的任务（如定时统计）。
scheduleWithFixedDelay（固定延迟）
•  按任务结束时间 + delay 计算下次执行时间。
•  保证每次执行之间的间隔固定，不受任务执行时间影响。
适用场景：需要保证任务间有固定间隔（如心跳检测）。
五、关键问题解答
Q1: 为什么使用DelayedWorkQueue而不是普通队列？
•  普通队列（如LinkedBlockingQueue）无法按时间排序，而DelayedWorkQueue能高效管理延迟任务。

Q2: 如果任务执行抛出异常，周期性任务会终止吗？
•  会终止！需要在任务内部捕获异常，否则后续周期不会执行。

Q3: 如何关闭ScheduledThreadPoolExecutor？
•  调用shutdown()：平缓关闭，执行完已提交任务。
•  调用shutdownNow()：立即关闭，尝试中断所有任务。

六、使用示例
延迟任务

ScheduledExecutorService executor = Executors.newScheduledThreadPool(2);
executor.schedule(() -> System.out.println("Task executed!"), 5, TimeUnit.SECONDS);

固定频率任务

executor.scheduleAtFixedRate(() -> {
   System.out.println("Fixed Rate Task: " + System.currentTimeMillis());
}, 0, 1, TimeUnit.SECONDS);

固定延迟任务

executor.scheduleWithFixedDelay(() -> {
   System.out.println("Fixed Delay Task: " + System.currentTimeMillis());
}, 0, 1, TimeUnit.SECONDS);

## 面试总结

围绕「JUC线程池之ScheduledThreadPoolExecutor详解」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

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
