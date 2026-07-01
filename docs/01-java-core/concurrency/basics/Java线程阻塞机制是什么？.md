# Java 线程阻塞机制是什么

## 核心概念

线程阻塞指线程主动或被动地停止占用 CPU，进入等待状态，直到某个条件满足才恢复执行。Java 提供了一整套阻塞 API，每种 API 都对应不同的触发条件、是否释放锁、是否响应中断。理解阻塞机制的关键不是记住"有哪些 API"，而是搞清楚"为什么阻塞、阻塞期间锁在哪、怎么恢复"。

阻塞可以按"释放锁"和"恢复方式"两个维度分类：`sleep` 不释放锁、靠超时或中断恢复；`wait` 释放锁、靠 `notify` 恢复；`park` 不需要锁、靠 `unpark` 恢复；`BlockingQueue.put/take` 释放锁、靠对端操作恢复；`Future.get` 不释放锁、靠任务完成恢复。

## 标准回答

Java 线程阻塞机制按 API 分六大类：

1. **`Thread.sleep(ms)`**：固定时间阻塞，不释放任何锁，响应中断抛 `InterruptedException`。
2. **`Object.wait()` / `wait(ms)`**：必须在 synchronized 块内，释放当前对象 monitor，等 `notify/notifyAll` 或超时恢复。
3. **`Thread.join()` / `join(ms)`**：本质是在目标 Thread 对象上 `wait()`，等目标线程结束。
4. **`LockSupport.park()` / `parkNanos`**：直接阻塞当前线程，不依赖锁，靠 `unpark(thread)` 恢复；许可机制可先 unpark 后 park。
5. **`Condition.await()`**：配合 `ReentrantLock` 使用，释放锁进入条件队列，靠 `signal/signalAll` 恢复。
6. **`BlockingQueue.put/take`**、**`Future.get`**、**`CountDownLatch.await`**、**`CyclicBarrier.await`**：基于上述底层 API 封装的高级阻塞。

按"是否释放锁"和"是否需要持锁"再分类：

| API | 是否释放已持锁 | 是否需要持锁才能调用 | 阻塞状态 |
|------|----------------|----------------------|----------|
| `sleep` | 否 | 否 | TIMED_WAITING |
| `wait` | 释放当前对象 monitor | 必须持有当前对象 monitor | WAITING / TIMED_WAITING |
| `join` | 释放 Thread 对象 monitor | 必须持有 Thread 对象 monitor | WAITING / TIMED_WAITING |
| `park` | 否（不涉及锁） | 否 | WAITING / TIMED_WAITING |
| `Condition.await` | 释放当前 Lock | 必须持有当前 Lock | WAITING / TIMED_WAITING |

## 实现原理

### sleep 为什么不释放锁？

`Thread.sleep()` 是 Thread 类的静态方法，本质是把当前线程从 CPU 调度上摘下来一段时间，它的语义就是"我休息会儿，但我的资源（锁）我还要用"。设计上没要求释放锁，所以不释放。这也意味着用 `sleep` 做线程协作时，其他线程拿不到锁，没法推进条件，可能死锁。

### wait 为什么释放锁？

`Object.wait()` 的设计目的就是"协作"——当前线程等待某个条件，条件由其他线程推进，所以必须把锁让出去。wait 的内部流程：

1. 检查当前线程是否持有 obj 的 monitor，否则抛 `IllegalMonitorStateException`。
2. 把当前线程加入 obj 的 wait set，状态置为 WAITING。
3. 释放 obj 的 monitor。
4. 等待 `notify/notifyAll/超时/中断`。
5. 被唤醒后从 wait set 移出，重新竞争 monitor。
6. 拿到 monitor 后从 wait() 返回。

### park 的许可机制

`LockSupport.park()` 检查一个"许可"标志：有许可就消费并立即返回，没有许可就阻塞。`unpark(thread)` 给目标线程发一个许可，**许可只能有一个，多次 unpark 不会累积**。这带来一个重要特性：

