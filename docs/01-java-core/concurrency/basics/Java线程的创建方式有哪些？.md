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
## 核心概念
Java线程的创建方式有哪些？ 可以放在“并发能力”这条主线里理解。复习时不要只背结论，要先说明它解决的核心问题，再解释关键机制、适用边界和代价。围绕这个知识点，重点关注：线程安全、可见性、原子性、锁竞争、线程池参数、队列选择、拒绝策略和故障隔离。如果面试官继续追问，通常会从“为什么这样设计、在什么场景会失效、线上如何排查”三个方向展开。

## 面试回答与追问
- **标准回答**：先给出 Java线程的创建方式有哪些？ 的定位，再说明它依赖的核心原理，最后结合业务场景说明如何使用。回答时要把“能解决什么问题”和“会带来什么成本”一起讲清楚。
- **常见追问**：如果数据量、并发量或调用链路继续放大，Java线程的创建方式有哪些？ 的瓶颈会出现在哪里？如何观测、如何优化、如何回滚？
- **易错点**：不要把概念和具体实现混在一起，也不要只说 API 名称。面试中更重要的是说清楚边界条件、失败场景和取舍依据。

## 实战场景与排查
典型落地场景包括：高并发接口、异步任务、定时任务、批量处理、缓存刷新、消息消费等需要控制吞吐与稳定性的场景。实际处理线上问题时，可以按“现象确认 → 指标采集 → 假设验证 → 小步修复 → 复盘沉淀”的路径推进。先看日志、监控、链路追踪和核心指标，再判断是容量问题、配置问题、代码路径问题，还是外部依赖抖动。

## 总结
复习 Java线程的创建方式有哪些？ 时，建议把它和相邻知识点放在一起比较：相同点是什么、区别在哪里、为什么当前场景选择它而不是替代方案。能讲清楚这些内容，才算真正掌握。
