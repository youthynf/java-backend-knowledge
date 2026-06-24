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

## 面试总结

围绕「Java线程的创建方式有哪些？」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

### 核心回答

1. Java 并发问题的核心是共享状态在多线程下的可见性、原子性和有序性。
2. 设计并发方案时要明确线程之间如何协作、如何退出、如何处理异常和超时。
3. 工程上还要考虑线程池复用、上下文清理、监控告警和压测验证。

### 高频追问

- 这个机制解决的是互斥、通信、调度还是资源隔离？
- 高并发下可能出现死锁、饥饿、活锁还是性能退化？
- 如何用线程 Dump 或指标证明你的判断？

### 实战落地

- **选型前**：先判断是互斥访问、线程协作、任务编排，还是限流隔离。
- **编码时**：控制共享变量范围，明确锁对象、超时策略、异常处理和资源释放。
- **上线后**：观察线程数、队列长度、阻塞时间、拒绝次数和 RT 抖动，必要时用线程 Dump 验证。

### 易错点

- 不要用 sleep 代替同步协作。
- 不要忽略中断、超时和资源释放。
