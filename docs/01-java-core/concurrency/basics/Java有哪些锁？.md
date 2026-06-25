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

## 面试总结

围绕「Java有哪些锁？」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

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
## 核心概念
Java有哪些锁？ 可以放在“并发能力”这条主线里理解。复习时不要只背结论，要先说明它解决的核心问题，再解释关键机制、适用边界和代价。围绕这个知识点，重点关注：线程安全、可见性、原子性、锁竞争、线程池参数、队列选择、拒绝策略和故障隔离。如果面试官继续追问，通常会从“为什么这样设计、在什么场景会失效、线上如何排查”三个方向展开。

## 面试回答与追问
- **标准回答**：先给出 Java有哪些锁？ 的定位，再说明它依赖的核心原理，最后结合业务场景说明如何使用。回答时要把“能解决什么问题”和“会带来什么成本”一起讲清楚。
- **常见追问**：如果数据量、并发量或调用链路继续放大，Java有哪些锁？ 的瓶颈会出现在哪里？如何观测、如何优化、如何回滚？
- **易错点**：不要把概念和具体实现混在一起，也不要只说 API 名称。面试中更重要的是说清楚边界条件、失败场景和取舍依据。

## 实战场景与排查
典型落地场景包括：高并发接口、异步任务、定时任务、批量处理、缓存刷新、消息消费等需要控制吞吐与稳定性的场景。实际处理线上问题时，可以按“现象确认 → 指标采集 → 假设验证 → 小步修复 → 复盘沉淀”的路径推进。先看日志、监控、链路追踪和核心指标，再判断是容量问题、配置问题、代码路径问题，还是外部依赖抖动。

## 总结
复习 Java有哪些锁？ 时，建议把它和相邻知识点放在一起比较：相同点是什么、区别在哪里、为什么当前场景选择它而不是替代方案。能讲清楚这些内容，才算真正掌握。
