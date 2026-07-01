# ArrayList 扩容机制是怎么样的

## 核心概念

`ArrayList` 底层是一个 `Object[]` 数组，一旦数组被占满，再 add 元素就要换一个更大的数组，把旧元素搬过去。这个"换数组 + 搬元素"的过程就是扩容。

设计上 ArrayList 把扩容隐藏在 `add()` 内部，对外保持"无限容量"的假象。代价是扩容本身要做一次 `Arrays.copyOf`，时间复杂度 `O(n)`，所以频繁扩容会拖累性能，这也是初始化时建议指定容量的根本原因。

## 标准回答

一句话结论：**ArrayList 默认初始容量 10，每次装满后扩容为原来的 1.5 倍，扩容靠 `Arrays.copyOf` 复制旧数组到新数组。**

要点展开：

1. **首次扩容**：JDK 1.7 之后，`new ArrayList()` 创建的是一个长度为 0 的空数组 `{}`，第一次 `add` 才会扩到默认容量 `DEFAULT_CAPACITY = 10`。
2. **后续扩容**：新容量 `newCapacity = oldCapacity + (oldCapacity >> 1)`，即 1.5 倍。
3. **边界保护**：如果 1.5 倍后超过 `MAX_ARRAY_SIZE = Integer.MAX_VALUE - 8`，会取 `Integer.MAX_VALUE` 作为上限。
4. **复制方式**：通过 `Arrays.copyOf(elementData, newCapacity)` 复制，底层调用 `System.arraycopy`，是 native 方法。
5. **对比 Vector**：Vector 默认扩容 2 倍，且方法都加了 `synchronized`，所以并发安全但性能差。

## 实现原理

### 关键源码常量

```java
// java.util.ArrayList
private static final int DEFAULT_CAPACITY = 10;          // 默认初始容量
private static final Object[] EMPTY_ELEMENTDATA = {};    // 指定容量为 0 时用
private static final Object[] DEFAULTCAPACITY_EMPTY_ELEMENTDATA = {};  // 无参构造用
private static final int MAX_ARRAY_SIZE = Integer.MAX_VALUE - 8;       // 最大数组长度
transient Object[] elementData;                          // 真正存元素的数组
```

### add 触发扩容

```java
public boolean add(E e) {
    ensureCapacityInternal(size + 1);   // 1. 校验容量
    elementData[size++] = e;            // 2. 赋值后 size++
    return true;
}

private void ensureCapacityInternal(int minCapacity) {
    ensureExplicitCapacity(calculateCapacity(elementData, minCapacity));
}

private static int calculateCapacity(Object[] elementData, int minCapacity) {
    // 第一次 add 时，从 0 扩到 10
    if (elementData == DEFAULTCAPACITY_EMPTY_ELEMENTDATA) {
        return Math.max(DEFAULT_CAPACITY, minCapacity);
    }
    return minCapacity;
}

private void ensureExplicitCapacity(int minCapacity) {
    modCount++;
    // 当需要的最小容量 > 当前数组长度，才真正扩容
    if (minCapacity - elementData.length > 0) {
        grow(minCapacity);
    }
}
```

### grow 方法：核心扩容逻辑

```java
private void grow(int minCapacity) {
    int oldCapacity = elementData.length;
    int newCapacity = oldCapacity + (oldCapacity >> 1);   // 1.5 倍
    if (newCapacity - minCapacity < 0) {                  // 1.5 倍仍不够，按 minCapacity
        newCapacity = minCapacity;
    }
    if (newCapacity - MAX_ARRAY_SIZE > 0) {               // 超上限保护
        newCapacity = hugeCapacity(minCapacity);
    }
    elementData = Arrays.copyOf(elementData, newCapacity); // 复制到新数组
}
```

### 为什么是 1.5 倍

- **位运算高效**：`oldCapacity >> 1` 等价于除以 2，比浮点运算快。
- **空间-时间折中**：2 倍扩容（如 Vector）浪费空间，1 倍扩容次数太频繁；1.5 倍在均摊 `O(1)` 的 add 复杂度和空间利用率之间比较平衡。
- **可复用性**：1.5 倍意味着经过多次扩容释放后，旧数组能被后续的某次扩容复用（GC 视角），而 2 倍永远不会重合。

### 扩容示意图

```text
add 第 1 个元素：[]  →  [_,_,_,_,_,_,_,_,_,_]   长度 0 → 10
add 第 11 个元素：长度 10 → 15
add 第 16 个元素：长度 15 → 22
add 第 23 个元素：长度 22 → 33
...
```

