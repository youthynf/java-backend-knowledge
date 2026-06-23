# Java有哪些锁？

Java有哪些锁？
乐观锁与悲观锁
乐观锁：认为自己在使用数据时不会有别的线程修改数据，所以不会添加锁，只是在更新数据的时候去判断之前有没有别的线程修改了这个数据，如果这个数据没有被更新，当前线程将自己修改的数据成功写入，如果数据已经被其他线程更新，则根据不同的实现方式执行不同的操作，如报错或重试。JUC原子类采用的是乐观锁。
悲观锁：认为自己在使用数据的时候一定有别的线程来修改数据，因此在获取数据的时候会先加锁，确保数据不会被别的线程修改。Java中synchronized关键字和Lock的实现类都是悲观锁。

// ------------------------- 悲观锁的调用方式 -------------------------
// synchronized
public synchronized void testMethod() {
        // 操作同步资源
}
// ReentrantLock
private ReentrantLock lock = new ReentrantLock(); // 需要保证多个线程使用的是同一个锁
public void modifyPublicResources() {
        lock.lock();
        // 操作同步资源
        lock.unlock();
}

// ------------------------- 乐观锁的调用方式 -------------------------
private AtomicInteger atomicInteger = new AtomicInteger();  // 需要保证多个线程使用的是同一个AtomicInteger
atomicInteger.incrementAndGet(); //执行自增1

自旋锁和适应性自旋锁
自旋锁：自旋锁是一种非阻塞锁，当线程需要获取锁时，如果锁已经被占用，不会立即阻塞当前线程，而是循环（自旋）检查锁的状态，直到锁被释放。优点是可以减少上下文切换开销，缺点是如果锁占用时间很长，会白白浪费处理器资源；
适应性自旋锁：自旋锁的优化版本，动态调整自旋的时间。主要调整依据是历史获得锁的自旋时间、当前等待锁的线程数量、JVM运行时统计的锁竞争状态。synchronized和ReentrantLock已内置集成智能自旋策略。

无锁、偏向锁、轻量级锁、重量级锁
这四种锁是指锁的状态，专门针对synchronized的。其中偏向锁通过针对Mark Word解决锁的问题，避免执行CAS操作。而轻量级锁是通过用CAS操作和自旋来解决加锁问题，避免线程阻塞和唤醒而影响性能。重量级锁是将除了拥有锁的线程之外的线程都阻塞住。
公平锁和非公平锁
公平锁：指多个线程按照申请锁的顺序来获取锁，线程直接进入队列中排队，队列中的第一个线程才能获得锁。优点是等待锁的线程不会饿死，缺点是整体吞吐率相对非公平锁要低，等待队列中除了第一个线程之外的线程都会阻塞，CPU唤醒阻塞线程的开销比非公平锁大。
非公平锁：多个线程加锁时直接尝试获得锁，获取不到才会进入等待队列的尾部等待，但如果此时锁刚好可用，那么这个线程可以无需阻塞直接获得锁。优点是可以减少CPU唤醒线程的开销，整体吞吐效率高，因为线程有几率不阻塞直接获得锁，CPU不需要唤醒所有线程。缺点是处于等待队列中的线程可能饿死或等待很久才获得锁。

可重入锁和非可重入锁
可重入锁：指在同一个线程在外层方法获取锁的时候，再次进入该线程的内层方法会自动获取锁（前提是锁对象前后是同一个对象或class）。底层实现原理是通过记录当前持有锁的线程和重入次数（计数器）实现的。优点是可以一定程度上避免死锁。Java中的ReentrantLock和synchronized都是可重入锁。

import java.util.concurrent.locks.ReentrantLock;

public class ReentrantLockDemo {
    private final ReentrantLock lock = new ReentrantLock();

    public void outer() {
        lock.lock();
        try {
            System.out.println("Outer lock");
            inner(); // 可重入
        } finally {
            lock.unlock();
        }
    }

    public void inner() {
        lock.lock();
        try {
            System.out.println("Inner lock");
        } finally {
            lock.unlock();
        }
    }

    public static void main(String[] args) {
        new ReentrantLockDemo().outer();
    }
}
非可重入锁：同一个线程无法重复获得同一把锁，试图重入会导致死锁。底层实现是仅检查当前锁是否被占用，不区分持有线程。

public class NonReentrantLock {
    private boolean isLocked = false;
    private Thread lockedBy = null;

    public synchronized void lock() throws InterruptedException {
        while (isLocked && lockedBy != Thread.currentThread()) {
            wait(); // 非当前线程持有锁时阻塞
        }
        isLocked = true;
        lockedBy = Thread.currentThread();
    }

    public synchronized void unlock() {
        if (Thread.currentThread() == lockedBy) {
            isLocked = false;
            lockedBy = null;
            notify();
        }
    }
}

// 测试（会死锁！）
public class NonReentrantDemo {
    private final NonReentrantLock lock = new NonReentrantLock();

    public void outer() throws InterruptedException {
        lock.lock();
        try {
            System.out.println("Outer lock");
            inner(); // 尝试重入，导致死锁
        } finally {
            lock.unlock();
        }
    }

    public void inner() throws InterruptedException {
        lock.lock();
        try {
            System.out.println("Inner lock");
        } finally {
            lock.unlock();
        }
    }

    public static void main(String[] args) throws InterruptedException {
        new NonReentrantDemo().outer(); // 调用outer()会阻塞在inner()
    }
}

ReentrantLock和NonReentrantLock都继承父类AQS，其父类AQS中维护了一个同步状态status来计算重入次数，status为0。当线程尝试获取锁时，可重入锁现场时获取并更新status值，如果status≠0，则判断当前线程是否获取到这个锁，如果时的话直接status+1，且当前线程可以再次获得锁；而非重入锁是直接去获取并尝试更新当前status指，如果status≠0的话会导致其获取锁失败，当前线程阻塞。释放锁时，可重入锁同样先获取当前status的值，在当前线程时持有锁的线程的前提下，如果status==0，则表示所有重复获取锁的操作都执行完成，才会真正释放锁；而非重入锁则是在确定当前线程时持有锁的线程后，直接将status置0，将锁释放。

独享锁和共享锁
独享锁：也叫排它锁，指该锁只能被一个线程持有，如果线程A对某数据加上排他锁后，则其他线程不能对该数据加任何类型的锁。获得排它锁的线程既能读取数据，又能修改数据。JDK中的synchronized和JUC中的Lock实现类就是独享锁。
共享锁：指锁可以被多个线程持有，如果线程A对某数据加上共享锁后，其他线程只能对该数据加共享锁，不能加排它锁。获得共享锁的线程只能读取数据，不能修改数据。

注：独享锁和共享锁也是通过AQS来实现的，通过实现不同的方法，来实现独享或共享。

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **Java有哪些锁？**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

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

