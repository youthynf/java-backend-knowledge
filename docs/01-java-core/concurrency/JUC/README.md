# JUC 并发工具

这一部分重点理解线程协作、锁、内存可见性、AQS 与线程池治理。面试中通常会从 API 使用追问到底层状态流转、阻塞唤醒和生产事故排查。

## 面试复习重点

- AQS 的 state、CLH 队列、独占/共享模式如何支撑锁和同步器。
- ReentrantLock、Semaphore、CountDownLatch、CyclicBarrier 等工具的适用场景和边界。
- 阻塞、唤醒、中断、超时、公平性等并发语义如何影响线上稳定性。

## 建议掌握程度

- **能讲清概念**：先用自己的话解释定义、背景和解决的问题。
- **能画出链路**：把核心流程、关键组件和状态变化串起来。
- **能回答追问**：准备优缺点、适用场景、常见坑和替代方案。
- **能落地排查**：结合日志、指标、工具和案例说明如何定位问题。

## 文章导航

- [悲观锁和乐观锁的区别是什么？](/01-java-core/concurrency/JUC/悲观锁和乐观锁的区别是什么？.md)
- [公平锁与非公平锁实现原理与区别是什么？](/01-java-core/concurrency/JUC/公平锁与非公平锁实现原理与区别是什么？.md)
- [AQS是什么？](/01-java-core/concurrency/JUC/AQS是什么？.md)
- [CLH队列锁是什么？](/01-java-core/concurrency/JUC/CLH队列锁是什么？.md)
- [JUC都有哪些类？](/01-java-core/concurrency/JUC/JUC都有哪些类？.md)
- [JUC工具类之Semaphore详解](/01-java-core/concurrency/JUC/JUC工具类之Semaphore详解.md)
- [JUC工具类-CountDownLatch详解](/01-java-core/concurrency/JUC/JUC工具类-CountDownLatch详解.md)
- [JUC工具类-CyclicBarrier详解](/01-java-core/concurrency/JUC/JUC工具类-CyclicBarrier详解.md)
- [JUC工具类-Exchanger详解](/01-java-core/concurrency/JUC/JUC工具类-Exchanger详解.md)
- [JUC工具类-Phaser详解](/01-java-core/concurrency/JUC/JUC工具类-Phaser详解.md)
- [JUC集合之BlockingQueue详解](/01-java-core/concurrency/JUC/JUC集合之BlockingQueue详解.md)
- [JUC集合之ConcurrentHashMap详解](/01-java-core/concurrency/JUC/JUC集合之ConcurrentHashMap详解.md)
- [JUC集合之ConcurrentLinkedQueue详解](/01-java-core/concurrency/JUC/JUC集合之ConcurrentLinkedQueue详解.md)
- [JUC集合之CopyOnWriteArrayList详解](/01-java-core/concurrency/JUC/JUC集合之CopyOnWriteArrayList详解.md)
- [JUC是什么？](/01-java-core/concurrency/JUC/JUC是什么？.md)
- [JUC锁之LockSupport详解](/01-java-core/concurrency/JUC/JUC锁之LockSupport详解.md)
- [JUC锁之ReentrantLock详解](/01-java-core/concurrency/JUC/JUC锁之ReentrantLock详解.md)
- [JUC锁之ReentrantReadWriteLock详解](/01-java-core/concurrency/JUC/JUC锁之ReentrantReadWriteLock详解.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
