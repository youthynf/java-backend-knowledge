# HashMap 扩容机制是怎么样的

## 核心概念

HashMap 扩容是指元素数量超过阈值时，把底层 `Node[]` 数组容量翻倍，并把所有元素迁移到新数组的过程。它的目的是控制每个桶的链表/红黑树长度，让 put/get 保持平均 `O(1)`。

扩容是 HashMap 性能敏感操作——一次扩容要重新搬运所有元素，时间复杂度 `O(n)`。所以初始化时预估容量、避免反复扩容很重要。

## 标准回答

一句话结论：**HashMap 扩容在 `++size > threshold` 时触发，容量翻倍（保持 2 的幂），新建 2 倍长度数组，旧元素按 `hash & oldCap` 判断位置——为 0 留原下标，非 0 移到 `原下标 + oldCap`，不需要重新计算 hash。**

5 个关键点：

1. **触发条件**：`size > threshold`，其中 `threshold = capacity * loadFactor`。
2. **默认值**：初始容量 16，负载因子 0.75，扩容阈值 12。
3. **容量翻倍**：`newCapacity = oldCapacity << 1`，始终保持 2 的幂。
4. **迁移优化**：JDK 8 用 `hash & oldCap` 判断元素新位置，避免重算 hash。
5. **链表保持顺序**：JDK 8 尾插法迁移，保持链表内节点顺序，且不会成环。

## 实现原理

### 关键常量

```java
static final int DEFAULT_INITIAL_CAPACITY = 1 << 4;     // 16
static final float DEFAULT_LOAD_FACTOR = 0.75f;
static final int MAXIMUM_CAPACITY = 1 << 30;            // 2^30
int threshold;       // 扩容阈值 = capacity * loadFactor
```

### resize 方法骨架

```java
final Node<K,V>[] resize() {
    Node<K,V>[] oldTab = table;
    int oldCap = (oldTab == null) ? 0 : oldTab.length;
    int oldThr = threshold;
    int newCap, newThr = 0;

    if (oldCap > 0) {
        // 已达上限，不再扩容
        if (oldCap >= MAXIMUM_CAPACITY) {
            threshold = Integer.MAX_VALUE;
            return oldTab;
        }
        // 容量翻倍
        else if ((newCap = oldCap << 1) < MAXIMUM_CAPACITY
                 && oldCap >= DEFAULT_INITIAL_CAPACITY) {
            newThr = oldThr << 1;   // 阈值也翻倍
        }
    } else if (oldThr > 0) {
        newCap = oldThr;            // 带初始容量参数的首次初始化
    } else {
        // 无参构造的首次初始化
        newCap = DEFAULT_INITIAL_CAPACITY;   // 16
        newThr = (int)(DEFAULT_LOAD_FACTOR * DEFAULT_INITIAL_CAPACITY);  // 12
    }

    if (newThr == 0) {
        float ft = (float)newCap * loadFactor;
        newThr = (newCap < MAXIMUM_CAPACITY && ft < MAXIMUM_CAPACITY
                  ? (int)ft : Integer.MAX_VALUE);
    }
    threshold = newThr;

    // 创建新数组
    Node<K,V>[] newTab = (Node<K,V>[])new Node[newCap];
    table = newTab;

    // 迁移旧数据
    if (oldTab != null) {
        for (int j = 0; j < oldCap; ++j) {
            Node<K,V> e;
            if ((e = oldTab[j]) != null) {
                oldTab[j] = null;
                if (e.next == null) {
                    // 单节点，直接放到新位置
                    newTab[e.hash & (newCap - 1)] = e;
                } else if (e instanceof TreeNode) {
                    // 红黑树拆分（可能退化回链表）
                    ((TreeNode<K,V>)e).split(this, newTab, j, oldCap);
                } else {
                    // 链表拆分：原位链 + 高位链
                    Node<K,V> loHead = null, loTail = null;
                    Node<K,V> hiHead = null, hiTail = null;
                    Node<K,V> next;
                    do {
                        next = e.next;
                        if ((e.hash & oldCap) == 0) {
                            // 留原位
                            if (loTail == null) loHead = e;
                            else loTail.next = e;
                            loTail = e;
                        } else {
                            // 移到 原位 + oldCap
                            if (hiTail == null) hiHead = e;
                            else hiTail.next = e;
                            hiTail = e;
                        }
                    } while ((e = next) != null);
                    if (loTail != null) { loTail.next = null; newTab[j] = loHead; }
                    if (hiTail != null) { hiTail.next = null; newTab[j + oldCap] = hiHead; }
                }
            }
        }
    }
    return newTab;
}
```

