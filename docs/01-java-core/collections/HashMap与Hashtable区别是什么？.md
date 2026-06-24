# HashMap 与 Hashtable 区别是什么？

## 核心概念

`HashMap` 和 `Hashtable` 都是基于哈希表的 key-value 容器，但它们属于不同历史阶段的设计：

- `Hashtable` 是 JDK 1.0 的早期集合类，方法级别使用 `synchronized`，线程安全但性能差。
- `HashMap` 是 JDK 1.2 集合框架的一部分，默认不保证线程安全，性能更好，使用更广。

实际开发中，单线程或外部已保证同步时优先用 `HashMap`；并发场景优先用 `ConcurrentHashMap`，而不是 Hashtable。

## 主要区别

### 1. 线程安全性不同

`Hashtable` 的大多数公开方法都使用 `synchronized` 修饰，单个方法调用是线程安全的。

`HashMap` 不加锁，不保证线程安全。多线程同时写入可能出现数据丢失、覆盖、结构异常等问题。

注意：Hashtable 的线程安全也只是方法级别的，复合操作仍然可能需要额外同步。例如“先判断不存在再 put”不是天然原子的业务动作。

### 2. 性能不同

Hashtable 因为方法级加锁，所有线程竞争同一把对象锁，并发性能较差。

HashMap 没有锁开销，单线程读写性能通常更好。

并发场景下，`ConcurrentHashMap` 通过更细粒度的并发控制提升吞吐，通常比 Hashtable 更合适。

### 3. null 支持不同

- `HashMap`：允许一个 `null` key，允许多个 `null` value。
- `Hashtable`：不允许 `null` key，也不允许 `null` value，否则会抛出 `NullPointerException`。

### 4. 初始容量和扩容方式不同

- `HashMap` 默认初始容量是 **16**，负载因子默认是 `0.75`，容量始终保持为 2 的幂，扩容时通常翻倍。
- `Hashtable` 默认初始容量是 **11**，负载因子默认也是 `0.75`，扩容通常是 `oldCapacity * 2 + 1`。

HashMap 使用 2 的幂容量，是为了通过：

```java
(n - 1) & hash
```

快速定位桶下标，并优化扩容迁移。

### 5. 底层结构不同

JDK 8 之后：

- `HashMap`：数组 + 链表 + 红黑树。链表过长且数组容量足够时会树化，降低极端冲突下的查询成本。
- `Hashtable`：数组 + 链表，没有 HashMap 这套红黑树优化。

### 6. 迭代行为不同

HashMap 的迭代器是 fail-fast 的。如果迭代过程中发生结构性修改，可能抛出 `ConcurrentModificationException`。

Hashtable 的 Iterator 通常也是 fail-fast；它早期还提供 Enumeration 枚举方式，Enumeration 不是 fail-fast。面试里不要简单说“Hashtable 一定不会 fail-fast”，要区分 Iterator 和 Enumeration。

### 7. 继承体系不同

- `HashMap` 继承 `AbstractMap`，实现 `Map` 接口。
- `Hashtable` 继承 `Dictionary`，实现 `Map` 接口。

`Dictionary` 是早期遗留抽象类，现在基本不再使用。

## 面试官想考什么

1. 是否知道 Hashtable 是历史遗留类，不是现代并发首选。
2. 是否能说清楚 null、线程安全、扩容、底层结构差异。
3. 是否知道并发场景应该考虑 `ConcurrentHashMap`。
4. 是否能纠正常见错误，例如 HashMap 默认容量不是 12。

## 标准回答

可以这样答：

> HashMap 和 Hashtable 都是哈希表实现的 Map。HashMap 默认不线程安全，允许一个 null key 和多个 null value，默认容量 16，容量保持 2 的幂，JDK 8 后底层是数组、链表和红黑树。Hashtable 是早期遗留类，方法用 synchronized 修饰，单方法线程安全，但并发性能差，不允许 null key 和 null value，默认容量 11，扩容一般是 2 倍加 1。现在单线程用 HashMap，并发场景优先用 ConcurrentHashMap，基本不推荐再使用 Hashtable。

## 深挖追问

### 为什么不推荐 Hashtable？

因为它锁粒度太粗，所有操作竞争同一个对象锁，吞吐量差；而且它是历史遗留类，API 设计也比较旧。现代并发场景下，`ConcurrentHashMap` 的并发性能和工程适用性更好。

### Hashtable 线程安全，为什么还不能替代 ConcurrentHashMap？

Hashtable 的线程安全主要是单方法互斥，不能解决所有业务复合操作的一致性问题。同时它锁住整个对象，高并发下性能容易成为瓶颈。ConcurrentHashMap 在 JDK 8 中通过 CAS、volatile、桶级 synchronized 等方式减少锁竞争，更适合并发读写。

### HashMap 为什么允许 null？

HashMap 对 null key 做了特殊处理，null key 的 hash 视为 0，通常放在 table[0] 对应的桶中。Hashtable 的实现会直接调用 key 的 hash 相关方法，因此不支持 null。

## 实战场景

- **普通业务映射**：优先使用 `HashMap`。
- **需要保持插入顺序**：使用 `LinkedHashMap`。
- **需要排序**：使用 `TreeMap`。
- **高并发读写**：使用 `ConcurrentHashMap`。
- **兼容老代码**：遇到 Hashtable 通常是历史包袱，评估后可逐步替换。

## 易错点

- HashMap 默认初始容量是 16，不是 12。
- Hashtable 不等于高性能并发容器。
- Hashtable 的 Iterator 和 Enumeration 行为不同，不要笼统说它完全没有 fail-fast。
- `Collections.synchronizedMap(new HashMap<>())` 只是粗粒度同步，迭代时仍需要手动同步。
- ConcurrentHashMap 不允许 null key/value，这是为了避免并发场景下 null 带来的歧义。
