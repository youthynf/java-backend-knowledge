# ArrayList 线程安全吗

## 核心概念

`ArrayList` 不是线程安全的。它的 `add` / `remove` 操作不是原子操作，且 `size` 字段没有可见性保护。多个线程并发写 ArrayList，会出现三种典型故障：**部分值为 null、数组越界、size 与实际元素数不符**。

注意"线程不安全"不等于"完全不能用"。如果 ArrayList 在构造完成后只读，多线程读取是安全的；只要有一个线程做结构性修改，就必须改用并发容器或加锁。

## 标准回答

一句话结论：**ArrayList 不是线程安全的，并发写会出现 null 元素、ArrayIndexOutOfBoundsException、size 错乱等问题；并发场景应使用 `CopyOnWriteArrayList`、`Collections.synchronizedList` 或 `Vector`。**

并发不安全的三种典型表现：

1. **部分槽位为 null**：两个线程同时拿到同一个 `size`，各自把元素写到同一位置，先后执行 `size++`，结果一个槽位被覆盖，另一个槽位空着但 size 已经 +2。
2. **数组越界**：两个线程同时拿到 `size == elementData.length - 1`，线程 A 写入并 `size++`，线程 B 再写时 `size` 已等于 length，抛 `ArrayIndexOutOfBoundsException`。
3. **size 与实际数量不符**：`size++` 不是原子操作（读 size → 加 1 → 写回），两个线程同时读到同一个 size，算出的新值相同，互相覆盖，size 比实际少 1。

## 实现原理

### add 方法的非原子性

```java
public boolean add(E e) {
    ensureCapacityInternal(size + 1);   // 步骤 1：判断容量，可能扩容
    elementData[size++] = e;            // 步骤 2：写入元素并 size++
    return true;
}
```

`size++` 实际是三步：读 `size` → 加 1 → 写回。两个线程并发执行时，如果都读到 `size = 5`，分别写回 6，最终 `size = 6` 而不是 7，一个元素被吞掉。

`elementData[size++] = e` 也不是原子的：先取 `size` 作为下标，再写元素，最后 `size++`。如果 A 线程取到下标 5 后被挂起，B 线程同样取到 5 并写入完成，A 恢复后也写入下标 5，B 写入的值被覆盖。

### 三种线程安全替代方案

```java
// 方案 1：CopyOnWriteArrayList（读多写少）
List<String> list1 = new CopyOnWriteArrayList<>();

// 方案 2：synchronizedList 包装（粗粒度锁）
List<String> list2 = Collections.synchronizedList(new ArrayList<>());

// 方案 3：Vector（历史遗留，方法级 synchronized）
List<String> list3 = new Vector<>();
```

三者的关键差异：

| 方案 | 锁粒度 | 读是否加锁 | 写时复制 | 迭代器 |
|------|--------|-----------|---------|--------|
| `CopyOnWriteArrayList` | 写时整数组 | 否 | 是 | 快照，不抛 CME |
| `synchronizedList` | 整个 list | 是 | 否 | fail-fast，遍历需手动加锁 |
| `Vector` | 整个对象 | 是 | 否 | fail-fast，遍历需手动加锁 |

## 代码示例

### 复现并发不安全

```java
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ArrayListConcurrencyDemo {
    public static void main(String[] args) throws InterruptedException {
        final List<Integer> list = new ArrayList<>();
        int threads = 10, perThread = 1000;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(threads);

        for (int t = 0; t < threads; t++) {
            pool.submit(() -> {
                for (int i = 0; i < perThread; i++) {
                    list.add(i);
                }
                latch.countDown();
            });
        }
        latch.await();
        pool.shutdown();

        System.out.println("期望 size = " + (threads * perThread));
        System.out.println("实际 size = " + list.size());
        // 多跑几次，size 通常小于 10000，偶尔抛 ArrayIndexOutOfBoundsException
    }
}
```

### 安全替代方案

```java
// 读多写少：CopyOnWriteArrayList
List<String> listeners = new CopyOnWriteArrayList<>();

// 写多读多：synchronizedList，遍历时仍要手动加锁
List<String> syncList = Collections.synchronizedList(new ArrayList<>());
synchronized (syncList) {                // 遍历必须手动加锁
    for (String s : syncList) {
        System.out.println(s);
    }
}
```

## 实战场景

| 场景 | 推荐方案 | 注意点 |
|------|---------|--------|
| 监听器 / 事件订阅列表 | `CopyOnWriteArrayList` | 注册少、通知频繁，写复制开销可接受 |
| 高并发读写缓存 | 不用 List，改用 `ConcurrentHashMap` | List 的同步包装在 Map 场景更弱 |
| 静态配置初始化后只读 | 普通 `ArrayList` + `final` 引用 | 安全发布即可，无需并发容器 |
| 历史代码维护已有 Vector | 评估替换为 `CopyOnWriteArrayList` | Vector 性能差且 API 老，但不强求改 |
| 遍历中需要修改 | 单线程用 `Iterator.remove()`，多线程用 `ConcurrentLinkedQueue` | 不要在 for-each 中直接 `list.remove()` |

## 深挖追问

### CopyOnWriteArrayList 和 Vector 的核心区别？

- **Vector**：每个方法整对象 `synchronized`，读也加锁，并发读性能差；写不复制，原地修改。
- **CopyOnWriteArrayList**：读完全无锁；写时复制整个数组，写完后用 `volatile` 引用替换。读多写少时性能远超 Vector，但写多时复制成本高。

### synchronizedList 复合操作还安全吗？

不安全。`if (!list.contains(x)) list.add(x)` 是两步操作，中间能被其他线程插入。要保证原子性必须手动加锁或使用 `CopyOnWriteArrayList` 等并发容器。

### Vector 为什么被淘汰？

- 所有方法 `synchronized`，锁住整个对象，并发性能差。
- 迭代器遍历期间其他线程修改仍抛 `ConcurrentModificationException`。
- 扩容 2 倍，内存浪费比 ArrayList（1.5 倍）大。
- JDK 集合框架推荐用 `Collections.synchronizedList` 或并发容器替代。

### ArrayList 的 size 字段是 volatile 吗？

不是。`size` 是普通 `int`，没有可见性保证。多线程下还会出现"一个线程 add 完，另一个线程读 size 仍是旧值"的问题，进一步加剧不安全。

## 易错点

- "线程不安全"不是说一定崩，单线程或初始化后只读是安全的，不要一刀切认为 ArrayList 必须换。
- `Collections.synchronizedList` 返回的 List 迭代时必须手动加锁，否则仍会抛 `ConcurrentModificationException`。
- `CopyOnWriteArrayList` 的迭代器是快照，看不到创建后的新写入。
- 不要在增强 for 中调 `list.remove()`，会抛 CME；要用 `Iterator.remove()`。
- Vector 不是"高并发容器"，只是"线程安全的旧容器"，吞吐量仍然差。

## 总结

ArrayList 非线程安全的根因是 `add` 非原子 + `size` 无可见性。三种替代方案各有定位：读多写少用 `CopyOnWriteArrayList`，写多读多用 `synchronizedList` 或换 `ConcurrentHashMap`，历史代码维护 Vector 可保留但不再推荐新写。

## 参考资料

- [OpenJDK ArrayList 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/ArrayList.java)
- [Java Concurrency in Practice - CopyOnWriteArrayList](https://jcip.net/)
