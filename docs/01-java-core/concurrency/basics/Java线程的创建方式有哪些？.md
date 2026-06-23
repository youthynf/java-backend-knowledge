# Java线程的创建方式有哪些？

Java线程的创建方式有哪些？
线程使用方式：
实现Runnable接口
实现Runnable接口，并实现run()方法，通过Thread调用start()方法来启动线程。

public class MyRunnable implements Runnable {
    public void run() {
        // ...
    }
}

public static void main(String[] args) {
    MyRunnable instance = new MyRunnable();
    Thread thread = new Thread(instance);
    thread.start();
}

实现Callable接口
与Runnable相比，Callable可以有返回值，返回值通过FuruteTask进行封装。

public class MyCallable implements Callable<Integer> {
    public Integer call() {
        return 123;
    }
}

public static void main(String[] args) throws ExecutionException, InterruptedException {
    MyCallable mc = new MyCallable();
    FutureTask<Integer> ft = new FutureTask<>(mc);
    Thread thread = new Thread(ft);
    thread.start();
    System.out.println(ft.get());
}

继承Thread类
同样需要实现run()方法，因为Thread类也实现了Runable接口。当调用start()方法启动一个线程时，虚拟机会将线程放入就绪队列中等待被调度，当一个线程被调度时会执行该线程的run()方法。

public class MyThread extends Thread {
    public void run() {
        // ...
    }
}

public static void main(String[] args) {
    MyThread mt = new MyThread();
    mt.start();
}

实现接口 VS 继承Thread
实现接口会好一些，因为Java不支持多重继承，因此继承了Thread类就无法继承其他类，但是可以实现多个接口，而且大多数时候只要求可执行就行，继承整个Thread类开销较大。

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **Java线程的创建方式有哪些？**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

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

