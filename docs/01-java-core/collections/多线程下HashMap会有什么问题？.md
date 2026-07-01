# 多线程下 HashMap 会有什么问题

## 核心概念

HashMap 不是线程安全的。多线程并发执行结构性修改（put、remove、resize）时，会出现数据覆盖、size 错乱、扩容结构异常，JDK 7 还会因头插法扩容导致**链表成环、CPU 100%**。

注意"线程不安全"不等于"完全不能用"：构造完成后只读，多线程读取没问题；只要有一个线程做结构性修改，就必须换并发容器或加锁。

## 标准回答

一句话结论：**HashMap 并发不安全，主要表现是数据覆盖丢失、size 错乱、扩容结构异常；JDK 7 头插法扩容还会导致链表成环使 CPU 100%，JDK 8 改尾插后不成环但仍非线程安全。并发场景必须用 `ConcurrentHashMap`，不要用 `HashMap + synchronized`，更不要用 Hashtable。**

5 类典型问题：

1. **数据覆盖**：两线程同时判断桶空，先后写入同一桶，前一个被覆盖。
2. **size 错乱**：`size++` 非原子，并发下互相覆盖。
3. **数组越界**：两线程同时拿到 `size == length - 1`，一者写入后 size++，另一者写入时越界。
4. **扩容结构异常**：多线程同时 resize 或一者扩容一者修改，桶链结构破坏。
5. **fail-fast 异常**：遍历期间其他线程结构性修改，抛 `ConcurrentModificationException`。

## 实现原理

### 问题 1：数据覆盖

```java
// HashMap.putVal 简化
if ((p = tab[i = (n - 1) & hash]) == null) {
    tab[i] = newNode(hash, key, value, null);   // 非原子：判断 + 赋值
}
```

并发场景：

```text
线程 A：判断 tab[5] == null，准备赋值
线程 B：判断 tab[5] == null，准备赋值
线程 A：tab[5] = nodeA
线程 B：tab[5] = nodeB   ← 覆盖了 nodeA
```

最终 nodeA 丢失。

### 问题 2：size 错乱

```java
++modCount;
if (++size > threshold) {     // ++size 非原子
    resize();
}
```

`++size` 是"读 size → 加 1 → 写回"三步，并发下两个线程都读到同一个 size，算出的新值相同，互相覆盖。

### 问题 3：JDK 7 链表成环（最严重）

JDK 7 扩容迁移用头插法：

```java
// JDK 7 transfer 简化
while (e != null) {
    next = e.next;
    int i = indexFor(e.hash, newCapacity);
    e.next = newTable[i];     // 头插：新节点指向原头
    newTable[i] = e;          // 新节点成为新头
    e = next;
}
```

并发下两个线程同时扩容，可能出现：

```text
原链表：A -> B -> null
线程 1 扩容中：处理到 A，记录 next = B
线程 2 扩容完成：B -> A -> null（头插后顺序倒置）
线程 1 恢复：执行 e.next = newTable[i]，但 newTable[i] 已是 B
结果：A.next = B, B.next = A → 成环
```

之后 `get` 遍历链表会进入死循环，CPU 100%。这是 JDK 7 HashMap 在并发下最经典的故障。

### 问题 4：JDK 8 改尾插后仍非线程安全

JDK 8 把扩容迁移改尾插，且用 `hash & oldCap` 拆分原位链/高位链，避免了头插法导致的链表成环。但 **put 本身仍然没有同步保护**，并发下仍会出现：

- 数据覆盖（同问题 1）
- size 错乱（同问题 2）
- 扩容期间 `table` 引用切换不一致，可能丢数据

### 问题 5：fail-fast

```java
final Node<K,V> nextNode() {
    // ...
    if (modCount != expectedModCount)
        throw new ConcurrentModificationException();
    // ...
}
```

一个线程迭代，另一个线程结构性修改（put/remove），`modCount` 变化，迭代器下次 `next()` 抛 CME。

## 代码示例

### 复现并发不安全

```java
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class HashMapConcurrencyBug {
    public static void main(String[] args) throws InterruptedException {
        Map<Integer, Integer> map = new HashMap<>();
        int threads = 10, perThread = 1000;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(threads);

        for (int t = 0; t < threads; t++) {
            pool.submit(() -> {
                for (int i = 0; i < perThread; i++) {
                    map.put(i, i);            // 并发 put
                }
                latch.countDown();
            });
        }
        latch.await();
        pool.shutdown();

        System.out.println("期望 size = " + (threads * perThread));
        System.out.println("实际 size = " + map.size());
        // 实际 size 通常 < 10000，偶发抛异常或卡死
    }
}
```

### 安全替代方案

