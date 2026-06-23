# 重写HashMap的equals方法不当会发生什么？

重写HashMap的equals方法不当会发生什么？
HashMap比较元素时，先比较hashCode是否相同，相同则继续比较equals()方法是否相同。

其中equals()和hashCode()的实现应该遵循以下规则：
若equals()结果相等，则hashCode()一定相等
反之，hashCode()相等，但equals()可能不相等；

如果我们只是重写了equals()方法，而没有重写hashCode方法，会存在equals()相同，而hashCode不相同的情况，违反了不允许存储重复数据的集合类的规则。导致的问题是：
原本相同的对象，因为因为改写了equals()导致不相同，而存放了重复的数据；
原本不相同的两个对象，因为equals()改写后相同了，而导致数据覆盖。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- HashMap 基于数组、链表/红黑树实现，JDK 8 后冲突严重时可树化。
- 容量通常保持 2 的幂，便于用 (n-1)&hash 定位桶。
- HashMap 非线程安全。

### 面试官想考什么
- put/get、扩容、树化、哈希扰动。
- 并发下数据覆盖、可见性和结构破坏风险。

### 标准回答
HashMap 通过 hash 定位桶，桶内再用 equals 精确匹配。put 时可能触发扩容，元素会重新分布。它适合单线程或外部同步场景，多线程应使用 ConcurrentHashMap。

### 深挖追问
- 为什么容量是 2 的幂？
- 负载因子为什么默认 0.75？
- JDK 7 和 JDK 8 扩容有什么差异？

### 实战场景/代码示例
```java
Map<String,Integer> map=new HashMap<>(16);
map.put("id",1);
Integer v=map.get("id");
```

### 易错点/总结
- 重写 key 的 equals 必须重写 hashCode。
- 不要在并发写场景使用 HashMap。
- 可变对象做 key 风险很高。

