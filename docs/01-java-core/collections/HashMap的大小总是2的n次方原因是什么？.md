# HashMap 的大小总是 2 的 n 次方原因是什么

## 核心概念

HashMap 的容量始终是 2 的幂（16、32、64...），这不是巧合，而是**为了同时优化"定位桶下标"和"扩容迁移"两个高频操作**。2 的幂让位运算可以替代取模，让扩容迁移只需检查一位 bit，是 HashMap 性能的关键设计。

无论你是用无参构造（默认 16），还是传 `new HashMap<>(100)`，最终容量都是 2 的幂——构造方法会调用 `tableSizeFor` 把任意整数向上取到最近的 2 的幂。

## 标准回答

一句话结论：**HashMap 容量保持 2 的幂是为了用 `(n-1) & hash` 替代 `hash % n` 计算桶下标（位运算比取模快），并让扩容时用 `hash & oldCap` 一位判断元素新位置，迁移成本最低；同时 `(n-1)` 全 1 让 hash 低位充分参与寻址，分布更均匀。**

三个核心收益：

1. **位运算替代取模**：`hash & (n-1)` 等价于 `hash % n`，但 CPU 位运算比取模快几个数量级。
2. **分布均匀**：n 是 2 的幂时，`(n-1)` 低位全是 1，让 hash 的所有低位都参与下标计算，冲突最少。
3. **扩容高效**：容量翻倍后，元素新位置只看 hash 的新增高位 bit，要么留原位要么移到 `原位 + oldCap`，无需重算 hash。

## 实现原理

### tableSizeFor：把任意整数向上取到最近的 2 的幂

```java
static final int tableSizeFor(int cap) {
    int n = -1 >>> Integer.numberOfLeadingZeros(cap - 1);
    return (n < 0) ? 1
         : (n >= MAXIMUM_CAPACITY) ? MAXIMUM_CAPACITY
         : n + 1;
}
```

JDK 11+ 的实现，原理是把 `cap - 1` 的最高位以下全部填 1，再加 1 得到 2 的幂。例如传 100：

```text
cap - 1 = 99  = 0110 0011
填充后       = 0111 1111 = 127
+1           = 1000 0000 = 128
```

所以 `new HashMap<>(100)` 的实际容量是 128。这保证了无论怎么初始化，容量一定是 2 的幂。

### 为什么 (n-1) & hash 能等价于 hash % n

当 n 是 2 的幂时，`n = 2^k`，`n - 1` 的二进制低位 k 位全是 1，高位全是 0。例如：

```text
n    = 16 = 0001 0000
n-1  = 15 = 0000 1111
hash & (n-1) 取 hash 的低 4 位
等价于 hash % 16
```

数学证明：`hash = q * n + r`（其中 `0 ≤ r < n`），`hash % n = r`。当 n 是 2 的幂时，r 就是 hash 的低 log2(n) 位，正好是 `hash & (n-1)` 的结果。

### 位运算比取模快多少

CPU 执行 `&` 是单周期指令，`%` 是除法，通常需要 20-80 周期。HashMap 每次 put/get 都要定位桶，10 亿次操作下差距是几十秒。

### 分布均匀的原因

如果 n 不是 2 的幂，比如 n = 15（`0b1111` 已经全 1 但下一位会变），`(n-1) = 14 = 0b1110`，最低位是 0，导致 hash 最低位不参与下标计算，分布不均——只有 0/2/4/6/8/10/12/14 这些偶数桶会被用，一半桶浪费。

n 是 2 的幂时 `(n-1)` 全 1，hash 的每一位都参与，桶分布最均匀。

### 扩容迁移优化

```java
// JDK 8 resize 中的关键判断
if ((e.hash & oldCap) == 0) {
    // 留原下标
} else {
    // 移到 原下标 + oldCap
}
```

容量从 16 扩到 32，`(n-1)` 从 `0b1111` 变成 `0b11111`，多了 bit 4。元素的 hash 在 bit 4 是 0 还是 1，决定它新位置：

- `hash & oldCap == 0`：bit 4 是 0，新下标 = 旧下标。
- `hash & oldCap != 0`：bit 4 是 1，新下标 = 旧下标 + 16。

一次位与 + 一次加法即可完成迁移判断，无需重新计算 hash，也无需重新做 `(n-1) & hash`。

## 代码示例

### 验证 tableSizeFor 的行为

