# 并发关键字

本目录覆盖 Java 并发的核心关键字与内存模型规则：synchronized、volatile、final 的底层原理，以及 JMM 的 Happens-Before 原则。这些是写出线程安全代码的理论基础。

## 目录

- [synchronized 基本原理是什么？](synchronized基本原理是什么？.md) — Mark Word / Monitor / 锁升级（无锁→偏向→轻量级→重量级）
- [volatile 基本原理是什么？](volatile基本原理是什么？.md) — 内存屏障（LoadLoad/StoreStore/LoadStore/StoreLoad）/ 可见性 / 禁止重排序 / DCL 单例
- [Happens-Before 原则是什么？](Happens-Before原则是什么？.md) — JMM 8 大规则与传递性
- [final 重排序规则是什么？](final重排序规则是什么？.md) — 写 final 域 / 读 final 域 / 引用类型 final 域的内存屏障约束
- [synchronized 与 ReentrantLock 区别是什么？](synchronized与ReentrantLock区别是什么？.md) — 实现层级、可中断、超时、公平、多 Condition 全维度对比
- [synchronized 与 volatile 有什么区别？](synchronized与volatile有什么区别？.md) — 互斥性、原子性、可见性、性能开销对比

## 关联阅读

- [公平锁与非公平锁实现原理与区别是什么？](../JUC/公平锁与非公平锁实现原理与区别是什么？.md) — 公平锁与非公平锁的 AQS 实现
- [悲观锁和乐观锁的区别是什么？](../JUC/悲观锁和乐观锁的区别是什么？.md) — 悲观锁与乐观锁对比
- [Java 有哪些锁？](../basics/Java有哪些锁？.md) — 锁分类总览

## 学习建议

1. 先看 **synchronized 基本原理** 和 **volatile 基本原理**，理解两大关键字的底层机制。
2. 再看 **Happens-Before 原则**，把零散的可见性规则串成体系。
3. 接着看 **final 重排序规则**，理解不可变对象的初始化安全。
4. 最后看两篇对比文章，建立 synchronized / ReentrantLock / volatile 的选型判断。

学完本目录后，可继续看 [JUC](../JUC/) 中 AQS、ReentrantLock、并发集合的实现细节。
