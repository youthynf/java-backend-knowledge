# Java中有哪些集合是线程安全的？

Java中有哪些集合是线程安全的？
传统线程安全集合
在java.util包中的线程安全类主要3个，其他都是非线程安全的：
Vector：线程安全，内部方法基本都是经过synchronized修饰，内部都是使用对象数组来保存数据，根据需要自动扩容，当数组容量满了，会创建全新的数组，并拷贝原有数组数据；
HashTable：线程安全的哈希表，每个方法都加上了synchronized关键字，锁住的是整个Table对象，不支持null键和值；
Stack：继承自Vector，同样存在性能问题；

使用 Collections 工具类包装
底层实现都是通过包装器将所有方法用 synchronized 块包裹，相比直接使用 Vector/Hashtable 更灵活，但复合操作仍需额外同步，迭代器也需要手动同步。

List<String> syncList = Collections.synchronizedList(new ArrayList<>());
Map<String, String> syncMap = Collections.synchronizedMap(new HashMap<>());
Set<String> syncSet = Collections.synchronizedSet(new HashSet<>());

在JUC包提供的都是线程安全的集合：
ConcurrentHashMap：JDK 7使用分段锁（Segment）实现，JDK 8采用CAS + synchronized (锁单个桶)提升并发度。特点是具有高并发性能，支持完全并发的检索和更新，但是弱一致性迭代器。
CopyOnWriteArrayList：实现方式是写时复制，特点是读操作无锁，写操作复制整个数组，适合读多写少场景，迭代器反映创建时的状态，非实时；
CopyOnWriteArraySet：基于 CopyOnWriteArrayList 实现，特点同上；
ConcurrentLinkedQueue：无锁实现的线程安全队列，基于 CAS 操作，是高性能的非阻塞队列；
BlockingQueue 接口及其实现

ArrayBlockingQueue：有界阻塞队列（数组实现）
LinkedBlockingQueue：可选有界/无界（链表实现）
PriorityBlockingQueue：带优先级的无界队列
SynchronousQueue：不存储元素的特殊队列
DelayQueue：元素延迟出队的队列
ConcurrentSkipListMap 和 ConcurrentSkipListSet：基于跳表(Skip List)实现，并发版本的 TreeMap/TreeSet，保证元素有序。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- 早期同步集合有 Vector、Hashtable、Collections.synchronizedXxx。
- 并发包提供 ConcurrentHashMap、CopyOnWriteArrayList、BlockingQueue 等更细粒度方案。

### 面试官想考什么
- 哪些集合线程安全，以及各自适用场景。
- 同步包装集合和并发集合的区别。

### 标准回答
线程安全集合要按读写比例和一致性要求选择。读多写少可用 CopyOnWrite；高并发 Map 用 ConcurrentHashMap；生产消费用 BlockingQueue。

### 深挖追问
- ConcurrentHashMap 为什么性能更好？
- synchronizedList 迭代时还需要加锁吗？
- 弱一致迭代器是什么？

### 实战场景/代码示例
```java
Map<String,Integer> map=new ConcurrentHashMap<>();
map.compute("k",(k,v)->v==null?1:v+1);
```

### 易错点/总结
- 不要只看“线程安全”标签，需看复合操作是否原子。
- 并发集合也不能替代业务级事务一致性。

---

<!-- interview-detail-2026-06-24 -->

## 面试版详细讲解补充

### 核心概念
- Java中有哪些集合是线程安全的？ 的核心是理解集合的数据结构、复杂度、线程安全边界以及与 equals/hashCode/扩容策略的关系。
- 复习时不要只记一句结论，要把“定义、底层原因、使用边界、工程取舍”串起来。

### 面试官想考什么
- 面试通常考底层结构、扩容/并发问题、为什么这样设计，以及在业务中如何选型。
- 能否把该知识点和常见线上问题、代码设计、性能/并发/可维护性联系起来。

### 标准回答
回答 Java中有哪些集合是线程安全的？ 时，先说明适用场景，再讲底层机制和关键参数，最后补充并发环境下的替代方案。集合类默认多数不是线程安全的，需要根据读写比例选择 synchronized 包装、并发容器或不可变集合。

如果是口述面试，建议先给一句结论，再补充 2~3 个关键细节，最后用项目场景收尾。这样既有结构，也能给面试官继续追问的抓手。

### 深挖追问
- 扩容何时触发？迭代时修改为什么抛 ConcurrentModificationException？并发容器如何降低锁粒度？
- 如果让你在项目里落地这个知识点，你会如何设计测试用例验证边界？
- 遇到性能、并发或可维护性问题时，有哪些替代方案？

### 示例/实战场景
```java
List<String> safe = Collections.synchronizedList(new ArrayList<>()); // 简单同步包装，复杂并发优先考虑 JUC 容器
```

实战中建议把该知识点放到具体场景里理解：例如接口参数校验、集合选型、线程池治理、金额计算、JVM 排障或框架扩展点，而不是孤立背概念。

### 易错点/总结
- 不要只背结论，要能结合容量、负载因子、hash 分布、读写比例解释取舍。
- 面试表达要避免绝对化，例如“永远”“一定”“只会”，很多 Java 行为都与版本、实现、参数和上下文有关。
- 最后用一句话收束：先讲清楚它解决什么问题，再讲清楚它的限制和替代方案。

