# ArrayList线程安全吗？

ArrayList线程安全吗？
ArrayList添加元素的步骤：
判断加入当前元素个数（size+1）后数组是否需要扩容，如果需要则调用grow()方法进行扩容；
将新添加的元素加入到size下标位置；
执行size++操作；

线程不安全体现在哪里？
部分值为null：并发线程拿到size相同，同时完成赋值，但size++被先后执行，size比实际大；
索引越界异常：并发线程拿到size相同，刚好是数组最后一个元素下标，线程A完成赋值并size++后，线程B才开始执行赋值，此时size值触发索引越界，size统计正常；
size与我们add的数量不符：并发线程拿到size相同，同时执行size++，该操作不是原子操作，先拿到size值，然后进行size+1，最后将新值复制给size。若两个拿到的size一样，计算出来的新值相同，则会导致size被覆盖，size比实际小。

如何实现ArrayList线程安全？
使用Collections.synchronizedList(arrayList)包装；
使用new CopyOnWriteArrayList(arrayList)包装；
使用Vector类替代ArrayList：new Vector(arrayList);
助记：线程不安全体现： 1.部分为null：拿到size相同，同时完成赋值，但size++被先后执行； 2.索引越界异常：拿到size相同，刚好是数组最后一个元素下标，赋值和size++先后执行； 3.size与add的数量不符：拿到size相同，同时完成赋值，执行size++并发，由于非原子性，导致size覆盖写；

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