```java
import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Map;

public class TableSizeForDemo {
    public static void main(String[] args) throws Exception {
        int[] inputs = {1, 5, 16, 100, 1000, 65536};
        for (int cap : inputs) {
            Map<Integer, String> map = new HashMap<>(cap);
            int actual = capacity(map);
            System.out.println("输入=" + cap + ", 实际容量=" + actual
                + ", 是 2 的幂=" + isPowerOfTwo(actual));
        }
    }

    static int capacity(Map<?, ?> m) throws Exception {
        Field f = HashMap.class.getDeclaredField("table");
        f.setAccessible(true);
        Object[] arr = (Object[]) f.get(m);
        if (arr == null) {
            // 触发一次 put 让 table 初始化
            ((HashMap<Integer, String>) m).put(0, "x");
            arr = (Object[]) f.get(m);
        }
        return arr.length;
    }

    static boolean isPowerOfTwo(int n) {
        return n > 0 && (n & (n - 1)) == 0;
    }
}
```

输出大致：

```text
输入=1, 实际容量=2, 是 2 的幂=true
输入=5, 实际容量=8, 是 2 的幂=true
输入=16, 实际容量=16, 是 2 的幂=true
输入=100, 实际容量=128, 是 2 的幂=true
输入=1000, 实际容量=1024, 是 2 的幂=true
输入=65536, 实际容量=65536, 是 2 的幂=true
```

### hash 扰动配合 2 的幂分布

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
// hash() 让高 16 位参与低 16 位计算
// 配合 (n-1) & hash（n=2^k），相当于让 hash 的所有 k 位都参与下标
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 指定初始容量 | `new HashMap<>(expected / 0.75f + 1)` | 实际容量会被 `tableSizeFor` 取整到 2 的幂 |
| 自定义 hash 散列 | 让 hashCode 低位充分分散 | 高位扰动只在 HashMap 内部，自定义 key 仍要写好 hashCode |
| 实现自定义哈希表 | 容量选 2 的幂 + 位运算定位 | 类似设计的有 ThreadLocal.ThreadLocalMap、ConcurrentHashMap |
| Bitset / Bloom Filter | 容量选 2 的幂 | 用位运算替代取模是通用优化 |

## 深挖追问

### 如果 n 不是 2 的幂会怎样？

- **性能下降**：必须用 `hash % n` 取模，比位运算慢。
- **分布不均**：`(n-1)` 不再全 1，部分 hash 位不参与下标计算，桶分布不均，冲突增多。
- **扩容复杂**：迁移时无法用一位判断新位置，必须重新计算每个元素的下标。

### 为什么不直接用取模？

取模指令 `%` 在 CPU 上等价于除法，比位与 `&` 慢 20-80 倍。HashMap 每次 put/get/containsKey 都要定位桶，是热点路径，必须用最快的方式。

### 为什么还要 hash 扰动？

即便容量是 2 的幂，如果 key 的 hashCode 低位规律性强（比如都是 4 的倍数），仍然会集中到少数桶。扰动 `hash = hashCode ^ (hashCode >>> 16)` 让高位信息参与低位计算，进一步分散。

举例：`hashCode` 是连续整数 0, 1, 2, ... 时，扰动后低位分布更均匀。

### ConcurrentHashMap 也是 2 的幂吗？

是的。ConcurrentHashMap 同样使用 `tableSizeFor` 保证容量是 2 的幂，定位桶下标也用 `(n-1) & hash`。这是 HashMap 系列的通用设计。

### HashSet 也用 2 的幂吗？

HashSet 底层是 HashMap，所以也是 2 的幂。元素作为 HashMap 的 key 存储，value 是固定的 PRESENT 对象。

### tableSizeFor 的时间复杂度？

`O(1)`。`Integer.numberOfLeadingZeros` 是 CPU 内置指令（`LZCNT`），5 次位运算搞定。即使手写版本的 `tableSizeFor`（JDK 8 的实现）也是 5 次位或 + 1 次加法，常数时间。

## 易错点

- "容量必须是 2 的幂"是 HashMap 设计要求，构造时传任意整数都会被 `tableSizeFor` 调整。
- `(n-1) & hash` 等价于 `hash % n` 的前提是 n 是 2 的幂，n 不是 2 的幂时不等价。
- hash 扰动不能替代 2 的幂容量，两者是配合关系，缺一不可。
- 扩容时判断新位置用 `hash & oldCap`，不是 `hash & (oldCap - 1)`——这两个容易混。
- 实际容量可能远大于指定容量（如传 100 得 128），初始化时不要假设容量等于传入值。

## 总结

HashMap 容量为 2 的幂有三层收益：位运算替代取模（性能）、`(n-1)` 全 1 让 hash 充分参与寻址（分布）、扩容时一位判断新位置（迁移效率）。配合 hash 扰动，让 HashMap 在大多数场景下保持 `O(1)` 性能。这是 HashMap 设计上最巧妙的取舍之一。

## 参考资料

- [OpenJDK HashMap.tableSizeFor 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/HashMap.java#L348)
- [Why HashMap capacity is power of 2](https://stackoverflow.com/questions/53526790/why-hashmap-capacity-is-power-of-2)
