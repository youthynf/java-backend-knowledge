# JUC 是什么

## 核心概念

JUC 是 `java.util.concurrent` 的简称，是 Java 从 5.0 开始提供的并发工具包。它解决的核心问题是：让开发者不再只依赖 `synchronized`、`wait/notify` 和手写线程管理，也能写出安全、高效、可维护的并发程序。

JUC 不是一个单独的类，而是一整套并发编程体系。它围绕 `volatile`、CAS、AQS、LockSupport 和线程池模型构建，上层提供原子类、显式锁、并发集合、阻塞队列、同步器和异步任务框架。

一句话：**JUC 是 Java 并发编程的工具箱，覆盖原子操作、锁、并发集合、阻塞队列、线程池、同步工具和 Future 异步编程七大模块。**

## 标准回答

JUC 是 Java 提供的并发编程基础设施，可以按模块划分成七类：

1. **原子类**：`AtomicInteger`、`AtomicLong`、`AtomicReference`、`LongAdder`，基于 CAS 实现无锁更新。
2. **锁与 AQS 同步器**：`ReentrantLock`、`ReentrantReadWriteLock`、`StampedLock`、`LockSupport`，基于 AQS 实现。
3. **并发集合**：`ConcurrentHashMap`、`CopyOnWriteArrayList`、`ConcurrentLinkedQueue`、`ConcurrentSkipListMap`。
4. **阻塞队列**：`ArrayBlockingQueue`、`LinkedBlockingQueue`、`PriorityBlockingQueue`、`SynchronousQueue`、`DelayQueue`，是线程池和生产者消费者模型的核心。
5. **线程池**：`ThreadPoolExecutor`、`ScheduledThreadPoolExecutor`、`ForkJoinPool`、`FutureTask`、`CompletableFuture`。
6. **同步工具**：`CountDownLatch`、`CyclicBarrier`、`Semaphore`、`Phaser`、`Exchanger`。
7. **Future 异步编程**：`Future`、`FutureTask`、`CompletableFuture`、`CompletionStage`。

底层机制四件套：`volatile` 保证可见性，CAS 保证原子更新，AQS 管理同步队列，LockSupport 提供线程阻塞与唤醒。

## 七大模块详解

### 1. 原子类（atomic 包）

原子类位于 `java.util.concurrent.atomic` 包，底层依赖 CAS。

| 类型 | 代表类 | 适用场景 |
|------|--------|----------|
| 基本类型 | `AtomicInteger`、`AtomicLong`、`AtomicBoolean` | 计数器、状态标记 |
| 引用类型 | `AtomicReference`、`AtomicStampedReference` | CAS 乐观更新，后者解决 ABA |
| 数组类型 | `AtomicIntegerArray`、`AtomicLongArray` | 数组元素原子更新 |
| 字段更新器 | `AtomicIntegerFieldUpdater` | 字段级 CAS |
| 高并发计数器 | `LongAdder`、`LongAccumulator` | 热点计数，比 AtomicLong 更高效 |

```java
AtomicInteger counter = new AtomicInteger(0);
int next = counter.incrementAndGet();
```

### 2. 显式锁（locks 包）

| 类 | 作用 |
|---|---|
| `ReentrantLock` | 可重入互斥锁，支持公平/非公平、可中断、超时 |
| `ReentrantReadWriteLock` | 读写锁，读多写少场景 |
| `StampedLock` | 支持乐观读，特定读多写少场景 |
| `Condition` | 配合 `Lock` 实现多条件等待队列 |
| `LockSupport` | 底层线程阻塞唤醒工具，AQS 依赖它 |

```java
ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    updateSharedState();
} finally {
    lock.unlock();
}
```

显式锁必须在 `finally` 中释放，否则一旦异常会导致死锁。

### 3. 并发集合

