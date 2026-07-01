# HashMap 与 Hashtable 区别是什么

## 核心概念

`HashMap` 和 `Hashtable` 都是哈希表实现的 key-value 容器，但属于两个时代：Hashtable 是 JDK 1.0 的历史遗留类，方法是 `synchronized` 的；HashMap 是 JDK 1.2 集合框架的一部分，不加锁。

现代开发中，单线程用 HashMap，并发用 `ConcurrentHashMap`，**Hashtable 基本不再使用**。它之所以还存在于 JDK，主要是为了兼容老代码。

## 标准回答

一句话结论：**HashMap 非线程安全、允许 null key/value、默认容量 16 且为 2 的幂、底层是数组+链表+红黑树；Hashtable 线程安全（方法级 synchronized）、不允许 null、默认容量 11、底层是数组+链表、扩容为 `2n+1`。**

7 个核心差异：

| 维度 | HashMap | Hashtable |
|------|---------|-----------|
| 出现版本 | JDK 1.2 | JDK 1.0 |
| 线程安全 | 否 | 是，方法级 synchronized |
| null key/value | 允许 1 个 null key，多个 null value | 都不允许，抛 NPE |
| 默认初始容量 | 16（保持 2 的幂） | 11 |
| 负载因子 | 0.75 | 0.75 |
| 扩容方式 | `2 * oldCapacity` | `2 * oldCapacity + 1` |
| 底层结构（JDK 8） | 数组 + 链表 + 红黑树 | 数组 + 链表 |
| 继承体系 | 继承 `AbstractMap` | 继承 `Dictionary` |

## 实现原理

### 继承体系差异

```text
HashMap  → AbstractMap → Object
Hashtable → Dictionary  → Object
```

`Dictionary` 是 JDK 1.0 的抽象类，现已废弃，官方建议用 Map 接口替代。Hashtable 同时实现了 Map 接口（JDK 1.2 之后才加上），所以两者都能当 Map 用。

### null 处理差异

```java
// HashMap.hash()
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
    // null key → hash=0，放入 table[0]
}
```

```java
// Hashtable.put()
public synchronized V put(K key, V value) {
    if (value == null) {
        throw new NullPointerException();    // value 不能为 null
    }
    int hash = key.hashCode();               // key 为 null 直接 NPE
    // ...
}
```

Hashtable 直接调 `key.hashCode()`，所以 null key 抛 NPE；HashMap 对 null key 做了特判，hash 视为 0。

### 扩容公式差异

```java
// HashMap：扩为 2 倍
int newCapacity = oldCapacity << 1;

// Hashtable：扩为 2n+1
int newCapacity = (oldCapacity << 1) + 1;
```

Hashtable 之所以用 `2n+1` 是为了让容量保持奇数，理论上有助于哈希分布（实际上由于 HashMap 的扰动算法更优，奇数策略并不重要）。

### 锁粒度差异

- **Hashtable**：每个方法都用 `synchronized` 修饰，锁住整个 this 对象。读、写、size、contains 等所有操作竞争同一把锁。
- **ConcurrentHashMap (JDK 8)**：仅锁住桶头节点，读完全无锁，写时 CAS + 桶级 synchronized，并发度大幅提升。

所以即使需要线程安全，也应该选 `ConcurrentHashMap` 而不是 Hashtable。

### 迭代器差异

- **HashMap.iterator**：fail-fast，迭代期间结构性修改抛 `ConcurrentModificationException`（基于 `modCount`）。
- **Hashtable.iterator**：也是 fail-fast。
- **Hashtable.Enumeration**：**不是 fail-fast**，这是 Hashtable 独有的旧式遍历方式。

所以"Hashtable 不会 fail-fast"这种说法不准确，要看是 Iterator 还是 Enumeration。

## 代码示例

### HashMap 允许 null

```java
Map<String, String> map = new HashMap<>();
map.put(null, "null-key-value");
map.put("k1", null);
map.put("k2", null);   // 多个 null value 都允许
```

### Hashtable 不允许 null

```java
Map<String, String> table = new Hashtable<>();
table.put("k1", null);    // 抛 NullPointerException
table.put(null, "v");     // 抛 NullPointerException
```

### ConcurrentHashMap 也不允许 null

