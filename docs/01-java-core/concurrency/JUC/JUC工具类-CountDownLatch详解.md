# JUC工具类-CountDownLatch详解

JUC工具类-CountDownLatch详解
一、概述
CountDownLatch是Java并发包(java.util.concurrent)中的一个同步工具类，它允许一个或多个线程等待其他线程完成操作后再继续执行。可以理解为"倒计时门闩"。其底层是由AQS提供支持，而AQS的数据结构核心就是两个虚拟队列，分别是同步队列sync queue和条件队列condition queue，不同条件会有不同的条件队列。CountDownLatch的典型用法是将一个程序分为n个互相独立的可解决任务，并创建值为n的CountDownLatch。当每个任务完成时，都会在这个锁存器上调用countDown，等待问题被解决的的任务调用这个锁存器的await将他们拦住，直到锁存器计数结束。

二、核心原理
内部实现
CountDownLatch基于AQS(AbstractQueuedSynchronizer)实现，但是CountDownLatch没有显式继承哪个父类或者哪个接口，它底层是通过内部类Sync继承AQS来实现的。

public class CountDownLatch {}
它主要包含以下关键部分：
•  计数器(state)：使用AQS的state字段表示当前计数；
•  await()：使当前线程等待直到计数器归零；
•  countDown()：减少计数器值；
内部类Sync
CountDownLatch类存在一个内部类Sync，继承自AbstractQueuedSynchronizer，对CountDownLatch方法的调用会转发到对Sync或AQS的方法调用，所以AQS对CountDownLatch提供支持。

private static final class Sync extends AbstractQueuedSynchronizer {
    // 版本号
    private static final long serialVersionUID = 4982264981922014374L;
    
    // 构造器
    Sync(int count) {
        setState(count);
    }
    
    // 返回当前计数
    int getCount() {
        return getState();
    }

    // 试图在共享模式下获取对象状态
    protected int tryAcquireShared(int acquires) {
        return (getState() == 0) ? 1 : -1;
    }

    // 试图设置状态来反映共享模式下的一个释放
    protected boolean tryReleaseShared(int releases) {
        // Decrement count; signal when transition to zero
        // 无限循环
        for (;;) {
            // 获取状态
            int c = getState();
            if (c == 0) // 没有被线程占有
                return false;
            // 下一个状态
            int nextc = c-1;
            if (compareAndSetState(c, nextc)) // 比较并且设置成功
                return nextc == 0;
        }
    }
}

工作流程
•  初始化：创建CountDownLatch时指定初始计数值

CountDownLatch latch = new CountDownLatch(3); // 初始计数器=3

// 类的构造函数
public CountDownLatch(int count) {
    if (count < 0) throw new IllegalArgumentException("count < 0");
    // 初始化状态数
    this.sync = new Sync(count);
}

•  等待线程：此函数将会使当前线程在锁存器倒计数至零之前一直等待，除非线程被中断。

latch.await();

public void await() throws InterruptedException {
    // 转发到sync对象上
    sync.acquireSharedInterruptibly(1);
}

public final void acquireSharedInterruptibly(int arg)
        throws InterruptedException {
    if (Thread.interrupted())
        throw new InterruptedException();
    if (tryAcquireShared(arg) < 0)
        doAcquireSharedInterruptibly(arg);
}

// 该函数只是简单的判断AQS的state是否为0，为0则返回1，不为0则返回-1。
protected int tryAcquireShared(int acquires) {
    return (getState() == 0) ? 1 : -1;
}

