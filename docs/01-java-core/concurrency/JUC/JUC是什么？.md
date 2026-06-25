# JUC是什么？

## 核心概念

JUC 是 `java.util.concurrent` 的简称，是 Java 标准库提供的并发工具包。它从 Java 5 开始引入，目标是让开发者不用只依赖 `synchronized`、`wait/notify` 和手写线程管理，也能写出更安全、更高性能、更可维护的并发程序。

JUC 不是一个单独的类，而是一整套并发编程体系，主要包括：

- 原子类：解决简单共享变量的原子更新问题。
- 显式锁：提供比 `synchronized` 更灵活的锁能力。
- 并发集合：提供线程安全且高并发性能更好的容器。
- 线程池：统一管理线程生命周期和任务调度。
- 同步工具：协调多个线程之间的执行顺序。
- 异步编程工具：表示异步任务结果并组合任务流程。

一句话：**JUC 是 Java 并发编程的工具箱，底层围绕 CAS、volatile、AQS、LockSupport 和线程池模型构建，上层提供锁、队列、集合、同步器和异步任务框架。**

## 面试官想考什么

面试问“JUC 是什么”，通常不是只想听包名，而是想看你有没有完整的并发知识框架：

1. 是否知道 JUC 解决了哪些并发问题。
2. 是否能把原子类、锁、线程池、并发集合、同步工具串起来。
3. 是否理解常见组件背后的基础机制：CAS、AQS、volatile、LockSupport。
4. 是否能根据业务场景选择合适工具。
5. 是否知道线上并发风险：死锁、线程池耗尽、队列堆积、可见性问题等。

## 标准回答

可以这样回答：

> JUC 是 `java.util.concurrent` 并发工具包，是 Java 提供的一套并发编程基础设施。它覆盖了原子操作、锁、并发集合、线程池、同步工具和异步任务等常见场景。
>
> 从底层看，JUC 很多组件依赖 CAS、volatile、AQS 和 LockSupport，比如 `ReentrantLock`、`Semaphore`、`CountDownLatch` 都基于 AQS；原子类基于 CAS；线程池通过工作线程、阻塞队列和拒绝策略管理任务。
>
> 实际开发中，JUC 的价值是让我们根据场景选择合适的并发工具：共享变量更新用原子类，复杂互斥用锁，读多写少用读写锁或 CopyOnWrite 容器，异步任务用线程池和 Future/CompletableFuture，线程协作用 CountDownLatch、CyclicBarrier、Semaphore、Phaser 等。

## JUC 的核心组成

### 1. 原子类 Atomic

原子类位于 `java.util.concurrent.atomic` 包中，主要用于无锁更新共享变量。

常见类型：

- 基本类型：`AtomicInteger`、`AtomicLong`、`AtomicBoolean`。
- 引用类型：`AtomicReference`、`AtomicStampedReference`。
- 数组类型：`AtomicIntegerArray`、`AtomicLongArray`。
- 字段更新器：`AtomicIntegerFieldUpdater`、`AtomicReferenceFieldUpdater`。
- 高并发计数器：`LongAdder`、`LongAccumulator`。

典型场景是计数器、状态标记、并发统计。

```java
AtomicInteger counter = new AtomicInteger(0);
int next = counter.incrementAndGet();
```

底层核心是 CAS，也就是比较并交换。它会比较内存中的旧值是否符合预期，如果符合就更新，否则重试。

### 2. 显式锁 Locks

JUC 提供了比 `synchronized` 更灵活的锁机制。

常见工具：

- `ReentrantLock`：可重入互斥锁，支持公平锁、非公平锁、可中断获取、超时获取。
- `ReentrantReadWriteLock`：读写锁，适合读多写少场景。
- `StampedLock`：支持乐观读、悲观读、写锁，适合特定读多写少场景。
- `Condition`：配合 `Lock` 实现多条件等待队列。
- `LockSupport`：底层线程阻塞和唤醒工具。

典型写法：

```java
ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    updateSharedState();
} finally {
    lock.unlock();
}
```

和 `synchronized` 相比，显式锁更灵活，但也要求开发者手动释放锁，必须放在 `finally` 中。

### 3. 并发集合 Collections

