# HashMap与Hashtable区别是什么？

HashMap与Hashtable区别是什么？
线程安全性：
Hashgable：线程安全，所有方法都是通过synchronized修饰，每次操作都需要加锁，性能较低；
HashMap：线程不安全，不支持多线程环境，必须通过外部工具Collections.synchronizedMap包装或使用ConcurrentHashMap来实现线程安全；

性能：
Hashtable：因为是线程安全，每次都需要加锁，性能较低，不推荐使用；
HashMap：性能优于Hashtable，因为不是线程安全，没有性能开销；

空值支持：
Hashtable：不允许null键或null值，如果尝试插入会抛出NullPointerException；
HashMap：允许一个null键和多个null值；

初始容量和负载因子：
Hashtable：初始容量是11，负载因子是0.75，扩容方式是变为原来的2n+1，通过 hash % capacity 计算索引值；
HashMap：初始容量是12，负载因子是0.75，扩容方式是2的n次方，扩容是容量翻倍，索引通过 hash & （capacity - 1）计算；

底层实现：
Hashtable：底层使用【数组+链表】，当哈希冲突严重时，性能显著下降；
HashMap：JDK1.8之后，底层使用【数组+链表+红黑树】，当链表长度大于阈值（默认8）后，且数组容量大于等于64，则链表转化为红黑树，提升查询性能；

迭代器：
Hashtable：没有使用fail-fast迭代器，在并发修改是不会抛出异常，但可能导致不一致行为；
HashMap：使用了fail-fast迭代器，如果在迭代过程中，有其他线程修改了HashMap的结构，则会抛出ConcurrentModificaionException异常；

设计时间：
Hashtable：引入于JDK1.0，设计较早，属于java.util包的一部分；
HashMap：引入于JDK1.2，属于java.util包的一部分，是Hashtable的改进版；

替代性：
Hashtable：虽然使用域简单的多线程场景，但推荐使用ConcurrentHashMap代替；
HashMap：推荐使用与单线程场景首选；

扩展问题：
为什么二者扩容倍数不一样？
Hashtable设计比较早，主要强调线程安全性，而非高效性，而HashMap则是Hashtable的改进版本，设计上吸取了Hashtable的一些局限性，并针对性优化，使用2的n次方容量和位运算，提高了效率并减少了哈希冲突。

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

---

<!-- interview-detail-2026-06-24 -->

## 面试版详细讲解补充

### 核心概念
- HashMap与Hashtable区别是什么？ 的核心是理解集合的数据结构、复杂度、线程安全边界以及与 equals/hashCode/扩容策略的关系。
- 复习时不要只记一句结论，要把“定义、底层原因、使用边界、工程取舍”串起来。

### 面试官想考什么
- 面试通常考底层结构、扩容/并发问题、为什么这样设计，以及在业务中如何选型。
- 能否把该知识点和常见线上问题、代码设计、性能/并发/可维护性联系起来。

### 标准回答
回答 HashMap与Hashtable区别是什么？ 时，先说明适用场景，再讲底层机制和关键参数，最后补充并发环境下的替代方案。集合类默认多数不是线程安全的，需要根据读写比例选择 synchronized 包装、并发容器或不可变集合。

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

