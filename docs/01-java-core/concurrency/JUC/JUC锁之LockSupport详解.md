# JUC锁之LockSupport详解

JUC锁之LockSupport详解
一、概述
LockSupport用来创建锁和其他同步类的基本线程阻塞原语. 简而言之, 当调用LockSupport.park()时, 表示当前线程将会等待, 直至获得许可, 当调用LockSupport.unpark()时, 必须把等待获得许可的线程作为参数进行传递, 好让此线程继续运行.

二、LockSupport源码分析
类的属性

public class LockSupport {
    // Hotspot implementation via intrinsics API
    private static final sun.misc.Unsafe UNSAFE;
    // 表示内存偏移地址
    private static final long parkBlockerOffset;
    // 表示内存偏移地址
    private static final long SEED;
    // 表示内存偏移地址
    private static final long PROBE;
    // 表示内存偏移地址
    private static final long SECONDARY;
    
    static {
        try {
            // 获取Unsafe实例
            UNSAFE = sun.misc.Unsafe.getUnsafe();
            // 线程类类型
            Class<?> tk = Thread.class;
            // 获取Thread的parkBlocker字段的内存偏移地址
            parkBlockerOffset = UNSAFE.objectFieldOffset
                (tk.getDeclaredField("parkBlocker"));
            // 获取Thread的threadLocalRandomSeed字段的内存偏移地址
            SEED = UNSAFE.objectFieldOffset
                (tk.getDeclaredField("threadLocalRandomSeed"));
            // 获取Thread的threadLocalRandomProbe字段的内存偏移地址
            PROBE = UNSAFE.objectFieldOffset
                (tk.getDeclaredField("threadLocalRandomProbe"));
            // 获取Thread的threadLocalRandomSecondarySeed字段的内存偏移地址
            SECONDARY = UNSAFE.objectFieldOffset
                (tk.getDeclaredField("threadLocalRandomSecondarySeed"));
        } catch (Exception ex) { throw new Error(ex); }
    }
}
UNSAFE字段表示sun.mic.Unsafe类, 一般程序中不允许直接调用, 而long类型的表示示例对象相应字段在内存中的偏移��址, 可以通过偏移地址获取或设置该字段的值.

构造函数
LockSupport只有一个私有构造函数, 无法被实例化.

// 私有构造函数，无法被实例化
private LockSupport() {}

核心函数分析
•  park函数
存在两个重载版本, 两个区别在于是否设置blocker(主要便于问题定位, 定位在等待什么对象锁). 

public static void park() {
    // 获取许可，设置时间为无限长，直到可以获取许可
    UNSAFE.park(false, 0L);
}

public static void park(Object blocker) {
    // 获取当前线程
    Thread t = Thread.currentThread();
    // 设置Blocker
    setBlocker(t, blocker);
    // 获取许可
    UNSAFE.park(false, 0L);
    // 重新可运行后再此设置Blocker
    setBlocker(t, null);
}

private static void setBlocker(Thread t, Object arg) {
    // 设置线程t的parkBlocker字段的值为arg
    UNSAFE.putObject(t, parkBlockerOffset, arg);
}
调用park函数后, 会禁用当前线程, 线程将处于休眠状态, 除非许可可用. 当其他线程将当前线程作为目标调用unpark函数, 或者某个线程中断当前线程, 或者当调用不合逻辑地(毫无理由地)返回时, 该线程会获得许可, 可以继续执行.

•  parkNanos函数
此函数表示许可可用前禁用当前线程, 并最多等待指定的等待时间. nanos表示等待多长时间, 相对时间.

public static void parkNanos(Object blocker, long nanos) {
    if (nanos > 0) { // 时间大于0
        // 获取当前线程
        Thread t = Thread.currentThread();
        // 设置Blocker
        setBlocker(t, blocker);
        // 获取许可，并设置了时间
        UNSAFE.park(false, nanos);
        // 设置许可
        setBlocker(t, null);
    }
}

•  parkUtil函数
此函数表示在指定的时限前禁用当前线程, 除非许可可用. 这里的deadline参数表示绝对时间, 表示指定时间.

public static void parkUntil(Object blocker, long deadline) {
    // 获取当前线程
    Thread t = Thread.currentThread();
    // 设置Blocker
    setBlocker(t, blocker);
    UNSAFE.park(true, deadline);
    // 设置Blocker为null
    setBlocker(t, null);
}

•  unpark函数
此函数表示如果给定线程的许可不可用, 则使其可用. 如果线程在park上受到阻塞, 则将解除其阻塞状态, 否则保证下一次调用park不会受阻塞. 如果给定线程尚未启动, 则该操作没有任何效果. 核心作用释放许可, 指定线程可以继续运行.

public static void unpark(Thread thread) {
    if (thread != null) // 线程为不空
        UNSAFE.unpark(thread); // 释放该线程许可
}


三、线程同步方式
使用wait/notify实现线程同步

class MyThread extends Thread {
    
    public void run() {
        synchronized (this) {
            System.out.println("before notify");            
            notify();
            System.out.println("after notify");    
        }
    }
}