### 迁移优化：hash & oldCap 原理

容量从 16 扩到 32 时：

```text
oldCap  = 16 = 0001 0000
n-1 (新) = 31 = 0001 1111
n-1 (旧) = 15 = 0000 1111
```

新数组下标比旧数组多用了第 5 位（bit 4）。一个节点的 hash 在 bit 4 是 0 还是 1，决定了它的新位置：

- `hash & oldCap == 0`：bit 4 是 0，新下标 = 旧下标。
- `hash & oldCap != 0`：bit 4 是 1，新下标 = 旧下标 + 16（oldCap）。

举例：`hash = 0b...00100`（十进制 4）

- 旧容量 16：`4 & 15 = 4` → 桶 4
- 新容量 32：`4 & 31 = 4` → 桶 4（`4 & 16 = 0`，留原位）

`hash = 0b...10100`（十进制 20）

- 旧容量 16：`20 & 15 = 4` → 桶 4
- 新容量 32：`20 & 31 = 20` → 桶 20 = 4 + 16（`20 & 16 = 16`，移到 `原位 + oldCap`）

所以同一个桶里的链表，扩容后最多拆成两条：原位链 + 高位链，不需要重新计算每个元素的 hash。

### 红黑树的拆分

红黑树节点的拆分逻辑和链表类似：通过 `hash & oldCap` 拆成低位树和高位树。拆完后如果树节点数 ≤ 6（`UNTREEIFY_THRESHOLD`），退化回链表。

### 为什么负载因子是 0.75

- **空间-时间折中**：太大（如 1.0）冲突多，链表长；太小（如 0.5）空间浪费多。
- **2 的幂配合**：0.75 = 3/4，使得 `capacity * 0.75` 在 capacity 是 2 的幂时是整数（如 16*0.75=12），阈值好计算。
- **泊松分布**：0.75 时桶冲突服从泊松分布，平均桶长很小，性能最佳。

源码注释提到 0.75 是经过权衡的经验值，不要随意改。设为 1 会显著增加冲突，设为 0.5 会浪费一半空间。

## 代码示例

### 观察扩容

```java
import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Map;

public class HashMapResizeDemo {
    public static void main(String[] args) throws Exception {
        Map<Integer, String> map = new HashMap<>(4, 0.75f);  // 阈值 = 3
        for (int i = 0; i < 10; i++) {
            map.put(i, "v" + i);
            System.out.println("size=" + map.size()
                + ", capacity=" + capacity(map)
                + ", threshold=" + threshold(map));
        }
    }

    static int capacity(Map<?, ?> m) throws Exception {
        Field table = HashMap.class.getDeclaredField("table");
        table.setAccessible(true);
        Object[] arr = (Object[]) table.get(m);
        return arr == null ? 0 : arr.length;
    }

    static int threshold(Map<?, ?> m) throws Exception {
        Field f = HashMap.class.getDeclaredField("threshold");
        f.setAccessible(true);
        return f.getInt(m);
    }
}
```

输出大致：

```text
size=1, capacity=4, threshold=3
size=2, capacity=4, threshold=3
size=3, capacity=4, threshold=3
size=4, capacity=8, threshold=6     // 触发扩容
size=5, capacity=8, threshold=6
...
size=7, capacity=16, threshold=12   // 再次扩容
```

