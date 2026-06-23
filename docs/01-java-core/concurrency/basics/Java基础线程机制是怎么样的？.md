# Java基础线程机制是怎么样的？

Java基础线程机制是怎么样的？
Executor
Executor管理多个异步任务的执行，而无需程序员显式地管理线程的生命周期。这里的异步是指多个任务的执行互不干扰，不需要进行同步操作。主要有三种Executor：
a. CachedThreadPool：一个任务创建一个线程；
b. FixedThreadPool：所有任务只能使用固定数量的线程；
c. SingleThreadExecutor：相当于大小为1的FixedThreadPool。

public static void main(String[] args) {
    ExecutorService executorService = Executors.newCachedThreadPool();
    for (int i = 0; i < 5; i++) {
        executorService.execute(new MyRunnable());
    }
    executorService.shutdown();
}

Daemon
守护线程是程序运行时在后台提供服务的进程。当所有非守护线程结束时，程序也就终止了，同时杀死所有守护线程。main()属于非守护线程，使用setDaemon()方法将一个线程设置为守护线程。

public static void main(String[] args) {
    Thread thread = new Thread(new MyRunnable());
    thread.setDaemon(true);
}

sleep()
Thread.sleep(millisec)方法会休眠当前正在执行的线程，millisec单位为毫秒。sleep()可能会抛出InterruptedException，因为异常不能跨线程传播会main()中，因此必须在本地进行处理的。

public void run() {
    try {
        Thread.sleep(3000);
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
}

yeild()
对静态方法Thread.yield()的调用声明了当前线程已经完成了生命周期中最重要的部分，可以切换给其他线程来执行。该方法只是对线程调度的一个建议，而且也只是建议具有相同优先级的其他线程可以运行。

public void run() {
    Thread.yield();
}

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **Java基础线程机制是怎么样的？**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

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

