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
