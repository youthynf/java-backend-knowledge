# 多线程下HashMap会有什么问题？

多线程下HashMap会有什么问题？
1.JDK1.7 之前，并发扩容会导致Entry链死循环问题；
2.并发执行put()方法，可能存在并发线程都认为当前位置没有值，而先后进行赋值操作，导致的数据覆盖问题；

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