public class WaitAndNotifyDemo {
    public static void main(String[] args) throws InterruptedException {
        MyThread myThread = new MyThread();            
        synchronized (myThread) {
            try {        
                myThread.start();
                // 主线程睡眠3s
                Thread.sleep(3000);
                System.out.println("before wait");
                // 阻塞主线程
                myThread.wait();
                System.out.println("after wait");
            } catch (InterruptedException e) {
                e.printStackTrace();
            }            
        }        
    }
}

// 运行结果
before wait
before notify
after notify
after wait
使用wait/notify实现同步时, 必须配合使用synchronized, 同时必须先调用wait, 后调用notify, 否则wait将一直阻塞下去.

使用park/unpark实现线程同步

import java.util.concurrent.locks.LockSupport;

class MyThread extends Thread {
    private Object object;

    public MyThread(Object object) {
        this.object = object;
    }

    public void run() {
        System.out.println("before unpark");
        try {
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        // 获取blocker
        System.out.println("Blocker info " + LockSupport.getBlocker((Thread) object));
        // 释放许可
        LockSupport.unpark((Thread) object);
        // 休眠500ms，保证先执行park中的setBlocker(t, null);
        try {
            Thread.sleep(500);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        // 再次获取blocker
        System.out.println("Blocker info " + LockSupport.getBlocker((Thread) object));

        System.out.println("after unpark");
    }
}

public class test {
    public static void main(String[] args) {
        MyThread myThread = new MyThread(Thread.currentThread());
        myThread.start();
        System.out.println("before park");
        // 获取许可
        LockSupport.park("ParkAndUnparkDemo");
        System.out.println("after park");
    }
}

// 运行结果
before park
before unpark
Blocker info ParkAndUnparkDemo
after park
Blocker info null
after unpark
park与unpark不需要配合synchronized使用, 先调用unpark, 后调用park时, 仍能正确实现同步, 不会造成wait/notify调用顺序不当所引起的阻塞. 因此park/unpark相比wait/notify更加的灵活.

三、响应中断
主线程park阻塞后, 接收到中断信号时, 会退出阻塞状态, 继续运行. 此时的interrupt起到的作用和unpark一样.

import java.util.concurrent.locks.LockSupport;

class MyThread extends Thread {
    private Object object;

    public MyThread(Object object) {
        this.object = object;
    }

    public void run() {
        System.out.println("before interrupt");        
        try {
            // 休眠3s
            Thread.sleep(3000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }    
        Thread thread = (Thread) object;
        // 中断线程
        thread.interrupt();
        System.out.println("after interrupt");
    }
}

public class InterruptDemo {
    public static void main(String[] args) {
        MyThread myThread = new MyThread(Thread.currentThread());
        myThread.start();
        System.out.println("before park");
        // 获取许可
        LockSupport.park("ParkAndUnparkDemo");
        System.out.println("after park");
    }
}

四、更深入理解
Thread.sleep() 和 Object.wait() 区别
•  Thread.sleep()不会释放占有的锁，Object.wait()会释放占有的锁；
•  Thread.sleep()必须传入时间，Object.wait()可传可不传，不传表示一直阻塞下去；
•  Thread.sleep()到时间了会自动唤醒，然后继续执行；Object.wait()不带时间的，需要另一个线程使用Object.notify()唤醒；
•  Object.wait()带时间的，假如没有被notify，到时间了会自动唤醒，这时又分好两种情况，一是立即获取到了锁，线程自然会继续执行；二是没有立即获取锁，线程进入同步队列等待获取锁；

Object.wait()和Condition.await()的区别
Object.wait()和Condition.await()的原理是基本一致的，不同的是Condition.await()底层是调用LockSupport.park()来实现阻塞当前线程的。实际上，Condition.wait()在阻塞当前线程之前还干了两件事：一是把当前线程添加到条件队列中，二是“完全”释放锁，也就是让state状态变量变为0，然后才是调用LockSupport.park()阻塞当前线程。
Thread.sleep()和LockSupport.park()的区别
LockSupport.park()还有几个兄弟方法——parkNanos()、parkUtil()等，我们这里说的park()方法统称这一类方法。
•  从功能上来说，Thread.sleep()和LockSupport.park()方法类似，都是阻塞当前线程的执行，且都不会释放当前线程占有的锁资源；
•  Thread.sleep()没法从外部唤醒，只能自己醒过来；LockSupport.park()方法可以被另一个线程调用LockSupport.unpark()方法唤醒；
•  Thread.sleep()方法声明上抛出了InterruptedException中断异常，所以调用者需要捕获这个异常或者再抛出；LockSupport.park()方法不需要捕获中断异常；
•  Thread.sleep()本身就是一个native方法；LockSupport.park()底层是调用的Unsafe的native方法；
Object.wait()和LockSupport.park()的区别
•  Object.wait()方法需要在synchronized块中执行；LockSupport.park()可以在任意地方执行；
•  Object.wait()方法声明抛出了中断异常，调用者需要捕获或者再抛出；LockSupport.park()不需要捕获中断异常；
•  Object.wait()不带超时的，需要另一个线程执行notify()来唤醒，但不一定继续执行后续内容；
•  LockSupport.park()不带超时的，需要另一个线程执行unpark()来唤醒，一定会继续执行后续内容；

总结: Object.wait(), Condition.await() 都会释放占有的锁资源, 而LockSupport.park(), Thread.sleep()都不会释放占有的锁资源.

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **JUC锁之LockSupport详解**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

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

