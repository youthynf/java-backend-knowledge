# synchronized与ReentrantLock场景分析

synchronized与ReentrantLock场景分析
如何选择
•  简单的同步块：synchronized（代码简洁）
•  需要可中断、超时、公平锁：ReentrantLock
•  多条件变量（如生产者-消费者）：ReentrantLock + Condition
•  高并发复杂逻辑：ReentrantLock；
总结
synchronized：
•  简单易用，自动管理锁，适合大多数基本同步需求。
•  功能有限（不支持中断、超时、公平锁等）。

ReentrantLock：
•  提供更灵活的锁控制（可中断、超时、公平锁、多条件变量）。
•  需手动管理锁，容易遗漏 unlock() 导致死锁。

推荐
•  优先使用 synchronized（除非需要高级功能）。
•  在复杂场景（如线程池、高性能并发）下选择 ReentrantLock。

## 面试总结

围绕「synchronized与ReentrantLock场景分析」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

### 核心回答

1. synchronized 基于对象监视器实现互斥和可见性，进入/退出临界区天然建立 happens-before。
2. 锁对象不同，保护的共享资源范围就不同；锁升级会经历偏向、轻量级、重量级等阶段。
3. 和 ReentrantLock 相比，synchronized 语法简单自动释放，ReentrantLock 提供可中断、超时、公平、多个条件队列。

### 高频追问

- 锁升级为什么不能随意降级？
- wait/notify 为什么必须在同步块内？
- 如何选择 synchronized 和 ReentrantLock？

### 实战落地

- **选型前**：先判断是互斥访问、线程协作、任务编排，还是限流隔离。
- **编码时**：控制共享变量范围，明确锁对象、超时策略、异常处理和资源释放。
- **上线后**：观察线程数、队列长度、阻塞时间、拒绝次数和 RT 抖动，必要时用线程 Dump 验证。

### 易错点

- 不要锁可变对象或字符串常量。
- 减少锁粒度但不能破坏共享状态的一致性。
