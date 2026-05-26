# 底层数据结构-listpack

底层数据结构-listpack
quicklist虽然通过控制quicklistNode结构的压缩列表大小或者元素个数，来减少连锁更新带来的性能影响，但是并没有完全解决连锁更新的问题。Redis5.0设计了一个新的数据结构叫listpack，目的是替代压缩列表，最大特点是每个节点不再包含前一个节点的长度了。

listpack结构：
listpack总字节数：记录lispack总的字节数大小；
listpack总元素数量：记录listpack中所有元素数量总和；
listpack entry：主要包含三个方面内容，依次是encoding（定义该元素的编码类型，会对不同长度的整数和字符串进行编码）、data（实际存放的数据）、len（encoding+data的总长度）；
listpack结尾标识：lispack最后结尾标识；

listpack 节点没有像压缩列表那样记录前一个节点长度的字段了，listpack 节点只记录当前节点的长度，当我们向 listpack 加入新元素的时候，不会影响其他节点的长度字段的变化，从而避免了压缩链表的连锁更新问题。

如何从后往前遍历：
可以从当前列表项起始位置的指针开始，向左逐个字节解析，得到前一项的 entry-len 值，从而计算出前一项的地址。（所以其实len放在entry末尾是有伏笔的）
