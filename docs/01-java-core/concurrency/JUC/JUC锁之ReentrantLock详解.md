# JUC锁之ReentrantLock详解

JUC锁之ReentrantLock详解
概述
ReentrantLock 是 Java 并发包 (java.util.concurrent.locks) 中的一个可重入互斥锁实现，它提供了比 synchronized 更灵活的锁机制。
底层实现
类的继承关系
ReentrantLock实现了Lock接口，Lock接口中定义了lock与unlock相关操作，并且还存在newCondition方法，表示生成一个条件。

public class ReentrantLock implements Lock, java.io.Serializable

类的内部类
ReentrantLock总共有三个内部类，并且三个内部类是紧密相关的，分别是Sync、NonfairSync、FairSync类，其中Sync继承AbstractQueuedSynchronizer抽象类，NonfairSync与FairSync均继承Sync类。
•  Sync类
提供默认的非公平锁获取实现nonfairTryAcquire()，tryRelease()，以及其他通用方法。

abstract static class Sync extends AbstractQueuedSynchronizer {
    // 序列号
    private static final long serialVersionUID = -5179523762034025860L;
    
    // 获取锁
    abstract void lock();
    
    // 非公平方式获取
    final boolean nonfairTryAcquire(int acquires) {
        // 当前线程
        final Thread current = Thread.currentThread();
        // 获取状态
        int c = getState();
        if (c == 0) { // 表示没有线程正在竞争该锁
            if (compareAndSetState(0, acquires)) { // 比较并设置状态成功，状态0表示锁没有被占用
                // 设置当前线程独占
                setExclusiveOwnerThread(current); 
                return true; // 成功
            }
        }
        else if (current == getExclusiveOwnerThread()) { // 当前线程拥有该锁
            int nextc = c + acquires; // 增加重入次数
            if (nextc < 0) // overflow
                throw new Error("Maximum lock count exceeded");
            // 设置状态
            setState(nextc); 
            // 成功
            return true; 
        }
        // 失败
        return false;
    }
    
    // 试图在共享模式下获取对象状态，此方法应该查询是否允许它在共享模式下获取对象状态，如果允许，则获取它
    protected final boolean tryRelease(int releases) {
        int c = getState() - releases;
        if (Thread.currentThread() != getExclusiveOwnerThread()) // 当前线程不为独占线程
            throw new IllegalMonitorStateException(); // 抛出异常
        // 释放标识
        boolean free = false; 
        if (c == 0) {
            free = true;
            // 已经释放，清空独占
            setExclusiveOwnerThread(null); 
        }
        // 设置标识
        setState(c); 
        return free; 
    }
    
    // 判断资源是否被当前线程占有
    protected final boolean isHeldExclusively() {
        // While we must in general read state before owner,
        // we don't need to do so to check if current thread is owner
        return getExclusiveOwnerThread() == Thread.currentThread();
    }

    // 新生一个条件
    final ConditionObject newCondition() {
        return new ConditionObject();
    }

    // Methods relayed from outer class
    // 返回资源的占用线程
    final Thread getOwner() {        
        return getState() == 0 ? null : getExclusiveOwnerThread();
    }
    // 返回状态
    final int getHoldCount() {            
        return isHeldExclusively() ? getState() : 0;
    }

    // 资源是否被占用
    final boolean isLocked() {        
        return getState() != 0;
    }

    /**
        * Reconstitutes the instance from a stream (that is, deserializes it).
        */
    // 自定义反序列化逻辑
    private void readObject(java.io.ObjectInputStream s)
        throws java.io.IOException, ClassNotFoundException {
        s.defaultReadObject();
        setState(0); // reset to unlocked state
    }
}

•  NonfairSync类
通过lock()方法获得锁，该方法首先会直接尝试CAS尝试获得锁，获取失败再acquire(1)进入等待队列。tryAcquire()直接使用父类Sync的nofairTryAcquire()非公平获取锁方法。

// 非公平锁
static final class NonfairSync extends Sync {
    // 版本号
    private static final long serialVersionUID = 7316153563782823691L;

    // 获得锁
    final void lock() {
        if (compareAndSetState(0, 1)) // 比较并设置状态成功，状态0表示锁没有被占用
            // 把当前线程设置独占了锁
            setExclusiveOwnerThread(Thread.currentThread());
        else // 锁已经被占用，或者set失败
            // 以独占模式获取对象，忽略中断
            acquire(1); 
    }

    protected final boolean tryAcquire(int acquires) {
        return nonfairTryAcquire(acquires);
    }
}

•  FairSyn类
通过hasQueuedPredecessors()判断等待队列是否已存在等待线程，只有不存在时才通过CAS获取锁，从而实现公平锁。

