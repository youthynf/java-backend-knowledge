# Java线程阻塞机制是什么？

Java线程阻塞机制是什么？
Java提供了多种线程阻塞（Thread Blocking）机制，用于控制线程的执行顺序、协调多线程任务或等待特定条件。
基于Object的阻塞（wait()/notify()）
wait()方法调用前线程必须持有对象的监视器锁（synchronized块内调用），否则抛出IllegalMonitorStateException；调用后，线程释放锁并进入等待状态，直到被notify()或notifyAll()唤醒，被唤醒后，线程需要重新竞争锁才能继续进行。notify()随机唤醒一个等待线程，notifyAll()唤醒所有等待线程，二者都无法精确唤醒某个特定线程。

Object lock = new Object();

// 线程A（等待）
synchronized (lock) {
    lock.wait(); // 释放锁并阻塞
    System.out.println("Thread A resumed");
}

// 线程B（唤醒）
synchronized (lock) {
    lock.notify(); // 唤醒一个等待线程
}

基于Lock和Condition的阻塞
Condition.await()类似Object.wait()，但必须配合Lock使用，而Condition.signal()/signalAll()类似notify()/notifyAll()，但可以绑定多个条件队列，可以指定队列精准唤醒。

Lock lock = new ReentrantLock();
Condition condition = lock.newCondition();

// 线程A（等待）
lock.lock();
try {
    condition.await(); // 释放锁并阻塞
    System.out.println("Thread A resumed");
} finally {
    lock.unlock();
}

// 线程B（唤醒）
lock.lock();
try {
    condition.signal(); // 唤醒一个等待线程
} finally {
    lock.unlock();
}

基于LockSupport的阻塞（park()/unpark()）
LockSupport.park()直接阻塞当前线程，无需获得锁，通过LockSupport.unpark(thread)精确唤醒指定线程。

Thread thread = new Thread(() -> {
    System.out.println("Thread will park");
    LockSupport.park(); // 阻塞
    System.out.println("Thread resumed");
});

thread.start();
Thread.sleep(1000);
LockSupport.unpark(thread); // 唤醒

基于Thread.sleep()的阻塞
使用Thread.sleep(millis)让当前线程休眠指定时间，不是放锁，但可能造成死锁，推荐使用TimeUnit.SECONDS.sleep(1)更易读。

System.out.println("Sleeping...");
Thread.sleep(1000); // 阻塞1秒
System.out.println("Awake!");

基于BlockingQueue的阻塞
使用BlockingQueue.take()如果队列为空，阻塞直到有元素，BlockingQueue.put()如果队列满，阻塞直到有空位。线程安全，无需手动同步，支持超时（poll(timeout)/offer(timeout)）。

BlockingQueue<String> queue = new ArrayBlockingQueue<>(10);

// 生产者
queue.put("Task"); // 如果队列满则阻塞

// 消费者
String task = queue.take(); // 如果队列空则阻塞

基于Future的阻塞（get()）
Future.get()阻塞直到异步任务完成，Future.get(timeout)超时等待。

ExecutorService executor = Executors.newSingleThreadExecutor();
Future<String> future = executor.submit(() -> "Result");

String result = future.get(); // 阻塞直到任务完成
System.out.println(result);

基于CountDownLatch/CycliBarrier的阻塞
CountDownLatch.await()阻塞直到计数器归零，不可重用；CycliBarrier.await()阻塞直到所有线程到达屏障，可重用。

// CountDownLatch
CountDownLatch latch = new CountDownLatch(3);
new Thread(() -> {
    latch.countDown(); // 计数器减1
}).start();
latch.await(); // 阻塞直到计数器归零

// CyclicBarrier
CyclicBarrier barrier = new CyclicBarrier(3);
new Thread(() -> {
    barrier.await(); // 阻塞直到3个线程都到达
}).start();

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **Java线程阻塞机制是什么？**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

线程基础问题要从线程生命周期、调度、同步和通信四条线回答。Java 线程是对底层线程能力的封装，运行结果受 JVM、操作系统调度和同步机制共同影响。面试中要能区分线程状态、阻塞原因、唤醒条件以及常用通信方式。

## 深挖追问

- `BLOCKED`、`WAITING`、`TIMED_WAITING` 如何区分？
- `sleep()`、`wait()`、`join()`、`park()` 的释放锁和唤醒条件有什么不同？
- 线程中断是强制停止吗？业务代码如何响应中断？
- ThreadLocal 在线程池中为什么容易泄漏？

## 实战场景/代码示例

```java
Thread t = new Thread(() -> {
    while (!Thread.currentThread().isInterrupted()) {
        // 执行可中断任务
    }
});
t.start();
t.interrupt(); // 发出中断信号，是否退出取决于任务是否响应
```

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