JUC 提供了多种线程安全集合，避免手写同步代码。

常见类型：

- `ConcurrentHashMap`：高并发 Map。
- `CopyOnWriteArrayList`：读多写少列表。
- `ConcurrentLinkedQueue`：非阻塞并发队列。
- `BlockingQueue`：阻塞队列，是线程池和生产者消费者模型的核心。
- `ConcurrentSkipListMap`：有序并发 Map。

例如生产者消费者模型常用阻塞队列：

```java
BlockingQueue<String> queue = new LinkedBlockingQueue<>();
queue.put("task");
String task = queue.take();
```

注意：并发集合通常只能保证单次操作线程安全，复合操作仍可能需要额外同步。

### 4. 线程池 Executor

线程池是生产环境最常用的 JUC 组件之一。

核心类：

- `Executor`：任务执行接口。
- `ExecutorService`：支持提交任务、关闭线程池、获取结果。
- `ThreadPoolExecutor`：标准线程池实现。
- `ScheduledThreadPoolExecutor`：定时任务线程池。
- `ForkJoinPool`：分治任务线程池。
- `Future` / `FutureTask`：表示异步任务结果。
- `CompletableFuture`：支持异步任务编排。

`ThreadPoolExecutor` 的核心参数包括核心线程数、最大线程数、空闲线程存活时间、工作队列、线程工厂和拒绝策略。

生产中一般不建议直接使用 `Executors.newFixedThreadPool()`、`newCachedThreadPool()` 等默认工厂，因为它们可能隐藏无界队列或无限线程增长风险。

### 5. 同步工具 Tools

同步工具用于协调线程执行顺序。

常见工具：

- `CountDownLatch`：一个或多个线程等待多个任务完成。
- `CyclicBarrier`：固定数量线程互相等待，到齐后一起进入下一轮。
- `Semaphore`：控制同时访问资源的线程数量。
- `Phaser`：更灵活的多阶段同步器，支持动态注册和注销。
- `Exchanger`：两个线程之间交换数据。

选型示例：主线程等多个子任务初始化完成用 `CountDownLatch`；多个线程每一轮到齐后再继续用 `CyclicBarrier`；控制接口并发量用 `Semaphore`；多阶段动态参与用 `Phaser`。

## 底层关键机制

### 1. volatile

`volatile` 主要提供两个能力：可见性和有序性。很多 JUC 组件会用 `volatile` 保存状态，比如 AQS 的 `state`、FutureTask 的任务状态等。

但 `volatile` 不保证复合操作的原子性，例如 `count++` 仍然不是线程安全的。

### 2. CAS

CAS 是 Compare-And-Swap，比较并交换。基本思想是：如果当前值等于预期值，就更新为新值；否则更新失败并重试。

原子类、AQS 状态更新、ConcurrentHashMap 的部分操作都使用 CAS。CAS 的优点是避免阻塞，缺点是可能自旋消耗 CPU，并且存在 ABA 问题。

### 3. AQS

AQS 是 `AbstractQueuedSynchronizer`，是 JUC 中很多同步器的基础。它主要提供：

- 一个 `volatile int state` 表示同步状态。
- 一个 FIFO 等待队列管理阻塞线程。
- 独占模式和共享模式两种获取方式。

典型组件包括 `ReentrantLock`、`Semaphore`、`CountDownLatch`、`ReentrantReadWriteLock`。面试中可以说：AQS 把“状态管理、线程排队、阻塞唤醒”抽象好了，具体同步器只需要定义如何获取和释放状态。

### 4. LockSupport

`LockSupport` 是更底层的线程阻塞与唤醒工具，核心方法是：

```java
LockSupport.park();
LockSupport.unpark(thread);
```

AQS 内部依赖 `LockSupport` 挂起和唤醒等待线程。它不要求先获得对象监视器，并且可以先 `unpark` 再 `park`，更适合构建底层同步工具。

## 常见选型思路

### 1. 更新简单计数器

低并发下 `AtomicLong` 足够，高并发热点计数更适合 `LongAdder`。

```java
LongAdder adder = new LongAdder();
adder.increment();
```

### 2. 保护临界区

