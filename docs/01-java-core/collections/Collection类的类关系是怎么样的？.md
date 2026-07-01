# Collection 类的类关系是怎么样的

## 核心概念

Java 集合框架分两条主线：**Collection 体系**（单元素集合，含 List、Set、Queue）和 **Map 体系**（键值对映射）。两者**没有继承关系**，并列存在，这是面试中最容易答错的点——很多人会说"Map 是 Collection 的子接口"，这是错的。

它们都来自 `java.util` 包，但只有 Collection 继承自 `Iterable`，所以 Collection 体系能用 for-each 遍历，Map 不能直接用 for-each，必须通过 `entrySet()` / `keySet()` / `values()` 拿到 Collection 视图才能遍历。

## 标准回答

```text
                Iterable
                   |
               Collection
              /     |     \
            List   Set      Queue
            /|\    /|\         \
ArrayList  ...  HashSet ...   Deque
LinkedList     TreeSet ...    PriorityQueue
Vector                        ArrayDeque
```

要点：

1. **顶层是 `Iterable`**：提供 `iterator()`，使集合能被 for-each 遍历。
2. **Collection 继承 Iterable**：下分 List、Set、Queue 三大子接口。
3. **Map 独立成系**：不继承 Collection，但可以通过 `entrySet()` 等方法返回 Collection 视图。
4. **List 有序可重复**：ArrayList、LinkedList、Vector、Stack。
5. **Set 不可重复**：HashSet（无序）、LinkedHashSet（插入序）、TreeSet（排序）。
6. **Queue 队列**：ArrayDeque、PriorityQueue，并发包下还有 BlockingQueue 系列。

## 实现原理

### List：有序、可重复、按下标访问

| 实现 | 底层结构 | 随机访问 | 中间插入删除 | 线程安全 |
|------|---------|---------|------------|---------|
| `ArrayList` | 动态数组 | `O(1)` | `O(n)` | 否 |
| `LinkedList` | 双向链表 | `O(n)` | 已定位节点后 `O(1)` | 否 |
| `Vector` | 动态数组 | `O(1)` | `O(n)` | 是，方法级 synchronized |
| `Stack` | 继承 Vector | `O(1)` | `O(n)` | 是，但已被 `ArrayDeque` 替代 |

### Set：不重复

| 实现 | 底层 | 顺序 | 复杂度 |
|------|------|------|--------|
| `HashSet` | 基于 `HashMap` | 无序 | 平均 `O(1)` |
| `LinkedHashSet` | 基于 `LinkedHashMap` | 插入顺序 | 平均 `O(1)` |
| `TreeSet` | 基于 `TreeMap`（红黑树） | 自然序/Comparator | `O(log n)` |

### Queue / Deque

| 实现 | 底层 | 特点 |
|------|------|------|
| `ArrayDeque` | 循环数组 | 双端队列，可做栈或队列，性能优于 Stack |
| `PriorityQueue` | 最小堆 | 出队按优先级，不保证整体有序 |
| `ConcurrentLinkedQueue` | CAS 链表 | 无界非阻塞线程安全 |
| `ArrayBlockingQueue` | 数组 + 锁 | 有界阻塞，生产者消费者 |
| `LinkedBlockingQueue` | 链表 + 锁 | 默认近无界，警惕 OOM |

### Map：键值对（独立体系）

| 实现 | 底层 | 顺序 | 线程安全 |
|------|------|------|---------|
| `HashMap` | 数组 + 链表 + 红黑树 | 无序 | 否 |
| `LinkedHashMap` | HashMap + 双向链表 | 插入序/访问序 | 否 |
| `TreeMap` | 红黑树 | 按 key 排序 | 否 |
| `Hashtable` | 数组 + 链表 | 无序 | 是，方法级 synchronized |
| `ConcurrentHashMap` | 分段锁/CAS + synchronized | 无序 | 是，高并发优化 |

## 代码示例

### 根据场景选集合

```java
import java.util.*;
import java.util.concurrent.*;

public class CollectionChoiceDemo {
    public static void main(String[] args) {
        // 1. 顺序访问、随机读 → ArrayList
        List<String> list = new ArrayList<>();

        // 2. 去重 → HashSet
        Set<String> set = new HashSet<>();

        // 3. 去重并保留插入顺序 → LinkedHashSet
        Set<String> orderedSet = new LinkedHashSet<>();

        // 4. 排序 → TreeSet
        Set<Integer> sortedSet = new TreeSet<>();

        // 5. 栈 → ArrayDeque（不要用 Stack）
        Deque<String> stack = new ArrayDeque<>();
        stack.push("a");

        // 6. 高并发 Map → ConcurrentHashMap（不要用 HashMap + synchronized）
        Map<String, String> cache = new ConcurrentHashMap<>();

        // 7. 生产者消费者 → LinkedBlockingQueue
        BlockingQueue<Runnable> queue = new LinkedBlockingQueue<>(100);
    }
}
```

