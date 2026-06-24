# CopyOnWriteArrayList底层实现原理是怎么样的？

CopyOnWriteArrayList底层实现原理是怎么样的？
CopyOnWriteArrayList写时复制列表，基本原理：
1. 底层使用的是通过volatile进行修饰的数组，保证当前线程对数组对象的修改，其他线程能及时感知；
2. 当操作数据写入时：
2.1 先申请一个ReentranceLock，确保同一时间只有一个线程操作；
2.2 获取当前数组长度length；
2.3 拷贝一个length+1的新数组；
2.4 将需要写入的元素放到新数组length下标中；
2.5 将原本指向旧数组的数据对象指针指向新数组；
2.6 释放ReentranceLock；
至此，写时复制列表的写入过程结束。
注意：CopyOnWriteArrayList读取数据时不需要加锁。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- `CopyOnWriteArrayList` 是 `java.util.concurrent` 包下的线程安全 List，核心思想是 **写时复制（Copy-On-Write）**：读操作直接读当前不可变快照，写操作先复制底层数组，在新数组上修改，再用 `volatile` 数组引用发布。
- 底层字段是 `private transient volatile Object[] array`；`volatile` 保证新数组引用对其他线程可见，但数组内部元素本身并不会因为放入集合就自动线程安全。
- 写操作通过锁串行化。JDK 8 典型实现使用 `ReentrantLock`，新版本源码中锁实现细节可能变化，但语义都是同一时刻只允许一个写线程修改并发布新快照。
- 迭代器是快照迭代器：创建迭代器时拿到当时的数组快照，遍历期间其他线程写入不会抛 `ConcurrentModificationException`，也看不到新写入的数据。

### 面试官想考什么
- 是否能说清“读不加锁、写复制数组并加锁、volatile 发布”的完整链路。
- 是否知道它适合读多写少，不适合频繁写、大列表、强实时一致性读取的场景。
- 是否能区分 `CopyOnWriteArrayList`、`ArrayList + synchronized`、`Collections.synchronizedList` 和 `ConcurrentHashMap` 等并发容器的选择边界。

### 标准回答
`CopyOnWriteArrayList` 的底层是一个 `volatile Object[]`。读操作不加锁，直接读取数组快照，因此读性能稳定且不会被写阻塞；写操作会获取锁，复制一份新数组，在新数组中完成新增、删除或替换，然后把数组引用切换到新数组。因为数组引用是 `volatile`，所以切换后的新快照能被后续读线程看到。它牺牲写入性能和内存占用，换取高并发读场景下的无锁读取和迭代安全，典型应用是配置列表、监听器列表、黑白名单等读远多于写的数据。

### 深挖追问
- 为什么读操作不需要加锁？因为读到的是某个已发布的数组快照，写线程不会原地修改旧数组。
- 迭代时能否看到最新数据？不能保证，迭代器只遍历创建时的快照。
- 为什么写入开销大？每次结构性修改都要复制数组，时间复杂度 O(n)，还会产生额外内存和 GC 压力。
- `addIfAbsent` 是否绝对无重复？单次调用在线程安全语义下会在锁内再次检查，能避免并发重复插入，但元素相等性仍依赖 `equals`。

### 实战场景/代码示例
```java
// 监听器列表：注册/注销少，事件通知读多
class EventBus {
    private final CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();

    void register(Listener listener) {
        listeners.addIfAbsent(listener);
    }

    void publish(Event event) {
        for (Listener listener : listeners) { // 快照遍历，不怕遍历中注册/注销
            listener.onEvent(event);
        }
    }
}
```

### 易错点/总结
- 不要把它当成“并发版 ArrayList”无脑使用；写频繁时性能可能非常差。
- 它保证集合结构线程安全，不保证元素对象内部状态线程安全。
- 读到旧快照是正常语义，不适合要求每次读取都必须看到最新写入的强一致场景。
- 原文中的 `ReentranceLock` 应为 `ReentrantLock`；面试表达时重点讲清写时复制机制，不要套用 ArrayList 扩容模板。