private void doAcquireSharedInterruptibly(int arg) throws InterruptedException {
    // 添加节点至等待队列
    final Node node = addWaiter(Node.SHARED);
    boolean failed = true;
    try {
        for (;;) { // 无限循环
            // 获取node的前驱节点
            final Node p = node.predecessor();
            if (p == head) { // 前驱节点为头节点
                // 试图在共享模式下获取对象状态
                int r = tryAcquireShared(arg);
                if (r >= 0) { // 获取成功
                    // 设置头节点并进行繁殖
                    setHeadAndPropagate(node, r);
                    // 设置节点next域
                    p.next = null; // help GC
                    failed = false;
                    return;
                }
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt()) // 在获取失败后是否需要禁止线程并且进行中断检查
                // 抛出异常
                throw new InterruptedException();
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}

•  计数线程：其他线程完成任务后调用countDown()减少计数

latch.countDown(); // 计数器减1

public void countDown() {
    sync.releaseShared(1);
}

public final boolean releaseShared(int arg) {
    if (tryReleaseShared(arg)) {
        doReleaseShared();
        return true;
    }
    return false;
}

// 此函数会试图设置状态来反映共享模式下的一个释放
protected boolean tryReleaseShared(int releases) {
    // Decrement count; signal when transition to zero
    // 无限循环
    for (;;) {
        // 获取状态
        int c = getState();
        if (c == 0) // 没有被线程占有
            return false;
        // 下一个状态
        int nextc = c-1;
        if (compareAndSetState(c, nextc)) // 比较并且设置成功
            return nextc == 0;
    }
}

private void doReleaseShared() {
    /*
        * Ensure that a release propagates, even if there are other
        * in-progress acquires/releases.  This proceeds in the usual
        * way of trying to unparkSuccessor of head if it needs
        * signal. But if it does not, status is set to PROPAGATE to
        * ensure that upon release, propagation continues.
        * Additionally, we must loop in case a new node is added
        * while we are doing this. Also, unlike other uses of
        * unparkSuccessor, we need to know if CAS to reset status
        * fails, if so rechecking.
        */
    // 无限循环
    for (;;) {
        // 保存头节点
        Node h = head;
        if (h != null && h != tail) { // 头节点不为空并且头节点不为尾结点
            // 获取头节点的等待状态
            int ws = h.waitStatus; 
            if (ws == Node.SIGNAL) { // 状态为SIGNAL
                if (!compareAndSetWaitStatus(h, Node.SIGNAL, 0)) // 不成功就继续
                    continue;            // loop to recheck cases
                // 释放后继结点
                unparkSuccessor(h);
            }
            else if (ws == 0 &&
                        !compareAndSetWaitStatus(h, 0, Node.PROPAGATE)) // 状态为0并且不成功，继续
                continue;                // loop on failed CAS
        }
        if (h == head) // 若头节点改变，继续循环  
            break;
    }
}

•  释放等待线程：当计数器减到0时，所有等待线程被唤醒
三、使用场景
主线程等待多个子线程完成任务

CountDownLatch latch = new CountDownLatch(N);
for (int i = 0; i < N; i++) {
    new Thread(() -> {
        // 执行任务
        latch.countDown();
    }).start();
}
latch.await(); // 主线程等待所有任务完成

多个线程等待某个事件发生

CountDownLatch startSignal = new CountDownLatch(1);
for (int i = 0; i < N; i++) {
    new Thread(() -> {
        startSignal.await(); // 所有线程等待开始信号
        // 执行任务
    }).start();
}
// 准备阶段...
startSignal.countDown(); // 释放所有等待线程

模拟高并发场景

CountDownLatch startLatch = new CountDownLatch(1);
CountDownLatch endLatch = new CountDownLatch(THREAD_COUNT);
  
for (int i = 0; i < THREAD_COUNT; i++) {
    new Thread(() -> {
        startLatch.await(); // 等待开始信号
        try {
            // 执行测试逻辑
        } finally {
            endLatch.countDown(); // 通知完成
        }
    }).start();
}
  
startLatch.countDown(); // 同时释放所有线程
endLatch.await(); // 等待所有线程完成

四、注意事项
计数器不可重置：CountDownLatch的计数器只能使用一次，如果需要重复使用，考虑使用CyclicBarrier
await()的超时版本：

boolean completed = latch.await(10, TimeUnit.SECONDS);
避免死锁：确保countDown()一定会被调用，否则等待线程会一直阻塞
性能考虑：对于极高并发场景，频繁的await()/countDown()可能成为性能瓶颈