```java
Map<String, String> chm = new ConcurrentHashMap<>();
chm.put("k1", null);      // 抛 NullPointerException
// 原因：并发下 get(k) 返回 null 无法区分"key 不存在"还是"value 是 null"
```

## 实战场景

| 场景 | 选型 | 注意点 |
|------|------|--------|
| 单线程缓存 | `HashMap` | 默认容量 16，预估元素多则初始化容量 |
| 多线程读写缓存 | `ConcurrentHashMap` | 不允许 null，复合操作用 `computeIfAbsent` |
| 保留插入顺序 | `LinkedHashMap` | 单线程用，并发场景需加锁 |
| 按 key 排序 | `TreeMap` | `O(log n)`，不适合热点数据 |
| 维护老代码遇到 Hashtable | 评估替换为 `ConcurrentHashMap` | 不要直接 new Hashtable |
| 配置初始化后只读 | `Map.copyOf` / `ImmutableMap` | 不可变 Map，安全发布 |

## 深挖追问

### Hashtable 线程安全，为什么还不推荐？

锁粒度太粗——所有方法竞争同一把对象锁，并发场景吞吐量低。JDK 8 之后 `ConcurrentHashMap` 通过 CAS + 桶级 synchronized，并发度高出几个数量级。此外 Hashtable 是历史遗留类，API 设计陈旧（继承 Dictionary 而非 AbstractMap），缺少现代 Map 的扩展方法。

### HashMap 为什么允许 null，ConcurrentHashMap 不允许？

HashMap 单线程使用，`get(k)` 返回 null 时可以通过 `containsKey(k)` 区分"key 不存在"和"value 是 null"，因为没有并发干扰。但 ConcurrentHashMap 并发场景下，`get(k)` 返回 null 时，再调 `containsKey(k)` 可能在两次调用之间 key 被其他线程修改，无法保证一致性。所以直接禁用 null 避免歧义。

### Hashtable 默认容量为什么是 11？

历史原因。JDK 1.0 设计时选了质数 11 作为初始容量，理论上质数容量配合取模哈希能让分布更均匀。但 JDK 1.2 之后 HashMap 改用 2 的幂 + 扰动函数，分布效果更好且能用位运算代替取模，所以 HashMap 不再需要质数容量。

### fail-fast 一定抛异常吗？

不一定。fail-fast 是"尽力检测"机制，基于 `modCount` 比较。`next()` 调用时检查 `modCount != expectedModCount` 才抛 CME，如果修改后没有再调 `next()`，可能不会抛。所以 fail-fast 不能作为并发正确性保证，只能用于 bug 检测。

### HashMap 和 Hashtable 的 rehash 有什么不同？

- **HashMap**：扩容后容量翻倍，元素位置只看 `hash & oldCap`，要么留在原下标，要么移到 `原下标 + oldCap`，不需要重新计算 hash。
- **Hashtable**：扩容后容量变为 `2n+1`，必须重新计算每个元素的 `hash % newCapacity`，成本更高。

## 易错点

- HashMap 默认初始容量是 16 不是 12（12 是 `16 * 0.75` 的扩容阈值，不是容量）。
- "Hashtable 不会 fail-fast"不准确，Iterator 仍 fail-fast，只有 Enumeration 不是。
- `Collections.synchronizedMap(new HashMap<>())` 是粗粒度同步，并发性能差，迭代时仍需手动加锁。
- ConcurrentHashMap 不允许 null key 和 null value，从 HashMap 迁移时要先过滤 null。
- 不要以为"加了 synchronized 就一定线程安全"——复合操作（如 `containsKey + put`）仍然不原子。

## 总结

一句话：HashMap 是现代默认 Map，单线程用；并发场景用 ConcurrentHashMap，不要再选 Hashtable。Hashtable 唯一的存在价值是兼容历史代码，新代码不要写它。和 HashMap 比，Hashtable 锁粗、不允 null、扩容公式旧、无红黑树优化，全面落后。

## 参考资料

- [OpenJDK HashMap 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/HashMap.java)
- [OpenJDK Hashtable 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/Hashtable.java)
- [Java Platform SE 8 - Hashtable](https://docs.oracle.com/javase/8/docs/api/java/util/Hashtable.html)
