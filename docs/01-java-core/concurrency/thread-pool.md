# Java 线程池详解

## 一、为什么需要线程池？

### 1.1 问题背景
- **线程创建开销大**：每次创建线程都需要分配栈内存、PC寄存器等资源
- **线程销毁成本**：线程执行完毕后需要回收资源
- **并发控制困难**：无限制创建线程会导致 OOM、CPU 过载

### 1.2 线程池的优势
1. **降低资源消耗**：复用已创建的线程，减少创建/销毁开销
2. **提高响应速度**：任务到达时无需等待线程创建即可执行
3. **提高可管理性**：统一管理线程，防止资源耗尽

---

## 二、Executor 框架

### 2.1 继承结构

```
Executor (接口)
    └── ExecutorService (接口)
            ├── ThreadPoolExecutor (核心实现)
            └── ScheduledThreadPoolExecutor (定时任务)
```

### 2.2 核心接口

```java
// Executor - 最基本的执行接口
public interface Executor {
    void execute(Runnable command);
}

// ExecutorService - 提供更丰富的功能
public interface ExecutorService extends Executor {
    // 关闭线程池
    void shutdown();
    List<Runnable> shutdownNow();
    
    // 提交任务
    <T> Future<T> submit(Callable<T> task);
    <T> Future<T> submit(Runnable task, T result);
    Future<?> submit(Runnable task);
    
    // 批量执行
    <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks);
    <T> T invokeAny(Collection<? extends Callable<T>> tasks);
}
```

---

## 三、ThreadPoolExecutor 核心参数

### 3.1 构造方法

```java
public ThreadPoolExecutor(
    int corePoolSize,        // 核心线程数
    int maximumPoolSize,     // 最大线程数
    long keepAliveTime,      // 空闲线程存活时间
    TimeUnit unit,           // 时间单位
    BlockingQueue<Runnable> workQueue,  // 任务队列
    ThreadFactory threadFactory,         // 线程工厂
    RejectedExecutionHandler handler     // 拒绝策略
)
```

### 3.2 参数详解

| 参数 | 说明 | 推荐值 |
|------|------|--------|
| corePoolSize | 核心线程数，即使空闲也不会被回收 | CPU密集型：N+1，IO密集型：2N |
| maximumPoolSize | 最大线程数，核心线程+临时线程 | 根据业务峰值设置 |
| keepAliveTime | 临时线程空闲存活时间 | 通常 60s |
| workQueue | 等待执行的任务队列 | 见下文队列选择 |
| threadFactory | 创建线程的工厂 | 可自定义线程名 |
| handler | 队列满时的拒绝策略 | 见下文拒绝策略 |

### 3.3 线程创建规则

```
1. 当前线程数 < corePoolSize → 创建新线程执行任务
2. 当前线程数 = corePoolSize → 任务进入队列
3. 队列已满 && 线程数 < maximumPoolSize → 创建临时线程
4. 线程数 = maximumPoolSize && 队列已满 → 执行拒绝策略
```

---

## 四、任务队列选择

### 4.1 有界队列

```java
// ArrayBlockingQueue - 数组结构有界队列
new ThreadPoolExecutor(5, 10, 60L, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(100));
```
- 必须指定容量
- 防止资源耗尽
- 生产环境推荐

### 4.2 无界队列

```java
// LinkedBlockingQueue - 链表结构，默认无界
new ThreadPoolExecutor(5, 5, 60L, TimeUnit.SECONDS,
    new LinkedBlockingQueue<>());  // 容量为 Integer.MAX_VALUE
```
- ⚠️ 可能导致 OOM
- FixedThreadPool 和 SingleThreadExecutor 使用此队列

### 4.3 同步移交队列

```java
// SynchronousQueue - 不存储元素，直接移交
new ThreadPoolExecutor(5, 10, 60L, TimeUnit.SECONDS,
    new SynchronousQueue<>());
```
- 没有容量，必须有空闲线程才能提交成功
- CachedThreadPool 使用此队列
- 适合处理大量短期任务

### 4.4 优先级队列

```java
// PriorityBlockingQueue - 支持优先级排序
new ThreadPoolExecutor(5, 10, 60L, TimeUnit.SECONDS,
    new PriorityBlockingQueue<>());
```

---

## 五、拒绝策略

### 5.1 内置拒绝策略

| 策略 | 行为 | 适用场景 |
|------|------|----------|
| AbortPolicy | 抛出 RejectedExecutionException | 默认策略，关键业务 |
| CallerRunsPolicy | 由调用线程执行任务 | 降级处理，不丢失任务 |
| DiscardPolicy | 直接丢弃，不抛异常 | 非核心业务 |
| DiscardOldestPolicy | 丢弃队列中最老的任务 | 允许丢弃旧任务 |

### 5.2 代码示例

```java
// 默认策略 - 抛异常
executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());

// 调用者执行 - 降级处理
executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());

// 自定义策略
executor.setRejectedExecutionHandler((r, e) -> {
    log.warn("任务被拒绝: {}", r.toString());
    // 存入消息队列，后续重试
    mqQueue.add(r);
});
```

---

## 六、Executors 工厂方法

### 6.1 FixedThreadPool

```java
ExecutorService executor = Executors.newFixedThreadPool(5);
// 源码分析
new ThreadPoolExecutor(nThreads, nThreads,   // 核心线程数 = 最大线程数
                       0L, TimeUnit.MILLISECONDS,
                       new LinkedBlockingQueue<Runnable>());  // 无界队列！
```
- 线程数固定
- ⚠️ 使用无界队列，可能 OOM