// 公平锁
static final class FairSync extends Sync {
    // 版本序列化
    private static final long serialVersionUID = -3000897897090466540L;

    final void lock() {
        // 以独占模式获取对象，忽略中断
        acquire(1);
    }

    /**
        * Fair version of tryAcquire.  Don't grant access unless
        * recursive call or no waiters or is first.
        */
    // 尝试公平获取锁
    protected final boolean tryAcquire(int acquires) {
        // 获取当前线程
        final Thread current = Thread.currentThread();
        // 获取状态
        int c = getState();
        if (c == 0) { // 状态为0
            if (!hasQueuedPredecessors() &&
                compareAndSetState(0, acquires)) { // 不存在已经等待更久的线程并且比较并且设置状态成功
                // 设置当前线程独占
                setExclusiveOwnerThread(current);
                return true;
            }
        }
        else if (current == getExclusiveOwnerThread()) { // 状态不为0，即资源已经被线程占据
            // 下一个状态
            int nextc = c + acquires;
            if (nextc < 0) // 超过了int的表示范围
                throw new Error("Maximum lock count exceeded");
            // 设置状态
            setState(nextc);
            return true;
        }
        return false;
    }
}

类的构造函数
•  ReentrantLock()：默认采用非公平策略获取锁。

public ReentrantLock() {
    // 默认非公平策略
    sync = new NonfairSync();
}
•  ReentrantLock(boolean)：参数为true表示公平策略，否则使用非公平策略。

public ReentrantLock(boolean fair) {
    sync = fair ? new FairSync() : new NonfairSync();
}

核心函数分析
通过分析ReentrantLock的源码，可知对其操作都转化为对Sync对象的操作，由于Sync继承了AQS，所以基本上都可以转为为对AQS的操作。比如对ReentrantLock的lock函数的调用，而具体会根据采用的策略的不同，而调用Sync的不同子类。
基本用法
基础用法

ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    // 临界区代码
} finally {
    lock.unlock(); // 必须在finally块中释放锁
}

可中断锁

try {
    lock.lockInterruptibly();
    // ...
} catch (InterruptedException e) {
    // 处理中断
} finally {
    if (lock.isHeldByCurrentThread()) {
        lock.unlock();
    }
}

尝试获取锁

if (lock.tryLock()) {
    try {
        // 获取锁成功
    } finally {
        lock.unlock();
    }
} else {
    // 获取锁失败
}

// 带超时的尝试
if (lock.tryLock(1, TimeUnit.SECONDS)) {
    // ...
}

条件变量使用

Condition condition = lock.newCondition();

// 等待线程
lock.lock();
try {
    while (!conditionSatisfied) {
        condition.await();
    }
    // 条件满足后的操作
} finally {
    lock.unlock();
}

// 通知线程
lock.lock();
try {
    conditionSatisfied = true;
    condition.signalAll();
} finally {
    lock.unlock();
}

锁的监控

// 获取等待队列长度
int queuedLength = lock.getQueueLength();

// 判断是否有线程在等待
boolean hasQueuedThreads = lock.hasQueuedThreads();

// 获取持有计数
int holdCount = lock.getHoldCount();

锁的信息获取

// 判断当前线程是否持有锁
boolean isHeld = lock.isHeldByCurrentThread();

// 判断锁是否被任何线程持有
boolean isLocked = lock.isLocked();


助记：• 什么是可重入，什么是可重入锁? 它用来解决什么问题?
• ReentrantLock的核心是AQS，那么它怎么来实现的，继承吗? 说说其类内部结构关系。
• ReentrantLock是如何实现公平锁的?ReentrantLock是如何实现非公平锁的?
• ReentrantLock默认实现的是公平还是非公平锁?
• 使用ReentrantLock实现公平和非公平锁的示例?
• ReentrantLock和Synchronized的对比?

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **JUC锁之ReentrantLock详解**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

JUC 相关问题要说明它解决的并发痛点：减少手写同步代码、提供高性能线程安全容器、原子类、锁、同步器和任务编排工具。回答时需要把 API 用法和底层机制联系起来，例如 CAS、AQS、队列、阻塞/唤醒、弱一致性迭代等。

## 深挖追问

- AQS 的 state、同步队列、独占/共享模式分别是什么作用？
- CAS 的 ABA、自旋开销、只能保护单变量等问题如何处理？
- JUC 容器和 `Collections.synchronizedXxx` 的适用场景有什么区别？
- 公平锁和非公平锁在吞吐、延迟、饥饿风险上如何取舍？

## 实战场景/代码示例

```java
AtomicInteger counter = new AtomicInteger();
int value = counter.incrementAndGet(); // 适合简单计数；复杂临界区仍应使用锁
```

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

