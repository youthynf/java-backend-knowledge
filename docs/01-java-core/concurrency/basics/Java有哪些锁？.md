# Java 有哪些锁

## 核心概念

Java 锁的世界看上去纷繁，其实只有三种分类视角：**对竞争的态度**（悲观 vs 乐观）、**对获取顺序的约定**（公平 vs 非公平）、**对持锁者的约束**（独占 vs 共享、可重入 vs 不可重入、是否阻塞）。加上 `synchronized` 在 JDK 6 后引入的锁升级机制（无锁→偏向锁→轻量级锁→重量级锁），就构成了 Java 锁的全景图。

理解每种锁的关键不是死记定义，而是知道"它解决什么问题、代价是什么、什么时候选它"。比如悲观锁适合写多读少，乐观锁适合读多写少；公平锁吞吐低但避免饥饿，非公平锁吞吐高但可能饿死。`synchronized` 是 JVM 内置的悲观独占可重入锁，JUC 的 `ReentrantLock` 是它的高级版。

## 标准回答

Java 锁按维度分类：

1. **悲观锁 vs 乐观锁**：悲观锁认为一定会被别人改，先加锁再操作（`synchronized` / `ReentrantLock`）；乐观锁认为不会冲突，提交时用 CAS 校验（`AtomicInteger` / `LongAdder`）。
2. **公平锁 vs 非公平锁**：公平锁按申请顺序排队，避免饥饿但吞吐低；非公平锁允许插队，吞吐高但可能饿死队列线程。
3. **可重入锁 vs 不可重入锁**：可重入锁允许同线程多次获取同一把锁（`synchronized` / `ReentrantLock`），不可重入锁重入会死锁。
4. **独占锁 vs 共享锁**：独占锁只能一个线程持有（`synchronized` / `ReentrantLock`），共享锁允许多个线程同时持有（`ReentrantReadWriteLock.ReadLock` / `Semaphore`）。
5. **自旋锁**：竞争时不立即阻塞，循环 CAS 尝试，避免上下文切换开销。
6. **锁升级**：`synchronized` 专属，按竞争强度从无锁→偏向锁→轻量级锁→重量级锁单向膨胀。

JDK 6 之后 `synchronized` 性能大幅提升，与 `ReentrantLock` 接近，选型更多看功能需求而非性能。

## 实现原理

### 悲观锁 vs 乐观锁

| 维度 | 悲观锁 | 乐观锁 |
|------|--------|--------|
| 思路 | 先加锁再操作 | 不加锁，提交时 CAS 校验 |
| 实现 | synchronized / ReentrantLock | AtomicInteger / LongAdder / 版本号 |
| 适用 | 写多读少、竞争激烈 | 读多写少、冲突少 |
| 代价 | 上下文切换、线程阻塞 | CAS 自旋、ABA 问题 |
| 数据库对应 | `select ... for update` | version 字段 + update where version=? |

### 公平锁 vs 非公平锁

`ReentrantLock` 内部基于 AQS。公平锁的 `tryAcquire` 会先调用 `hasQueuedPredecessors()` 检查队列里有没有排在前面的线程，有就老老实实去排队；非公平锁直接 CAS 尝试抢，抢不到再入队。非公平锁吞吐高的原因是"刚释放锁的线程大概率还能立刻抢回来"，避免了唤醒阻塞线程的开销。

```java
// ReentrantLock.NonfairSync
final boolean nonfairTryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();
    if (c == 0) {
        if (compareAndSetState(0, acquires)) { // 直接抢，不管队列
            setExclusiveOwnerThread(current);
            return true;
        }
    }
    // ...
}

// ReentrantLock.FairSync
final boolean tryAcquire(int acquires) {
    final Thread current = Thread.currentThread();
    int c = getState();
    if (c == 0) {
        if (!hasQueuedPredecessors() &&          // 先看队列里有没有先来的
            compareAndSetState(0, acquires)) {
            setExclusiveOwnerThread(current);
            return true;
        }
    }
    // ...
}
```

### 可重入锁的实现

