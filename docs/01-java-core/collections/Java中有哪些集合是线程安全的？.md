# Java 中有哪些集合是线程安全的？

## 核心概念

Java 中线程安全集合可以分成三类：

1. **早期同步容器**：如 `Vector`、`Hashtable`，方法级别加 `synchronized`。
2. **Collections 包装类**：如 `Collections.synchronizedList()`，给普通集合套一层同步包装。
3. **并发容器**：如 `ConcurrentHashMap`、`CopyOnWriteArrayList`、`BlockingQueue`，针对并发场景做了专门设计。

实际开发中，优先考虑 `java.util.concurrent` 包下的并发容器，而不是直接使用 `Vector`、`Hashtable`。

## 面试官想考什么

这个问题表面是在问“有哪些类”，实际是在考：

- 你能不能区分“线程安全”和“高并发性能好”。
- 你是否知道同步容器和并发容器的区别。
- 你是否能根据读多写多、生产消费、去重缓存等场景选择合适集合。
- 你是否知道复合操作仍然可能需要额外同步。

## 标准回答

Java 常见线程安全集合包括：

### 1. Vector

`Vector` 是早期线程安全 List，很多方法使用 `synchronized` 修饰。它能保证单个方法调用的线程安全，但锁粒度大，并发性能一般，现在较少作为首选。

### 2. Hashtable

`Hashtable` 是早期线程安全 Map，也通过方法级 `synchronized` 保证线程安全。它不允许 null key 和 null value。现代并发场景通常用 `ConcurrentHashMap` 替代。

### 3. Collections.synchronizedXxx

`Collections` 可以把普通集合包装成同步集合：

```java
List<String> list = Collections.synchronizedList(new ArrayList<>());
Map<String, String> map = Collections.synchronizedMap(new HashMap<>());
```

它的原理是在每个方法外层加同一把锁，简单但锁竞争较重。遍历时仍需要手动加锁。

### 4. ConcurrentHashMap

`ConcurrentHashMap` 是高并发 Map。JDK 1.8 中主要通过 CAS + synchronized + Node 数组 + 链表/红黑树实现，降低了锁粒度，适合高并发读写缓存、计数、状态表等场景。

### 5. CopyOnWriteArrayList

`CopyOnWriteArrayList` 适合读多写少场景。写操作会复制底层数组，修改副本后再替换引用；读操作通常不加锁，遍历时看到的是快照。

典型场景：配置监听器列表、黑白名单快照、读多写少的订阅者列表。

### 6. BlockingQueue

`BlockingQueue` 是线程安全队列，常用于生产者消费者模型。例如：

- `ArrayBlockingQueue`
- `LinkedBlockingQueue`
- `PriorityBlockingQueue`
- `DelayQueue`
- `SynchronousQueue`

线程池中的任务队列就大量使用了阻塞队列。

### 7. ConcurrentLinkedQueue / ConcurrentLinkedDeque

这是基于非阻塞算法的并发队列/双端队列，适合高并发无界队列场景，不提供阻塞等待能力。

## 深挖追问

### 1. 线程安全集合是否所有操作都安全？

单个方法调用通常安全，但复合操作不一定安全。例如：

```java
if (!list.contains("A")) {
    list.add("A");
}
```

即使 `list` 是 synchronizedList，上面这两步之间也可能被其他线程插入，导致重复添加。需要额外同步，或选择支持原子复合操作的数据结构。

### 2. synchronizedList 遍历为什么还要手动加锁？

因为迭代器遍历是多次方法调用组成的复合过程。官方推荐：

```java
List<String> list = Collections.synchronizedList(new ArrayList<>());

synchronized (list) {
    Iterator<String> it = list.iterator();
    while (it.hasNext()) {
        System.out.println(it.next());
    }
}
```

否则遍历过程中其他线程修改集合，仍可能抛出 `ConcurrentModificationException` 或读到不一致状态。

### 3. ConcurrentHashMap 为什么不能完全替代 HashMap？

`ConcurrentHashMap` 为并发付出了额外成本，单线程或局部变量场景没必要使用。并且它不允许 null key/null value，这和 HashMap 不同。普通非并发场景使用 HashMap 更简单。

### 4. CopyOnWriteArrayList 为什么适合读多写少？

因为每次写入都会复制数组，写成本是 O(n)，内存开销也较高。但读操作无需加锁，遍历是稳定快照，所以读多写少时收益明显。

## 实战场景

### 场景 1：本地缓存表

多线程读写用户状态缓存，可以使用 `ConcurrentHashMap`：

```java
ConcurrentHashMap<Long, String> statusMap = new ConcurrentHashMap<>();

statusMap.put(userId, "ONLINE");
String status = statusMap.get(userId);
```

如果要“没有就初始化”，不要写成 `containsKey + put`，推荐：

```java
UserProfile profile = cache.computeIfAbsent(userId, id -> loadProfile(id));
```

### 场景 2：生产者消费者

```java
BlockingQueue<Runnable> queue = new LinkedBlockingQueue<>(1000);

queue.put(task);   // 队列满时阻塞
Runnable task = queue.take(); // 队列空时阻塞
```

这种场景不应该用 synchronizedList 硬凑，因为队列的阻塞语义和容量控制更重要。

### 场景 3：监听器列表

```java
CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();

for (Listener listener : listeners) {
    listener.onEvent(event);
}
```

监听器通常注册少、通知多，CopyOnWriteArrayList 很合适。

## 易错点

- `Vector`、`Hashtable` 线程安全但不代表性能好。
- synchronized 包装集合遍历时仍要手动加锁。
- `ConcurrentHashMap` 不允许 null key/null value。
- 线程安全集合只能保证自身结构安全，不能自动保证业务操作的原子性。
- 写多场景慎用 `CopyOnWriteArrayList`，否则复制成本很高。

## 总结

面试回答可以按“同步容器、同步包装类、并发容器”三类展开。实际选型时更重要的是场景：Map 高并发读写选 `ConcurrentHashMap`，读多写少 List 选 `CopyOnWriteArrayList`，生产消费选 `BlockingQueue`，普通单线程场景不要过度使用线程安全集合。
