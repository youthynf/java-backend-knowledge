# 多线程下 HashMap 会有什么问题？

## 核心概念

HashMap 不是线程安全的集合。多个线程同时读写 HashMap，尤其是并发执行 put、resize、remove 等结构性修改时，可能出现数据丢失、覆盖、读到旧值、遍历异常，甚至在旧版本 JDK 中出现链表成环导致 CPU 飙高。

注意：这里的核心不是“HashMap 一定不能多线程读”，而是 **不能在没有同步保护的情况下并发修改**。如果初始化完成后只读，通常问题不大；一旦并发写，就应该换成并发容器或加锁。

## 面试官想考什么

面试官通常想确认你是否知道：

- HashMap 为什么线程不安全，而不是只会背结论。
- 并发 put 和 resize 会破坏什么结构。
- JDK 1.7 和 JDK 1.8 的问题表现有什么差异。
- 业务中应该如何替代 HashMap。
- 为什么 `Collections.synchronizedMap` 和 `ConcurrentHashMap` 的适用场景不同。

## 标准回答

多线程下 HashMap 主要有以下问题：

### 1. 数据覆盖或丢失

多个线程同时 put 时，可能同时计算到同一个桶位，并基于旧状态写入。后写入的线程可能覆盖前一个线程的结果，导致部分数据丢失。

例如两个线程都看到某个桶为空：

```text
线程 A：发现 table[i] == null，准备放入 A 节点
线程 B：发现 table[i] == null，准备放入 B 节点
线程 A：table[i] = A
线程 B：table[i] = B
```

最终 A 节点可能丢失。

### 2. size 统计不准确

HashMap 的 `size++` 不是原子操作。多个线程同时新增元素时，size 可能少加或错加，进一步影响扩容判断。

### 3. resize 期间结构异常

扩容会创建新数组并迁移旧元素。多个线程同时扩容或一个线程扩容时另一个线程修改链表，可能导致桶链结构异常。

JDK 1.7 中，HashMap 扩容迁移链表时采用头插法，并发 resize 可能造成链表成环，get 时遍历链表进入死循环，表现为 CPU 100%。

JDK 1.8 改为尾插法，降低了链表成环的典型风险，但仍然不是线程安全的，仍可能出现数据覆盖、丢失、结构不一致等问题。

### 4. 遍历时并发修改异常

一个线程遍历 HashMap，另一个线程修改结构，可能触发 fail-fast，抛出 `ConcurrentModificationException`。

## 深挖追问

### 1. HashMap 多线程读安全吗？

如果 HashMap 构建完成后不再修改，只是多个线程读取，一般可以工作。但如果没有安全发布，其他线程理论上可能看到未完全初始化的状态。工程上更稳妥的方式是：初始化后通过 final 字段、安全发布机制，或者使用不可变 Map。

### 2. 为什么 ConcurrentHashMap 更适合并发？

ConcurrentHashMap 针对并发访问做了专门设计。JDK 1.8 中读操作大多数情况下无锁，写操作主要使用 CAS 和 synchronized 锁住桶级别节点，锁粒度远小于 Hashtable 的整表锁。

它还提供了一些原子复合方法，例如：

```java
cache.computeIfAbsent(key, k -> loadFromDb(k));
```

这比 `containsKey + put` 更适合并发场景。

### 3. synchronizedMap 能不能解决问题？

`Collections.synchronizedMap(new HashMap<>())` 可以通过外层同步保证单个方法线程安全，但所有操作竞争同一把锁，并发性能一般。并且遍历时还需要手动对 map 加锁。

```java
Map<String, String> map = Collections.synchronizedMap(new HashMap<>());

synchronized (map) {
    for (Map.Entry<String, String> entry : map.entrySet()) {
        System.out.println(entry.getKey());
    }
}
```

如果是高并发读写，通常优先选择 ConcurrentHashMap。

### 4. ConcurrentHashMap 是否允许 null？

不允许 null key 和 null value。原因之一是并发场景下 null 会带来语义歧义：`get(key)` 返回 null 时，无法区分 key 不存在，还是 value 本身就是 null。

## 实战场景

### 场景 1：本地缓存不要用普通 HashMap 并发写

错误写法：

```java
Map<Long, User> cache = new HashMap<>();

public User getUser(Long id) {
    if (!cache.containsKey(id)) {
        cache.put(id, loadUser(id));
    }
    return cache.get(id);
}
```

多个线程同时访问时，`containsKey + put` 不是原子操作，还可能破坏 HashMap 结构。

推荐写法：

```java
ConcurrentHashMap<Long, User> cache = new ConcurrentHashMap<>();

public User getUser(Long id) {
    return cache.computeIfAbsent(id, this::loadUser);
}
```

### 场景 2：只读配置 Map

如果配置启动时加载完成，运行期只读，可以构建不可变 Map：

```java
Map<String, String> config = Map.of(
        "env", "prod",
        "region", "cn"
);
```

或者在初始化阶段构建 HashMap，之后不再修改，并通过 final 字段安全发布。

### 场景 3：需要保持顺序的并发场景

如果既要并发又要排序或顺序，不能简单套 HashMap。可以根据场景选择：

- 排序：`ConcurrentSkipListMap`
- 插入顺序且写少读多：额外加锁保护 `LinkedHashMap`
- 缓存淘汰：优先用 Caffeine 这类成熟缓存库

## 易错点

- 不要把 HashMap 当成本地缓存直接并发写。
- JDK 1.8 改进了扩容迁移方式，但 HashMap 仍然线程不安全。
- `volatile Map` 只能保证引用可见，不能保证 Map 内部操作线程安全。
- `containsKey + put` 在并发下不是原子操作。
- 使用 synchronizedMap 时，遍历仍要手动加锁。

## 总结

多线程下 HashMap 的核心风险是并发结构性修改：数据可能丢失，size 可能错误，扩容可能导致结构不一致。面试回答时建议先说明“不安全的原因”，再讲 JDK 1.7/1.8 resize 差异，最后给出工程替代方案：高并发用 ConcurrentHashMap，读多写少可考虑不可变 Map 或受控加锁。