可重入锁在 AQS 的 `state` 上记录重入次数：第一次获取 state=1，重入 state+1，每次 unlock state-1，减到 0 才真正释放锁。`synchronized` 也类似——monitor 的 `_count` 字段记录重入次数。

### synchronized 的锁升级

`ynchronized` 在 JDK 6 之后引入"锁升级"机制，根据竞争强度自动选择不同实现：

| 锁状态 | 触发条件 | Mark Word 标志 | 实现方式 | 适用场景 |
|--------|----------|----------------|----------|----------|
| 无锁 | 新建对象 | 01 (biased=0) | 无 | 没有同步 |
| 偏向锁 | 首次被某线程访问 | 01 (biased=1) | CAS 写线程 ID 到 Mark Word | 单线程重复进入 |
| 轻量级锁 | 出现竞争 | 00 | CAS 自旋（实际不自旋，直接膨胀） | 短暂、交替执行 |
| 重量级锁 | 长时间持有或激烈竞争 | 10 | OS mutex + monitor | 长临界区 |

升级是单向的——一旦升级到重量级锁就不会降级（GC 安全点可能批量撤销偏向锁除外）。注意 JDK 15 已废弃偏向锁（JEP 374），JDK 18 默认禁用。

> 详细升级流程见 [synchronized基本原理是什么？](/01-java-core/concurrency/keywords/synchronized基本原理是什么？.md)。

### 共享锁的实现

`ReentrantReadWriteLock` 用 AQS 的 `state` 高 16 位记录读锁持有数、低 16 位记录写锁重入数。读锁是共享锁，多个线程可同时持有；写锁是独占锁，与所有读锁互斥。`Semaphore` 也是共享锁，state 记录剩余许可数。

## 代码示例

### 悲观锁（synchronized）

```java
public class PessimisticCounter {
    private int count;

    public synchronized void inc() {
        count++; // 同一时刻只有一个线程能进入
    }
}
```

### 乐观锁（CAS）

```java
import java.util.concurrent.atomic.AtomicInteger;

public class OptimisticCounter {
    private final AtomicInteger count = new AtomicInteger();

    public void inc() {
        count.incrementAndGet(); // CAS 自旋，无锁
    }
}
```

### 公平锁 vs 非公平锁

```java
import java.util.concurrent.locks.ReentrantLock;

public class FairLockDemo {
    private static void test(boolean fair) {
        ReentrantLock lock = new ReentrantLock(fair);
        for (int i = 0; i < 5; i++) {
            new Thread(() -> {
                for (int j = 0; j < 3; j++) {
                    lock.lock();
                    try {
                        System.out.println(Thread.currentThread().getName() + " got lock");
                    } finally { lock.unlock(); }
                }
            }, "t-" + i).start();
        }
    }
    // fair=true：按 t-0, t-1, t-2 顺序循环
    // fair=false：可能出现某个线程连续抢到多次
}
```

### 可重入锁

```java
import java.util.concurrent.locks.ReentrantLock;

public class ReentrantDemo {
    private final ReentrantLock lock = new ReentrantLock();

    public void outer() {
        lock.lock();
        try {
            System.out.println("outer, hold count = " + lock.getHoldCount()); // 1
            inner();
        } finally { lock.unlock(); }
    }

    public void inner() {
        lock.lock();
        try {
            System.out.println("inner, hold count = " + lock.getHoldCount()); // 2
        } finally { lock.unlock(); }
    }
}
```

### 读写锁

```java
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class Cache<K, V> {
    private final ReentrantReadWriteLock rwl = new ReentrantReadWriteLock();
    private final java.util.Map<K, V> map = new java.util.HashMap<>();

    public V get(K key) {
        rwl.readLock().lock();
        try { return map.get(key); } finally { rwl.readLock().unlock(); }
    }

    public void put(K key, V value) {
        rwl.writeLock().lock();
        try { map.put(key, value); } finally { rwl.writeLock().unlock(); }
    }
}
```

## 实战场景

