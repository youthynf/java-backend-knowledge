# Java 集合框架

本目录覆盖 Java 集合框架的核心知识点：Collection 体系、ArrayList、HashMap、并发集合、哈希冲突、equals/hashCode 约定等。

## 目录

### 集合体系

- [Collection 类的类关系是怎么样的？](Collection类的类关系是怎么样的？.md) — Collection 和 Map 两大体系的继承关系与实现选型
- [工具类 Collection 和 Collections 有什么区别？](工具类Collection和Collections有什么区别？.md) — 接口 vs 工具类，Collections 的 sort/synchronized/unmodifiable 用法
- [Java 遍历集合的方法有哪些？](Java遍历集合的方法有哪些？.md) — 7 种遍历方式、fail-fast 机制、安全删除元素

### ArrayList

- [ArrayList 扩容机制是怎么样的？](ArrayList扩容机制是怎么样的？.md) — 默认 10、1.5 倍扩容、grow 源码与预估容量
- [ArrayList 线程安全吗？](ArrayList线程安全吗？.md) — 并发不安全的三种表现与替代方案
- [CopyOnWriteArrayList 底层实现原理是怎么样的？](CopyOnWriteArrayList底层实现原理是怎么样的？.md) — 写时复制 + volatile 发布，读多写少场景

### HashMap

- [HashMap 的底层如何实现？](HashMap的底层如何实现？.md) — 数组 + 链表 + 红黑树，JDK 7 vs JDK 8 对比
- [HashMap 执行 put 方法过程是怎么样的？](HashMap执行put方法过程是怎么样的？.md) — putVal 8 步流程，hash 扰动与树化条件
- [HashMap 扩容机制是怎么样的？](HashMap扩容机制是怎么样的？.md) — 阈值、翻倍、hash & oldCap 迁移优化
- [HashMap 的大小总是 2 的 n 次方原因是什么？](HashMap的大小总是2的n次方原因是什么？.md) — 位运算替代取模、扩容迁移优化
- [HashMap 与 Hashtable 区别是什么？](HashMap与Hashtable区别是什么？.md) — 线程安全、null、容量、底层结构 7 个差异
- [多线程下 HashMap 会有什么问题？](多线程下HashMap会有什么问题？.md) — 数据覆盖、size 错乱、JDK 7 链表成环
- [重写 HashMap 的 equals 方法不当会发生什么？](重写HashMap的equals方法不当会发生什么？.md) — equals/hashCode 约定与典型错误

### 哈希与并发

- [如何解决哈希冲突问题？](如何解决哈希冲突问题？.md) — 链地址法、开放寻址法、再哈希法等 5 种方案
- [Java 中有哪些集合是线程安全的？](Java中有哪些集合是线程安全的？.md) — 同步容器、同步包装、并发容器三类对比

## 复习建议

- 先掌握 **Collection 类关系** 和 **HashMap 底层** 两条主线，再展开细节。
- HashMap 相关 7 篇是高频考点，建议按"底层 → put → 扩容 → 2 的幂 → 多线程 → equals"顺序阅读。
- 并发场景重点掌握 **ConcurrentHashMap**（JDK 7 Segment vs JDK 8 CAS + synchronized）和 **CopyOnWriteArrayList**。
- 关键源码常量务必记牢：`DEFAULT_INITIAL_CAPACITY=16`、`LOAD_FACTOR=0.75`、`TREEIFY_THRESHOLD=8`、`UNTREEIFY_THRESHOLD=6`、`MIN_TREEIFY_CAPACITY=64`。
