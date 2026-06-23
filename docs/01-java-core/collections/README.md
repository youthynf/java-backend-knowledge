# collections

- [多线程下HashMap会有什么问题？](01-java-core/collections/多线程下HashMap会有什么问题？.md)
- [工具类Collection和Collections有什么区别？](01-java-core/collections/工具类Collection和Collections有什么区别？.md)
- [如何解决哈希冲突问题？](01-java-core/collections/如何解决哈希冲突问题？.md)
- [重写HashMap的equals方法不当会发生什么？](01-java-core/collections/重写HashMap的equals方法不当会发生什么？.md)
- [ArrayList扩容机制是怎么样的？](01-java-core/collections/ArrayList扩容机制是怎么样的？.md)
- [ArrayList线程安全吗？](01-java-core/collections/ArrayList线程安全吗？.md)
- [Collection类的类关系是怎么样的？](01-java-core/collections/Collection类的类关系是怎么样的？.md)
- [CopyOnWriteArrayList底层实现原理是怎么样的？](01-java-core/collections/CopyOnWriteArrayList底层实现原理是怎么样的？.md)
- [HashMap的大小总是2的n次方原因是什么？](01-java-core/collections/HashMap的大小总是2的n次方原因是什么？.md)
- [HashMap的底层如何实现？](01-java-core/collections/HashMap的底层如何实现？.md)
- [HashMap扩容机制是怎么样的？](01-java-core/collections/HashMap扩容机制是怎么样的？.md)
- [HashMap与Hashtable区别是什么？](01-java-core/collections/HashMap与Hashtable区别是什么？.md)
- [HashMap执行put方法过程是怎么样的？](01-java-core/collections/HashMap执行put方法过程是怎么样的？.md)
- [Java遍历集合的方法有哪些？](01-java-core/collections/Java遍历集合的方法有哪些？.md)
- [Java中有哪些集合是线程安全的？](01-java-core/collections/Java中有哪些集合是线程安全的？.md)

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- 集合框架用于组织对象，核心关注数据结构、复杂度和线程安全。
- 选择集合要看是否有序、是否去重、是否按 key 查询、读写比例。

### 面试官想考什么
- 底层结构和复杂度。
- 线程安全、迭代行为和常见坑。

### 标准回答
collections 可按“底层结构 → 关键操作复杂度 → 适用场景 → 线程安全 → 易错点”回答。

### 深挖追问
- 和相近集合有什么区别？
- 并发场景如何选择？
- 元素可变会带来什么问题？

### 实战场景/代码示例
```java
// 根据访问模式选择集合：按下标访问用 List，去重用 Set，按 key 查询用 Map。
```

### 易错点/总结
- 不要只背 API，要能说出选择理由。
- 集合中的对象相等性通常依赖 equals/hashCode 或 Comparator。

