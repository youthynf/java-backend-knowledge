# JUC工具类之Semaphore详解

## 核心概念

`Semaphore` 是 JUC 中的信号量工具，用来控制同时访问某个资源的线程数量。

它内部维护一组许可证（permits）：

- 线程访问资源前调用 `acquire()` 获取许可证；
- 如果还有许可证，线程继续执行；
- 如果没有许可证，线程阻塞等待；
- 使用完资源后调用 `release()` 归还许可证。

一句话：**Semaphore 用许可证数量限制并发访问量**。

示例：

```java
Semaphore semaphore = new Semaphore(10); // 最多允许 10 个线程同时进入

semaphore.acquire();
try {
    accessResource();
} finally {
    semaphore.release();
}
```

## 面试官想考什么

面试问 `Semaphore`，一般会重点考：

1. 它和锁有什么区别，为什么不是简单互斥。
2. `permits` 的含义，以及为什么可以实现限流、连接池、资源池。
3. 公平信号量和非公平信号量的区别。
4. `acquire()`、`tryAcquire()`、`release()` 的语义和风险。
5. 它底层如何基于 AQS 共享模式实现。
6. 使用时如何避免许可证泄漏、过度释放和线程永久阻塞。

## 标准回答

可以这样回答：

> `Semaphore` 是 JUC 里的信号量，用来控制同时访问某个资源的线程数量。它维护一定数量的许可证，线程进入临界区前先 acquire 获取许可证，退出时 release 释放许可证。如果许可证不足，线程会阻塞或获取失败。
>
> 和 `ReentrantLock` 这种互斥锁不同，Semaphore 不一定只允许一个线程进入，它可以允许 N 个线程并发访问。因此它特别适合限流、连接池、停车场、批量接口并发控制等场景。底层上，Semaphore 基于 AQS 的共享模式实现，state 表示剩余许可证数量。

## 底层原理

### AQS 共享模式

`Semaphore` 内部有一个 `Sync` 类继承 `AbstractQueuedSynchronizer`。

AQS 的 `state` 字段在这里表示“当前剩余许可证数量”：

```text
state = available permits
```

如果初始化：

```java
new Semaphore(3)
```

就表示 `state = 3`，最多 3 个线程可以同时获取许可证。

### acquire 流程

`acquire()` 的核心逻辑：

1. 尝试减少许可证数量。
2. 如果剩余许可证足够，通过 CAS 将 `state` 减去需要的 permits。
3. 如果许可证不足，线程进入 AQS 同步队列等待。
4. 其他线程 `release()` 后，等待线程被唤醒，再次尝试获取许可证。

简化伪代码：

```java
for (;;) {
    int available = getState();
    int remaining = available - acquires;
    if (remaining < 0) {
        return remaining; // 获取失败，进入队列
    }
    if (compareAndSetState(available, remaining)) {
        return remaining; // 获取成功
    }
}
```

### release 流程

`release()` 会增加许可证数量，并唤醒等待队列中的线程。

简化伪代码：

```java
for (;;) {
    int current = getState();
    int next = current + releases;
    if (compareAndSetState(current, next)) {
        return true;
    }
}
```

需要注意：`release()` 不会检查当前线程是否真的获取过许可证。也就是说，错误地多次 release 会让许可证数量超过初始值，从而破坏限流语义。

## 公平与非公平

`Semaphore` 支持公平和非公平两种模式：

```java
Semaphore nonfair = new Semaphore(10);       // 默认非公平
Semaphore fair = new Semaphore(10, true);    // 公平
```

### 非公平模式

非公平模式下，新来的线程可以直接尝试抢许可证，即使队列里已经有等待线程。

优点：吞吐量通常更高。

缺点：等待时间不稳定，极端情况下可能出现饥饿。

### 公平模式

公平模式下，线程获取许可证前会检查等待队列，如果前面已经有线程排队，就不会插队。

优点：等待顺序更可控。

缺点：上下文切换更多，吞吐量可能下降。

### 面试怎么答

如果追问“该选公平还是非公平”，可以这样说：

> 默认优先非公平，因为吞吐量更好。只有当业务明确要求先来先服务，或者需要减少长时间饥饿风险时，才考虑公平信号量。

## 深挖追问

### 1. Semaphore 和 ReentrantLock 有什么区别？

| 维度 | Semaphore | ReentrantLock |
|---|---|---|
| 控制目标 | 限制并发访问数量 | 保护临界区互斥访问 |
| 同时进入线程数 | 可以是 N 个 | 通常只能 1 个 |
| 是否绑定持有线程 | 不严格绑定 | 锁必须由持有线程释放 |
| release/unlock 校验 | release 不检查调用线程 | unlock 非持有线程会报错 |
| 典型场景 | 限流、资源池、连接池 | 共享变量保护、复杂锁条件 |

一句话：

- `ReentrantLock` 是“只能一个人进门”；
- `Semaphore` 是“最多 N 个人同时进门”。

