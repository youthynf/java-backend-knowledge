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

## 面试总结

围绕「Java基础线程机制是怎么样的？」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

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
