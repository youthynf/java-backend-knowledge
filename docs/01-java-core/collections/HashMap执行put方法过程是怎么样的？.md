# HashMap执行put方法过程是怎么样的？

HashMap执行put方法过程是怎么样的？
计算key的哈希值：调用 hash(key) 计算 key 的哈希值，不是直接使用 key 的 hashCode()，而是会进行二次处理：

// 将 hashCode 的高16位与低16位异或（减少哈希冲突）
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}

定位数组索引（桶位置）：使用 (数组长度-1) & hash 代替取模运算（效率更高）

i = (n - 1) & hash  // n是数组长度

处理数组槽位的多种可能情况
3.1 桶为空（没有元素）：直接创建新节点放入该位置，并将HashMap的修改次数modCount加1，以便在进行迭代时发现并发修改。

if ((p = tab[i]) == null)
    tab[i] = newNode(hash, key, value, null);
3.2 桶不为空（存在元素）
第一个节点匹配：检查第一个节点的 key 是否相同（先比较哈希值，再用 equals），相同则覆盖

if (p.hash == hash && 
    ((k = p.key) == key || (key != null && key.equals(k))))
    e = p;
红黑树节点：如果是树节点，调用红黑树的插入方法，在红黑树中使用哈希码和equals()方法进行查找，根据键的哈希码定位到红黑树中的某个节点，然后逐个比较键，直到找到相同的键或达到红黑树的末尾，如果找到则更新值，否则将新的键值对添加到红黑树；

else if (p instanceof TreeNode)
    e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
链表遍历：遍历链表查找 key，找不到则在链表尾部插入新节点（JDK 1.7及之前采用头插法），链表长度≥8时尝试树化（前提是数组长度≥64）

for (int binCount = 0; ; ++binCount) {
    if ((e = p.next) == null) {
        p.next = newNode(hash, key, value, null);
        if (binCount >= TREEIFY_THRESHOLD - 1) // -1 for 1st
            treeifyBin(tab, hash);
        break;
    }
    if (e.hash == hash &&
        ((k = e.key) == key || (key != null && key.equals(k))))
        break;
    p = e;
}

扩容检查：检查当前容量size是否超过阈值【当前容量×负载因子】，超过则需要进行扩容操作：

if (++size > threshold)
    resize();

扩容操作：
创建一个新的2倍大小的数组；
将旧数组中的键值对重新哈希到新的数组中；
更新HashMap的数组引用和阈值参数；

6.完成添加操作

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

