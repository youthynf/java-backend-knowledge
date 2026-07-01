# Java 中有哪些集合是线程安全的

## 核心概念

Java 线程安全集合分三代：**早期同步容器**（Vector、Hashtable，方法级 synchronized）、**Collections 包装类**（`synchronizedList` / `synchronizedMap` 等，粗粒度同步包装）、**并发容器**（`java.util.concurrent` 包下的 ConcurrentHashMap、CopyOnWriteArrayList、BlockingQueue 等）。

实际开发中，优先用 `java.util.concurrent` 下的并发容器，**Vector 和 Hashtable 已经被淘汰**，只在维护老代码时才会遇到。

## 标准回答

一句话结论：**Java 线程安全集合分三类——早期同步容器（Vector、Hashtable，方法级 synchronized，性能差）、Collections 同步包装（synchronizedList/Map，粗粒度锁）、并发容器（ConcurrentHashMap、CopyOnWriteArrayList、BlockingQueue，专门为并发设计）。新代码一律用并发容器。**

常见线程安全集合清单：

| 类别 | 类 | 特点 |
|------|----|----|
| 同步容器 | `Vector` | List，方法级 synchronized，扩容 2 倍 |
| 同步容器 | `Hashtable` | Map，方法级 synchronized，不允 null |
| 同步包装 | `Collections.synchronizedList` | 任意 List 套同步包装 |
| 同步包装 | `Collections.synchronizedMap` | 任意 Map 套同步包装 |
| 并发容器 | `ConcurrentHashMap` | 高并发 Map，JDK 8 用 CAS + 桶级 synchronized |
| 并发容器 | `CopyOnWriteArrayList` | 读多写少 List，写时复制 |
| 并发容器 | `CopyOnWriteArraySet` | 基于 CopyOnWriteArrayList 的 Set |
| 并发容器 | `ConcurrentLinkedQueue` | CAS 无界非阻塞队列 |
| 并发容器 | `ConcurrentLinkedDeque` | CAS 双端队列 |
| 并发容器 | `ArrayBlockingQueue` | 有界阻塞队列 |
| 并发容器 | `LinkedBlockingQueue` | 链表阻塞队列 |
| 并发容器 | `PriorityBlockingQueue` | 优先级阻塞队列 |
| 并发容器 | `DelayQueue` | 延迟队列 |
| 并发容器 | `SynchronousQueue` | 直接传递，无容量 |
| 并发容器 | `ConcurrentSkipListMap` | 跳表实现的并发有序 Map |
| 并发容器 | `ConcurrentSkipListSet` | 跳表实现的并发有序 Set |

## 实现原理

### 1. 同步容器：Vector / Hashtable

```java
// Vector.add
public synchronized boolean add(E e) { ... }

// Hashtable.put
public synchronized V put(K key, V value) { ... }
```

特点：每个方法 `synchronized` 锁住整个对象，所有操作竞争同一把锁，并发吞吐量差。复合操作（如 `containsKey + put`）仍不原子。

### 2. Collections 同步包装

```java
public static <T> List<T> synchronizedList(List<T> list) {
    return (list instanceof RandomAccess
            ? new SynchronizedRandomAccessList<>(list)
            : new SynchronizedList<>(list));
}

static class SynchronizedList<E> extends SynchronizedCollection<E> implements List<E> {
    public void add(int index, E element) {
        synchronized (mutex) {list.add(index, element);}
    }
    // ...
}
```

特点：内部用 `mutex` 对象锁，每个方法包装一层 `synchronized`。本质和 Vector 一样是粗粒度锁。迭代时必须手动加锁：

```java
List<String> list = Collections.synchronizedList(new ArrayList<>());
synchronized (list) {                        // 遍历必须手动加锁
    for (String s : list) { ... }
}
```

### 3. 并发容器

#### ConcurrentHashMap

JDK 7：分段锁 `Segment[]`，每个 Segment 是一个独立的小 HashMap，默认 16 个段，并发度 16。

