# Happens-Before原则是什么？

Happens-Before原则是什么？
一、概述
Happens-Before是Java内存模型（JMM）的核心概念，用于定义多线程环境中操作的可见性和执行顺序。它定义的是操作间的可见性规则，而非时间顺序。它并非描述实际的时间顺序，而是规定前一个操作的结果对后一个操作可见的逻辑关系，从而避免指令重排序和内存可见性问题。

二、解决的问题
在多线程中，由于CPU缓存和指令重排序等优化，线程可能看不到其他线程修改的数据，导致程序行为不符合预期。Happens-Before原则就是提供一组规则，开发者只需要按照这些规则编写代码，而无需关心底层的内存访问细节，JVM和CPU缓存和重排序优化都必须遵守Happens-Before规则，进而解决指令重排序和内存可见性导致的并发问题。

三、六项基本规则
程序顺序规则：同一线程中的操作，书写在前面的操作Happens-Before后面的操作；
锁规则：解锁操作Happens-Before后续的加锁操作；
volatile变量规则：对volatile变量的写操作Happens-Before后续对该变量的读操作；
线程启动规则：Thread.start() Happens-Before新线程的任何操作；
线程终止规则：线程中的所有操作Happens-Before其他线程检测到线程终止（如join()）；
传递性规则：若A Happens-Before B，且B Happens-Before C，则A Happens-Before C。

四、如何满足规则
使用同步机制（锁、volatile、线程操作等）建立Happens-Before关系。
