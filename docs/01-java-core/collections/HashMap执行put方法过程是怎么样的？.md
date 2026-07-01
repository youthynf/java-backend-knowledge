# HashMap 执行 put 方法过程是怎么样的

## 核心概念

`HashMap.put(k, v)` 的本质是：**根据 key 的 hash 定位数组桶位 → 桶为空直接插入 → 桶不为空查同 key 覆盖或追加新节点 → size 超阈值则扩容**。

JDK 8 之后 HashMap 底层是 `Node<K,V>[] table` 数组，每个桶可能是 null、单向链表或红黑树。put 过程要处理这三种情况，是面试高频考点。

## 标准回答

一句话结论：**put 先做 hash 扰动得到 hash 值，通过 `(n-1) & hash` 定位桶下标；桶空直接放；桶不空先看头节点是否同 key（同则覆盖 value），再看是红黑树还是链表，红黑树走树插入，链表遍历找同 key 覆盖或尾插新节点；最后 `++size > threshold` 触发扩容。**

8 个步骤：

1. 计算 `hash = (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16)`。
2. table 未初始化则 `resize()` 初始化（懒初始化，默认 16）。
3. 桶下标 `i = (n - 1) & hash`。
4. `table[i] == null` → 直接 `newNode` 放入。
5. 桶不空，头节点 key 相同 → 记录节点准备覆盖。
6. 否则判断 TreeNode 走 `putTreeVal`，链表走遍历 + 尾插。
7. 链表长度 ≥ 8 触发 `treeifyBin`（容量 < 64 时优先扩容）。
8. 找到同 key 覆盖旧 value 返回；新增节点则 `++size > threshold` 时 `resize()`。

## 实现原理

### putVal 源码骨架

```java
final V putVal(int hash, K key, V value, boolean onlyIfAbsent, boolean evict) {
    Node<K,V>[] tab; Node<K,V> p; int n, i;
    // 1. table 未初始化或长度 0，先 resize
    if ((tab = table) == null || (n = tab.length) == 0) {
        n = (tab = resize()).length;
    }
    // 2. 桶为空，直接放入新节点
    if ((p = tab[i = (n - 1) & hash]) == null) {
        tab[i] = newNode(hash, key, value, null);
    } else {
        Node<K,V> e; K k;
        // 3. 头节点就是同 key
        if (p.hash == hash && ((k = p.key) == key || (key != null && key.equals(k)))) {
            e = p;
        }
        // 4. 红黑树
        else if (p instanceof TreeNode) {
            e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
        }
        // 5. 链表
        else {
            for (int binCount = 0; ; ++binCount) {
                if ((e = p.next) == null) {
                    p.next = newNode(hash, key, value, null);   // 尾插
                    if (binCount >= TREEIFY_THRESHOLD - 1) {    // 链表长度到 8
                        treeifyBin(tab, hash);                  // 尝试树化
                    }
                    break;
                }
                if (e.hash == hash && ((k = e.key) == key || (key != null && key.equals(k)))) {
                    break;   // 找到同 key，准备覆盖
                }
                p = e;
            }
        }
        // 6. 找到同 key，覆盖 value，返回旧 value
        if (e != null) {
            V oldValue = e.value;
            if (!onlyIfAbsent || oldValue == null) {
                e.value = value;
            }
            afterNodeAccess(e);    // LinkedHashMap 钩子
            return oldValue;
        }
    }
    ++modCount;
    // 7. 新增节点，size 超阈值则扩容
    if (++size > threshold) {
        resize();
    }
    afterNodeInsertion(evict);
    return null;
}
```

### hash 扰动的目的

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

数组下标 `i = (n - 1) & hash`，n 是 2 的幂，`(n-1)` 低位全是 1、高位全是 0，所以只有 hash 的低位参与下标计算。如果某些 key 的 hashCode 高位差异大、低位相同，不扰动会全部集中到一个桶。扰动让高 16 位也参与低位计算，分散冲突。

### 桶下标计算

```java
i = (n - 1) & hash;
```

只有 n 是 2 的幂时，`(n-1) & hash` 才等价于 `hash % n`，且位运算比取模快。这是 HashMap 容量必须为 2 的幂的根本原因。

### 树化条件（不是到 8 就树化）

```java
final void treeifyBin(Node<K,V>[] tab, int hash) {
    int n, index; Node<K,V> e;
    if (tab == null || (n = tab.length) < MIN_TREEIFY_CAPACITY) {
        resize();   // 容量 < 64，优先扩容，不树化
    } else {
        // 容量 ≥ 64，链表转红黑树
        // ...
    }
}
```

链表长度 ≥ 8 但容量 < 64 时，扩容比树化更划算——因为冲突可能是数组太小导致，扩容能把链表拆开。只有容量 ≥ 64 且链表 ≥ 8 才真正树化。

关键常量：

```java
static final int TREEIFY_THRESHOLD = 8;          // 链表树化阈值
static final int UNTREEIFY_THRESHOLD = 6;        // 红黑树退化回链表阈值
static final int MIN_TREEIFY_CAPACITY = 64;      // 树化要求的最小容量
```

### 扩容时的迁移优化

```java
// 扩容后判断节点新位置
if ((e.hash & oldCap) == 0) {
    // 留在原下标
} else {
    // 移到 原下标 + oldCap
}
```

