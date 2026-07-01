# HashMap 的底层如何实现

## 核心概念

HashMap 是 Java 中最常用的哈希表实现，底层用 **数组 + 链表 + 红黑树** 存储键值对，目标是在大多数场景下提供平均 `O(1)` 的 put/get 性能。

JDK 8 之后的结构可以概括为一句话：**数组做快速寻址，链表处理普通冲突，红黑树优化极端冲突，扩容控制整体冲突概率。** 理解 HashMap 底层，就是理解这四件事如何协作。

```text
Node<K,V>[] table
  ├── null                          (空桶)
  ├── Node → Node → Node            (链表)
  ├── TreeNode(红黑树根)             (树化后的桶)
  └── Node                          (单节点)
```

## 标准回答

一句话结论：**HashMap 底层是 `Node<K,V>[] table` 数组，每个桶可能是 null、单向链表或红黑树；put 时通过 `hash(key)` 扰动 + `(n-1) & hash` 定位桶，桶空直接放，桶不空查同 key 覆盖或追加新节点；链表长度 ≥ 8 且容量 ≥ 64 时树化为红黑树；size 超过 `capacity * 0.75` 时扩容翻倍。**

5 个关键设计：

1. **数据结构**：`Node[]` 数组，每桶 `Node`（链表）或 `TreeNode`（红黑树，继承自 Node）。
2. **hash 扰动**：`(h = key.hashCode()) ^ (h >>> 16)`，让高位参与低位计算。
3. **桶下标**：`(n - 1) & hash`，n 必须是 2 的幂。
4. **冲突处理**：链地址法（拉链法），链表过长时树化。
5. **扩容**：`size > threshold` 触发，容量翻倍，元素按 `hash & oldCap` 拆分到原位/高位。

## 实现原理

### Node 结构

```java
static class Node<K,V> implements Map.Entry<K,V> {
    final int hash;          // 缓存 hash，避免重复计算
    final K key;
    V value;
    Node<K,V> next;          // 链表下一个节点

    Node(int hash, K key, V value, Node<K,V> next) { ... }
}
```

TreeNode 继承自 Node，多了一些红黑树的指针（parent、left、right、prev、red）：

```java
static final class TreeNode<K,V> extends LinkedHashMap.Entry<K,V> {
    TreeNode<K,V> parent;
    TreeNode<K,V> left;
    TreeNode<K,V> right;
    TreeNode<K,V> prev;       // 删除时用
    boolean red;
    // ...
}
```

### 关键常量

```java
static final int DEFAULT_INITIAL_CAPACITY = 1 << 4;       // 16，默认初始容量
static final int MAXIMUM_CAPACITY = 1 << 30;              // 2^30，最大容量
static final float DEFAULT_LOAD_FACTOR = 0.75f;           // 默认负载因子
static final int TREEIFY_THRESHOLD = 8;                   // 链表树化阈值
static final int UNTREEIFY_THRESHOLD = 6;                 // 树退化回链表阈值
static final int MIN_TREEIFY_CAPACITY = 64;               // 树化要求的最小容量
```

### hash 扰动

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

设计目的：数组下标 `i = (n - 1) & hash` 只用 hash 的低位，如果 key 的 hashCode 高位差异大、低位相同，不扰动会全部集中到一个桶。把高 16 位异或到低 16 位，让高位信息参与低位寻址，减少冲突。

### 桶定位

```java
i = (n - 1) & hash;
```

n 是 2 的幂时，`(n-1) & hash` 等价于 `hash % n`，但位运算比取模快。

### 树化条件

```java
final void treeifyBin(Node<K,V>[] tab, int hash) {
    int n, index; Node<K,V> e;
    if (tab == null || (n = tab.length) < MIN_TREEIFY_CAPACITY) {
        resize();              // 容量 < 64，先扩容
    } else {
        // 容量 ≥ 64，链表转红黑树
    }
}
```

链表长度 ≥ 8 但容量 < 64 时扩容，不树化。因为小容量下冲突主要来自数组太小，扩容能把链表拆开，比树化更划算。

### 扩容机制

```text
threshold = capacity * loadFactor
扩容条件：++size > threshold
扩容方式：newCapacity = oldCapacity << 1（翻倍）
迁移：hash & oldCap == 0 留原位，非 0 移到 原位 + oldCap
```

### JDK 7 vs JDK 8 对比

| 维度 | JDK 7 | JDK 8 |
|------|-------|-------|
| 数据结构 | 数组 + 链表 | 数组 + 链表 + 红黑树 |
| 插入方式 | 头插法 | 尾插法 |
| 扩容迁移 | 重新计算 hash 取模 | `hash & oldCap` 一位判断 |
| 并发问题 | 头插法扩容可能链表成环，CPU 100% | 改尾插后不成环，但仍非线程安全 |
| hash 扰动 | 9 次扰动（位与、位或、移位） | 1 次异或 + 1 次移位 |

## 代码示例

### 自定义对象作为 key

