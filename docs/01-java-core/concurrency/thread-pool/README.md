# 线程池

这一部分重点理解线程协作、锁、内存可见性、AQS 与线程池治理。面试中通常会从 API 使用追问到底层状态流转、阻塞唤醒和生产事故排查。

## 面试复习重点

- 线程池核心参数、队列选择、拒绝策略和线程生命周期。
- CPU 密集/IO 密集任务的容量估算、隔离和监控指标。
- 线程池耗尽、任务堆积、上下文丢失和优雅关闭的排查方案。

## 建议掌握程度

- **能讲清概念**：先用自己的话解释定义、背景和解决的问题。
- **能画出链路**：把核心流程、关键组件和状态变化串起来。
- **能回答追问**：准备优缺点、适用场景、常见坑和替代方案。
- **能落地排查**：结合日志、指标、工具和案例说明如何定位问题。

## 文章导航

- [如何撤回提交给线程池中的任务？](/01-java-core/concurrency/thread-pool/如何撤回提交给线程池中的任务？.md)
- [如何使用Executors工具类创建线程池？](/01-java-core/concurrency/thread-pool/如何使用Executors工具类创建线程池？.md)
- [为什么核心线程池满了之后是先加入阻塞队列而不是直接创建线程？](/01-java-core/concurrency/thread-pool/为什么核心线程池满了之后是先加入阻塞队列而不是直接创建线程？.md)
- [线程池为什么一定使用阻塞队列？](/01-java-core/concurrency/thread-pool/线程池为什么一定使用阻塞队列？.md)
- [线程池有哪些状态？](/01-java-core/concurrency/thread-pool/线程池有哪些状态？.md)
- [线程池中的线程是如何关闭的？](/01-java-core/concurrency/thread-pool/线程池中的线程是如何关闭的？.md)
- [线程池中核心线程数如何设置？](/01-java-core/concurrency/thread-pool/线程池中核心线程数如何设置？.md)
- [线程发生异常，会被移出线程池吗](/01-java-core/concurrency/thread-pool/线程发生异常，会被移出线程池吗.md)
- [ComletableFuture入门详解](/01-java-core/concurrency/thread-pool/ComletableFuture入门详解.md)
- [CompletableFuture底层原理详解](/01-java-core/concurrency/thread-pool/CompletableFuture底层原理详解.md)
- [Java的并发模型如何理解？](/01-java-core/concurrency/thread-pool/Java的并发模型如何理解？.md)
- [ThreadPoolExecutor线程池任务执行流程是怎么样的？](/01-java-core/concurrency/thread-pool/ThreadPoolExecutor线程池任务执行流程是怎么样的？.md)
- [ThreadPoolExecutor线程池有哪些拒绝策略？](/01-java-core/concurrency/thread-pool/ThreadPoolExecutor线程池有哪些拒绝策略？.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
