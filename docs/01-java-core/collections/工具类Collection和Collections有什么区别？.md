# 工具类 Collection 和 Collections 有什么区别

## 核心概念

`Collection` 和 `Collections` 名字像，但完全是两个东西：

- **`Collection`** 是接口，是 Java 集合框架的根接口（List、Set、Queue 的父接口）。
- **`Collections`** 是工具类，提供一堆操作集合的静态方法（排序、查找、同步包装、不可变包装等）。

简单记忆：**`Collection` 是接口定义"是什么"，`Collections` 是工具类提供"怎么操作"。** 一个 `-s` 之差，含义完全不同。

## 标准回答

一句话结论：**Collection 是集合框架的根接口（`java.util.Collection`），定义了 add/remove/size/iterator 等基本操作；Collections 是工具类（`java.util.Collections`），全是静态方法，提供 sort、binarySearch、synchronizedList、unmodifiableList 等集合操作工具。**

7 个核心差异：

| 维度 | Collection | Collections |
|------|-----------|-------------|
| 类型 | 接口 | 工具类（全静态方法） |
| 包 | `java.util` | `java.util` |
| 继承关系 | 继承 `Iterable` | 继承 `Object` |
| 用途 | 定义集合行为 | 提供集合操作工具 |
| 是否可实例化 | N/A（接口） | 否，构造私有 |
| 代表方法 | `add`、`remove`、`size`、`iterator` | `sort`、`binarySearch`、`synchronizedList` |
| 子接口/子类 | List、Set、Queue | 无子类 |

## 实现原理

### Collection 接口

```java
package java.util;

public interface Collection<E> extends Iterable<E> {
    int size();
    boolean isEmpty();
    boolean contains(Object o);
    Iterator<E> iterator();
    Object[] toArray();
    <T> T[] toArray(T[] a);
    boolean add(E e);
    boolean remove(Object o);
    boolean containsAll(Collection<?> c);
    boolean addAll(Collection<? extends E> c);
    boolean removeAll(Collection<?> c);
    boolean retainAll(Collection<?> c);
    void clear();
    boolean equals(Object o);
    int hashCode();
    // Java 8+ 默认方法
    default boolean removeIf(Predicate<? super E> filter) { ... }
    default Spliterator<E> spliterator() { ... }
    default Stream<E> stream() { ... }
    default Stream<E> parallelStream() { ... }
}
```

Collection 是接口，定义了所有单元素集合的通用行为。它的三大子接口：

```text
Collection
   ├── List     (有序、可重复)
   ├── Set      (无序、不重复)
   └── Queue    (队列)
```

注意：**Map 不继承 Collection**，它是独立体系。

### Collections 工具类

```java
package java.util;

public class Collections {
    private Collections() { }              // 构造私有，不可实例化

    // 排序（基于 TimSort）
    public static <T extends Comparable<? super T>> void sort(List<T> list) { ... }
    public static <T> void sort(List<T> list, Comparator<? super T> c) { ... }

    // 二分查找
    public static <T> int binarySearch(List<? extends Comparable<? super T>> list, T key) { ... }

    // 反转、打乱、填充
    public static void reverse(List<?> list) { ... }
    public static void shuffle(List<?> list) { ... }
    public static void fill(List<? super T> list, T obj) { ... }

    // 同步包装
    public static <T> List<T> synchronizedList(List<T> list) { ... }
    public static <K,V> Map<K,V> synchronizedMap(Map<K,V> m) { ... }
    public static <T> Set<T> synchronizedSet(Set<T> s) { ... }

    // 不可变包装
    public static <T> List<T> unmodifiableList(List<? extends T> list) { ... }
    public static <K,V> Map<K,V> unmodifiableMap(Map<? extends K,? extends V> m) { ... }

    // 单元素、空集合
    public static <T> List<T> singletonList(T o) { ... }
    public static <T> List<T> emptyList() { ... }

    // 频率、不相交判断
    public static int frequency(Collection<?> c, Object o) { ... }
    public static boolean disjoint(Collection<?> c1, Collection<?> c2) { ... }
}
```

所有方法都是 `static`，构造方法私有，不能 `new Collections()`。

## 代码示例

### Collection 接口的使用

```java
import java.util.*;

Collection<String> col = new ArrayList<>();
col.add("a");
col.add("b");
col.remove("a");
int size = col.size();

// Collection 的默认方法（Java 8+）
col.removeIf(s -> s.startsWith("tmp"));
col.stream().forEach(System.out::println);
```

### Collections 工具类的常见用法

```java
import java.util.*;

// 1. 排序
List<Integer> nums = new ArrayList<>(Arrays.asList(3, 1, 4, 1, 5, 9, 2, 6));
Collections.sort(nums);                                // [1, 1, 2, 3, 4, 5, 6, 9]
Collections.sort(nums, Comparator.reverseOrder());     // [9, 6, 5, 4, 3, 2, 1, 1]

// 2. 二分查找（前提：list 已排序）
int idx = Collections.binarySearch(nums, 5);

// 3. 反转、打乱、填充
Collections.reverse(nums);
Collections.shuffle(nums);
Collections.fill(nums, 0);                             // 全部填 0

// 4. 同步包装（线程安全）
List<String> syncList = Collections.synchronizedList(new ArrayList<>());
Map<String, String> syncMap = Collections.synchronizedMap(new HashMap<>());

// 5. 不可变包装
List<String> readonly = Collections.unmodifiableList(new ArrayList<>(Arrays.asList("a", "b")));
readonly.add("c");   // 抛 UnsupportedOperationException

// 6. 单元素集合
List<String> one = Collections.singletonList("only");

// 7. 空集合（避免返回 null）
List<String> empty = Collections.emptyList();

// 8. 频率、不相交
int freq = Collections.frequency(nums, 1);
boolean dis = Collections.disjoint(List.of("a"), List.of("b"));
```

