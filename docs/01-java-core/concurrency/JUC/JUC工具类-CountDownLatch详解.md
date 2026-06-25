# JUC 工具类：CountDownLatch 详解

## 核心概念

`CountDownLatch` 是 JUC 提供的一次性同步工具，可以让一个或多个线程等待其他线程完成任务后再继续执行。它的名字可以理解成“倒计时门闩”：初始化时给一个计数值，每完成一个任务就调用一次 `countDown()`，计数减到 0 后，所有调用 `await()` 等待的线程都会被唤醒。

它的底层基于 AQS 共享模式实现，AQS 的 `state` 字段保存剩余计数。`await()` 本质上是尝试以共享模式获取同步状态：如果 `state == 0`，获取成功；否则当前线程进入 AQS 等待队列。`countDown()` 本质上是以共享模式释放：通过 CAS 把 `state` 减 1，当从 1 变成 0 时唤醒等待队列中的线程。

## 面试官想考什么

面试问 `CountDownLatch`，通常关注四个点：

1. 是否知道它解决的是“一个或多个线程等待多个任务完成”的协作问题。
2. 是否知道它是一次性的，计数归零后不能重置。
3. 是否能说清楚 AQS 共享模式下 `await()` 和 `countDown()` 的核心流程。
4. 是否能结合实际场景说明如何避免等待线程永久阻塞。

一句话回答：`CountDownLatch` 是基于 AQS 共享模式的一次性倒计时同步器，`state` 表示剩余计数，`await()` 在计数未归零时阻塞，`countDown()` 递减计数并在归零时唤醒所有等待线程。

## 基本用法

典型场景是主线程等待多个子任务完成：

```java
int taskCount = 3;
CountDownLatch latch = new CountDownLatch(taskCount);
ExecutorService pool = Executors.newFixedThreadPool(taskCount);

for (int i = 0; i < taskCount; i++) {
    pool.execute(() -> {
        try {
            // 执行业务任务
            doWork();
        } finally {
            latch.countDown(); // 必须放 finally，避免异常导致主线程永久等待
        }
    });
}

boolean finished = latch.await(10, TimeUnit.SECONDS);
if (!finished) {
    throw new TimeoutException("tasks not finished in time");
}
```

这段代码有两个面试加分点：

- `countDown()` 放在 `finally` 中，避免任务异常后计数无法归零。
- 使用带超时的 `await()`，避免调用方无限等待。

## 底层原理

`CountDownLatch` 内部有一个 `Sync` 类继承 `AbstractQueuedSynchronizer`。构造方法会把传入的 count 设置到 AQS 的 `state`：

```java
private static final class Sync extends AbstractQueuedSynchronizer {
    Sync(int count) {
        setState(count);
    }

    protected int tryAcquireShared(int acquires) {
        return (getState() == 0) ? 1 : -1;
    }

    protected boolean tryReleaseShared(int releases) {
        for (;;) {
            int c = getState();
            if (c == 0) {
                return false;
            }
            int next = c - 1;
            if (compareAndSetState(c, next)) {
                return next == 0;
            }
        }
    }
}
```

`await()` 的流程：

1. 调用 AQS 的 `acquireSharedInterruptibly(1)`。
2. AQS 调用 `tryAcquireShared()` 判断 `state` 是否为 0。
3. 如果为 0，说明门闩已打开，线程直接继续执行。
4. 如果不为 0，线程加入 AQS 同步队列，并通过 `park` 阻塞。

`countDown()` 的流程：

1. 调用 AQS 的 `releaseShared(1)`。
2. AQS 调用 `tryReleaseShared()`，通过 CAS 将 `state` 减 1。
3. 如果减完后不是 0，只更新计数，不唤醒等待线程。
4. 如果减完后等于 0，触发共享模式释放，唤醒等待队列中的线程。

注意：`countDown()` 多调用几次不会把计数减成负数。计数已经是 0 时，后续 `countDown()` 直接无效返回。

## 常见使用场景

### 1. 主线程等待多个任务结束

比如批量导入数据时，主线程把数据切分成多个分片并行处理，等所有分片处理完成后汇总结果。

