# ArrayList扩容机制是怎么样的？

ArrayList扩容机制是怎么样的？
扩容条件： 
当往ArrayList添加元素时，会校验当前列表元素长度加 1 后是否大于当前列表长度 size ，大于则触发扩容。

扩容步骤：
1、计算新列表长度：一般是原长度的1.5倍，校验是否超出最大整型长度；
2、创建新的数组：根据新的长度创建一个全新的数组；
3、元素复制：将原数组中的元素逐个复制到新数组中；
4、将ArrayList内部的数据引用指向新数组；

为什么是1.5倍？
主要是为了可以方便通过位运算的方式计算出新数组的长度，减少浮点运算和运算时间及运算次数：

int newCapacity = oldCapacity + (oldCapacity >> 1)

为什么建议初始化ArrayList时最好指定长度？
如果初始化不指定，默认初始化一个长度为0的空数组，当插入一个元素时就需要进行一次扩容，默认初始长度是10。初始化根据预估的数据量，指定列表的初始长度，可以有效避免频繁的扩容。

TIPS：
Vector扩容为2倍，ArrayList则是1.5倍。
助记：ArrayList默认10，超出容量时，扩容1.5倍；vector扩容2倍。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- ArrayList 底层是动态数组，支持快速随机访问。
- 扩容会创建新数组并复制元素；非线程安全。

### 面试官想考什么
- 扩容机制、时间复杂度、线程安全。
- ArrayList 与 LinkedList/Vector 区别。

### 标准回答
ArrayList 适合读多写少、按下标访问的场景。尾部追加均摊 O(1)，中间插入/删除需要移动元素。多线程修改要外部同步或使用并发集合。

### 深挖追问
- 默认容量和首次扩容？
- 为什么随机访问快？
- fail-fast 是什么？

### 实战场景/代码示例
```java
List<String> list=new ArrayList<>(100);
list.add("A");
String first=list.get(0);
```

### 易错点/总结
- 预估大小可减少扩容成本。
- 迭代时结构性修改会触发 ConcurrentModificationException。

