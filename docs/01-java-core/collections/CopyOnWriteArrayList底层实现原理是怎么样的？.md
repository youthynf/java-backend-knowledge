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
