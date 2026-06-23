# HashMap的大小总是2的n次方原因是什么？

HashMap的大小总是2的n次方原因是什么？
1. 高效定位桶：
可以通过按位与的方式快速算出数组桶的下标值，比求余方式性能高：

index = ( hash & （n-1）)

2.减少哈希冲突：
当长度为2的幂时，(n-1)的二进制是全1（如15=1111），这使得：
hash值的所有位都参与运算
减少哈希冲突的概率
元素分布更均匀

3. 高效扩容：
扩容时(通常是2倍)，元素的新位置只有两种可能：
保持原索引位置
原索引+旧容量位置

// JDK8扩容时的重新哈希计算：
if ((e.hash & oldCap) == 0) {  // 判断高位bit
    // 保持原索引
} else {
    // 新索引 = 原索引 + oldCap
}
这种设计使得不需要重新计算每个元素的hash，只需检查hash值的某一位即可确定新位置。
潜在问题与解决：
问题：如果key的hashCode实现不好，低位规律性强，仍会导致冲突
解决方案：HashMap已经通过hash()方法将高位参与运算：

static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
助记：将HashMap的大小设计为2的n次方，主要是为了： 高效计算桶索引； 减少哈希冲突； 优化扩容过程的性能。

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