### 6.2 CachedThreadPool

```java
ExecutorService executor = Executors.newCachedThreadPool();
// 源码分析
new ThreadPoolExecutor(0, Integer.MAX_VALUE,  // 可无限创建线程！
                       60L, TimeUnit.SECONDS,
                       new SynchronousQueue<Runnable>());
```
- 线程数可无限增长
- ⚠️ 可能创建过多线程导致 OOM

### 6.3 SingleThreadExecutor

```java
ExecutorService executor = Executors.newSingleThreadExecutor();
// 源码分析
new ThreadPoolExecutor(1, 1,   // 只有一个线程
                       0L, TimeUnit.MILLISECONDS,
                       new LinkedBlockingQueue<Runnable>());
```
- 单线程串行执行
- ⚠️ 无界队列可能 OOM

### 6.4 ScheduledThreadPool

```java
ScheduledExecutorService executor = Executors.newScheduledThreadPool(5);
// 支持定时和周期性任务
executor.schedule(() -> System.out.println("延迟3秒执行"), 3, TimeUnit.SECONDS);
executor.scheduleAtFixedRate(() -> {}, 1, 3, TimeUnit.SECONDS);  // 初始延迟1秒，每3秒执行
```

### 6.5 ⚠️ 阿里巴巴规范
> 【强制】线程池不允许使用 Executors 去创建，而是通过 ThreadPoolExecutor 的方式，这样的处理方式让写的同学更加明确线程池的运行规则，规避资源耗尽的风险。

---

## 七、线程池监控

### 7.1 常用监控方法

```java
ThreadPoolExecutor executor = ...;

// 基本信息
int poolSize = executor.getPoolSize();          // 当前线程数
int corePoolSize = executor.getCorePoolSize();  // 核心线程数
int largestPoolSize = executor.getLargestPoolSize(); // 历史最大线程数

// 任务统计
long taskCount = executor.getTaskCount();       // 提交的总任务数
long completedTaskCount = executor.getCompletedTaskCount(); // 完成的任务数
int activeCount = executor.getActiveCount();    // 正在执行的任务数

// 队列信息
BlockingQueue<Runnable> queue = executor.getQueue();
int queueSize = queue.size();                   // 队列中等待的任务数
```

### 7.2 监控线程类

```java
public class ThreadPoolMonitor {
    private final ThreadPoolExecutor executor;
    
    public void printStats() {
        log.info("线程池状态: [核心={}, 最大={}, 当前={}, 活动={}, 队列={}, 完成={}, 总计={}]",
            executor.getCorePoolSize(),
            executor.getMaximumPoolSize(),
            executor.getPoolSize(),
            executor.getActiveCount(),
            executor.getQueue().size(),
            executor.getCompletedTaskCount(),
            executor.getTaskCount());
    }
}
```

---

## 八、最佳实践

### 8.1 线程数配置

**CPU 密集型任务**
```java
// N = CPU 核心数
int corePoolSize = Runtime.getRuntime().availableProcessors() + 1;
```

**IO 密集型任务**
```java
// 等待时间越长，线程数可以越多
int corePoolSize = Runtime.getRuntime().availableProcessors() * 2;
// 或者公式：线程数 = CPU核心数 * (1 + 等待时间/计算时间)
```

### 8.2 合理配置示例

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    10,     // 核心线程数
    20,     // 最大线程数
    60L,    // 空闲线程存活时间
    TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(100),  // 有界队列
    new ThreadFactoryBuilder().setNameFormat("worker-%d").build(),  // 自定义线程名
    new ThreadPoolExecutor.CallerRunsPolicy()  // 降级策略
);

// 允许核心线程超时回收
executor.allowCoreThreadTimeOut(true);
```

### 8.3 优雅关闭

```java
public void shutdown(ExecutorService executor) {
    executor.shutdown();  // 不再接受新任务
    try {
        if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
            executor.shutdownNow();  // 强制终止
            if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
                log.error("线程池未能正常关闭");
            }
        }
    } catch (InterruptedException e) {
        executor.shutdownNow();
        Thread.currentThread().interrupt();
    }
}
```

---

## 九、常见问题

### 9.1 线程池中异常如何处理？

```java
// 方式1：try-catch 捕获
executor.execute(() -> {
    try {
        // 业务代码
    } catch (Exception e) {
        log.error("任务执行异常", e);
    }
});

// 方式2：重写 afterExecute
class LoggingExecutor extends ThreadPoolExecutor {
    @Override
    protected void afterExecute(Runnable r, Throwable t) {
        super.afterExecute(r, t);
        if (t != null) {
            log.error("任务执行异常", t);
        }
    }
}
```

### 9.2 如何避免任务丢失？

1. 使用有界队列 + 合理的拒绝策略
2. CallerRunsPolicy 降级处理
3. 自定义策略：持久化到消息队列/数据库

### 9.3 线程池如何实现动态调参？

```java
ThreadPoolExecutor executor = ...;

// 动态调整核心线程数
executor.setCorePoolSize(newCoreSize);

// 动态调整最大线程数
executor.setMaximumPoolSize(newMaxSize);
```

---

## 参考资料

- [Java 并发编程实战](https://book.douban.com/subject/10484692/)
- [Java 并发编程的艺术](https://book.douban.com/subject/26591326/)
- [JavaGuide - 线程池详解](https://javaguide.cn/java/concurrent/java-thread-pool.html)
- [美团技术团队 - Java线程池实现原理及其在美团业务中的实践](https://tech.meituan.com/2020/04/02/java-pooling-pratice-in-meituan.html)