## 代码示例

### 预估容量减少扩容

```java
import java.util.ArrayList;
import java.util.List;

public class ArrayListCapacityDemo {
    public static void main(String[] args) {
        // 反例：默认 10，要插入 100 万个元素，会扩容约 18 次
        List<Integer> bad = new ArrayList<>();
        long s1 = System.currentTimeMillis();
        for (int i = 0; i < 1_000_000; i++) {
            bad.add(i);
        }
        long s2 = System.currentTimeMillis();

        // 正例：预先指定容量，0 次扩容
        List<Integer> good = new ArrayList<>(1_000_000);
        long s3 = System.currentTimeMillis();
        for (int i = 0; i < 1_000_000; i++) {
            good.add(i);
        }
        long s4 = System.currentTimeMillis();

        System.out.println("不指定容量耗时：" + (s2 - s1) + " ms");
        System.out.println("指定容量耗时：" + (s4 - s3) + " ms");
    }
}
```

### trimToSize 回收浪费空间

```java
List<String> list = new ArrayList<>(1000);
list.add("a");            // 实际只用 1 个，但数组仍占 1000 长度
((ArrayList<String>) list).trimToSize();   // 缩到 1，节省内存
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 批量导入数据 | `new ArrayList<>(expectedSize)` | 容量预估公式：`expectedSize / 0.75f + 1`，留余量避免边界扩容 |
| 配置加载后只读 | 加载完调用 `trimToSize()` | 释放多余数组空间，长驻内存场景效果明显 |
| 多线程写入 | 改用 `CopyOnWriteArrayList` 或加锁 | ArrayList 扩容非原子，并发会丢数据、数组越界 |
| 大量中间插入 | 改用 `LinkedList` 或重构数据流 | ArrayList 中间插入要搬移后续元素，`O(n)` |

## 深挖追问

### JDK 1.6 / 1.7 / 1.8 的 ArrayList 默认容量有差异吗？

有。JDK 1.6 直接 `new Object[10]`；JDK 1.7 改为 `new Object[]{}`（空数组），第一次 add 才扩到 10；JDK 1.8 沿用 1.7 的懒初始化策略。好处是空 ArrayList 不占内存，适合短生命周期场景。

### addAll 时会一次性扩容到位吗？

会。`addAll` 调用 `ensureCapacityInternal(size + numNew)`，把 `minCapacity` 传给 `grow`，如果 1.5 倍不够就直接用 `minCapacity`，避免逐个 add 反复扩容。

### ArrayList 的 elementData 为什么用 transient 修饰？

ArrayList 的 `elementData` 数组长度通常大于 `size`，直接序列化会写出大量 null。所以 ArrayList 重写了 `writeObject` / `readObject`，只序列化 `size` 范围内的真实元素。

### 1.5 倍扩容为什么不会浪费太多内存？

均摊分析：n 次 add 总复制次数为 `n + n/2 + n/4 + ... ≈ 2n`，单次 add 均摊 `O(1)`。每次扩容后旧数组失去引用，可被 GC 回收，所以不会长期持有内存。

## 易错点

- `new ArrayList()` 默认容量不是 10，是 0，第一次 add 才扩到 10。
- Vector 扩容 2 倍，ArrayList 扩容 1.5 倍，不要记混。
- `ArrayList(int initialCapacity)` 传 0 时使用 `EMPTY_ELEMENTDATA`，与无参构造的 `DEFAULTCAPACITY_EMPTY_ELEMENTDATA` 是两个不同的空数组，区分目的就是让首次扩容走不同的逻辑。
- `ensureCapacity` 是公开方法但很少用，因为 add 内部已经自动判断。
- 子类 `SubList` 的修改会反映到原 ArrayList，但不在本篇范围。

## 总结

ArrayList 扩容三件事：默认 10、1.5 倍、`Arrays.copyOf` 复制。和 Vector 比，1.5 倍比 2 倍更省空间，不加锁比 synchronized 更快；和 HashMap 比，HashMap 扩容是 2 倍且需要 rehash，ArrayList 只是搬运元素到更大数组。

## 参考资料

- [OpenJDK ArrayList 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/ArrayList.java)
- [Java Platform SE 8 - ArrayList](https://docs.oracle.com/javase/8/docs/api/java/util/ArrayList.html)