```java
CountDownLatch done = new CountDownLatch(parts.size());
for (Part part : parts) {
    executor.execute(() -> {
        try {
            importPart(part);
        } finally {
            done.countDown();
        }
    });
}
done.await();
mergeResult();
```

### 2. 多个线程等待统一开始信号

压测或并发模拟中，可以让多个线程先准备好，再由主线程统一放行。

```java
CountDownLatch start = new CountDownLatch(1);
CountDownLatch done = new CountDownLatch(threadCount);

for (int i = 0; i < threadCount; i++) {
    executor.execute(() -> {
        try {
            start.await();
            requestApi();
        } finally {
            done.countDown();
        }
    });
}

start.countDown();
done.await();
```

### 3. 服务启动依赖检查

主服务启动前，需要等待配置加载、缓存预热、外部连接检查都完成。每完成一个初始化步骤就 `countDown()`，主线程等待所有步骤完成再对外提供服务。

## 和 CyclicBarrier、Semaphore 的区别

- `CountDownLatch`：一次性倒计时，适合“等待 N 个任务完成”。计数不能重置。
- `CyclicBarrier`：可循环使用，适合“一组线程互相等待，到齐后一起继续”。
- `Semaphore`：控制许可证数量，适合限流和并发资源控制，不是等待任务完成。

面试中可以这样区分：如果主线程等子任务，用 `CountDownLatch`；如果多个参与者互相等齐，用 `CyclicBarrier`；如果限制同时访问资源的线程数，用 `Semaphore`。

## 深挖追问

**追问 1：为什么 CountDownLatch 基于 AQS 共享模式？**

因为计数归零后，不是只允许一个线程通过，而是所有等待线程都可以继续执行。这符合 AQS 的共享模式：一个释放动作可能传播并唤醒多个等待节点。

**追问 2：await() 被中断会怎样？**

`await()` 会响应中断并抛出 `InterruptedException`。如果业务不打算吞掉中断，通常要恢复中断标记或向上抛出，让上层决定是否取消任务。

```java
try {
    latch.await();
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();
    throw e;
}
```

**追问 3：countDown() 是否会阻塞？**

通常不会。它只是 CAS 递减计数，并在归零时触发唤醒等待线程。真正阻塞的是调用 `await()` 且计数未归零的线程。

**追问 4：如果某个任务失败没有 countDown，会发生什么？**

等待线程可能永久阻塞。这是 `CountDownLatch` 最常见的坑。解决方式是把 `countDown()` 放到 `finally`，并尽量使用 `await(timeout, unit)` 设置超时时间。

## 实战落地与排查

在线上如果发现接口卡住，线程 Dump 显示线程停在 `CountDownLatch.await()`，优先排查：

1. 初始化 count 是否和实际任务数一致。
2. 是否所有任务路径都会执行 `countDown()`，异常路径有没有遗漏。
3. 线程池是否满了，导致负责 `countDown()` 的任务根本没有执行。
4. 是否应该使用超时等待，避免上游请求无限挂起。
5. 是否误把可重复同步场景写成了 `CountDownLatch`，其实应该用 `CyclicBarrier` 或其他协调器。

一个典型事故是：主线程提交 10 个任务并设置 `CountDownLatch(10)`，但线程池队列满了只成功提交 8 个任务，主线程仍等待 10 次 `countDown()`，最终一直阻塞。因此提交任务失败时也要补偿计数，或者先确认任务提交成功后再设置计数。

## 易错点

- `CountDownLatch` 不能重置；归零后就一直打开。
- `countDown()` 不要求由等待线程调用，任何线程都可以调用。
- `await()` 要考虑中断和超时，业务代码不能无脑永久等待。
- 初始 count 不能小于 0；如果 count 为 0，`await()` 会立即返回。
- 并行任务中 `countDown()` 最好放在 `finally`，这是生产代码的基本防线。

## 总结

`CountDownLatch` 适合一次性的线程协作：一个线程或多个线程等待 N 个事件完成。底层用 AQS 的 `state` 保存计数，`await()` 在计数未归零时进入同步队列等待，`countDown()` 通过 CAS 递减计数并在归零时唤醒等待者。面试回答时，要同时讲清楚使用场景、AQS 原理、一次性限制和异常场景下的防挂死措施。
