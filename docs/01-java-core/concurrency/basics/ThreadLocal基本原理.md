# ThreadLocal基本原理

ThreadLocal基本原理
什么是ThreadLocal，用来解决什么问题
ThreadLocal是Java中用于实现线程局部变量的类，每个类可以访问自己的变量副本，避免多线程竞争。其核心思想是通过线程隔离数据，解决共享变量的线程安全问题。

ThreadLocal底层实现机制
每个线程（Thread类）内部维护一个ThreadLocalMap类型的实例。ThreaLocalMap 类是 ThreadLocal 的一个静态内部类，它没有实现 Map 接口，只有 private 方法和 default 构造方法，它内部定义了一个 Entry 静态内部类继承了 WeakReference<ThreadLocal<?>>，key为ThreadLocal实例的弱引用，value为线程局部变量的实际值。使用Entry数组来存储不同ThreadLocal实例变量副本，并没有使用链表。哈希函数是基于 ThreadLocal 的threadLocalHashCode，通过黄金分割数（0x61c88647）散列，key.threadLocalHashCode & (len-1)。当发生哈希冲突时，采用的是开放地址法（线性探测），而不是链地址法。

内存泄露问题与解决
3.1 内存泄漏原因：
ThreadLocalMap的键（key）是ThreadLocal实例的弱引用，一旦ThreadLocal实例被设置为null时，键会被GC回收，但是值（value）仍被强引用。若线程长期存活（如线程池的线程），ThreadLocalMap中未被清理的条目会导致无法回收，从而导致内存泄漏。
3.2 解决方法：
a. 显式调用 remove() 清理不再使用的条目，其原理是找到对应的entry将reference置null，然后将value也置null，同时将entry数组对应的下标位置置null；
b. 尽量使用 static 修饰 ThreadLocal 实例，减少实例数量，避免频繁创建；
c. 短生命周期的任务尽量减少使用 ThreadLocal，避免线程池滥用。 
ThreadLocal应用场景：
a. 数据库管理链接：每个线程独立管理，避免事务混乱；
b. 线程上下文传递：比如异步任务传递上下文信息；
c. 用户 session 存储：web 框架中保存每个用户的请求信息。
