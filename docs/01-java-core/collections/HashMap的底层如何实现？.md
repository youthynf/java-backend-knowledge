# HashMap 的底层如何实现？

## 核心概念

HashMap 是 Java 中最常用的哈希表实现，它用 **数组 + 链表 + 红黑树** 存储键值对，目标是在大多数情况下提供接近 O(1) 的 put/get 性能。

理解 HashMap 底层，核心抓四件事：

1. **哈希定位**：通过 key 的 hash 值定位数组下标。
2. **冲突处理**：不同 key 可能落到同一个桶，先用链表存储。
3. **树化优化**：链表过长时转红黑树，降低极端冲突下的查询成本。
4. **扩容迁移**：元素数量超过阈值后扩容，减少冲突概率。

JDK 1.8 之后 HashMap 的桶结构大致如下：

```text
Node<K,V>[] table
  ├── null
  ├── Node -> Node -> Node
  ├── TreeNode(红黑树)
  └── Node
```

## 面试官想考什么

面试官通常不是只想听“数组加链表加红黑树”，而是想确认你是否理解 HashMap 为什么快、什么时候会变慢、以及扩容和并发场景下有什么坑。

常见考点：

- `hash()` 为什么还要做高低位扰动？
- table 长度为什么通常是 2 的幂？
- put 时如何定位桶位？
- 链表什么时候转红黑树？
- 扩容时元素为什么可以只留在原位置或移动到 `oldCap + index`？
- HashMap 为什么线程不安全？

## 标准回答

HashMap 底层维护一个 `Node<K,V>[] table` 数组，每个数组位置叫一个桶。插入元素时，会先根据 key 计算 hash，然后通过 `(n - 1) & hash` 定位桶下标。

如果桶为空，直接放入新节点；如果桶不为空，就说明发生了哈希冲突。HashMap 会先比较 hash 和 key：如果找到相同 key，就覆盖旧值；如果没有相同 key，就把新节点追加到链表或插入红黑树。

当同一个桶中的链表长度达到树化阈值时，HashMap 会尝试把链表转成红黑树。JDK 1.8 中树化条件不是只看链表长度，还要求数组容量达到一定值：

- 链表长度达到 `TREEIFY_THRESHOLD = 8`
- table 容量至少达到 `MIN_TREEIFY_CAPACITY = 64`

如果容量还小，HashMap 更倾向于先扩容，因为冲突多可能只是数组太小导致的。

HashMap 通过 `size > threshold` 触发扩容，其中：

```text
threshold = capacity * loadFactor
```

默认负载因子是 `0.75`，这是空间利用率和查询性能之间的折中。扩容时容量通常翻倍，元素会被重新分布到新数组中。

## 深挖追问

### 1. 为什么 table 长度要是 2 的幂？

因为 HashMap 用位运算计算下标：

```java
index = (table.length - 1) & hash;
```

当 `table.length` 是 2 的幂时，`table.length - 1` 的二进制低位全是 1，可以让 hash 的低位充分参与寻址，效果等价于取模，但性能比 `%` 更好。

例如容量为 16：

```text
16 - 1 = 15 = 0000 1111
index = hash & 0000 1111
```

### 2. 为什么 hash 要做高低位扰动？

JDK 1.8 的 hash 计算会把高 16 位和低 16 位异或：

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

因为数组下标主要依赖 hash 的低位。如果某些 key 的 hashCode 高位差异明显、低位差异不明显，不扰动就容易集中到同一个桶。高低位异或可以让高位信息参与低位寻址，减少冲突。

### 3. 链表转红黑树后一定更快吗？

不一定。红黑树节点更大，维护旋转、变色也有成本。只有当桶内元素较多时，红黑树的 O(log n) 查询优势才明显。所以 HashMap 设置了树化阈值，而不是一冲突就树化。

### 4. 扩容时为什么不用重新完整取模？

JDK 1.8 扩容容量翻倍后，一个节点的新位置只取决于 hash 中新增参与计算的那一位：

```text
(hash & oldCap) == 0 -> 留在原下标
(hash & oldCap) != 0 -> 移动到 原下标 + oldCap
```

这让扩容迁移更高效，也减少了重新计算的成本。

## 实战场景

### 场景 1：自定义对象作为 key

如果用自定义对象作为 HashMap 的 key，必须正确重写 `equals()` 和 `hashCode()`。

```java
class UserKey {
    private final Long userId;

    UserKey(Long userId) {
        this.userId = userId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UserKey)) return false;
        UserKey other = (UserKey) o;
        return java.util.Objects.equals(userId, other.userId);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(userId);
    }
}
```

如果只重写 `equals()` 不重写 `hashCode()`，逻辑上相等的 key 可能落到不同桶，导致 get 取不到数据。

### 场景 2：预估容量减少扩容

如果要一次放入大量元素，可以提前设置容量，减少扩容成本。

```java
int expectedSize = 10_000;
int capacity = (int) (expectedSize / 0.75f) + 1;
Map<String, Object> map = new HashMap<>(capacity);
```

这在批量导入、缓存预热、构建索引时很有用。

## 易错点

- HashMap 不是有序集合，遍历顺序不能依赖。
- HashMap 允许一个 `null` key，且 null key 通常放在 0 号桶。
- 链表长度达到 8 不一定马上树化，容量小于 64 时优先扩容。
- 红黑树退化回链表也有阈值，通常桶内元素减少到较少时会退化。
- HashMap 线程不安全，并发写入可能导致数据覆盖、丢失或结构异常。

## 总结

一句话概括：HashMap 用数组做快速寻址，用链表处理普通冲突，用红黑树优化极端冲突，用扩容控制整体冲突概率。面试回答时不要只背结构，要把 hash 定位、冲突处理、树化条件、扩容迁移和线程安全一起讲清楚。
