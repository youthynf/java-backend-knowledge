# JUC线程池之ThreadPoolExecutor详解

JUC线程池之ThreadPoolExecutor详解
一、概述
ThreadPoolExecutor是Java并发包 (java.util.concurrent) 提供的线程池核心实现类，用于高效管理线程资源，适用于高并发任务处理。
二、原理详解
线程池原理
Java线程池的实现原理本质就是一个线程集合workerSet和一个阻塞队列workQueue。当用户向线程池提交一个任务时，线程池会先将任务放入workQueue中。workerSet中的线程会不断的从workQueue中获取任务然后执行。当workQueue中没有任务的时候，worker就会阻塞，直到队列中有任务了就取出来继续执行。
Execute原理
当一个任务提交至线程池之后：
线程池首先当前运行的线程数量是否少于corePoolSize。如果是，则创建一个新的工作线程来执行任务。如果都在执行任务，则进入2；
判断BlockingQueue是否已经满了，倘若还没有满，则将线程放入BlockingQueue。否则进入3；
如果创建一个新的工作线程将使当前运行的线程数量超过maximumPoolSize，则交给RejectedExecutionHandler来处理任务。
当ThreadPoolExecutor创建新线程时，通过CAS来更新线程池的状态ctl。

ThreadPoolExecutor参数
•  corePoolSize：线程池中的核心线程数，当提交一个任务时，线程池创建一个新线程执行任务，直到当前线程数等于corePoolSize, 即使有其他空闲线程能够执行新来的任务, 也会继续创建线程；如果当前线程数为corePoolSize，继续提交的任务被保存到阻塞队列中，等待被执行；如果执行了线程池的prestartAllCoreThreads()方法，线程池会提前创建并启动所有核心线程。
•  workQueue：用来保存等待被执行的任务的阻塞队列。在JDK中提供了如下阻塞队列：
ArrayBlockingQueue: 基于数组结构的有界阻塞队列，按FIFO排序任务；
LinkedBlockingQueue: 基于链表结构的阻塞队列，按FIFO排序任务，吞吐量通常要高于ArrayBlockingQueue；
SynchronousQueue: 一个不存储元素的阻塞队列，每个插入操作必须等到另一个线程调用移除操作，否则插入操作一直处于阻塞状态，吞吐量通常要高于LinkedBlockingQueue；
PriorityBlockingQueue: 具有优先级的无界阻塞队列；
LinkedBlockingQueue比ArrayBlockingQueue在插入删除节点性能方面更优，但是二者在put(), take()任务的时均需要加锁，SynchronousQueue使用无锁算法，根据节点的状态判断执行，而不需要用到锁，其核心是Transfer.transfer().
•  maximumPoolSize：线程池中允许的最大线程数。如果当前阻塞队列满了，且继续提交任务，则创建新的线程执行任务，前提是当前线程数小于maximumPoolSize；当阻塞队列是无界队列, 则maximumPoolSize则不起作用, 因为无法提交至核心线程池的线程会一直持续地放入workQueue.keepAliveTime  线程空闲时的存活时间，即当线程没有任务执行时，该线程继续存活的时间；默认情况下，该参数只在线程数大于corePoolSize时才有用, 超过这个时间的空闲线程将被终止；
•  unit：keepAliveTime的单位；
•  threadFactory：创建线程的工厂，通过自定义的线程工厂可以给每个新建的线程设置一个具有识别度的线程名。默认为DefaultThreadFactory；
•  handler：线程池的饱和策略，当阻塞队列满了，且没有空闲的工作线程，如果继续提交任务，必须采取一种策略处理该任务，线程池提供了4种策略：
AbortPolicy：默认拒绝策略，直接抛出RejectedExecutionException异常，阻止系统继续运行。
CallerRunsPolicy：由调用线程（提交任务的线程）来执行被拒绝的任务，这样做会降低新任务的提交速度，给线程池一定时间来处理积压的任务。
DiscardOldestPolicy：丢弃任务队列中最旧的（也就是最早进入队列的）那个任务，然后尝试重新提交当前被拒绝的任务。
DiscardPolicy: 直接丢弃被拒绝的新任务，不做任何处理，也不会抛出异常。
当然也可以根据应用场景通过实现RejectedExecutionHandler接口，实现rejectedExecution()方法来自定义饱和策略，如记录日志或持久化存储不能处理的任务。
自定义拒绝策略步骤
1. 实现RejectedExecutionHandler接口：该接口只有一个方法rejectedExecution(Runnable r, ThreadPoolExecutor executor)，在这个方法中定义当任务被拒绝时的具体处理逻辑；
实现rejectedExecution()方法：可以根据业务需求进行不同的处理，比如将被拒绝的任务记录到日志中、存储到其他的备份队列等待后续处理、发送通知等操作；

