# Java 的并发模型如何理解

## 核心概念

Java 的并发模型基于**线程**而非进程。线程是 JVM 内的轻量级执行单元，多个线程共享同一个进程的堆、方法区，通过共享内存 + 同步控制协作。这套模型叫"共享内存并发模型"，是 Java 区别于 Erlang/Akka 等"消息传递并发模型"的根本特征。

并发编程要解决的核心问题是共享状态在多线程下的**可见性、原子性、有序性**——这三性都源自共享内存模型本身：因为共享，所以需要同步；因为同步，所以有锁竞争和性能损耗。

## 标准回答

Java 并发模型可以从三个层面理解：

1. **执行单元**：线程（`Thread`），由 JVM 映射到 OS 线程（1:1 模型）。
2. **通信方式**：共享内存。线程间通过读写堆中的共享变量传递信息，需要 `synchronized`、`volatile`、`Lock`、`Atomic*` 等同步机制保证三性。
3. **协作原语**：`wait/notify`、`Lock/Condition`、`CountDownLatch`、`Semaphore`、`BlockingQueue` 等用于线程间协作。

JMM（Java Memory Model）规定了线程与主内存、工作内存的交互规则，是理解可见性和有序性的理论基础。JUC 包（`java.util.concurrent`）在共享内存模型上提供了线程池、并发容器、原子类、锁等高层抽象。

## 实现原理

### 进程 vs 线程

| 维度 | 进程 | 线程 |
|------|------|------|
| 资源占用 | 独立内存空间 | 共享进程堆，私有栈 |
| 创建开销 | 大（分配内存、页表） | 小（栈 + 寄存器） |
| 通信方式 | IPC（管道、Socket、共享内存） | 直接读写共享变量 |
| 隔离性 | 进程崩溃不影响其他 | 线程崩溃可能拖垮进程 |
| 切换成本 | 高 | 低 |

JVM 是单进程多线程模型，Java 应用通常跑在一个 JVM 进程里，通过多线程利用多核 CPU。

### 共享内存模型

每个线程有自己的工作内存（CPU 缓存抽象），主内存存共享变量。线程对变量的操作：

```
Thread A: read → load → use → assign → store → write
                                              ↓
                                          主内存
                                              ↑
Thread B: read ← load ← use ← assign ← store ← write
```

JMM 定义了 8 种原子操作和一系列规则（happens-before、volatile 语义、锁语义）来约束这些操作的可见性和有序性。

### 1:1 线程模型

Java 线程与 OS 线程是 1:1 映射（HotSpot 实现）：

- `new Thread()` 创建 JVM 层 Thread 对象。
- `start()` 调用 native 方法创建 OS 线程。
- 线程调度由 OS 完成，JVM 不实现用户态调度。

代价是线程创建/销毁/切换都要走系统调用，开销大——这正是线程池存在的根本原因。

### 通信方式对比

| 模型 | 代表 | 通信方式 | 同步方式 |
|------|------|----------|----------|
| 共享内存 | Java、C++ | 读写共享变量 | 锁、CAS、volatile |
| 消息传递 | Erlang、Go(channel)、Akka | 发送消息 | 无共享状态，天然无锁 |

Java 也可以通过 `BlockingQueue` 模拟消息传递风格（生产者消费者模式），但底层仍是共享内存。

## 代码示例

### 共享内存 + 同步

```java
class Counter {
    private int count = 0;

    public synchronized void increment() {   // 加锁保证原子性
        count++;
    }

    public int get() {
        return count;
    }
}
```

### 用 BlockingQueue 实现消息传递风格

```java
BlockingQueue<Task> queue = new LinkedBlockingQueue<>();

// 生产者线程
new Thread(() -> {
    while (running) {
        Task task = generateTask();
        queue.put(task);   // 队列空时消费者阻塞，满时生产者阻塞
    }
}).start();

// 消费者线程
new Thread(() -> {
    while (running) {
        Task task = queue.take();
        process(task);
    }
}).start();
```

### 线程协作原语