### 预估容量避免扩容

```java
int expected = 1000;
// 0.75 负载因子下，容量 = expected / 0.75 + 1，避免触发扩容
Map<Integer, String> map = new HashMap<>((int)(expected / 0.75f) + 1);
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 批量导入数据 | 预估容量 `new HashMap<>(expectedSize / 0.75f + 1)` | Guava `Maps.newHashMapWithExpectedSize` 已封装 |
| 内存敏感场景 | 适当调小容量，使用后释放 | HashMap 不缩容，长时间持有浪费内存 |
| 高并发写入 | 改用 `ConcurrentHashMap` | HashMap 并发扩容会结构异常 |
| key hash 质量差 | 改进 hashCode 实现 | 扩容无法解决根本冲突问题 |
| 调整负载因子 | `new HashMap<>(16, 0.5f)` | 慎调，0.75 是经验最优值 |

## 深挖追问

### 扩容时为什么不用重新计算 hash？

HashMap 的 hash 在 put 时已经计算好存在 `Node.hash` 字段里，扩容时直接读。而且 `(n-1) & hash` 的位运算特性使得扩容后只需检查新增的一位（`hash & oldCap`），不用重新做完整 hash 计算。

### JDK 7 和 JDK 8 扩容的区别？

- **JDK 7**：扩容迁移用头插法，并发下可能导致链表成环，get 时死循环 CPU 100%。
- **JDK 8**：改尾插法，保持链表节点顺序，避免成环；且引入"原位链 + 高位链"拆分，迁移效率更高。但 JDK 8 仍不是线程安全的，并发扩容仍可能丢数据、size 错乱。

### 扩容一定翻倍吗？

不一定。如果指定了初始容量，会取大于该值的最小 2 的幂作为初始容量；如果容量已达 `MAXIMUM_CAPACITY = 2^30`，不再扩容，threshold 设为 `Integer.MAX_VALUE`。

### 红黑树扩容后会退化吗？

会。`TreeNode.split` 在拆分完低位树和高位树后，如果节点数 ≤ `UNTREEIFY_THRESHOLD = 6`，退化回链表。

### 容量到达 64 之前，链表长度到 8 怎么办？

不树化，而是触发扩容。`treeifyBin` 方法先检查 `tab.length < MIN_TREEIFY_CAPACITY`，是则直接 `resize()`。这是因为小容量下冲突主要来自数组太小，扩容比树化更有效。

### 扩容会减小吗？

不会主动缩容。即使 remove 掉大部分元素，HashMap 的数组长度也不会变。如果在意内存，应该重新 `new HashMap` 把数据搬过去。

## 易错点

- 阈值 `threshold = capacity * loadFactor`，不是 capacity 本身。默认 16/0.75 时阈值是 12，size 到 13 才扩容，不是到 16。
- 链表长度到 8 + 容量 < 64 时扩容，不树化。
- 扩容一定翻倍是错的——已达 `MAXIMUM_CAPACITY` 不再扩容。
- JDK 8 改尾插后并非线程安全，并发扩容仍会出问题。
- 负载因子不是越小越好，0.75 是经验最优值，乱调可能更差。

## 总结

HashMap 扩容三件事：阈值 = 容量 × 0.75；容量翻倍保持 2 的幂；JDK 8 用 `hash & oldCap` 一位判断新位置，原位链 + 高位链拆分迁移。和 ArrayList 比，HashMap 扩容需要重新分布元素而非简单搬运；和 ConcurrentHashMap 比，HashMap 扩容没有任何同步保护，并发下不安全。

## 参考资料

- [OpenJDK HashMap.resize 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/HashMap.java#L674)
- [HashMap 工作原理 - 美团技术团队](https://tech.meituan.com/2016/06/24/java-hashmap.html)
