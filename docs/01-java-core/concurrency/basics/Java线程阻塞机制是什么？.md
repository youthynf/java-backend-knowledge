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

## 面试总结

围绕「Java线程阻塞机制是什么？」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

### 核心回答

1. Java 并发问题的核心是共享状态在多线程下的可见性、原子性和有序性。
2. 设计并发方案时要明确线程之间如何协作、如何退出、如何处理异常和超时。
3. 工程上还要考虑线程池复用、上下文清理、监控告警和压测验证。

### 高频追问

- 这个机制解决的是互斥、通信、调度还是资源隔离？
- 高并发下可能出现死锁、饥饿、活锁还是性能退化？
- 如何用线程 Dump 或指标证明你的判断？

### 实战落地

- **选型前**：先判断是互斥访问、线程协作、任务编排，还是限流隔离。
- **编码时**：控制共享变量范围，明确锁对象、超时策略、异常处理和资源释放。
- **上线后**：观察线程数、队列长度、阻塞时间、拒绝次数和 RT 抖动，必要时用线程 Dump 验证。

### 易错点

- 不要用 sleep 代替同步协作。
- 不要忽略中断、超时和资源释放。
