# Collection类的类关系是怎么样的？

Collection类的类关系是怎么样的？
一、概述
容器就是可以容纳其他对象的对象，并且 Java 容器只能存放对象，对于基本类型（int, long, float, double 等），需要将其包装成对象类型后才能放入容器。容器主要包括两种：
Collection：Collection 存储这对象的集合；
Map：Map 存储这键值对（两个对象）的映射关系。

二、Collection 的子类实现
List：有序的Collection，能精准控制每个元素的插入位置，常用的实现类有：
ArrayList：动态数组，实现了List接口，支持动态增长，支持随机查找，但增删性能一般；
LinkedList：双向链表，实现了List接口，支持快速的出入和删除，但随机查找时间复杂度O(n)；
Vector：通过synchronized实现线程安全，但影响性能，如果不需要线程安全使用ArrayList替代；每次扩容2倍；
Stack：主要用于栈操作，例如表达式求值，撤销操作实现等，现实开发中推荐使用ArrayQueue替代。

Set：不允许存在重复的元素，与List不同，Set中的元素是无序的，常用的实现类：
HashSet：基于HashMap实现，用于存储唯一元素；
LinkedHashSet：继承自HashSet，通过LinkedHashMap实现，使用双向链表维护元素的插入顺序；
TreeSet：通过TreeMap实现，保证插入后的元素集合仍然有序；

Queue：队列
PriorityQueue：优先队列，可以按照比较器或者元素的自然顺序进行排序；
ArrayDeque：高效的双端队列实现，支持队列和栈操作，比LinkedList更高效；
ConcurrentLinkedQueue：无界的非阻塞线程安全队列，基于CAS实现线程安全；
ArrayBlockingQueue：有界的阻塞队列，容量固定，适合生产者-消费者模式；
LinkedBlokingQueue：可选有界的阻塞队列，默认容量Integer.MAX_VALUE；

三、Map 的子类实现
Map：键值对集合，存储键、值和之间的映射，Key无序且唯一，value不要求有序，允许重复；Map没有继承Collection接口，主要实现有：
HashMap：基于哈希的Map实现，存储键值对，通过键值快速查找；JDK1.8之前HashMap由数组+链表组成，数组是HashMap的主体，链表则是为了解决哈希冲突而存在，JDK1.8之后在解决哈希冲突有了较大变化，当链表长度大于阈值（默认8）时，将链表转化为红黑树，减少搜索时间；
TreeMap：基于红黑树的有序Map集合，可以按照键的顺序进行排序；
LinkedHashMap：继承自HashMap，底层实现是在HashMap基础上，增加了一条双向链表，用于保持键值对的插入顺序；同时通过对链表进行相应操作，实现访问顺序相关逻辑；
HashTable：数组+链表实现，数组是HashTable的主体，链表则是为了解决哈希冲突而存在的；
ConcurrentHashMap：Node数组+链表+红黑树实现，线程安全（JDK1.8之前使用Segment锁，1.8之后使用volatile + CAS 或 Synchronized）