容量翻倍后，`(n-1)` 多了一个高位 1。`hash & oldCap` 检查 hash 在新增的那一位是 0 还是 1：为 0 留原位，为 1 移到 `原位 + oldCap`。不需要重新计算 hash，迁移成本极低。

## 代码示例

### 观察 put 触发的不同分支

```java
import java.util.HashMap;
import java.util.Map;

public class HashMapPutDemo {
    public static void main(String[] args) {
        Map<String, Integer> map = new HashMap<>(4, 0.75f);

        // 1. 桶空 → 直接放入
        map.put("a", 1);

        // 2. 同 key → 覆盖 value，size 不变
        map.put("a", 100);
        System.out.println(map.get("a"));   // 100

        // 3. 不同 key 同 hash → 链表尾插
        // 自定义 key 故意制造冲突可以观察，这里略

        // 4. size > threshold（4 * 0.75 = 3）→ 触发扩容
        map.put("b", 2);
        map.put("c", 3);
        map.put("d", 4);    // 此时 size=4 > 3，扩容到 8
    }
}
```

### 自定义 key 必须正确重写 equals/hashCode

```java
public record UserId(Long id, String tenant) {}

Map<UserId, String> userMap = new HashMap<>();
userMap.put(new UserId(1L, "A"), "Tom");
userMap.get(new UserId(1L, "A"));   // "Tom"，record 自动生成 equals/hashCode
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 预知数据量 | `new HashMap<>(expectedSize / 0.75f + 1)` | 避免反复扩容 |
| 自定义对象作为 key | 同时重写 `equals` 和 `hashCode` | 推荐用 `record` 自动生成 |
| 高冲突 key | 改善 hashCode 实现或换 key 类型 | 链表退化影响 get 性能 |
| putIfAbsent 原子操作 | `map.putIfAbsent(k, v)` | 单线程下避免 `containsKey + put` 竞态 |
| 多线程并发 put | 改用 `ConcurrentHashMap` | HashMap 并发 put 会丢数据、结构异常 |

## 深挖追问

### 为什么容量要是 2 的幂？

只有 n 是 2 的幂时，`(n-1) & hash` 才等价于 `hash % n`。位运算比取模快，且扩容时只需检查 `hash & oldCap` 一位即可确定新位置，迁移成本最低。这是 HashMap 性能的关键设计之一。

### 链表长度到 8 不一定树化，那到几才一定树化？

链表长度 ≥ 8 且容量 ≥ 64 才树化。如果容量 < 64，链表长度再多也是优先扩容。所以"链表到 8 必然树化"是错的。

### 为什么树化阈值是 8？

源码注释有解释：基于泊松分布。在负载因子 0.75 下，桶中节点数服从泊松分布，参数 λ ≈ 0.5。一个桶有 8 个节点的概率约为 `0.00000006`，几乎不会发生。所以选 8 作为树化阈值是"几乎不会触发"的极端兜底，正常情况下不会出现树。退化阈值 6 而不是 8 是为了避免链表和树之间频繁切换（震荡）。

### put 相同 key 会增加 size 吗？

不会。同 key 走覆盖分支，`e != null` 时直接 return 旧 value，不会执行 `++size`。只有新增 key 才让 size 加 1。

### HashMap 可以并发 put 吗？

不能。HashMap 非线程安全，并发 put 会出现：数据覆盖（同桶位同时写）、size 错乱（`size++` 非原子）、扩容结构异常（多线程 resize 时桶链可能错乱）。JDK 7 还可能因头插法导致链表成环、CPU 100%；JDK 8 改尾插法避免了环，但其他问题仍存在。

### null key 的 hash 是多少？

是 0。`hash(null) = 0`，所以 null key 固定放在 `table[0]` 桶。ConcurrentHashMap 不允许 null key，是因为 get 返回 null 时无法区分"key 不存在"和"value 是 null"。

### onlyIfAbsent 参数干啥用？

`onlyIfAbsent=true` 表示"key 已存在时不覆盖"。`putIfAbsent(k, v)` 内部就是调 `putVal(hash(k), k, v, true, false)`。

## 易错点

- 链表长度到 8 不一定树化，容量 < 64 时优先扩容。
- JDK 8 是尾插，JDK 7 是头插；JDK 8 改尾插主要是为了解决并发扩容时的链表成环问题，不是为了性能。
- 同 key put 不会增加 size，只覆盖 value。
- `threshold = capacity * loadFactor`，不是 capacity。
- `hashCode` 相等不等于 key 相等，HashMap 在桶内还要调 `equals` 判断。
- null key 的 hash 是 0，固定放 `table[0]`。

## 总结

put 流程一句话：扰动 hash → `(n-1) & hash` 定位桶 → 桶空直接放 / 桶不空找同 key 覆盖或链表尾插 / 红黑树插入 → 链表 ≥ 8 且容量 ≥ 64 才树化 → `++size > threshold` 触发扩容。和 ConcurrentHashMap 比，HashMap 没有任何同步保护，所以 put 流程简单但并发不安全。

## 参考资料

- [OpenJDK HashMap.putVal 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/HashMap.java#L628)
- [HashMap 源码泊松分布注释](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/HashMap.java#L202)
