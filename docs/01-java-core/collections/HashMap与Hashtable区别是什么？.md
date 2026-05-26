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