```java
// 提前 unpark
Thread t = ...;
LockSupport.unpark(t);  // 给 t 发许可
t.start();
// t.run() 内部 park() 会立即返回，不会阻塞
```

而 `wait/notify` 不行——`notify()` 在 `wait()` 之前调用是丢失的，会导致 wait 永久阻塞。这是 `park/unpark` 的关键优势。

### BlockingQueue 的阻塞实现

`ArrayBlockingQueue.put()` 简化版：

```java
public void put(E e) throws InterruptedException {
    final ReentrantLock lock = this.lock;
    lock.lockInterruptibly();
    try {
        while (count == items.length)
            notFull.await();        // 满了，释放锁，进 notFull 队列等
        enqueue(e);
        notEmpty.signal();          // 通知可能等待 take 的线程
    } finally {
        lock.unlock();
    }
}
```

阻塞的本质是 `Condition.await()`——释放锁、进条件队列、等 signal。

### Future.get() 的阻塞

`FutureTask.get()` 内部用一个 `WaitNode` 链表保存等待线程，用 `LockSupport.park()` 阻塞。任务跑完后调 `finishCompletion()`，遍历等待链表逐个 `LockSupport.unpark(t)`。所以 `Future.get()` 不需要任何锁就能阻塞，靠的是 park。

## 代码示例

### sleep 不释放锁的演示

```java
public class SleepHoldsLock {
    private static final Object lock = new Object();

    public static void main(String[] args) throws InterruptedException {
        Thread t1 = new Thread(() -> {
            synchronized (lock) {
                System.out.println("t1 got lock, sleeping 3s");
                try { Thread.sleep(3000); } catch (InterruptedException ignored) {}
                System.out.println("t1 released lock");
            }
        });

        Thread t2 = new Thread(() -> {
            try { Thread.sleep(500); } catch (InterruptedException ignored) {}
            synchronized (lock) {
                System.out.println("t2 got lock"); // 必须 t1 出 synchronized 才能拿到
            }
        });

        t1.start(); t2.start();
        t1.join(); t2.join();
    }
}
```

### wait/notify 协作

```java
public class WaitNotifyDemo {
    public static void main(String[] args) throws InterruptedException {
        Object lock = new Object();
        Thread waiter = new Thread(() -> {
            synchronized (lock) {
                try {
                    System.out.println("waiter: waiting");
                    lock.wait();
                    System.out.println("waiter: resumed");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        waiter.start();
        Thread.sleep(500);
        synchronized (lock) {
            lock.notify();
        }
    }
}
```

### LockSupport.park/unpark

```java
import java.util.concurrent.locks.LockSupport;

public class ParkDemo {
    public static void main(String[] args) throws InterruptedException {
        Thread t = new Thread(() -> {
            System.out.println("parking");
            LockSupport.park();          // 阻塞
            System.out.println("unparked");
        });
        t.start();
        Thread.sleep(500);
        LockSupport.unpark(t);            // 精准唤醒 t
    }
}
```

### Future.get 超时阻塞

```java
import java.util.concurrent.*;

public class FutureDemo {
    public static void main(String[] args) {
        ExecutorService pool = Executors.newSingleThreadExecutor();
        Future<String> f = pool.submit(() -> {
            Thread.sleep(5000);
            return "done";
        });
        try {
            String r = f.get(1, TimeUnit.SECONDS); // 最多等 1 秒
            System.out.println(r);
        } catch (TimeoutException e) {
            System.out.println("timeout, cancel task");
            f.cancel(true);
        } catch (Exception e) {
            e.printStackTrace();
        }
        pool.shutdown();
    }
}
```

## 实战场景