```java
// 1. 高并发读写 → ConcurrentHashMap
Map<Long, User> cache = new ConcurrentHashMap<>();
cache.computeIfAbsent(userId, this::loadFromDb);   // 原子复合操作

// 2. 只读配置 → 不可变 Map
Map<String, String> config = Map.of("env", "prod", "region", "cn");

// 3. 已经只读但需要安全发布 → volatile / final
private final Map<String, String> readonly;
{
    Map<String, String> tmp = new HashMap<>();
    tmp.put("k", "v");
    readonly = Collections.unmodifiableMap(tmp);
}
```

### 不要这样写

```java
// 反例：HashMap + synchronized，性能差
Map<String, String> badCache = new HashMap<>();
synchronized (badCache) {                    // 锁住整个 map
    if (!badCache.containsKey(k)) {
        badCache.put(k, load(k));
    }
}

// 反例：Hashtable，方法级 synchronized，吞吐量差
Map<String, String> bad = new Hashtable<>();
```

## 实战场景

| 场景 | 推荐方案 | 注意点 |
|------|---------|--------|
| 本地缓存高并发读写 | `ConcurrentHashMap` | 用 `computeIfAbsent` 避免竞态 |
| 配置加载后只读 | `Map.copyOf` / `Collections.unmodifiableMap` | 安全发布（final 或 volatile） |
| 多线程统计计数 | `ConcurrentHashMap` + `merge` / `LongAdder` | 不要用 HashMap + synchronized |
| 需要保留顺序的并发 Map | `ConcurrentSkipListMap` | 跳表实现，`O(log n)` |
| LRU 缓存 | Caffeine / Guava Cache | 不要自己用 LinkedHashMap + 锁 |
| 任务队列 | `LinkedBlockingQueue` | 必须设容量 |

## 深挖追问

### HashMap 多线程只读安全吗？

如果 HashMap 构造完成后**不再有任何修改**，且通过 `final` 或 `volatile` 安全发布，多线程只读是安全的。但没有安全发布时，其他线程可能看到未完全初始化的状态（指令重排导致）。工程上稳妥做法是用不可变 Map（`Map.copyOf`）或直接用 `ConcurrentHashMap`。

### JDK 8 改尾插后 HashMap 线程安全了吗？

没有。尾插法只解决了"扩容时链表成环"这一个问题，**put 本身仍无同步保护**，并发下仍会出现数据覆盖、size 错乱、扩容期间数据丢失等问题。JDK 8 HashMap 仍非线程安全。

### ConcurrentHashMap 的 size 准确吗？

JDK 8 的 `size()` 是近似值。它由 `baseCount` + 所有 `CounterCell` 累加得到，并发下部分计数可能未及时合并。如果业务需要精确值，要在外部加锁。`mappingCount()` 也是同样语义，但返回 long，适合元素数超过 int 范围的场景。

### volatile Map 能解决并发问题吗？

不能。`volatile` 只保证引用的可见性，不保证 Map 内部操作的原子性。多线程调 `volatileMap.put(...)` 仍会出问题，因为 `put` 本身是非原子的复合操作。要用 `ConcurrentHashMap`。

### 为什么 ConcurrentHashMap 不允许 null？

并发场景下 `get(k)` 返回 null 时，无法区分"key 不存在"和"value 就是 null"。如果再用 `containsKey(k)` 二次确认，两次调用之间 key 可能被其他线程修改，无法保证一致性。所以直接禁用 null。

### synchronizedMap 和 ConcurrentHashMap 怎么选？

- `synchronizedMap`：粗粒度锁，所有操作竞争同一把锁，并发吞吐量差。但强一致，迭代时手动加锁可以拿到一致快照。
- `ConcurrentHashMap`：桶级锁，读无锁，并发吞吐量高。但弱一致，迭代时看到的是某时刻快照。

绝大多数并发场景选 ConcurrentHashMap；如果业务必须强一致快照且能接受性能损失，才考虑 synchronizedMap。

## 易错点

- JDK 8 改尾插只是"不成环"，不是"线程安全"，不要混淆。
- `volatile Map` 不能保证 Map 内部操作线程安全。
- `containsKey + put` 在并发下不是原子操作，即使 Map 是 ConcurrentHashMap 也不行（用 `computeIfAbsent`）。
- `synchronizedMap` 迭代时仍要手动加锁，否则抛 CME。
- 只读场景下 HashMap 也不一定安全，要看是否安全发布。

## 总结

HashMap 并发问题的根因是 put/resize 没有同步保护，加上 `size++` 非原子。JDK 7 头插法扩容会链表成环导致 CPU 100%，JDK 8 改尾插后不成环但仍非线程安全。工程替代方案：高并发用 ConcurrentHashMap，只读配置用不可变 Map，需要顺序用 ConcurrentSkipListMap。永远不要在多线程下用裸 HashMap。

## 参考资料

- [JDK 7 HashMap 并发死循环分析 - 美团技术团队](https://tech.meituan.com/2016/06/24/java-hashmap.html)
- [OpenJDK ConcurrentHashMap 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/concurrent/ConcurrentHashMap.java)
- [Java Concurrency in Practice - 5.2 ConcurrentHashMap](https://jcip.net/)