### 2. Semaphore 可以实现互斥锁吗？

可以，把许可证数量设置为 1：

```java
Semaphore mutex = new Semaphore(1);
```

但一般不建议用它替代锁。原因是 `Semaphore.release()` 不校验释放者，非获取线程也可以释放，容易写出错误代码。互斥保护共享状态时，优先用 `synchronized` 或 `ReentrantLock`。

### 3. release 可以比 acquire 多吗？

语法上可以，逻辑上通常是 bug。

例如初始 permits 是 3，如果错误调用了 5 次 `release()`，可用许可证可能变成 8。这样限流上限就被突破了。

所以生产代码必须使用 `try/finally` 保证只在成功 acquire 后 release。

### 4. acquire 被中断怎么办？

`acquire()` 是响应中断的。如果线程等待许可证时被中断，会抛 `InterruptedException`。

常见处理：

```java
boolean acquired = false;
try {
    semaphore.acquire();
    acquired = true;
    doWork();
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();
} finally {
    if (acquired) {
        semaphore.release();
    }
}
```

### 5. tryAcquire 适合什么场景？

`tryAcquire()` 不会一直等待，适合限流和降级：

```java
if (!semaphore.tryAcquire()) {
    return "系统繁忙，请稍后再试";
}
try {
    return queryRemoteService();
} finally {
    semaphore.release();
}
```

带超时版本适合“最多等一会儿，等不到就失败”的场景：

```java
if (semaphore.tryAcquire(200, TimeUnit.MILLISECONDS)) {
    try {
        doWork();
    } finally {
        semaphore.release();
    }
}
```

## 实战场景

### 场景一：接口并发限流

比如某个下游接口最多允许 20 个并发请求，超过的请求直接降级或排队等待。

```java
private final Semaphore limiter = new Semaphore(20);

public Response callRemote(Request request) {
    if (!limiter.tryAcquire()) {
        return Response.busy();
    }
    try {
        return remoteClient.call(request);
    } finally {
        limiter.release();
    }
}
```

这种限流是进程内限流，适合单实例或每实例限额。分布式全局限流还需要 Redis、网关或限流中间件配合。

### 场景二：数据库连接池

连接池本质上就是有限资源池。可以用 Semaphore 控制同时借出的连接数量。

```java
class SimplePool<T> {
    private final Semaphore permits;
    private final Queue<T> resources = new ConcurrentLinkedQueue<>();

    SimplePool(Collection<T> resources) {
        this.resources.addAll(resources);
        this.permits = new Semaphore(resources.size(), true);
    }

    T borrow() throws InterruptedException {
        permits.acquire();
        return resources.poll();
    }

    void release(T resource) {
        resources.offer(resource);
        permits.release();
    }
}
```

真实连接池还要处理连接有效性、超时、泄漏检测、关闭等问题，但并发控制思想类似。

### 场景三：批量任务控制并发度

有 1000 个任务，但最多只允许 10 个任务同时执行，避免把 CPU、数据库或下游服务打满。

```java
Semaphore semaphore = new Semaphore(10);

for (Task task : tasks) {
    executor.submit(() -> {
        boolean acquired = false;
        try {
            semaphore.acquire();
            acquired = true;
            task.run();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            if (acquired) {
                semaphore.release();
            }
        }
    });
}
```

## 易错点

### 1. 没有放在 finally 里 release

如果业务逻辑抛异常但没有释放许可证，就会发生许可证泄漏。泄漏多了以后，所有线程都可能卡在 `acquire()`。

正确方式：

```java
semaphore.acquire();
try {
    doWork();
} finally {
    semaphore.release();
}
```

### 2. acquire 失败还 release

如果 `acquire()` 被中断或 `tryAcquire()` 返回 false，说明没有拿到许可证，此时不能 release。

推荐使用 `acquired` 标记位。

### 3. 错误地多次 release

`release()` 不校验持有者，也不校验是否超过初始 permits。多 release 会让并发上限失效。

### 4. 把本地 Semaphore 当分布式限流

单机 Semaphore 只限制当前 JVM 内的并发。如果服务部署了 10 个实例，每个实例 `new Semaphore(20)`，全局并发可能达到 200。

需要全局限流时，要使用 Redis、网关限流、服务治理限流或专门的分布式限流组件。

### 5. 公平模式滥用

公平模式不是越公平越好。它会降低吞吐量，只有在确实需要先来先服务或避免饥饿时才使用。

## 总结

`Semaphore` 的核心价值是：**用许可证控制并发访问数量**。

面试回答抓住五句话：

1. 它维护 permits，线程 acquire 获取许可证，release 归还许可证。
2. 它可以允许 N 个线程同时访问资源，不等同于互斥锁。
3. 底层基于 AQS 共享模式，state 表示剩余许可证。
4. 默认非公平，公平模式更有序但吞吐量更低。
5. 生产使用必须注意 `try/finally`、超时/降级、避免许可证泄漏和多 release。
