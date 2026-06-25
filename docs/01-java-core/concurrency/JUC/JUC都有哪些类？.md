# JUC都有哪些类？

## 核心概念

JUC 是 `java.util.concurrent` 包的简称，是 Java 为并发编程提供的一整套工具体系。它不是某一个类，而是覆盖了**原子操作、锁、线程池、并发容器、同步工具、阻塞队列、Future 异步模型**等多个模块。

如果只用一句话回答：**JUC 的核心目标是让 Java 开发者在多线程场景下更安全、更高效地完成线程协作、资源竞争控制和异步任务执行。**

常见分类可以这样记：

```text
JUC = 原子类 + 锁 + 并发集合 + 阻塞队列 + 线程池 + 同步工具 + Future/CompletableFuture
```

面试时不要只罗列类名，最好能说清楚每一类解决什么问题、典型代表是什么、适合什么业务场景。

## 面试官想考什么

面试官问“JUC 都有哪些类”，一般不是单纯考背诵，而是想看你是否建立了 Java 并发知识地图：

- 你是否知道 JUC 的主要模块；
- 你是否能区分锁、同步器、并发容器、阻塞队列的职责；
- 你是否理解线程池和 Future 属于任务调度与异步编程体系；
- 你是否知道常见类背后的底层机制，例如 CAS、AQS、volatile、LockSupport；
- 你是否能把类和实际业务场景对应起来。

## 标准回答

JUC 包中的类可以分成七大类：

1. **原子类**：例如 `AtomicInteger`、`AtomicLong`、`AtomicReference`、`LongAdder`，用于无锁线程安全更新。
2. **锁与 AQS 同步器**：例如 `ReentrantLock`、`ReentrantReadWriteLock`、`StampedLock`、`LockSupport`，用于控制共享资源访问。
3. **并发集合**：例如 `ConcurrentHashMap`、`CopyOnWriteArrayList`、`ConcurrentLinkedQueue`，用于多线程安全存取数据。
4. **阻塞队列**：例如 `ArrayBlockingQueue`、`LinkedBlockingQueue`、`PriorityBlockingQueue`、`SynchronousQueue`、`DelayQueue`，常用于生产者消费者模型和线程池任务队列。
5. **线程池与任务调度**：例如 `ThreadPoolExecutor`、`ScheduledThreadPoolExecutor`、`ForkJoinPool`、`Executors`。
6. **同步工具类**：例如 `CountDownLatch`、`CyclicBarrier`、`Semaphore`、`Exchanger`、`Phaser`。
7. **Future 异步编程**：例如 `Future`、`FutureTask`、`CompletableFuture`、`CompletionStage`。

这几类背后的底层技术主要包括：`volatile` 保证可见性，CAS 保证原子更新，AQS 管理同步队列，LockSupport 提供线程阻塞与唤醒能力。

## 分类详解

### 1. 原子类

原子类位于 `java.util.concurrent.atomic` 包中，底层主要依赖 CAS 实现无锁并发更新。

常见类：

- `AtomicInteger`：原子更新 int。
- `AtomicLong`：原子更新 long。
- `AtomicBoolean`：原子更新 boolean。
- `AtomicReference`：原子更新对象引用。
- `AtomicStampedReference`：通过版本号解决 ABA 问题。
- `LongAdder`：高并发计数场景下比 `AtomicLong` 更适合。

典型场景：接口调用次数统计、并发计数器、状态标记、CAS 乐观更新。

### 2. 锁相关类

JUC 提供了比 `synchronized` 更灵活的显式锁。

常见类：

- `ReentrantLock`：可重入互斥锁，支持公平锁、非公平锁、可中断获取锁、超时获取锁。
- `ReentrantReadWriteLock`：读写锁，适合读多写少场景。
- `StampedLock`：支持乐观读，适合读多写少且追求性能的场景。
- `LockSupport`：提供 `park/unpark`，是很多同步组件阻塞唤醒线程的基础。
- `Condition`：配合 `Lock` 实现更灵活的等待/通知机制。

典型场景：库存扣减临界区保护、缓存刷新控制、读多写少的数据访问。

### 3. 并发集合

并发集合用于替代普通集合在多线程下的非线程安全问题。

常见类：

- `ConcurrentHashMap`：高并发 Map，JDK 8 之后主要使用 CAS + synchronized + 红黑树优化。
- `CopyOnWriteArrayList`：写时复制 List，适合读多写少场景。
- `ConcurrentLinkedQueue`：基于 CAS 的非阻塞队列。
- `ConcurrentSkipListMap`：支持排序的并发 Map。

典型场景：本地缓存、在线用户表、路由表、读多写少配置列表。

### 4. 阻塞队列

阻塞队列位于 `java.util.concurrent` 包中，核心特点是：队列为空时消费者可以阻塞等待，队列满时生产者可以阻塞等待。

常见类：

- `ArrayBlockingQueue`：数组实现的有界阻塞队列。
- `LinkedBlockingQueue`：链表实现的阻塞队列，默认近似无界。
- `PriorityBlockingQueue`：支持优先级的无界阻塞队列。
- `SynchronousQueue`：不存储元素，生产和消费必须直接配对。
- `DelayQueue`：延迟队列，元素到期后才能被消费。
- `LinkedTransferQueue`：支持生产者直接向消费者转交元素。

典型场景：生产者消费者模型、线程池任务队列、异步削峰、延迟任务。

### 5. 线程池相关类

线程池用于统一管理线程资源，避免频繁创建和销毁线程。

常见类：