JDK 8：抛弃 Segment，改用 `Node[]` + CAS + 桶级 synchronized。读完全无锁（volatile 读 Node 的 val 和 next），写时只锁住桶头节点，并发度等于桶数。

```java
// 简化的 putVal 逻辑
final V putVal(K key, V value, boolean onlyIfAbsent) {
    int hash = spread(key.hashCode());
    for (Node<K,V>[] tab = table;;) {
        Node<K,V> f; int n, i, fh;
        if (tab == null || (n = tab.length) == 0)
            tab = initTable();
        else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
            // 桶空，CAS 直接放入
            if (casTabAt(tab, i, null, new Node<>(hash, key, value, null)))
                break;
        } else if ((fh = f.hash) == MOVED) {
            // 正在扩容，帮忙迁移
            tab = helpTransfer(tab, f);
        } else {
            synchronized (f) {              // 锁住桶头节点
                if (tabAt(tab, i) == f) {
                    // 链表或红黑树插入
                }
            }
        }
    }
}
```

#### CopyOnWriteArrayList

读无锁，写时复制整个数组后用 `volatile` 替换引用。详见 [CopyOnWriteArrayList 底层实现原理](CopyOnWriteArrayList底层实现原理是怎么样的？.md)。

#### BlockingQueue 系列

```java
// ArrayBlockingQueue.put / take
public void put(E e) throws InterruptedException {
    final ReentrantLock lock = this.lock;
    lock.lockInterruptibly();
    try {
        while (count == items.length)        // 队列满，等待
            notFull.await();
        enqueue(e);
    } finally { lock.unlock(); }
}

public E take() throws InterruptedException {
    final ReentrantLock lock = this.lock;
    lock.lockInterruptibly();
    try {
        while (count == 0)                   // 队列空，等待
            notEmpty.await();
        return dequeue();
    } finally { lock.unlock(); }
}
```

用 `ReentrantLock + 两个 Condition` 实现阻塞语义，是线程池任务队列的基础。

#### ConcurrentLinkedQueue

基于 Michael & Scott 算法的无锁链表队列，全 CAS 操作，无阻塞等待。适合高并发无界队列，不适用于生产者-消费者（无阻塞等待）。

## 代码示例

### 高并发 Map

```java
ConcurrentHashMap<Long, UserProfile> cache = new ConcurrentHashMap<>();

// 原子复合操作
cache.computeIfAbsent(userId, this::loadFromDb);

// 原子累加
cache.merge(userId, 1, Integer::sum);
```

### 生产者-消费者

```java
BlockingQueue<Task> queue = new LinkedBlockingQueue<>(1000);

// 生产者
new Thread(() -> {
    while (true) {
        Task t = generate();
        queue.put(t);              // 队列满自动阻塞
    }
}).start();

// 消费者
new Thread(() -> {
    while (true) {
        Task t = queue.take();     // 队列空自动阻塞
        process(t);
    }
}).start();
```

### 监听器列表

```java
CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();
listeners.add(new Listener());      // 写少
for (Listener l : listeners) {      // 读多，无锁遍历
    l.on(event);
}
```

### 不允 null 的注意点

```java
ConcurrentHashMap<String, String> map = new ConcurrentHashMap<>();
map.put("k", null);   // 抛 NullPointerException
// 从 HashMap 迁移数据时要先过滤 null
```

## 实战场景

| 场景 | 推荐方案 | 注意点 |
|------|---------|--------|
| 高并发读写缓存 | `ConcurrentHashMap` | 不允 null，复合操作用 `computeIfAbsent` |
| 监听器 / 订阅者列表 | `CopyOnWriteArrayList` | 读多写少，写少且数据量小 |
| 线程池任务队列 | `LinkedBlockingQueue` / `ArrayBlockingQueue` | 必须设容量，默认 `Integer.MAX_VALUE` 易 OOM |
| 延迟任务调度 | `DelayQueue` | 任务实现 `Delayed` 接口 |
| 优先级出队 | `PriorityBlockingQueue` | 不保证遍历有序，只保证队首最优 |
| 高并发无界队列 | `ConcurrentLinkedQueue` | 无阻塞等待，不能用于生产者-消费者 |
| 并发有序 Map | `ConcurrentSkipListMap` | 跳表实现，`O(log n)` |
| 静态配置只读 | 普通 `HashMap` + `final` 引用 | 安全发布即可，无需并发容器 |