三、ThreadPoolExecutor关键源码
关键属性

//这个属性是用来存放 当前运行的worker数量以及线程池状态的
//int是32位的，这里把int的高3位拿来充当线程池状态的标志位,后29位拿来充当当前运行worker的数量
private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));
//存放任务的阻塞队列
private final BlockingQueue<Runnable> workQueue;
//worker的集合,用set来存放
private final HashSet<Worker> workers = new HashSet<Worker>();
//历史达到的worker数最大值
private int largestPoolSize;
//当队列满了并且worker的数量达到maxSize的时候,执行具体的拒绝策略
private volatile RejectedExecutionHandler handler;
//超出coreSize的worker的生存时间
private volatile long keepAliveTime;
//常驻worker的数量
private volatile int corePoolSize;
//最大worker的数量,一般当workQueue满了才会用到这个参数
private volatile int maximumPoolSize;

内部状态

private final AtomicInteger ctl = new AtomicInteger(ctlOf(RUNNING, 0));
private static final int COUNT_BITS = Integer.SIZE - 3;
private static final int CAPACITY   = (1 << COUNT_BITS) - 1;

// runState is stored in the high-order bits
private static final int RUNNING    = -1 << COUNT_BITS;
private static final int SHUTDOWN   =  0 << COUNT_BITS;
private static final int STOP       =  1 << COUNT_BITS;
private static final int TIDYING    =  2 << COUNT_BITS;
private static final int TERMINATED =  3 << COUNT_BITS;

// Packing and unpacking ctl
private static int runStateOf(int c)     { return c & ~CAPACITY; }
private static int workerCountOf(int c)  { return c & CAPACITY; }
private static int ctlOf(int rs, int wc) { return rs | wc; }

四、Excutor工具类的四种线程池
newFixedThreadPool

public static ExecutorService newFixedThreadPool(int nThreads) {
    return new ThreadPoolExecutor(
        nThreads, nThreads, // corePoolSize = maxPoolSize
        0L, TimeUnit.MILLISECONDS, // 空闲线程立即回收
        new LinkedBlockingQueue<Runnable>() // 无界队列
    );
}
线程池的线程数量达corePoolSize后，即使线程池没有可执行任务时，也不会释放线程。FixedThreadPool的工作队列为无界队列LinkedBlockingQueue(队列容量为Integer.MAX_VALUE), 这会导致以下问题：线程池里的线程数量不超过corePoolSize，这导致了maximumPoolSize和keepAliveTime将会是个无用参数。由于使用了无界队列, 所以FixedThreadPool永远不会拒绝, 即饱和策略失效。如果任务提交速度比处理速度快，会导致任务堆积，甚至出现OOM。
newSingleThreadExecutor

public static ExecutorService newSingleThreadExecutor() {
    return new ThreadPoolExecutor(
        1, 1, // 只有一个线程
        0L, TimeUnit.MILLISECONDS,
        new LinkedBlockingQueue<Runnable>() // 无界队列
    );
}
初始化的线程池中只有一个线程，如果该线程异常结束，会重新创建一个新的线程继续执行任务，唯一的线程可以保证所提交任务的顺序执行.由于使用了无界队列, 所以SingleThreadPool永远不会拒绝, 即饱和策略失效。任务堆积时，可能引发OOM问题。
newCachedThreadPool

public static ExecutorService newCachedThreadPool() {
    return new ThreadPoolExecutor(
        0, Integer.MAX_VALUE, // 线程数可无限增长
        60L, TimeUnit.SECONDS, // 空闲线程 60s 后回收
        new SynchronousQueue<Runnable>() // 无缓冲队列
    );
}
线程池的线程数可达到Integer.MAX_VALUE，即2147483647，内部使用SynchronousQueue作为阻塞队列；和newFixedThreadPool创建的线程池不同，newCachedThreadPool在没有任务执行时，当线程的空闲时间超过keepAliveTime，会自动释放线程资源，当提交新任务时，如果没有空闲线程，则创建新线程执行任务，会导致一定的系统开销； 执行过程与前两种稍微不同：
•  主线程调用SynchronousQueue的offer()方法放入task, 倘若此时线程池中有空闲的线程尝试读取SynchronousQueue的task, 即调用了SynchronousQueue的poll(), 那么主线程将该task交给空闲线程. 否则执行(2)；
•  当线程池为空或者没有空闲的线程, 则创建新的线程执行任务；
•  执行完任务的线程倘若在60s内仍空闲, 则会被终止. 因此长时间空闲的CachedThreadPool不会持有任何线程资源；

newScheduledThreadPool