| 类 | 特点 | 适用场景 |
|---|---|---|
| `ConcurrentHashMap` | JDK 8 起 CAS + synchronized 桶锁 | 高并发 Map |
| `CopyOnWriteArrayList` | 写时复制，读无锁 | 读多写少列表 |
| `ConcurrentLinkedQueue` | CAS 无锁非阻塞 | 高并发非阻塞队列 |
| `ConcurrentSkipListMap` | 跳表实现，有序 | 排序并发 Map |

并发集合只保证单次操作线程安全，复合操作仍需 `putIfAbsent`、`computeIfAbsent` 等原子方法。

### 4. 阻塞队列

| 队列 | 特点 |
|---|---|
| `ArrayBlockingQueue` | 数组实现，有界，FIFO |
| `LinkedBlockingQueue` | 链表实现，默认近似无界 |
| `SynchronousQueue` | 不存储元素，生产者消费者直接配对 |
| `PriorityBlockingQueue` | 无界，按优先级排序 |
| `DelayQueue` | 延迟队列，到期才能取出 |
| `LinkedTransferQueue` | 支持生产者直接向消费者转交 |

```java
BlockingQueue<String> queue = new LinkedBlockingQueue<>();
queue.put("task");
String task = queue.take();
```

### 5. 线程池

| 类 | 作用 |
|---|---|
| `ThreadPoolExecutor` | 标准线程池实现 |
| `ScheduledThreadPoolExecutor` | 定时任务线程池 |
| `ForkJoinPool` | 分治任务线程池，工作窃取 |
| `Future` / `FutureTask` | 异步任务结果 |
| `CompletableFuture` | 异步任务编排 |

生产环境不推荐 `Executors` 默认工厂，应显式 `new ThreadPoolExecutor`，明确线程数、队列大小、线程名和拒绝策略。

### 6. 同步工具

| 工具 | 语义 | 是否可复用 |
|---|---|---|
| `CountDownLatch` | 倒计时门闩，一个或多个线程等待 N 个事件 | 一次性 |
| `CyclicBarrier` | 循环屏障，一组线程互相等待到齐 | 可复用 |
| `Semaphore` | 信号量，控制并发访问数量 | 可复用 |
| `Phaser` | 多阶段同步，支持动态注册 | 可复用 |
| `Exchanger` | 两个线程间交换数据 | 可复用 |

### 7. Future 异步编程

- `Callable`：有返回值、可抛异常的任务。
- `Future`：异步结果接口，可取消、判断完成、获取结果。
- `FutureTask`：`Runnable` + `Future` 的结合体。
- `CompletableFuture`：支持链式编排、组合、异常处理。

## 底层关键机制

### volatile

`volatile` 提供可见性和有序性，但**不保证原子性**。`count++` 仍非线程安全。AQS 的 `state`、FutureTask 的 `state`、`ConcurrentHashMap` 的 Node `val` 都依赖 `volatile`。

### CAS

CAS（Compare-And-Swap）是乐观锁基础：比较内存值是否等于预期，相等则更新，否则重试。Java 通过 `Unsafe.compareAndSwapXxx` 调用 CPU 的 `cmpxchg` 指令保证原子性。CAS 的缺点：自旋开销、ABA 问题、只能保证单个变量原子性。

### AQS

AQS（`AbstractQueuedSynchronizer`）把同步器通用逻辑抽象出来：

- `volatile int state` 表示同步状态。
- FIFO 双向队列管理等待线程（CLH 变体）。
- 独占模式和共享模式两种获取方式。
- `park/unpark` 实现阻塞唤醒。

`ReentrantLock`、`Semaphore`、`CountDownLatch`、`ReentrantReadWriteLock` 都基于 AQS。

### LockSupport

