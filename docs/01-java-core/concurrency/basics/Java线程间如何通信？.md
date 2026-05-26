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
