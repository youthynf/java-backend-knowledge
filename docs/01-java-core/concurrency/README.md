# Java 并发编程

## 核心概念

### 线程基础
- **线程状态**：NEW、RUNNABLE、BLOCKED、WAITING、TIMED_WAITING、TERMINATED
- **创建方式**：继承 Thread、实现 Runnable、实现 Callable（有返回值）
- **wait/notify**：必须在 synchronized 块中使用，属于 Object 方法

### synchronized vs Lock

| 特性 | synchronized | ReentrantLock |
|------|-------------|---------------|
| 实现层面 | JVM 关键字 | Java API |
| 锁获取 | 自动释放 | 手动 unlock() |
| 公平性 | 非公平 | 可选公平/非公平 |
| 中断 | 不可中断 | lockInterruptibly() |
| 条件变量 | 单一条件 | 多个 Condition |

### volatile 关键字
- **可见性**：写操作立即刷新到主内存，读操作从主内存读取
- **禁止指令重排序**：通过内存屏障实现
- **不保证原子性**：count++ 操作仍需加锁

### CAS 与 Atomic 类
- **CAS（Compare And Swap）**：乐观锁，无锁并发
- **ABA 问题**：通过版本号解决（AtomicStampedReference）
- **常用类**：AtomicInteger、AtomicReference、LongAdder（高并发计数）

### AQS（AbstractQueuedSynchronizer）
- **核心思想**：state 变量 + CLH 双向队列
- **独占模式**：ReentrantLock
- **共享模式**：CountDownLatch、Semaphore
- **Condition**：实现等待/通知机制

---

## 面试高频问题

### 1. synchronized 的实现原理？

**回答要点**：
- 对象头中的 Mark Word
- Monitor 机制
- 锁升级：偏向锁 → 轻量级锁 → 重量级锁

### 2. volatile 能保证线程安全吗？

**回答要点**：
- 保证可见性
- 禁止指令重排序
- 不保证原子性
- 适用场景：状态标志、单例双重检查

### 3. 线程池核心参数有哪些？如何配置？

**回答要点**：
- corePoolSize、maximumPoolSize、keepAliveTime、workQueue
- 任务流程：核心线程 → 队列 → 最大线程 → 拒绝策略
- 配置建议：CPU 密集型 N+1，IO 密集型 2N

### 4. ThreadLocal 会有内存泄漏吗？如何避免？

**回答要点**：
- Key 是弱引用，Value 是强引用
- 线程池场景下 Value 可能泄漏
- 使用后手动 remove()

### 5. ConcurrentHashMap 如何保证线程安全？

**回答要点**：
- JDK7：Segment 分段锁
- JDK8：CAS + synchronized 锁桶节点
- 更细粒度的并发控制

---

## 代码示例

### 线程池创建

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    10,                             // corePoolSize
    20,                             // maximumPoolSize
    60L, TimeUnit.SECONDS,          // keepAliveTime
    new ArrayBlockingQueue<>(100),  // workQueue
    new ThreadFactoryBuilder().setNameFormat("worker-%d").build(),
    new ThreadPoolExecutor.CallerRunsPolicy()  // 拒绝策略
);
```

### 单例模式（双重检查）

```java
public class Singleton {
    private static volatile Singleton instance;
    
    private Singleton() {}
    
    public static Singleton getInstance() {
        if (instance == null) {
            synchronized (Singleton.class) {
                if (instance == null) {
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}
```

---

## 实战场景

### 线程池监控
- 记录活跃线程数
- 监控队列长度
- 拒绝任务计数

### 死锁排查
1. `jstack` 查看线程栈
2. 找到 BLOCKED 线程
3. 分析锁持有关系

---

## 延伸思考

- 为什么 HashMap 是线程不安全的？
- 如何实现一个线程安全的计数器？
- Fork/Join 框架的适用场景？
- 虚拟线程对并发编程的影响？

## 参考资料

- [Java 并发编程实战](https://book.douban.com/subject/10484692/)
- [Java 并发编程之美](https://book.douban.com/subject/30368104/)