| 场景 | 推荐锁 | 理由 |
|------|--------|------|
| 简单同步块 | `synchronized` | 语法简单、JVM 自动释放、JDK 6+ 性能接近 ReentrantLock |
| 需要可中断 / 超时 / 公平 / 多条件 | `ReentrantLock` | synchronized 不支持这些高级特性 |
| 读多写少（缓存） | `ReentrantReadWriteLock` / `StampedLock` | 读读并发，写独占 |
| 高并发计数 | `LongAdder` | 比 `AtomicLong` 在写激烈时性能好（分段累加） |
| 状态标记 | `volatile` | 不需要锁，只保证可见性 |
| 数据库乐观锁 | version 字段 | `update t set val=?, version=version+1 where id=? and version=?`，看影响行数 |

## 深挖追问

### synchronized 和 ReentrantLock 怎么选？

简单同步优先 `synchronized`（自动释放、JVM 优化充分）；需要可中断、超时、公平、多条件队列时用 `ReentrantLock`。详见 [synchronized与ReentrantLock区别是什么？](/01-java-core/concurrency/keywords/synchronized与ReentrantLock区别是什么？.md)。

### 公平锁和非公平锁到底怎么选？

绝大多数场景用非公平锁（默认）。只有"必须避免饥饿"——比如交易系统中希望请求按到达顺序处理——才考虑公平锁，并接受吞吐下降 5-10 倍。详见 [公平锁与非公平锁实现原理与区别是什么？](/01-java-core/concurrency/JUC/公平锁与非公平锁实现原理与区别是什么？.md)。

### 悲观锁和乐观锁冲突大时怎么办？

冲突激烈时乐观锁的 CAS 自旋会消耗大量 CPU，反而比悲观锁差。这种场景要么换悲观锁，要么用分段锁（`LongAdder` / `ConcurrentHashMap` 的分段）降低单点冲突。详见 [悲观锁和乐观锁的区别是什么？](/01-java-core/concurrency/JUC/悲观锁和乐观锁的区别是什么？.md)。

### 锁升级为什么不能降级？

降级需要全局安全点（safepoint）扫描所有线程，开销大；而且大多数场景下"已经激烈竞争过"的对象往往会继续被激烈竞争，降级收益小。JDK 只在 GC safepoint 时批量撤销或重偏向。

### StampedLock 是什么？和 ReentrantReadWriteLock 有什么区别？

`StampedLock` 是 JDK 8 引入的乐观读写锁。它支持"乐观读"——先读一个 stamp，读完数据后再 validate stamp，如果 validate 失败说明期间有写操作，再升级为悲观读锁重读。乐观读不阻塞写线程，读多写少场景吞吐比 `ReentrantReadWriteLock` 高。代价是不支持重入，使用复杂，容易出 bug。

## 易错点

- 用 `synchronized (字符串常量)` 或 `synchronized (Integer.valueOf(1))`——常量被共享，可能锁住无关业务。
- `ReentrantLock` 忘了 `unlock` 或没放 finally——异常时锁泄漏，所有线程卡死。
- `ReentrantReadWriteLock` 在持有读锁时尝试获取写锁——死锁（写锁要等所有读锁释放，自己持有的读锁永远不释放）。
- `LongAdder` 用在需要精确值的场景——`sum()` 不是原子快照，并发下可能不准。
- 以为 `volatile` 是锁——它只保证可见性，不保证复合操作原子性。

## 总结

Java 锁按"悲观/乐观、公平/非公平、可重入、独占/共享"四个维度分类。`synchronized` 是悲观、非公平、可重入、独占的内置锁，配合 JDK 6 后的锁升级机制性能接近 `ReentrantLock`。`ReentrantLock` 提供可中断、超时、公平、多条件队列等高级特性。读多写少用 `ReentrantReadWriteLock` 或 `StampedLock`，计数用 `LongAdder`。选型的核心是"看场景功能需求，而非性能差异"。

## 参考资料

- [Java 锁详解——美团技术团队](https://tech.meituan.com/2018/11/15/java-lock.html)
- [ReentrantLock 官方文档](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/locks/ReentrantLock.html)
- [JEP 374: Disable and Deprecate Biased Locking](https://openjdk.org/jeps/374)

---
