# JUC工具类之Semaphore详解

JUC工具类之Semaphore详解
一、概述
Semaphore（信号量）是一种用于控制多线程/多进程访问共享资源的同步机制，由荷兰计算机科学家Edsger Dijkstra在1960年代提出。它是并发编程中的基础工具之一。
二、基本概念
Semaphore本质上是一个计数器，用于管理对共享资源的访问权限。它包含两个主要操作：
P操作（Proberen，荷兰语"尝试"）：也称为wait()或acquire()
•  减少信号量的值
•  如果值变为负值，则阻塞当前线程/进程

V操作（Verhogen，荷兰语"增加"）：也称为signal()或release()
•  增加信号量的值
•  如果有线程/进程在等待，则唤醒其中一个

三、工作原理
类的继承关系
Semaphore实现了Serializable接口，即可以进行序列化。Semaphore自身只有两个属性，最重要的是sync属性，基于Semaphore对象的操作绝大多数都转移到了对sync的操作。

public class Semaphore implements java.io.Serializable {
    // 版本号
    private static final long serialVersionUID = -3222578661600680210L;
    // 属性
    private final Sync sync;
}

类的内部类
Semaphore总共有三个内部类，并且内部类是紧密相关的。Semaphore与ReentrantLock的内部类的结构相同，类内部总共存在Sync、NonfairSync、FairSync三个类，NonfairSync与FairSync类继承自Sync类，Sync类继承自AbstractQueuedSynchronizer抽象类。
•  内部类-Sync类

// 内部类，继承自AQS
abstract static class Sync extends AbstractQueuedSynchronizer {
    // 版本号
    private static final long serialVersionUID = 1192457210091910933L;
    
    // 构造函数
    Sync(int permits) {
        // 设置状态数
        setState(permits);
    }
    
    // 获取许可
    final int getPermits() {
        return getState();
    }

    // 共享模式下非公平策略获取
    final int nonfairTryAcquireShared(int acquires) {
        for (;;) { // 无限循环
            // 获取许可数
            int available = getState();
            // 剩余的许可
            int remaining = available - acquires;
            if (remaining < 0 ||
                compareAndSetState(available, remaining)) // 许可小于0或者比较并且设置状态成功
                return remaining;
        }
    }
    
    // 共享模式下进行释放
    protected final boolean tryReleaseShared(int releases) {
        for (;;) { // 无限循环
            // 获取许可
            int current = getState();
            // 可用的许可
            int next = current + releases;
            if (next < current) // overflow
                throw new Error("Maximum permit count exceeded");
            if (compareAndSetState(current, next)) // 比较并进行设置成功
                return true;
        }
    }

    // 根据指定的缩减量减小可用许可的数目
    final void reducePermits(int reductions) {
        for (;;) { // 无限循环
            // 获取许可
            int current = getState();
            // 可用的许可
            int next = current - reductions;
            if (next > current) // underflow
                throw new Error("Permit count underflow");
            if (compareAndSetState(current, next)) // 比较并进行设置成功
                return;
        }
    }

    // 获取并返回立即可用的所有许可
    final int drainPermits() {
        for (;;) { // 无限循环
            // 获取许可
            int current = getState();
            if (current == 0 || compareAndSetState(current, 0)) // 许可为0或者比较并设置成功
                return current;
        }
    }
}

•  内部类-NonfairSync类
NonfairSync类继承了Sync类，表示采用非公平策略获取资源，其只有一个tryAcquireShared方法，重写了AQS的该方法。

static final class NonfairSync extends Sync {
    // 版本号
    private static final long serialVersionUID = -2694183684443567898L;
    
    // 构造函数
    NonfairSync(int permits) {
        super(permits);
    }
    // 共享模式下获取
    protected int tryAcquireShared(int acquires) {
        return nonfairTryAcquireShared(acquires);
    }
}

•  类的内部类-FairSync类
FairSync类继承了Sync类，表示采用公平策略获取资源，其只有一个tryAcquireShared方法，重写了AQS的该方法。