## 深挖追问

### 线程安全集合所有操作都安全吗？

不全是。单方法调用通常安全，但**复合操作不一定安全**：

```java
// 即使 list 是 synchronizedList，下面两步之间也可能被插入
if (!list.contains("A")) {
    list.add("A");              // 可能多个线程同时通过判断，重复添加
}
```

要保证原子性，必须额外加锁或用支持原子复合操作的容器（如 `ConcurrentHashMap.computeIfAbsent`）。

### synchronizedList 遍历为什么还要手动加锁？

迭代器是多次 `next()` 调用组成的复合过程。如果遍历期间其他线程修改集合，可能抛 `ConcurrentModificationException` 或读到不一致状态。官方推荐：

```java
synchronized (list) {
    Iterator<String> it = list.iterator();
    while (it.hasNext()) { it.next(); }
}
```

### ConcurrentHashMap 为什么不能完全替代 HashMap？

- 不允许 null key/value，业务有 null 时需先过滤。
- 单线程场景下并发容器的 CAS、volatile 等有额外开销，没必要。
- ConcurrentHashMap 弱一致（迭代时看到的是某时刻快照），有些场景需要强一致。

### ConcurrentHashMap 的 size 准确吗？

JDK 8 的 `size()` 是近似值。它把 `baseCount` + 所有 `CounterCell` 的值相加，并发下可能略小于真实值（部分计数还没合并）。如果需要精确值，要在外部加锁。

### CopyOnWriteArrayList 为什么适合读多写少？

每次写复制整个数组，写成本 `O(n)`；读完全无锁，性能与 ArrayList 相当。读多写少时，写偶发的 `O(n)` 成本被读的零开销抵消。但写多时复制成本会拖垮系统。

### Vector / Hashtable 为什么被淘汰？

- 锁粒度太粗，所有方法竞争同一把锁，并发吞吐量差。
- API 设计陈旧（Vector 继承 AbstractList 但实现 Stack 子类，Hashtable 继承 Dictionary）。
- 缺少现代 Map 的扩展（如 computeIfAbsent、merge）。
- ConcurrentHashMap / CopyOnWriteArrayList 已经覆盖了它们的场景且性能更好。

## 易错点

- "线程安全"不等于"高并发性能好"，Vector 线程安全但并发差。
- synchronizedList 迭代时仍要手动加锁，否则抛 CME。
- `ConcurrentHashMap` 不允许 null key/value，从 HashMap 迁移要过滤 null。
- `LinkedBlockingQueue` 不指定容量时默认 `Integer.MAX_VALUE`，生产环境必设容量。
- `CopyOnWriteArrayList` 不要用于写多场景，复制成本会拖垮系统。
- `PriorityBlockingQueue` 出队有序，遍历无序，不要用 for-each 假定顺序。

## 总结

记忆三类：早期同步容器（Vector/Hashtable，淘汰）、同步包装（synchronizedXxx，粗粒度锁）、并发容器（j.u.c 包，新代码首选）。选型看场景：高并发 Map 选 ConcurrentHashMap，读多写少 List 选 CopyOnWriteArrayList，生产消费选 BlockingQueue，并发有序选 ConcurrentSkipListMap。Vector 和 Hashtable 只在维护老代码时遇到，新代码不要写。

## 参考资料

- [Java Concurrency in Practice - Chapter 5 Building Blocks](https://jcip.net/)
- [OpenJDK java.util.concurrent 包](https://github.com/openjdk/jdk/tree/jdk8u/jdk/src/share/classes/java/util/concurrent)
