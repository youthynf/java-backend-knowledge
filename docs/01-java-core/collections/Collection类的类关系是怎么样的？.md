# Collection 类的类关系是怎么样的？

## 核心概念

Java 集合框架可以分成两条主线：

- **Collection**：单个元素的集合，下面主要有 `List`、`Set`、`Queue` 三类。
- **Map**：键值对映射，存储的是 `key -> value`，它**不继承 Collection**。

面试时要先把这两条线分清楚。很多人会说“Map 是 Collection 的子接口”，这是错误的。

## Collection 体系

### List：有序、可重复、按下标访问

`List` 关注元素顺序和下标访问，允许重复元素。

- **ArrayList**：底层动态数组，随机访问快，尾部追加快；中间插入/删除可能需要搬移元素。
- **LinkedList**：底层双向链表，适合已定位节点后的插入/删除；随机访问需要从头或尾遍历，时间复杂度是 `O(n)`。
- **Vector**：早期线程安全列表，方法大多用 `synchronized` 修饰，性能和扩展性较差，实际开发中很少再选。
- **Stack**：早期栈结构，继承自 Vector；现在更推荐用 `ArrayDeque` 实现栈。

### Set：不重复，不按下标访问

`Set` 关注元素唯一性，不提供下标访问。

- **HashSet**：基于 `HashMap` 实现，元素作为 HashMap 的 key，适合快速去重。
- **LinkedHashSet**：在 HashSet 基础上维护插入顺序。
- **TreeSet**：基于 `TreeMap`，按照自然顺序或比较器排序。

### Queue / Deque：队列和双端队列

`Queue` 关注先进先出或优先级调度，`Deque` 支持两端插入和删除。

- **PriorityQueue**：优先队列，按照自然顺序或 Comparator 排序，不保证整体有序，只保证队首是当前优先级最高/最低的元素。
- **ArrayDeque**：数组实现的双端队列，常用于替代 Stack，也可做普通队列。
- **ConcurrentLinkedQueue**：基于 CAS 的无界非阻塞线程安全队列。
- **ArrayBlockingQueue**：有界阻塞队列，常用于生产者-消费者模型。
- **LinkedBlockingQueue**：链表实现的阻塞队列，可以有界；不指定容量时默认接近无界，要警惕内存风险。

## Map 体系

`Map` 存储键值对，key 唯一，value 可以重复。常见实现有：

- **HashMap**：最常用的哈希表。JDK 8 之后底层是数组 + 链表 + 红黑树，平均 `O(1)` 查询。
- **LinkedHashMap**：在 HashMap 基础上维护双向链表，可以保持插入顺序或访问顺序，常用于 LRU 缓存。
- **TreeMap**：红黑树实现，key 有序，查询/插入/删除复杂度是 `O(log n)`。
- **Hashtable**：早期线程安全 Map，方法级 `synchronized`，基本被 `ConcurrentHashMap` 替代。
- **ConcurrentHashMap**：并发场景常用 Map。JDK 8 主要通过 CAS + `synchronized` + volatile 等机制降低锁粒度。

## 面试官想考什么

1. **体系边界**：Collection 和 Map 是否有继承关系。
2. **数据结构选型**：数组、链表、哈希表、红黑树分别适合什么场景。
3. **线程安全意识**：哪些集合不是线程安全的，并发场景该怎么替代。
4. **复杂度判断**：随机访问、插入删除、排序、去重分别应该选哪个集合。

## 标准回答

可以这样答：

> Java 集合框架分为 Collection 和 Map 两大体系。Collection 表示单元素集合，主要包括 List、Set、Queue；Map 表示键值对映射，不继承 Collection。List 有序可重复，典型实现是 ArrayList 和 LinkedList；Set 不允许重复，典型实现是 HashSet、LinkedHashSet、TreeSet；Queue 面向队列场景，常见 ArrayDeque、PriorityQueue 和阻塞队列。Map 中最常用的是 HashMap，此外还有保持顺序的 LinkedHashMap、有序的 TreeMap、并发场景使用的 ConcurrentHashMap。

## 深挖追问

### ArrayList 和 LinkedList 怎么选？

大多数业务场景优先选 `ArrayList`，因为它内存连续、缓存友好、随机访问快。`LinkedList` 只有在频繁操作链表节点且已经定位到节点时才有优势；如果每次都要按下标查找，它反而更慢。

### HashSet 为什么能去重？

HashSet 底层使用 HashMap，元素作为 key。判断重复时先比较 hash，再通过 `equals` 判断是否相等。因此自定义对象放入 HashSet 时，必须正确重写 `hashCode` 和 `equals`。

### TreeMap 和 HashMap 的区别？

HashMap 追求平均 `O(1)` 的读写效率，但不保证顺序；TreeMap 基于红黑树，key 有序，适合范围查询、排序遍历等场景，但单次操作是 `O(log n)`。

## 实战场景

- **去重**：普通去重用 `HashSet`，需要保留插入顺序用 `LinkedHashSet`。
- **按访问顺序淘汰缓存**：用 `LinkedHashMap` 的 accessOrder 模式实现简易 LRU。
- **排行榜或范围查询**：用 `TreeMap` / `TreeSet`，或者结合 Redis ZSet。
- **高并发读写 Map**：不要用 `HashMap`，优先考虑 `ConcurrentHashMap`。
- **生产者消费者**：优先使用 `ArrayBlockingQueue`、`LinkedBlockingQueue` 等阻塞队列。

## 易错点

- Map 不继承 Collection。
- LinkedList 不是所有插入删除都快，按下标定位仍然是 `O(n)`。
- HashSet 的“无序”不是随机，只是不要依赖它的遍历顺序。
- `Collections.synchronizedMap` 是粗粒度加锁，复杂复合操作仍要自己保证同步。
- `LinkedBlockingQueue` 不指定容量时可能堆积大量任务，引发内存问题。