`LockSupport` 提供 `park()` 阻塞、`unpark(thread)` 唤醒。它比 `wait/notify` 更灵活：不要求持有监视器，`unpark` 可以先于 `park` 调用不丢信号。AQS 内部依赖它挂起和唤醒等待线程。

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 接口并发限流 | `Semaphore` 控制本实例并发量 | 单 JVM 限流，多实例需要网关或 Redis |
| 异步批量处理 | `ExecutorService` + `CountDownLatch` 等待所有子任务 | 必须带超时、异常处理、任务幂等 |
| 缓存并发更新 | `ConcurrentHashMap.computeIfAbsent` 原子加载 | `mappingFunction` 不能阻塞或递归修改 Map |
| 高并发计数 | `LongAdder` 替代 `AtomicLong` | 最后调 `sum()` 读取，弱一致 |
| 并行编排多接口 | `CompletableFuture.allOf` | 默认用 ForkJoinPool，阻塞任务要指定业务线程池 |

```java
private final Semaphore semaphore = new Semaphore(50);

public Result callDownstream(Request request) {
    if (!semaphore.tryAcquire()) {
        return Result.fail("系统繁忙");
    }
    try {
        return downstream.call(request);
    } finally {
        semaphore.release();
    }
}
```

## 深挖追问

### 1. JUC 和 synchronized 是什么关系？

`synchronized` 是 JVM 内置锁，适合简单互斥；JUC 是标准库工具集，覆盖范围更广。JUC 不替代 `synchronized`，简单临界区用 `synchronized` 更清晰，需要超时、可中断、公平、多条件队列时用 JUC。

### 2. 为什么 AQS 很重要？

JUC 中很多锁和同步器都基于 AQS。掌握 AQS 就能理解 `ReentrantLock`、`Semaphore`、`CountDownLatch` 的共同原理：`state` 表示同步状态，FIFO 队列管理等待线程，`park/unpark` 实现阻塞唤醒，独占/共享两种模式覆盖不同语义。

### 3. 为什么不建议直接用 Executors 创建线程池？

- `newFixedThreadPool`、`newSingleThreadExecutor` 使用无界队列，可能 OOM。
- `newCachedThreadPool` 最大线程数 `Integer.MAX_VALUE`，可能创建过多线程。
- `newScheduledThreadPool` 使用无界延迟队列，任务可能堆积。

阿里规约要求显式 `new ThreadPoolExecutor`，明确线程数、队列容量、线程名和拒绝策略。

### 4. 并发集合能否保证所有操作线程安全？

不能。并发集合只保证单次方法调用线程安全，复合操作仍可能有竞态：

```java
// 非原子复合操作
if (!map.containsKey(key)) {
    map.put(key, value);
}

// 推荐
map.putIfAbsent(key, value);
```

### 5. JUC 能解决所有并发问题吗？

不能。JUC 只提供工具，仍需正确建模：共享状态设计、线程池隔离、下游容量、超时降级、取消补偿、监控排查都需要业务层处理。

## 易错点

- 把线程安全容器当事务容器：单次操作安全不等于复合逻辑安全。
- 线程池参数随手配：无界队列、过大线程数、无拒绝策略都会导致线上故障。
- 忘记释放锁或许可：`lock.unlock()`、`semaphore.release()` 必须放 `finally`。
- 忽略异常和超时：异步任务失败后没人观察，问题被隐藏。
- 把单机 `Semaphore` 当分布式限流：多实例下总并发 = 实例数 × permits。

## 总结

JUC 是 Java 并发的工具箱，按模块划分七大类：原子类、锁、并发集合、阻塞队列、线程池、同步工具、Future。底层四件套是 `volatile`、CAS、AQS、LockSupport。选型时先明确场景：简单互斥用 `synchronized`，复杂控制用 `ReentrantLock`，读多写少用读写锁或 CopyOnWrite，限流用 `Semaphore`，等任务完成用 `CountDownLatch`，线程协作用 `CyclicBarrier`，多阶段动态参与用 `Phaser`，异步任务用线程池 + Future/CompletableFuture。

## 参考资料

- [JDK java.util.concurrent 包](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/package-summary.html)
- Java Concurrency in Practice