简单互斥优先 `synchronized`。如果需要超时、可中断、公平锁、多条件队列，再考虑 `ReentrantLock`。

### 3. 读多写少

可以考虑 `ReentrantReadWriteLock`、`StampedLock`、`CopyOnWriteArrayList`，或者不可变对象加 `volatile` 引用替换。

### 4. 任务异步执行

使用线程池，不要频繁手动 `new Thread()`。核心是配置好线程数、队列大小、拒绝策略、线程命名、异常处理和监控指标。

### 5. 多线程协作

根据等待关系选择：等别人完成用 `CountDownLatch`，大家互相等用 `CyclicBarrier`，控制并发量用 `Semaphore`，多阶段动态参与用 `Phaser`。

## 实战场景

### 场景一：接口并发限流

某个下游接口最多支持 50 个并发请求，可以用 `Semaphore` 控制本实例并发量：

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

注意：这是单 JVM 限流。多实例全局限流需要网关、Redis 或专门限流组件。

### 场景二：异步批量处理

批量任务可以提交到线程池，再用 `CountDownLatch` 等待完成：

```java
CountDownLatch latch = new CountDownLatch(tasks.size());

for (Task task : tasks) {
    executor.submit(() -> {
        try {
            task.run();
        } finally {
            latch.countDown();
        }
    });
}

boolean completed = latch.await(10, TimeUnit.SECONDS);
```

生产代码里要处理超时、异常、线程池拒绝和任务幂等。

### 场景三：缓存并发更新

并发场景下更新共享缓存，可以使用 `ConcurrentHashMap` 的原子方法：

```java
ConcurrentHashMap<String, Object> cache = new ConcurrentHashMap<>();
Object value = cache.computeIfAbsent(key, k -> loadFromDb(k));
```

但要注意 `mappingFunction` 不应该执行过重、容易阻塞或递归修改同一个 Map 的逻辑。

## 高频追问

### 1. JUC 和 synchronized 是什么关系？

`synchronized` 是 Java 语言层面的内置锁，适合简单互斥场景。JUC 是标准库提供的并发工具集合，覆盖范围更广。JUC 并不是完全替代 `synchronized`，简单临界区用 `synchronized` 往往更清晰；需要高级能力时再用 JUC。

### 2. 为什么 AQS 很重要？

因为 JUC 中很多锁和同步器都是基于 AQS 实现的。掌握 AQS，就能理解 `ReentrantLock`、`Semaphore`、`CountDownLatch` 等工具的共同原理。AQS 的核心是：用 `state` 表示同步状态，用队列管理等待线程，用 `park/unpark` 实现阻塞唤醒。

### 3. 为什么不建议直接用 Executors 创建线程池？

因为一些默认工厂存在资源失控风险：

- `newFixedThreadPool` 使用无界队列，可能导致任务堆积和 OOM。
- `newCachedThreadPool` 最大线程数近似无限，可能创建过多线程。
- `newSingleThreadExecutor` 也是无界队列，任务堆积风险明显。

生产中更推荐显式创建 `ThreadPoolExecutor`，明确线程数、队列大小、线程名和拒绝策略。

### 4. 并发集合是否能保证所有操作线程安全？

不能。并发集合通常保证单个方法调用的线程安全，但多个操作组合起来仍可能有竞态。

```java
// 非原子复合操作
if (!map.containsKey(key)) {
    map.put(key, value);
}

// 推荐
map.putIfAbsent(key, value);
```

### 5. JUC 能解决所有并发问题吗？

不能。JUC 提供工具，但仍需要正确建模。实际问题还包括共享状态设计、线程池隔离、下游容量、超时降级、取消补偿、监控排查等。

## 易错点

1. 只背 API，不理解场景：面试更关注为什么选这个工具，以及不用它会有什么问题。
2. 把线程安全容器当成事务容器：单次操作安全不代表复合逻辑安全。
3. 线程池参数随便配：无界队列、过大线程数、没有拒绝策略都会导致线上故障。
4. 忘记释放锁或许可：`lock.unlock()`、`semaphore.release()` 必须放在 `finally`。
5. 忽略异常和超时：异步任务失败后如果没人观察，问题会被隐藏。
