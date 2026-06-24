# Java线程Dump如何分析？

Java线程Dump如何分析？
一、Thread Dump概述
Thread Dump是非常有用的诊断Java应用问题的工具。每一个Java虚拟机都有及时生成所有线程在某一点状态的thread-dump的能力，虽然各个 Java虚拟机打印的thread dump略有不同，但是 大多都提供了当前活动线程的快照，及JVM中所有Java线程的堆栈跟踪信息，堆栈信息一般包含完整的类名及所执行的方法，如果可能的话还有源代码的行数。
二、Thread Dump特点
•  能在各种操作系统下使用；
•  能在各种Java应用服务器下使用；
•  能在生产环境下使用而不影响系统的性能；
•  能将问题直接定位到应用程序的代码行上；

三、Thread Dump抓取
一般当服务器挂起，崩溃或者性能低下时，就需要抓取服务器的线程堆栈（Thread Dump）用于后续的分析。在实际运行中，往往一次 dump的信息，还不足以确认问题。为了反映线程状态的动态变化，需要接连多次做thread dump，每次间隔10-20s，建议至少产生三次 dump信息，如果每次 dump都指向同一个问题，我们才确定问题的典型性。
•  操作系统命令获取ThreadDump

ps –ef | grep java
kill -3 <pid>

•  JVM自带工具获取线程堆栈

jps 或 ps –ef | grep java
jstack [-l ] <pid> | tee -a jstack.log

四、Thread Dump分析
Thread Dump信息
•  头部信息：时间、JVM信息

2011-11-02 19:05:06  
Full thread dump Java HotSpot(TM) Server VM (16.3-b01 mixed mode):
•  线程INFO信息块：

1. "Timer-0" daemon prio=10 tid=0xac190c00 nid=0xaef in Object.wait() [0xae77d000] 
# 线程名称：Timer-0；
# 线程类型：daemon；
# 优先级: prio=10，默认是5；
# JVM线程id：tid=0xac190c00，JVM内部线程的唯一标识（通过java.lang.Thread.getId()获取，通常用自增方式实现）
# 对应系统线程id（NativeThread ID）：nid=0xaef，和top命令查看的线程pid对应，不过pid是10进制，nid是16进制。（top -H -p pid，可以查看该进程的所有线程信息）
# 线程状态：in Object.wait()；
# 起始栈地址：[0xae77d000]，对象的内存地址，通过JVM内存查看工具，能够看出线程是在哪儿个对象上等待；
2.  java.lang.Thread.State: TIMED_WAITING (on object monitor)
3.  at java.lang.Object.wait(Native Method)
4.  -waiting on <0xb3885f60> (a java.util.TaskQueue)     # 继续wait 
5.  at java.util.TimerThread.mainLoop(Timer.java:509)
6.  -locked <0xb3885f60> (a java.util.TaskQueue)         # 已经locked
7.  at java.util.TimerThread.run(Timer.java:462)
Java thread statck trace：是上面2-7行的信息。到目前为止这是最重要的数据，Java stack trace提供了大部分信息来精确定位问题根源。
•  Java thread stack trace详解：
堆栈信息应该你想解读，程序先执行第7行，然后是第6行，以此类推。
线程状态分析
线程的状态是一个很重要的东西，因此thread dump中会显示这些状态，通过对这些状态的分析，能够得出线程的运行状况，进而发现可能存在的问题。线程的状态在Thread.State这个枚举类型中定义。
•  NEW：
每一个线程，在堆内存中都有一个对应的Thread对象。Thread t = new Thread();当刚刚在堆内存中创建Thread对象，还没有调用t.start()方法之前，线程就处在NEW状态。在这个状态上，线程与普通的java对象没有什么区别，就仅仅是一个堆内存中的对象。
•  RUNNABLE：
该状态表示线程具备所有运行条件，在运行队列中准备操作系统的调度，或者正在运行。 这个状态的线程比较正常，但如果线程长时间停留在在这个状态就不正常了，这说明线程运行的时间很长（存在性能问题），或者是线程一直得不得执行的机会（存在线程饥饿的问题）。
•  BLOCKED：
线程正在等待获取java对象的监视器(也叫内置锁)，即线程正在等待进入由synchronized保护的方法或者代码块。synchronized用来保证原子性，任意时刻最多只能由一个线程进入该临界区域，其他线程只能排队等待。
•  WAITING：
处在该线程的状态，正在等待某个事件的发生，只有特定的条件满足，才能获得执行机会。而产生这个特定的事件，通常都是另一个线程。也就是说，如果不发生特定的事件，那么处在该状态的线程一直等待，不能获取执行的机会。比如：A线程调用了obj对象的obj.wait()方法，如果没有线程调用obj.notify或obj.notifyAll，那么A线程就没有办法恢复运行； 如果A线程调用了LockSupport.park()，没有别的线程调用LockSupport.unpark(A)，那么A没有办法恢复运行。 
•  TIMED_WAITING：
J.U.C中很多与线程相关类，都提供了限时版本和不限时版本的API。TIMED_WAITING意味着线程调用了限时版本的API，正在等待时间流逝。当等待时间过去后，线程一样可以恢复运行。如果线程进入了WAITING状态，一定要特定的事件发生才能恢复运行；而处在TIMED_WAITING的线程，如果特定的事件发生或者是时间流逝完毕，都会恢复运行。
•  TERMINATED：
线程执行完毕，执行完run方法正常返回，或者抛出了运行时异常而结束，线程都会停留在这个状态。这个时候线程只剩下Thread对象了，没有什么用了。

## 面试总结

围绕「Java线程Dump如何分析？」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

### 核心回答

1. JVM 排障要先保现场，再定位资源维度：CPU、内存、GC、线程、IO。
2. 常见链路是 top/pidstat 找进程，jstack/jcmd/Arthas 定线程和方法，GC 日志/MAT 定内存问题。
3. 排障结论必须落到代码热点、配置问题或外部依赖，而不是停留在工具输出。

### 高频追问

- CPU 高为什么不应第一步直接看业务日志？
- 如何把 Linux 线程 id 转成 jstack 中的 nid？
- 如何区分死锁、阻塞、等待 IO 和无限循环？

### 实战落地

- **排查类问题**：先收集监控、日志和 JVM 现场信息，再用工具验证假设，避免凭经验改参数。
- **调优类问题**：先明确目标是降低停顿、提升吞吐还是减少内存，再选择收集器、堆大小和业务代码优化。
- **面试表达**：用“现象 → 原理 → 工具验证 → 解决方案 → 风险边界”的链路回答。

### 易错点

- 先保存现场快照再重启。
- 采样要多次，不要根据一次 jstack 下结论。
