# 并发基础

本目录覆盖 Java 并发编程的基础知识：线程创建、线程生命周期、线程间通信、阻塞机制、锁概览与 ThreadLocal。这些是理解 JUC、并发关键字、线程池的前置知识。

## 目录

- [Java 线程的创建方式有哪些？](Java线程的创建方式有哪些？.md) — 继承 Thread / 实现 Runnable / Callable + FutureTask / 线程池四种方式与原理
- [Java 基础线程机制是怎么样的？](Java基础线程机制是怎么样的？.md) — sleep / yield / join / interrupt / Daemon / Executor 核心 API
- [线程状态如何转换？](线程状态如何转换？.md) — 6 种 Thread.State 的触发条件与转换路径
- [Java 线程间如何通信？](Java线程间如何通信？.md) — wait/notify、Condition、BlockingQueue、同步工具类
- [Java 线程阻塞机制是什么？](Java线程阻塞机制是什么？.md) — sleep / wait / park / await / BlockingQueue / Future 六类阻塞 API 对比
- [Java 有哪些锁？](Java有哪些锁？.md) — 悲观/乐观、公平/非公平、可重入、独占/共享、synchronized 锁升级总览
- [ThreadLocal 基本原理是什么？](ThreadLocal基本原理是什么？.md) — ThreadLocalMap 数据结构、内存泄漏、InheritableThreadLocal 局限

## 学习建议

1. 先掌握 **线程创建** 和 **线程状态转换**，理解线程的生命周期。
2. 再学 **基础线程机制** 和 **阻塞机制**，搞清楚 sleep / wait / park 的差异。
3. 接着看 **线程间通信**，掌握 wait/notify、Condition、BlockingQueue 三套协作方式。
4. 最后看 **Java 有哪些锁** 和 **ThreadLocal**，建立锁的分类体系和隔离机制认知。

学完本目录后，可继续看 [并发关键字](../keywords/) 和 [JUC](../JUC/)。
