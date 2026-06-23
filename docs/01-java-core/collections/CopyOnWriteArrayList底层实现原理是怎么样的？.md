# CopyOnWriteArrayList底层实现原理是怎么样的？

CopyOnWriteArrayList底层实现原理是怎么样的？
CopyOnWriteArrayList写时复制列表，基本原理：
1. 底层使用的是通过volatile进行修饰的数组，保证当前线程对数组对象的修改，其他线程能及时感知；
2. 当操作数据写入时：
2.1 先申请一个ReentranceLock，确保同一时间只有一个线程操作；
2.2 获取当前数组长度length；
2.3 拷贝一个length+1的新数组；
2.4 将需要写入的元素放到新数组length下标中；
2.5 将原本指向旧数组的数据对象指针指向新数组；
2.6 释放ReentranceLock；
至此，写时复制列表的写入过程结束。
注意：CopyOnWriteArrayList读取数据时不需要加锁。

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

