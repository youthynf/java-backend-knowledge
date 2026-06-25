# JUC工具类-CyclicBarrier详解

## 核心概念

`CyclicBarrier` 是 JUC 中的“循环屏障”：它让一组线程在某个同步点互相等待，直到最后一个线程也到达，屏障才会打开，所有等待线程继续执行。

它适合解决这类问题：**多个线程需要分阶段并行执行，每个阶段必须等所有参与者完成后才能进入下一阶段**。

关键词：

- **Barrier（屏障）**：线程到达后被阻塞，等待其他线程。
- **Parties（参与方数量）**：需要一起到达屏障的线程数。
- **Cyclic（可循环）**：屏障打开后会自动重置，可以用于下一轮同步。
- **Barrier Action（屏障动作）**：最后一个到达的线程会执行的回调逻辑。

常见初始化方式：

```java
CyclicBarrier barrier = new CyclicBarrier(3, () -> {
    System.out.println("所有线程到达屏障，开始进入下一阶段");
});
```

## 面试官想考什么

面试里问 `CyclicBarrier`，通常不是只想听 API，而是在考：

1. 你能否区分 `CyclicBarrier`、`CountDownLatch`、`Phaser` 的使用边界。
2. 你是否理解它为什么可以重复使用。
3. 你是否知道一个线程中断、超时或屏障动作异常后，会导致整个屏障 broken。
4. 你是否能把它和真实业务场景结合，比如并发压测、分阶段计算、批量任务对齐。
5. 你是否了解它底层不是直接继承 AQS，而是基于 `ReentrantLock + Condition` 实现。

## 标准回答

可以这样回答：

> `CyclicBarrier` 是 JUC 里的循环屏障，用来让一组线程互相等待。每个线程执行到某个阶段后调用 `await()`，如果还不是最后一个线程，就进入等待；最后一个线程到达后，会先执行可选的 barrierAction，然后唤醒所有等待线程。屏障打开后会进入下一代 generation，并把计数重置，所以它可以复用。
>
> 它底层通过 `ReentrantLock` 保护状态，通过 `Condition` 挂起和唤醒等待线程，内部用 `count` 记录还未到达的线程数，用 `Generation` 区分不同轮次。如果有线程中断、超时、reset 或 barrierAction 执行失败，当前 generation 会被标记为 broken，其他等待线程会抛 `BrokenBarrierException`。

## 底层原理

### 核心字段

简化理解如下：

```java
public class CyclicBarrier {
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition trip = lock.newCondition();

    private final int parties;          // 总参与线程数
    private final Runnable barrierCommand;

    private Generation generation = new Generation();
    private int count;                  // 当前轮还未到达的线程数

    private static class Generation {
        boolean broken = false;
    }
}
```

几个字段的作用：

- `parties`：每一轮需要等待的线程总数。
- `count`：当前轮还差多少线程到达屏障。
- `generation`：屏障的当前轮次，每打开一次就切换到新 generation。
- `broken`：当前轮是否已经被破坏。
- `trip`：等待队列，没到齐的线程会在这里等待。

### await 流程

`await()` 的核心逻辑可以拆成 5 步：

1. 获取 `ReentrantLock`。
2. 检查当前 generation 是否 broken。
3. 将 `count` 减 1，表示当前线程已到达。
4. 如果 `count == 0`，说明自己是最后一个到达的线程：
   - 执行 `barrierAction`；
   - 调用 `nextGeneration()` 唤醒所有等待线程；
   - 重置 `count = parties`；
   - 创建新的 `Generation`。
5. 如果不是最后一个线程，就调用 `Condition.await()` 等待屏障打开。

简化伪代码：

```java
int index = --count;
if (index == 0) {
    if (barrierCommand != null) {
        barrierCommand.run();
    }
    nextGeneration();
    return 0;
}

for (;;) {
    trip.await();
    if (generation changed) {
        return index;
    }
    if (generation.broken) {
        throw new BrokenBarrierException();
    }
}
```

### 为什么能复用

复用的关键是 `nextGeneration()`：

```java
private void nextGeneration() {
    trip.signalAll();
    count = parties;
    generation = new Generation();
}
```

屏障被触发后：

- 唤醒当前轮等待线程；
- 把 `count` 重置为总参与数；
- 创建新的 `Generation` 表示下一轮。

所以同一个 `CyclicBarrier` 可以反复用于多个阶段，这就是 “Cyclic” 的含义。

## 深挖追问

### 1. CyclicBarrier 和 CountDownLatch 有什么区别？

| 维度 | CountDownLatch | CyclicBarrier |
|---|---|---|
| 核心语义 | 一个或多个线程等待其他事件完成 | 一组线程互相等待 |
| 是否可复用 | 不可复用 | 可复用 |
| 计数方式 | `countDown()` 递减到 0 | `await()` 到齐后自动重置 |
| 等待方 | 通常是主线程等待工作线程 | 所有参与线程互相等待 |
| 回调动作 | 没有内置回调 | 支持 barrierAction |
| 底层实现 | AQS 共享模式 | ReentrantLock + Condition |

