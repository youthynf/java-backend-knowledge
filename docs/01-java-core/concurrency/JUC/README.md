# JUC 并发工具

本目录覆盖 Java 并发工具包（`java.util.concurrent`）的核心组件：底层框架（AQS、LockSupport）、显式锁、同步器、并发集合、阻塞队列、线程池和异步任务。

## 目录

### 入门与基础

- [JUC 是什么](JUC是什么？.md) — JUC 七大模块和底层四件套（volatile / CAS / AQS / LockSupport）
- [悲观锁和乐观锁的区别是什么](悲观锁和乐观锁的区别是什么？.md) — 两种并发控制思想的对比与 CAS 的缺点
- [公平锁与非公平锁实现原理与区别是什么](公平锁与非公平锁实现原理与区别是什么？.md) — AQS 中 `hasQueuedPredecessors` 的关键作用

### 底层框架

- [AQS 是什么](AQS是什么？.md) — `state` + FIFO 双向队列 + 独占/共享模式 + 模板方法
- [CLH 队列锁是什么](CLH队列锁是什么？.md) — CLH 自旋锁原理与 AQS 的关系
- [LockSupport 如何使用](LockSupport如何使用？.md) — `park/unpark` 许可证模型与 `wait/notify` 的区别

### 显式锁

- [ReentrantLock 如何使用](ReentrantLock如何使用？.md) — 可重入互斥锁、公平/非公平、`Condition`
- [ReentrantReadWriteLock 如何使用](ReentrantReadWriteLock如何使用？.md) — 读写锁、state 高低 16 位编码、锁降级

### 同步工具

- [CountDownLatch 如何使用](CountDownLatch如何使用？.md) — 一次性倒计时门闩，基于 AQS 共享模式
- [CyclicBarrier 如何使用](CyclicBarrier如何使用？.md) — 循环屏障，基于 `ReentrantLock + Condition`
- [Semaphore 如何使用](Semaphore如何使用？.md) — 信号量限流，基于 AQS 共享模式
- [Phaser 如何使用](Phaser如何使用？.md) — 多阶段动态参与者同步器
- [Exchanger 如何使用](Exchanger如何使用？.md) — 两个线程双向数据交换，slot + arena

### 并发集合

- [ConcurrentHashMap 如何实现线程安全](ConcurrentHashMap如何实现线程安全？.md) — JDK 7 分段锁 vs JDK 8 CAS + synchronized 桶锁 + CounterCell
- [ConcurrentLinkedQueue 如何实现无锁](ConcurrentLinkedQueue如何实现无锁？.md) — Michael & Scott 算法、HOPS 延迟更新
- [CopyOnWriteArrayList 如何实现读写分离](CopyOnWriteArrayList如何实现读写分离？.md) — 写时复制、volatile 数组、弱一致迭代器
- [BlockingQueue 如何选择](BlockingQueue如何选择？.md) — 七种阻塞队列的选型对比

### 线程池与异步

- [ThreadPoolExecutor 如何工作](ThreadPoolExecutor如何工作？.md) — 七参数、四步执行流程、`ctl` 状态机、拒绝策略
- [ScheduledThreadPoolExecutor 如何使用](ScheduledThreadPoolExecutor如何使用？.md) — `DelayedWorkQueue` 堆、fixedRate vs fixedDelay
- [Fork-Join 框架是什么](Fork-Join框架是什么？.md) — 分治并行、工作窃取、双端队列 LIFO+FIFO
- [FutureTask 如何使用](FutureTask如何使用？.md) — `RunnableFuture` 双重身份、状态机、`cancel` 协作式中断