```java
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public final class UserKey {
    private final Long userId;
    private final String tenantId;

    public UserKey(Long userId, String tenantId) {
        this.userId = userId;
        this.tenantId = tenantId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UserKey)) return false;
        UserKey other = (UserKey) o;
        return Objects.equals(userId, other.userId)
            && Objects.equals(tenantId, other.tenantId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, tenantId);
    }
}

class Demo {
    public static void main(String[] args) {
        Map<UserKey, String> cache = new HashMap<>();
        cache.put(new UserKey(1L, "A"), "Tom");

        // 取出来必须是 Tom，不能是 null
        System.out.println(cache.get(new UserKey(1L, "A")));
    }
}
```

### 预估容量减少扩容

```java
int expectedSize = 10_000;
int capacity = (int) (expectedSize / 0.75f) + 1;
Map<String, Object> map = new HashMap<>(capacity);
```

### Java record 自动生成 equals/hashCode

```java
public record UserId(Long id, String tenant) {}

Map<UserId, String> map = new HashMap<>();
map.put(new UserId(1L, "A"), "Tom");
map.get(new UserId(1L, "A"));   // Tom
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 单线程缓存 | `HashMap` | 默认 16/0.75，预估容量时初始化 |
| 自定义 key | 重写 `equals` + `hashCode` 或用 `record` | 必须 equals 相等则 hashCode 相等 |
| 批量导入数据 | `new HashMap<>(expected / 0.75f + 1)` | 避免反复扩容 |
| 并发读写 | `ConcurrentHashMap` | 不允许 null key/value |
| 保留插入顺序 | `LinkedHashMap` | 单线程，accessOrder 可做 LRU |
| 按 key 排序 | `TreeMap` | `O(log n)`，不适合热点数据 |
| 配置初始化后只读 | `Map.copyOf`（JDK 10+） | 不可变，安全发布 |

## 深挖追问

### 链表转红黑树后一定更快吗？

不一定。红黑树节点比 Node 大（多 4 个指针 + 1 个 boolean），维护旋转、变色也有成本。桶内元素少时链表查询并不慢，所以 HashMap 设了 8 的树化阈值——只有极端冲突才树化。退化阈值 6 而不是 8 是为了避免链表和树之间频繁切换。

### 为什么链表树化阈值是 8？

源码注释基于泊松分布：在负载因子 0.75 下，一个桶有 k 个节点的概率服从 λ=0.5 的泊松分布。桶有 8 个节点的概率约为 `0.00000006`，几乎不会发生。选 8 是"几乎不会触发"的极端兜底，正常情况下不会出现树。

### 扩容时为什么不用重新计算 hash？

HashMap 的 hash 在 put 时已存在 `Node.hash` 字段。扩容时容量翻倍，`(n-1)` 多了一位 1，元素新位置只取决于 hash 在新增位的值，用 `hash & oldCap` 即可判断，无需重新计算。

### HashMap 允许 null key 吗？

允许一个 null key。`hash(null) = 0`，固定放在 `table[0]` 桶。value 也允许 null。ConcurrentHashMap 不允许 null，因为 get 返回 null 时无法区分"key 不存在"和"value 是 null"。

### HashMap 线程安全吗？

不安全。并发 put 会出现数据覆盖、size 错乱、扩容结构异常。JDK 7 头插法扩容可能链表成环导致 CPU 100%，JDK 8 改尾插后不成环但仍非线程安全。并发场景必须用 `ConcurrentHashMap`。

### 为什么不在 put 时直接 synchronized？

因为单线程场景下加锁有性能开销。HashMap 设计目标是单线程最高性能，并发场景交给 `ConcurrentHashMap` 处理。两者定位不同，不要混用。

## 易错点

- HashMap 默认容量是 16，不是 12（12 是 `16 * 0.75` 的扩容阈值）。
- 链表长度到 8 不一定树化，容量 < 64 时优先扩容。
- 红黑树退化阈值是 6，不是 8。
- HashMap 不是有序的，遍历顺序不要依赖。
- `hashCode` 相等不等于 key 相等，HashMap 在桶内还要调 `equals`。
- JDK 8 改尾插后仍非线程安全，不要认为"尾插解决了并发问题"。

## 总结

HashMap 底层用数组 + 链表 + 红黑树：数组做快速寻址，链表处理普通冲突，红黑树优化极端冲突，扩容控制冲突概率。JDK 8 相比 JDK 7 三大改进：链表过长时树化、扩容迁移改尾插且用一位判断新位置、hash 扰动简化为一次异或。面试时要把 hash 扰动、2 的幂容量、树化条件、扩容迁移、线程安全这几个点串起来讲，不能只背"数组+链表+红黑树"。

## 参考资料

- [OpenJDK HashMap 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/HashMap.java)
- [HashMap 源码解析 - 美团技术团队](https://tech.meituan.com/2016/06/24/java-hashmap.html)
- [Java Platform SE 8 - HashMap](https://docs.oracle.com/javase/8/docs/api/java/util/HashMap.html)