一句话区分：

- `CountDownLatch` 更像“倒计时门闩”：别人做完，我再继续。
- `CyclicBarrier` 更像“集合点”：大家都到了，再一起继续。

### 2. CyclicBarrier 底层是不是基于 AQS？

不是直接基于 AQS。

`CountDownLatch`、`Semaphore`、`ReentrantLock` 都和 AQS 有很深关系，但 `CyclicBarrier` 本身是通过组合 `ReentrantLock` 和 `Condition` 实现的。

当然，`ReentrantLock` 和 `ConditionObject` 底层又依赖 AQS，所以可以说它间接使用了 AQS 能力，但不能说 `CyclicBarrier` 直接继承或直接基于 AQS 实现。

### 3. 什么情况下会 BrokenBarrierException？

当前 generation 被破坏时，等待线程会抛 `BrokenBarrierException`。常见触发方式：

- 某个等待线程被中断；
- 某个等待线程超时；
- 其他线程调用 `reset()`；
- `barrierAction` 执行抛异常。

这点很重要：**CyclicBarrier 是一组线程协作，一个线程出问题，整组线程都要知道当前屏障已经不可用了**。

### 4. barrierAction 由谁执行？

由最后一个到达屏障的线程执行。

所以 barrierAction 不应该做太重的逻辑。如果回调执行很慢，其他已经到达的线程都要继续等；如果回调抛异常，屏障会进入 broken 状态。

### 5. await 返回值有什么用？

`await()` 会返回一个 arrival index：

- 最后一个到达的线程返回 `0`；
- 其他线程返回不同的正数。

可以用它做一些简单分工，比如让最后一个到达的线程执行汇总逻辑。不过实际开发中，更常用的是构造函数里的 `barrierAction`。

## 实战场景

### 场景一：并发压测同时起跑

压测时，经常需要让多个线程准备好后同时发起请求，否则先启动的线程会提前执行，压测结果不准确。

```java
int threadCount = 100;
CyclicBarrier startBarrier = new CyclicBarrier(threadCount);

for (int i = 0; i < threadCount; i++) {
    new Thread(() -> {
        try {
            prepareRequest();
            startBarrier.await(); // 所有线程准备好后一起开始
            doRequest();
        } catch (Exception e) {
            Thread.currentThread().interrupt();
        }
    }).start();
}
```

### 场景二：多阶段并行计算

假设一个任务分为多个阶段，每个线程负责一部分数据，但阶段 2 必须等所有线程完成阶段 1 才能开始。

```java
CyclicBarrier barrier = new CyclicBarrier(4, () -> {
    System.out.println("当前阶段完成，准备进入下一阶段");
});

Runnable worker = () -> {
    try {
        computeStageOne();
        barrier.await();

        computeStageTwo();
        barrier.await();

        computeStageThree();
        barrier.await();
    } catch (Exception e) {
        Thread.currentThread().interrupt();
    }
};
```

### 场景三：批量任务分片后统一合并

多个线程分别计算分片数据，到齐后由 barrierAction 统一合并结果。

```java
List<Result> results = Collections.synchronizedList(new ArrayList<>());

CyclicBarrier barrier = new CyclicBarrier(5, () -> {
    merge(results);
});
```

注意：如果 barrierAction 里需要访问共享结果，结果容器必须保证线程安全，或者在到达屏障前做好内存可见性和同步控制。

## 易错点

### 1. parties 数量和实际线程数不一致

如果 `parties = 5`，但只有 4 个线程调用 `await()`，这 4 个线程会一直等，除非被中断或超时。

线上使用建议：优先用带超时的 `await(timeout, unit)`，不要无限等待。

### 2. 异常处理不当导致线程永久等待

如果某个线程在到达 `await()` 前就异常退出，其他线程可能永远等不到它。

应对方式：

- 在线程内部捕获异常；
- 必要时调用 `reset()` 或中断其他线程；
- 使用超时等待兜底。

### 3. barrierAction 太重

barrierAction 由最后一个到达的线程执行，执行期间其他线程无法通过屏障。这里适合做轻量汇总、状态切换，不适合做远程调用、长时间 IO 或复杂计算。

### 4. reset 不是“无感重启”

`reset()` 会打破当前屏障。如果有线程正在等待，它们会收到 `BrokenBarrierException`。所以 reset 应该作为异常恢复手段，而不是正常流程里的频繁操作。

## 总结

`CyclicBarrier` 的核心价值是：**让固定数量的线程在多个阶段反复对齐**。

面试回答时要抓住四句话：

1. 它用于一组线程互相等待，到齐后一起继续。
2. 它可以复用，靠的是 generation 切换和 count 重置。
3. 它底层使用 `ReentrantLock + Condition`，不是直接继承 AQS。
4. 中断、超时、reset 或 barrierAction 异常都会导致屏障 broken，需要做好异常和超时处理。
