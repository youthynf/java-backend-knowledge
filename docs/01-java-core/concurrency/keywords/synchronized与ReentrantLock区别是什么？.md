# synchronized与ReentrantLock区别是什么？

synchronized与ReentrantLock区别是什么？
概述
synchronized 和 ReentrantLock 都是 Java 中用于线程同步的机制，但它们在实现方式、功能和使用场景上有显著区别。
基本对比
锁的实现：synchronized是JVM内置关键字，而ReentrantLock则是JDK提供的类，位于java.util.concurrent.locks包下；
锁的获取方式：synchronized是自动加锁/释放，而ReentrantLock则需要手动 lock() / unlock()；
是否可中断：synchronized不可中断，而ReentrantLock支持可中断 (lockInterruptibly())；
是否可设置超时：synchronized不支持设置锁超时，ReentrantLock支持 (tryLock(timeout, unit))；
是否公平锁：synchronized是非公平锁，而ReentrantLock支持配置公平/非公平；
条件变量：synchronized只有单一wait()/notify()，而ReentrantLock支持多个 Condition；
性能：JDK6 后优化，两者性能接近，ReentrantLock高竞争时略优；
锁的释放：synchronized是自动释放（代码块结束或异常），而ReentrantLock必须手动 unlock()（否则死锁）。

核心区别详解
锁的获取与释放
•  synchronized进入同步块自动获取锁，执行完成或异常退出时自动释放，无需手动管理锁状态。

synchronized (obj) {
    // 临界区代码
} // 自动释放锁
•  ReentrantLock必须显式调用lock()/unlock()进行加解锁，否则可能导致死锁，必须将unlock()放在finally块中确保释放。

ReentrantLock lock = new ReentrantLock();
lock.lock();  // 必须手动加锁
try {
    // 临界区代码
} finally {
    lock.unlock();  // 必须手动释放
}

可中断性
•  synchronized线程在等待锁时不可中断，会一直阻塞。
•  ReentrantLock提供lockInterruptibly()方法，允许线程在等待锁时响应中断：

try {
    lock.lockInterruptibly();  // 可中断获取锁
    // 临界区代码
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();  // 恢复中断状态
} finally {
    if (lock.isHeldByCurrentThread()) {
        lock.unlock();
    }
}

超时获取锁
•  synchronized无法设置超时，线程会无限等待。
•  ReentrantLock提供了tryLock(timeout, unit)，支持设置超时时间：

if (lock.tryLock(3, TimeUnit.SECONDS)) {  // 尝试获取锁，最多等3秒
    try {
        // 临界区代码
    } finally {
        lock.unlock();
    }
} else {
    System.out.println("获取锁失败，执行备用逻辑");
}

公平锁与非公平锁
•  synchronized默认是非公平锁，不保证等待事假最长的线程先获得锁。
•  ReentrantLock支持配置公平/非公平锁，公平锁按照线程等待顺序分配锁（减少饥饿，但吞吐量较低），非公平锁允许插队（默认，吞吐量更高）：

ReentrantLock fairLock = new ReentrantLock(true);  // 公平锁

条件变量（Condition）
•  synchronized只能通过wait()/notify()实现简单的等待-通知机制，所有等待线程共用同一个条件队列；
•  ReentrantLock支持多个Condition，可精细化控制线程唤醒：

ReentrantLock lock = new ReentrantLock();
Condition notEmpty = lock.newCondition();  // 条件1：队列非空
Condition notFull = lock.newCondition();   // 条件2：队列未满

// 生产者
lock.lock();
try {
    while (queue.isFull()) {
        notFull.await();  // 等待"未满"条件
    }
    queue.add(item);
    notEmpty.signal();    // 唤醒"非空"等待线程
} finally {
    lock.unlock();
}

// 消费者
lock.lock();
try {
    while (queue.isEmpty()) {
        notEmpty.await();  // 等待"非空"条件
    }
    queue.remove();
    notFull.signal();      // 唤醒"未满"等待线程
} finally {
    lock.unlock();
}

性能对比
低竞争场景：
synchronized性能捷径ReentrantLock，JDK6后优化了偏向锁、轻量级锁；
高竞争场景：
ReentrantLock略优，可以减少线程阻塞，支持更灵活的调度。
