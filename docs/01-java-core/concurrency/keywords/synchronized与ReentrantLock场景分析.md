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

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **synchronized与ReentrantLock场景分析**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

并发关键字要从 Java 内存模型（JMM）角度回答：它们分别解决可见性、有序性、原子性或互斥问题。`volatile` 更偏向可见性和禁止特定重排序，不保证复合操作原子性；`synchronized` 提供互斥和可见性；`final` 关注安全发布和初始化语义。回答时要区分“能保证什么”和“不能保证什么”。

## 深挖追问

- 可见性、原子性、有序性分别是什么？
- `volatile` 为什么不能替代锁？
- `synchronized` 的锁对象是什么？锁升级或优化大致解决什么问题？
- Happens-Before 规则如何帮助我们判断线程间可见性？

## 实战场景/代码示例

```java
class ConfigHolder {
    private volatile boolean initialized;

    void init() {
        // 初始化配置
        initialized = true; // 写 volatile，发布初始化完成信号
    }

    boolean ready() {
        return initialized; // 读 volatile，看到其他线程写入结果
    }
}
```

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