- `ThreadPoolExecutor`：最核心的通用线程池实现。
- `ScheduledThreadPoolExecutor`：支持延迟任务和周期任务。
- `ForkJoinPool`：适合任务拆分、分治计算。
- `Executors`：线程池工厂类，但生产环境不推荐直接使用默认工厂方法。
- `ThreadFactory`：自定义线程创建方式，例如线程名、是否守护线程、异常处理器。
- `RejectedExecutionHandler`：线程池饱和后的拒绝策略接口。

典型场景：接口异步处理、批量任务、定时调度、并行计算。

### 6. 同步工具类

同步工具类用于多个线程之间的协作，不一定是保护共享资源，而是协调执行顺序。

常见类：

- `CountDownLatch`：一个或多个线程等待其他线程完成。
- `CyclicBarrier`：一组线程互相等待，到齐后继续执行。
- `Semaphore`：信号量，用于控制并发访问数量。
- `Exchanger`：两个线程之间交换数据。
- `Phaser`：更灵活的阶段同步工具，可动态注册参与者。

典型场景：服务启动等待、批量任务汇总、限流、并行计算阶段同步。

### 7. Future 与异步编程类

Future 体系用于表示异步任务的执行结果。

常见类：

- `Callable`：有返回值、可抛异常的任务。
- `Future`：异步任务结果接口，可以取消任务、判断完成状态、获取结果。
- `FutureTask`：`Runnable` 和 `Future` 的结合体。
- `CompletableFuture`：支持链式编排、组合、异常处理的异步工具。
- `CompletionStage`：异步阶段编排接口。

典型场景：并行调用多个远程接口、异步聚合结果、异步任务编排。

## 实战场景

### 场景一：高并发计数

如果只是低并发计数，可以使用 `AtomicLong`；如果是热点指标统计，例如接口 QPS、埋点计数，在高并发下更适合使用 `LongAdder`，因为它通过分散热点降低 CAS 竞争。

```java
LongAdder counter = new LongAdder();
counter.increment();
long total = counter.sum();
```

### 场景二：读多写少配置表

配置列表加载后读多写少，可以使用 `CopyOnWriteArrayList`。它的读操作不加锁，写操作复制新数组，适合读远多于写的场景。

```java
CopyOnWriteArrayList<String> configs = new CopyOnWriteArrayList<>();
configs.add("feature-a");
for (String config : configs) {
    System.out.println(config);
}
```

### 场景三：并行调用多个接口

电商详情页可能需要同时查询商品、库存、价格、评价，可以使用 `CompletableFuture` 并行编排：

```java
CompletableFuture<String> item = CompletableFuture.supplyAsync(() -> "商品信息");
CompletableFuture<String> stock = CompletableFuture.supplyAsync(() -> "库存信息");
CompletableFuture<String> price = CompletableFuture.supplyAsync(() -> "价格信息");

CompletableFuture<Void> all = CompletableFuture.allOf(item, stock, price);
all.join();
System.out.println(item.join() + stock.join() + price.join());
```

### 场景四：控制下游接口并发

如果某个下游接口最多允许 20 个并发请求，可以使用 `Semaphore` 做本地并发控制：

```java
Semaphore semaphore = new Semaphore(20);

public String callRemote() throws InterruptedException {
    semaphore.acquire();
    try {
        return "ok";
    } finally {
        semaphore.release();
    }
}
```

## 深挖追问

### 1. JUC 的核心底层机制有哪些？

主要有四个：

- `volatile`：保证变量可见性和禁止部分指令重排序；
- CAS：通过比较并交换实现乐观无锁更新；
- AQS：抽象队列同步器，是 `ReentrantLock`、`Semaphore`、`CountDownLatch` 等组件的基础；
- `LockSupport`：提供线程级别的阻塞和唤醒能力。

### 2. CountDownLatch 和 CyclicBarrier 有什么区别？

- `CountDownLatch` 是倒计时门闩，计数减到 0 后放行，不能重复使用；
- `CyclicBarrier` 是循环屏障，多个线程互相等待，达到指定数量后一起继续，可以重复使用；
- 前者更适合“主线程等待多个子任务完成”，后者更适合“多个线程分阶段协同推进”。

### 3. ReentrantLock 和 synchronized 怎么选？

- 简单临界区优先使用 `synchronized`，语义清晰，JVM 优化成熟；
- 需要公平锁、可中断锁、超时获取锁、多个条件队列时使用 `ReentrantLock`；
- 使用 `ReentrantLock` 必须在 `finally` 中释放锁，否则容易死锁。

### 4. ConcurrentHashMap 为什么比 Hashtable 更适合并发？

`Hashtable` 基本使用整表级别同步，竞争大；`ConcurrentHashMap` 通过更细粒度的并发控制降低锁竞争。JDK 8 中，读操作大多无锁，写操作结合 CAS 和桶级别 `synchronized`，链表过长时会转为红黑树，提高查找效率。

## 易错点总结

1. **JUC 不是只有锁和线程池，而是一整套并发工具体系。**
2. **原子类适合简单状态更新，不适合复杂业务事务。**
3. **`CopyOnWriteArrayList` 写成本很高，不适合频繁写入。**
4. **`LinkedBlockingQueue` 默认容量很大，生产环境要警惕任务堆积。**
5. **`CompletableFuture` 默认使用公共线程池，阻塞任务最好指定业务线程池。**
6. **`Semaphore` 控制的是本地并发，不等同于分布式限流。**
7. **显式锁必须在 `finally` 中释放。**

## 参考资料

- JDK `java.util.concurrent` 包源码
- Java Concurrency in Practice
- JDK 官方文档