| 场景 | 推荐阻塞方式 | 注意点 |
|------|--------------|--------|
| 退避重试 | `TimeUnit.MILLISECONDS.sleep(backoff)` | 要响应中断 |
| 优雅停机 | `volatile` + `CountDownLatch.await()` | 不用 sleep 轮询 |
| 生产者-消费者 | `BlockingQueue.put/take` | 队列必须带界 |
| 任务超时取消 | `Future.get(timeout)` | 拿不到结果要 `cancel(true)` |
| 多线程汇总 | `CompletableFuture.allOf().join()` | 比 `CountDownLatch` 更易组合 |
| 精准唤醒 | `Condition.signal()` / `LockSupport.unpark()` | 不要用 `notify()`，随机唤醒易出 bug |

## 深挖追问

### sleep 和 wait 到底有什么本质区别？

| 维度 | sleep | wait |
|------|-------|------|
| 所属 | Thread 静态方法 | Object 实例方法 |
| 释放锁 | 不释放 | 释放当前对象 monitor |
| 使用前提 | 任意位置 | 必须在 synchronized 块内 |
| 唤醒方式 | 超时 / 中断 | notify / notifyAll / 超时 / 中断 |
| 状态 | TIMED_WAITING | WAITING / TIMED_WAITING |
| 用途 | 简单延时 | 线程协作 |

### park 和 wait 怎么选？

- **不需要锁**：选 `park`。`park` 不依赖任何 monitor，开销小。
- **需要协作**：选 `wait` 配 synchronized 或 `await` 配 ReentrantLock，业务代码更直观。
- **要实现底层同步器**（AQS、FutureTask）：用 `park/unpark`，因为它精准、不依赖锁、可提前发许可。

### 为什么 await() 抛 InterruptedException 而 awaitUninterruptibly() 不抛？

`Condition` 提供三种 await 变体：响应中断（`await`）、不响应中断（`awaitUninterruptibly`）、超时（`awaitNanos`）。`awaitUninterruptibly()` 内部循环检查中断标志但不抛异常，调用者必须自己用 `Thread.interrupted()` 检查。实际开发几乎用不到这个方法。

### join() 是怎么实现的？

`Thread.join()` 内部是带超时的 `wait()`：

```java
public final synchronized void join(long millis) throws InterruptedException {
    while (isAlive()) {
        wait(millis);
    }
}
```

线程结束时，JVM 会在该 Thread 对象上自动调 `notifyAll()`，唤醒所有 join 等待者。所以 `join()` 必须是 synchronized——`wait()` 要求持有 monitor。

### InterruptedException 被抛出后中断标志还在吗？

不在。`wait/sleep/join/park` 抛出 `InterruptedException` 时会**清除**中断标志。如果上层还想感知中断，必须 `Thread.currentThread().interrupt()` 恢复标志位。

## 易错点

- 用 `sleep()` 做等待-通知——不释放锁，其他线程拿不到锁推不动条件，等于死锁。
- `wait()` 用 `if` 不用 `while`——虚假唤醒或 `notifyAll` 后条件不满足，会误执行。
- `notify()` 替代 `notifyAll()`——随机唤醒，可能唤醒"错类"线程导致死等。
- `park/unpark` 误以为可以累积许可——`unpark` 多次只算一次。
- `Future.get()` 不设超时——任务卡死时调用线程永久阻塞。
- 吞 `InterruptedException` 不恢复中断标志——上层无法感知，破坏协作。

## 总结

Java 阻塞 API 6 大类按是否释放锁和恢复方式区分。`sleep` 不释放锁、`wait` 释放 monitor、`park` 不依赖锁、`Condition.await` 释放 Lock、`BlockingQueue` 和 `Future` 是高级封装。`wait/notify` 必须在 synchronized 内、`wait` 必须 while 循环、`Future.get` 必须设超时——这三条是工程底线。`park/unpark` 凭许可机制和精准唤醒成为 AQS 等底层同步器的基石，但要理解"许可不累积"和"可提前 unpark"两个特性。

## 参考资料

- [LockSupport 官方文档](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/locks/LockSupport.html)
- [Object.wait 官方文档](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Object.html#wait())
- [Java Concurrency in Practice 第 14 章](https://jcip.net/)

---
