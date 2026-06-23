# Java线程间如何通信？

Java线程间如何通信？
Java线程通信方式
共享变量+同步机制：通过共享内存区域（如对象或变量），结合同步机制（synchronized、volatile）实现通信。

public class SharedVariableDemo {
    private volatile boolean flag = false;

    public void setFlag() {
        flag = true;
    }

    public void waitForFlag() {
        while (!flag) {
            // 等待flag变为true
        }
        System.out.println("Flag is true now.");
    }
}

wait()和notify()/notifyAll()：基于Object类的内置锁机制，实现线程的等待和唤醒。

public class WaitNotifyDemo {
    private final Object lock = new Object();
    private boolean conditionMet = false;

    public void waitForCondition() throws InterruptedException {
        synchronized (lock) {
            while (!conditionMet) {
                lock.wait(); // 释放锁并等待
            }
            System.out.println("Condition met, proceeding...");
        }
    }

    public void signalCondition() {
        synchronized (lock) {
            conditionMet = true;
            lock.notifyAll(); // 唤醒所有等待线程
        }
    }
}

Lock和Condition：通过ReentrantLock和Condition接口提供更灵活的线程通信机制，更精准唤醒。

import java.util.concurrent.locks.*;

public class LockConditionDemo {
    private final Lock lock = new ReentrantLock();
    private final Condition condition = lock.newCondition();
    private boolean isReady = false;

    public void waitForResource() throws InterruptedException {
        lock.lock();
        try {
            while (!isReady) {
                condition.await(); // 释放锁并等待
            }
            System.out.println("Resource is ready.");
        } finally {
            lock.unlock();
        }
    }

    public void prepareResource() {
        lock.lock();
        try {
            isReady = true;
            condition.signalAll(); // 唤醒所有等待线程
        } finally {
            lock.unlock();
        }
    }
}

阻塞队列（BlockingQueue）：使用线程安全的阻塞队列作为通信媒介，实现生产者-消费者模式。

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;

public class BlockingQueueDemo {
    private static BlockingQueue<String> queue = new ArrayBlockingQueue<>(10);

    // 生产者线程
    static class Producer implements Runnable {
        public void run() {
            try {
                queue.put("Message"); // 阻塞直到队列有空间
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }

    // 消费者线程
    static class Consumer implements Runnable {
        public void run() {
            try {
                String msg = queue.take(); // 阻塞直到队列有元素
                System.out.println("Received: " + msg);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }
}

同步辅助类（CountDownLatch、CyclicBarriers）：通过同步工具协调多个线程的执行阶段。其中CountDownLatch等待多个线程完成初始化，不可重用，而CyclicBarrier实现多线程分阶段并行计算，可重用。

import java.util.concurrent.CountDownLatch;

public class CountDownLatchDemo {
    public static void main(String[] args) throws InterruptedException {
        int threadCount = 3;
        CountDownLatch latch = new CountDownLatch(threadCount);

        for (int i = 0; i < threadCount; i++) {
            new Thread(() -> {
                System.out.println("Thread completed task.");
                latch.countDown();
            }).start();
        }

        latch.await(); // 主线程等待所有子线程完成
        System.out.println("All threads finished.");
    }
}

管道通信（PipedInputStream/PipedOutputStream）：通过管道流进行线程间数据传输，适用于字符或字节流通信。

import java.io.*;

public class PipedCommunicationDemo {
    public static void main(String[] args) throws IOException {
        final PipedOutputStream pos = new PipedOutputStream();
        final PipedInputStream pis = new PipedInputStream(pos);

        // 写数据线程
        Thread writer = new Thread(() -> {
            try {
                pos.write("Hello from writer!".getBytes());
                pos.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        });

        // 读数据线程
        Thread reader = new Thread(() -> {
            try {
                int data;
                while ((data = pis.read()) != -1) {
                    System.out.print((char) data);
                }
                pis.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        });

        writer.start();
        reader.start();
    }
}

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **Java线程间如何通信？**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

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

