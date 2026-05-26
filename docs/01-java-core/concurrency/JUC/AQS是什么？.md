# AQS是什么？

AQS是什么？
一、概述
AQS（AbstractQueuedSynchronizer）是一个用来构建锁和同步器的框架，位于Java 并发包 (java.util.concurrent.locks)下，它为实现阻塞锁和相关同步器（如信号量、事件等）提供了一个FIFO等待队列的基础实现，使用AQS能简单且高效地构造出应用广泛的大量的同步器，比如我们提到的ReentrantLock，Semaphore，其他的诸如ReentrantReadWriteLock，SynchronousQueue，FutureTask等等皆是基于AQS的。当然，我们自己也能利用AQS非常轻松容易地构造出符合我们自己需求的同步器。

二、核心思想
AQS核心思想是，如果被请求的共享资源空闲，则将当前请求资源的线程设置为有效的工作线程，并且将共享资源设置为锁定状态。如果被请求的共享资源被占用，那么就需要一套线程阻塞等待以及被唤醒时锁分配的机制，这个机制AQS是用CLH队列锁实现的，即将暂时获取不到锁的线程加入到队列中。
CLH(Craig,Landin,and Hagersten)队列是一个虚拟的双向队列(虚拟的双向队列即不存在队列实例，仅存在结点之间的关联关系)。AQS是将每条请求共享资源的线程封装成一个CLH锁队列的一个结点(Node)来实现锁的分配。

AQS使用一个int成员变量state来表示同步状态，通过内置的FIFO队列来完成获取资源线程的排队工作。AQS使用CAS对该同步状态进行原子操作，实现对其值的修改。状态信息通过protected的getState、setState、compareAndSetState进行操作。

//返回同步状态的当前值
protected final int getState() {  
        return state;
}
 // 设置同步状态的值
protected final void setState(int newState) { 
        state = newState;
}
//原子地(CAS操作)将同步状态值设置为给定值update如果当前同步状态的值等于expect(期望值)
protected final boolean compareAndSetState(int expect, int update) {
        return unsafe.compareAndSwapInt(this, stateOffset, expect, update);
}

三、核心结构

// 主要组成
private volatile int state;          // 同步状态
private transient volatile Node head; // 等待队列头节点
private transient volatile Node tail; // 等待队列尾节点

// 内部 Node 类
static final class Node {
    volatile int waitStatus;        // 等待状态
    volatile Node prev;             // 前驱节点
    volatile Node next;             // 后继节点
    volatile Thread thread;         // 关联线程
    Node nextWaiter;                // 条件队列专用
}

四、关键方法
同步器的设计是基于模板方法模式的，如果需要自定义同步器的一般方式是：使用者继承AbstractQueuedSynchronizer并重写指定的方法，这些重写方法无非是对于共享资源state的获取和释放。将AQS组合在自定义同步组件的实现中，并调用其模板方法，而这些模板方法会调用使用者重写的方法。
需要子类实现的方法

isHeldExclusively()//该线程是否正在独占资源。只有用到condition才需要去实现它。
tryAcquire(int)//独占方式。尝试获取资源，成功则返回true，失败则返回false。
tryRelease(int)//独占方式。尝试释放资源，成功则返回true，失败则返回false。
tryAcquireShared(int)//共享方式。尝试获取资源。负数表示失败；0表示成功，但没有剩余可用资源；正数表示成功，且有剩余资源。 
tryReleaseShared(int)//共享方式。尝试释放资源，成功则返回true，失败则返回false。

模板方法（可直接使用）

acquire(int) ：获取独占锁（不可中断）；
acquireInterruptibly(int)：可中断获取独占锁；
tryAcquireNanos(int, long)：带超时的获取独占锁；
release(int)：释放独占锁；
acquireShared(int)：获取共享锁；
releaseShared(int)：释放共享锁；

以ReentrantLock为例，state初始化为0，表示未锁定状态。A线程lock()时，会调用tryAcquire()独占该锁并将state+1。此后，其他线程再tryAcquire()时就会失败，直到A线程unlock()到state=0(即释放锁)为止，其它线程才有机会获取该锁。当然，释放锁之前，A线程自己是可以重复获取此锁的(state会累加)，这就是可重入的概念。但要注意，获取多少次就要释放多么次，这样才能保证state是能回到零态的。
五、实现原理
1. 独占模式（如 ReentrantLock）
获取锁流程：
•  调用tryAcquire()尝试获取锁；
•  失败后创建Node加入等待队列尾部；
•  自旋检查前驱节点是否为头节点；
•  如果是则再次尝试获取锁；
•  否则挂起线程（通过 LockSupport.park()）；

释放锁流程：
•  调用 tryRelease() 释放资源；
•  唤醒后继节点线程（unparkSuccessor()）；

2. 共享模式（如 Semaphore）
获取锁流程：
•  调用tryAcquireShared()尝试获取共享资源
•  返回值≥0表示成功，<0表示失败
•  失败后进入等待队列
•  被唤醒后传播唤醒信号（doReleaseShared()）

六、状态管理
AQS 使用 state 变量表示资源状态：
•  ReentrantLock：state=0 表示未锁定，>0 表示重入次数
•  Semaphore：state 表示可用许可数
•  CountDownLatch：state 表示初始计数

七、AQS在JUC中的应用
•  ReentrantLock：使用独占模式，state表示重入次数；
•  ReentrantReadWriteLock：使用读共享/写独占模式，state的高16位读状态，低16位写状态；
•  Semaphore：使用共享模式，state表示可用许可数；
•  CountDownLatch：使用共享模式，state表示初始计数；
•  FutureTask：使用独占模式，state表示任务状态（未开始/运行中/已完成）；

八、AQS源码关键点
节点状态（waitStatus）

static final int CANCELLED =  1;  // 节点已取消
static final int SIGNAL    = -1;  // 后继节点需要唤醒
static final int CONDITION = -2;  // 节点在条件队列中
static final int PROPAGATE = -3;  // 共享模式下传播唤醒

获取锁核心逻辑（acquireQueued）

final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return interrupted;
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}

九、AQS设计优势
灵活性：通过模板方法支持多种同步器实现
高性能：CLH 队列减少锁竞争
可扩展：支持独占和共享两种模式
可靠性：完善的取消和中断处理机制
十、自定义AQS示例（实现非重入锁）

class NonReentrantLock implements Lock {
    private static class Sync extends AbstractQueuedSynchronizer {
        protected boolean tryAcquire(int acquires) {
            if (compareAndSetState(0, 1)) {
                setExclusiveOwnerThread(Thread.currentThread());
                return true;
            }
            return false;
        }
        
        protected boolean tryRelease(int releases) {
            if (getState() == 0)
                throw new IllegalMonitorStateException();
            setExclusiveOwnerThread(null);
            setState(0);
            return true;
        }
    }
    
    private final Sync sync = new Sync();
    
    public void lock() { sync.acquire(1); }
    public void unlock() { sync.release(1); }
    // 其他 Lock 方法实现...
}

十一、AQS使用注意事项
实现 tryAcquire/tryRelease 时要保证线程安全；
状态变量 state 需要使用原子操作更新；
注意处理中断和超时情况；
共享模式需要正确实现传播逻辑；