protected int tryAcquireShared(int acquires) {
    for (;;) { // 无限循环
        if (hasQueuedPredecessors()) // 同步队列中存在其他节点
            return -1;
        // 获取许可
        int available = getState();
        // 剩余的许可
        int remaining = available - acquires;
        if (remaining < 0 ||
            compareAndSetState(available, remaining)) // 剩余的许可小于0或者比较设置成功
            return remaining;
    }
}
从tryAcquireShared方法的源码可知，它使用公平策略来获取资源，它会判断同步队列中是否存在其他的等待节点。

类的构造函数
•  Semaphore(int)类型构造函数：默认是非公平锁

public Semaphore(int permits) {
    sync = new NonfairSync(permits);
}

•  Semaphore(int, boolean)型构造函数

public Semaphore(int permits, boolean fair) {
    sync = fair ? new FairSync(permits) : new NonfairSync(permits);
}

四、核心数据结构
Semaphore通常包含以下组成部分：
•  一个整数值（计数器）
•  一个等待队列（用于存储被阻塞的线程/进程）
•  操作该数据结构的原子方法

五、二进制信号量 vs 计数信号量
二进制信号量（Binary Semaphore）：
•  取值只能是0或1
•  类似于互斥锁（Mutex），但有一些关键区别
•  可用于实现互斥访问

计数信号量（Counting Semaphore）：
•  取值可以是任意非负整数
•  用于控制对多个实例的资源的访问

六、Semaphore示例

import java.util.concurrent.Semaphore;

class MyThread extends Thread {
    private Semaphore semaphore;
    
    public MyThread(String name, Semaphore semaphore) {
        super(name);
        this.semaphore = semaphore;
    }
    
    public void run() {        
        int count = 3;
        System.out.println(Thread.currentThread().getName() + " trying to acquire");
        try {
            semaphore.acquire(count);
            System.out.println(Thread.currentThread().getName() + " acquire successfully");
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        } finally {
            semaphore.release(count);
            System.out.println(Thread.currentThread().getName() + " release successfully");
        }
    }
}

public class SemaphoreDemo {
    public final static int SEM_SIZE = 10;
    
    public static void main(String[] args) {
        Semaphore semaphore = new Semaphore(SEM_SIZE);
        MyThread t1 = new MyThread("t1", semaphore);
        MyThread t2 = new MyThread("t2", semaphore);
        t1.start();
        t2.start();
        int permits = 5;
        System.out.println(Thread.currentThread().getName() + " trying to acquire");
        try {
            semaphore.acquire(permits);
            System.out.println(Thread.currentThread().getName() + " acquire successfully");
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        } finally {
            semaphore.release();
            System.out.println(Thread.currentThread().getName() + " release successfully");
        }      
    }
}

七、实际应用场景
限制资源访问：例如数据库连接池限制最大连接数
2. 生产者-消费者问题：协调生产者和消费者的速度
3. 读者-写者问题：控制对共享数据的读写访问
4. 线程池管理：限制同时执行的线程数量

八、与互斥锁(Mutex)的区别
虽然二进制信号量与互斥锁类似，但存在重要区别：
所有权：
•  Mutex有所有者概念（哪个线程获取就必须由哪个线程释放）
•  Semaphore没有所有者概念（任何线程都可以执行V操作）

用途：
•  Mutex用于互斥访问
•  Semaphore用于信号通知和资源计数

性能：在大多数实现中，无竞争的Mutex操作比Semaphore更快

九、现代实现考虑
现代操作系统和编程语言中的Semaphore实现通常：
使用原子操作保证计数器修改的原子性；
结合自旋锁和操作系统阻塞机制优化性能；
提供超时机制（如tryAcquire(timeout)）；
可能支持公平/非公平模式（控制唤醒顺序）；

十、常见问题
优先级反转：高优先级线程可能被低优先级线程持有的信号量阻塞；
2. 死锁风险：不正确的信号量使用可能导致死锁；
3. 资源泄漏：忘记释放信号量可能导致系统资源耗尽；
令牌释放：release方法用于添加令牌，不会以初始化大小为准，反复调用会加超；
令牌获取：acquire方法用于获取令牌，不与线程绑定，一个线程或多个线程，多次调用，只要没有令牌可获取都会阻塞；
Semaphore是并发编程中的强大工具，正确使用可以有效解决复杂的同步问题，但需要谨慎设计以避免潜在问题。