### Map 转 Collection 视图

```java
Map<String, Integer> map = new HashMap<>();
map.put("a", 1);

// Map 本身不能 for-each，要拿视图
for (Map.Entry<String, Integer> e : map.entrySet()) {
    System.out.println(e.getKey() + "=" + e.getValue());
}
```

## 实战场景

| 场景 | 选型 | 注意点 |
|------|------|--------|
| 用户列表分页查询 | `ArrayList` | 随机访问多，几乎不中间插入 |
| 任务调度按优先级出队 | `PriorityQueue` | 不保证遍历有序，只保证队首最优 |
| LRU 缓存 | `LinkedHashMap`（accessOrder=true） | 重写 `removeEldestEntry` 控制容量 |
| 黑白名单去重 | `HashSet` / `CopyOnWriteArraySet` | 读多写少用并发版 |
| 高并发计数表 | `ConcurrentHashMap` | 用 `computeIfAbsent` / `merge` 做原子复合操作 |
| 多线程任务队列 | `LinkedBlockingQueue` | 必须设容量，默认 `Integer.MAX_VALUE` 易 OOM |
| 范围查询 | `TreeMap` | `subMap` / `headMap` / `tailMap` |

## 深挖追问

### ArrayList 和 LinkedList 怎么选？

绝大多数业务场景选 `ArrayList`：内存连续、缓存友好、随机访问 `O(1)`。`LinkedList` 只在"已定位到节点后频繁插入删除"的场景才占优，按下标操作反而是 `O(n)`。即使要做大量中间插入，`ArrayList` 的搬移成本通常也被 CPU 缓存命中抵消。

### HashSet 为什么能去重？

底层是 `HashMap`，元素作为 key 存储，value 是一个静态 `PRESENT` 对象。判断重复时先比较 hash，再 `equals`。所以自定义对象放入 HashSet，必须同时重写 `hashCode` 和 `equals`，且遵守"equals 相等则 hashCode 必相等"的约定。

### TreeMap 和 HashMap 怎么选？

- `HashMap`：平均 `O(1)` 读写，不保证顺序，适合绝大多数缓存/查找场景。
- `TreeMap`：`O(log n)` 读写，key 有序，适合范围查询（`subMap`）、按 key 排序遍历。

性能敏感且不需要排序时选 HashMap；需要排序或范围扫描时选 TreeMap。

### Stack 为什么不推荐？

`Stack` 继承 `Vector`，所有方法 `synchronized`，性能差；且"继承 Vector"的设计违背了栈的语义（栈不应该有按中间下标访问的能力）。官方推荐用 `ArrayDeque` 做栈，性能更好，API 也更清晰。

### Collection 和 Collections 的关系？

`Collection` 是接口（集合框架根接口），`Collections` 是工具类（提供 `sort`、`synchronizedList` 等静态方法），两者只是名字像，没有继承关系。

## 易错点

- Map 不继承 Collection，"Map 是 Collection 子接口"是错的。
- `LinkedList` 不是所有插入删除都快，按下标定位仍是 `O(n)`。
- `HashSet` 的"无序"不是"随机"，每次遍历顺序可能相同，只是不要依赖。
- `LinkedBlockingQueue` 不指定容量时默认 `Integer.MAX_VALUE`，生产环境必设容量。
- `PriorityQueue` 出队有序，遍历无序，不要用 for-each 假定顺序。

## 总结

记住两条主线：Collection（List/Set/Queue）和 Map 平级；选择实现时先看是否需要有序、是否需要去重、是否需要并发、是否需要排序，再据此选具体类。绝大多数业务场景 ArrayList + HashMap + ConcurrentHashMap 三个就够用。

## 参考资料

- [Java Collections Framework Overview](https://docs.oracle.com/javase/8/docs/technotes/guides/collections/overview.html)
- [OpenJDK java.util 包源码](https://github.com/openjdk/jdk/tree/jdk8u/jdk/src/share/classes/java/util)