```java
// CountDownLatch：等待 N 个线程完成
CountDownLatch latch = new CountDownLatch(3);
for (int i = 0; i < 3; i++) {
    new Thread(() -> {
        doWork();
        latch.countDown();
    }).start();
}
latch.await();   // 阻塞直到 3 个都完成

// Semaphore：限制并发数
Semaphore sem = new Semaphore(10);
sem.acquire();
try { callExternal(); } finally { sem.release(); }
```

### 多进程（例外场景）

```java
// 启动子进程
Process p = new ProcessBuilder("java", "-jar", "worker.jar").start();
int code = p.waitFor();

// Java 9+ 获取进程信息
long pid = ProcessHandle.current().pid();
```

## 实战场景

| 场景 | 模型选择 | 原因 |
|------|----------|------|
| 业务后端服务 | 多线程 + 共享内存 | 共享缓存、连接池效率高 |
| 任务编排 | 线程池 + CompletableFuture | 异步串联、组合多任务 |
| 高隔离要求 | 多 JVM 进程 | 进程间故障隔离 |
| 流式处理 | 多线程 + BlockingQueue | 生产消费解耦 |
| 计算/IO 混合 | 多个线程池隔离 | 防止互相拖垮 |

## 深挖追问

### Java 为什么选共享内存模型？

历史原因：Java 设计于 90 年代，主流 OS（Linux/Windows）都支持多进程多线程，共享内存模型对开发者最直观。消息传递模型需要语言级支持（如 Erlang 的 actor），实现复杂度高。

### 共享内存模型的核心问题是什么？

共享状态在多线程下需要同步，同步带来：

1. **可见性问题**：一个线程的写对另一个线程不可见（CPU 缓存）。
2. **原子性问题**：`count++` 不是原子操作，多线程下丢失更新。
3. **有序性问题**：编译器和 CPU 可能重排序，破坏预期顺序。

JMM 用 `happens-before` 关系约束这些行为。

### 1:1 线程模型的代价是什么？

每个 Java 线程映射到一个 OS 线程，创建/销毁/切换都走系统调用。所以：

- 不能创建太多线程（默认 1MB 栈，1000 线程 = 1GB）。
- 高并发场景用线程池复用线程。
- 极高并发场景（百万连接）用 NIO + 少量线程，避免线程爆炸。

### Java 19+ 的虚拟线程是什么？

虚拟线程（Project Loom）是用户态线程，由 JVM 调度而非 OS。一个 OS 线程可以跑多个虚拟线程，创建/切换成本极低。底层仍是共享内存模型，但解决了"线程昂贵"的问题。虚拟线程适合 IO 密集场景，能让代码用同步阻塞写法达到异步 IO 的吞吐。

### 共享内存和消息传递能混用吗？

能。生产中常见的"共享内存 + 队列"模式就是混合：多个线程通过 `BlockingQueue` 传递任务（消息传递风格），但任务内部仍可能访问共享缓存（共享内存）。Java 也可以通过 JMS、Kafka 跨进程消息传递。

## 易错点

- 把"并发"和"并行"混为一谈：并发是"同时处理多件事"（可能切换），并行是"同时执行多件事"（多核同时跑）。
- 以为多线程一定比单线程快：线程切换、锁竞争可能让多线程更慢。
- 忽略可见性问题：一个线程改了变量没刷主内存，另一个线程读到旧值。
- 用 `Thread.stop` 强杀线程：已废弃，破坏不变量。

## 总结

Java 并发模型的核心是"线程 + 共享内存"，多个线程共享堆内存通过同步机制协作。这套模型直观高效，但带来可见性、原子性、有序性三大问题，JMM 和 JUC 包是解决这些问题的理论基础和工程实现。理解共享内存模型，是掌握线程池、锁、并发容器、JMM 的前提。

## 参考资料

- [JDK java.util.concurrent 包文档](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/package-summary.html)
- [Java 并发编程实战](https://book.douban.com/subject/10484692/) - Brian Goetz
- [Java 并发编程的艺术](https://book.douban.com/subject/26591326/)
- [The Java Memory Model](https://www.cs.umd.edu/~pugh/java/memoryModel/)

---
