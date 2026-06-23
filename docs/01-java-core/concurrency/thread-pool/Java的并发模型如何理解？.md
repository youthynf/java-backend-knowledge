# Java的并发模型如何理解？

Java的并发模型如何理解？
Java并发控制的是线程还是进程？
Java的并发模型主要基于线程（Thread），而不是进程。

线程 vs 进程的区别
资源占用: 线程共享进程内存(堆, 方法区), 而进程拥有独立的内存空间;
创建开销: 线程是轻量级的, 约栈1MB占内存, 而进程是重量级的, 需要独立分配内存空间;
通信方式: 线程间能直接共享对象(需同步控制), 而进程则需要IPC(管道, Socket, 共享内存);
隔离性: 线程崩溃可能导致整个进程终止, 而进程崩溃不影响其他进程.

Java的并发模型
基于线程的实现
•  java.lang.Thread：基础线程类;
•  线程池（ExecutorService）**：管理线程生命周期;
•  并发工具包（JUC）：
- ReentrantLock、Semaphore、CountDownLatch等控制线程同步;
- ConcurrentHashMap、BlockingQueue等线程安全容器;

为何不直接控制进程？
•  JVM设计限制：单进程多线程模型;
•  跨进程通信成本高：需通过JNI调用OS API或网络通信;
•  内存共享优势：线程间直接访问堆内存效率更高;

例外情况
虽然Java主推线程级并发，但在特定场景会涉及进程：
•  多JVM实例：

Runtime.exec("java MyApp"); // 启动新进程

•  分布式系统：
- 通过Socket/RPC跨进程通信
- 例如：Dubbo、gRPC等框架

•  Process API（Java 9+）：

ProcessHandle.current().pid(); // 获取进程ID

性能对比
计算密集型: 线程方案需要控制线程数≤CPU核心数, 而进程方案则支持跨机器扩展;
I/O密集型: 线程方案比较适合, 采用NIO+多线程, 而进程方案上下文切换成本高;
容错需求: 线程崩溃影响大, 进程隔离更安全.
代码示例

线程并发

ExecutorService pool = Executors.newFixedThreadPool(4);
pool.submit(() -> System.out.println(Thread.currentThread().getName()));
pool.shutdown();

进程并发

ProcessBuilder pb = new ProcessBuilder("java", "-version");
Process p = pb.start();
p.waitFor(); // 等待子进程结束

总结
•  Java并发核心是线程级（Thread），因共享内存高效
•  进程级并发需借助外部机制（多JVM/分布式系统）
•  选择依据：数据共享需求 vs 隔离性需求

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **Java的并发模型如何理解？**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

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

