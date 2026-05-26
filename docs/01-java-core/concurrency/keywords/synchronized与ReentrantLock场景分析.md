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