### 推荐用 Java 8+ 的 List.of / Map.of

```java
// 老写法
List<String> old1 = Collections.unmodifiableList(Arrays.asList("a", "b"));
List<String> old2 = Collections.singletonList("only");
List<String> old3 = Collections.emptyList();

// Java 9+ 推荐
List<String> new1 = List.of("a", "b");          // 不可变
List<String> new2 = List.of("only");            // 单元素
List<String> new3 = List.of();                  // 空
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 对 List 排序 | `Collections.sort(list)` 或 `list.sort(comparator)` | Java 8+ 推荐用 `list.sort()` |
| 二分查找 | `Collections.binarySearch(list, key)` | 前提：list 已按升序排序 |
| 返回空集合替代 null | `Collections.emptyList()` | 避免调用方判空 |
| 包装不可变集合 | `Collections.unmodifiableList(list)` | 防止外部修改 |
| 同步包装 | `Collections.synchronizedList(new ArrayList<>())` | 遍历仍要手动加锁 |
| 计算元素出现次数 | `Collections.frequency(col, o)` | `O(n)` |
| 判断两集合无交集 | `Collections.disjoint(c1, c2)` | 任一元素相同返回 false |
| 求最大/最小 | `Collections.max(col)` / `Collections.min(col)` | 基于 Comparable 或 Comparator |

## 深挖追问

### Collections.sort 底层用什么算法？

JDK 7+ 用 **TimSort**（归并排序的优化版本，结合了插入排序和归并排序）。`List.sort()` 内部会先转成数组，对数组排序后再写回 List。TimSort 对"部分有序"的数据特别高效，最坏 `O(n log n)`，最好 `O(n)`。

### synchronizedList 和 Vector 的区别？

- **Vector**：方法本身 `synchronized`，是设计上的并发容器（虽然已被淘汰）。
- **synchronizedList**：包装类，把任意 List 套一层 `synchronized`，锁对象是 `mutex`（默认是包装后的 List 自身）。

两者性能差不多，但 synchronizedList 更灵活——可以包装 LinkedList、自定义 List 实现等。

### Collections.emptyList() 和 new ArrayList() 的区别？

- `Collections.emptyList()` 返回单例的不可变空 List，**每次调用返回同一对象**，零内存开销。
- `new ArrayList()` 每次创建新对象，分配 `DEFAULTCAPACITY_EMPTY_ELEMENTDATA` 数组引用。

返回值场景应该用 `Collections.emptyList()` 或 `List.of()`，避免无意义对象创建。

### unmodifiableList 是真正的不可变吗？

不完全。`unmodifiableList` 是**视图**——它禁止通过这个引用修改，但底层 List 如果被原引用修改，unmodifiableList 也能看到变化。

```java
List<String> original = new ArrayList<>(List.of("a"));
List<String> view = Collections.unmodifiableList(original);
original.add("b");
System.out.println(view);   // [a, b] ← view 也变了
```

要真正的不可变快照，应该 `List.copyOf(original)` 或 `new ArrayList<>(original)` 后再包装。

### Collections 可以包装数组吗？

不行。Collections 只能操作 Collection 体系。数组操作要用 `Arrays` 工具类（`Arrays.sort`、`Arrays.binarySearch`、`Arrays.asList`）。

### Collection 接口有静态方法吗？

Java 8 之后接口可以有静态方法，但 Collection 接口本身没定义。Java 9+ 在 `List`、`Set`、`Map` 接口上加了 `of` 静态方法用于创建不可变集合，但 `Collection` 接口本身仍以实例方法 + 默认方法为主。

## 易错点

- `Collection` 是接口、`Collections` 是工具类，两者只是名字像，没有继承关系。
- `Collections.sort(list)` 是就地排序，不返回新 List；`list.stream().sorted().collect(toList())` 才返回新 List。
- `Collections.emptyList()` 返回不可变 List，调 `add` 抛 `UnsupportedOperationException`。
- `synchronizedList` 遍历仍要手动加锁，否则抛 `ConcurrentModificationException`。
- `unmodifiableList` 是视图，底层 List 修改会影响"不可变"视图。
- Java 9+ 推荐 `List.of` / `Map.of` 替代 `Collections.unmodifiableXxx`。

## 总结

一句话：`Collection` 是接口（定义集合行为），`Collections` 是工具类（提供集合操作静态方法）。Collections 的常用方法分四类：排序查找（sort/binarySearch）、同步包装（synchronizedXxx）、不可变包装（unmodifiableXxx）、便捷工厂（emptyList/singletonList）。Java 9+ 后 `List.of` / `Map.of` 替代了部分 unmodifiableXxx 用法。

## 参考资料

- [OpenJDK Collections 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/Collections.java)
- [Java Platform SE 8 - Collection 接口](https://docs.oracle.com/javase/8/docs/api/java/util/Collection.html)
- [Java Platform SE 8 - Collections 工具类](https://docs.oracle.com/javase/8/docs/api/java/util/Collections.html)