public static ScheduledExecutorService newScheduledThreadPool(int corePoolSize) {
    return new ScheduledThreadPoolExecutor(corePoolSize);
}
使用 DelayedWorkQueue（无界队列），长时间任务可能导致任务堆积，导致OOM问题。
五、线程回收机制
核心线程
•  默认不回收（即使空闲），保持corePoolSize数量。
•  可强制回收：调用allowCoreThreadTimeOut(true)后，核心线程空闲超过keepAliveTime会被回收。

非核心线程
空闲时间超过keepAliveTime后自动回收，直到线程数降至corePoolSize。

线程池关闭时
•  shutdown()：将线程池的状态设置为SHUTDOWN，线程池进入这个状态后，就拒绝再接受任务，然后会将剩余的任务全部执行完。

public void shutdown() {
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        //检查是否可以关闭线程
        checkShutdownAccess();
        //设置线程池状态
        advanceRunState(SHUTDOWN);
        //尝试中断worker
        interruptIdleWorkers();
            //预留方法,留给子类实现
        onShutdown(); // hook for ScheduledThreadPoolExecutor
    } finally {
        mainLock.unlock();
    }
    tryTerminate();
}

private void interruptIdleWorkers() {
    interruptIdleWorkers(false);
}

private void interruptIdleWorkers(boolean onlyOne) {
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        //遍历所有的worker
        for (Worker w : workers) {
            Thread t = w.thread;
            //先尝试调用w.tryLock(),如果获取到锁,就说明worker是空闲的,就可以直接中断它
            //注意的是,worker自己本身实现了AQS同步框架,然后实现的类似锁的功能
            //它实现的锁是不可重入的,所以如果worker在执行任务的时候,会先进行加锁,这里tryLock()就会返回false
            if (!t.isInterrupted() && w.tryLock()) {
                try {
                    t.interrupt();
                } catch (SecurityException ignore) {
                } finally {
                    w.unlock();
                }
            }
            if (onlyOne)
                break;
        }
    } finally {
        mainLock.unlock();
    }
}

•  shutdownNow()：将线程池状态设置为STOP，然后拒绝所有提交的任务。最后中断正在运行中的worker，然后清空任务队列。

public List<Runnable> shutdownNow() {
    List<Runnable> tasks;
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        checkShutdownAccess();
        //检测权限
        advanceRunState(STOP);
        //中断所有的worker
        interruptWorkers();
        //清空任务队列
        tasks = drainQueue();
    } finally {
        mainLock.unlock();
    }
    tryTerminate();
    return tasks;
}

private void interruptWorkers() {
    final ReentrantLock mainLock = this.mainLock;
    mainLock.lock();
    try {
        //遍历所有worker，然后调用中断方法
        for (Worker w : workers)
            w.interruptIfStarted();
    } finally {
        mainLock.unlock();
    }
}

六、深入理解
不允许使用Executors创建线程池原因：
•  newFixedThreadPool和newSingleThreadExecutor：主要问题是堆积的请求处理队列可能会耗费非常大的内存，甚至OOM；
•  newCachedThreadPool和newScheduledThreadPool：主要问题是线程数最大数是Integer.MAX_VALUE，可能会创建数量非常多的线程，甚至OOM。

配置线程池需要考虑因素：
•  CPU密集型：尽可能少的线程，Ncpu+1；
•  IO密集型：尽可能多的线程, Ncpu*2，比如数据库连接池；
•  混合型：CPU密集型的任务与IO密集型任务的执行时间差别较小，拆分为两个线程池；否则没有必要拆分。

线程池状态监控方法
•  getTaskCount() 
•  getCompletedTaskCount() 
•  getLargestPoolSize()
•  getPoolSize()
•  getActiveCount()

## 面试总结

围绕「JUC线程池之ThreadPoolExecutor详解」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

### 核心回答

1. 线程池通过复用线程降低创建销毁成本，并用队列、拒绝策略和参数控制并发压力。
2. 核心参数要结合任务类型、RT、吞吐、下游容量和机器资源一起评估。
3. 线上重点关注活跃线程数、队列积压、拒绝次数、任务耗时和异常吞噬。

### 高频追问

- 为什么不建议直接使用 Executors 默认工厂？
- CPU 密集型和 IO 密集型线程数如何估算？
- 队列满、线程满、下游慢时如何降级和止血？

### 实战落地

- **选型前**：先判断是互斥访问、线程协作、任务编排，还是限流隔离。
- **编码时**：控制共享变量范围，明确锁对象、超时策略、异常处理和资源释放。
- **上线后**：观察线程数、队列长度、阻塞时间、拒绝次数和 RT 抖动，必要时用线程 Dump 验证。

### 易错点

- 不要使用无界队列掩盖流量问题。
- 异步任务要显式处理异常、超时和上下文传递。
