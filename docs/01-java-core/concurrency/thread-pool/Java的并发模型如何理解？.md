# Java的并发模型如何理解？

Java的并发模型如何理解？
Java并发控制的是线程还是进程？
Java的并发模型主要基于线程（Thread），而不是进程。

线程 vs 进程的区别
资源占用: 线程共享进程内存(堆, 方法区), 而进程拥有独立的内存空间;
创建开销: 线程是轻量级的, 约栈1MB占内存, 而进程是重量级的, 需要独立分配内存空间;
通信方式: 线程间能直接共享对象(需同步控制), 而进程则需要IPC(管道, Socket, 共享内存);
隔离性: 线程崩溃可能导致整个进程终止, 而进程崩溃不影响其他进程.

Java的并发模型
基于线程的实现
•  java.lang.Thread：基础线程类;
•  线程池（ExecutorService）**：管理线程生命周期;
•  并发工具包（JUC）：
- ReentrantLock、Semaphore、CountDownLatch等控制线程同步;
- ConcurrentHashMap、BlockingQueue等线程安全容器;

为何不直接控制进程？
•  JVM设计限制：单进程多线程模型;
•  跨进程通信成本高：需通过JNI调用OS API或网络通信;
•  内存共享优势：线程间直接访问堆内存效率更高;

例外情况
虽然Java主推线程级并发，但在特定场景会涉及进程：
•  多JVM实例：

Runtime.exec("java MyApp"); // 启动新进程

•  分布式系统：
- 通过Socket/RPC跨进程通信
- 例如：Dubbo、gRPC等框架

•  Process API（Java 9+）：

ProcessHandle.current().pid(); // 获取进程ID

性能对比
计算密集型: 线程方案需要控制线程数≤CPU核心数, 而进程方案则支持跨机器扩展;
I/O密集型: 线程方案比较适合, 采用NIO+多线程, 而进程方案上下文切换成本高;
容错需求: 线程崩溃影响大, 进程隔离更安全.
代码示例

线程并发

ExecutorService pool = Executors.newFixedThreadPool(4);
pool.submit(() -> System.out.println(Thread.currentThread().getName()));
pool.shutdown();

进程并发

ProcessBuilder pb = new ProcessBuilder("java", "-version");
Process p = pb.start();
p.waitFor(); // 等待子进程结束

总结
•  Java并发核心是线程级（Thread），因共享内存高效
•  进程级并发需借助外部机制（多JVM/分布式系统）
•  选择依据：数据共享需求 vs 隔离性需求

## 面试总结

围绕「Java的并发模型如何理解？」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

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
