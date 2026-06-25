# Java问题排查工具有哪些？

Java问题排查工具有哪些？
一、Java调试入门工具
•  jps
jps是jdk提供的一个查看当前java进程的小工具， 可以看做是JavaVirtual Machine Process Status Tool的缩写。

jps # 显示进程的ID 和 类的名称
jps –l # 输出输出完全的包名，应用主类名，jar的完全路径名 
jps –v # 输出jvm参数
jps –q # 显示java进程号
jps -m # main 方法
jps -l Java问题排查工具有哪些.Java问题排查工具有哪些.xx.xx # 远程查看
java程序在启动以后，会在java.io.tmpdir指定的目录下，就是临时文件夹里，生成一个类似于hsperfdata_User的文件夹，这个文件夹里（在Linux中为/tmp/hsperfdata_{userName}/），有几个文件，名字就是java进程的pid，因此列出当前运行的java进程，只是把这个目录里的文件名列一下而已。 至于系统的参数什么，就可以解析这几个文件获得。
•  jstack
jstack是jdk自带的线程堆栈分析工具，使用该命令可以查看或导出 Java 应用程序中线程堆栈信息。

# 基本
jstack 2815

# java和native c/c++框架的所有栈信息
jstack -m 2815

# 额外的锁信息列表，查看是否死锁
jstack -l 2815

•  jinfo
jinfo 是 JDK 自带的命令，可以用来查看正在运行的 java 应用程序的扩展参数，包括Java System属性和JVM命令行参数；也可以动态的修改正在运行的 JVM 一些参数。当系统崩溃时，jinfo可以从core文件里面知道崩溃的Java应用程序的配置信息。

# 输出当前 jvm 进程的全部参数和系统属性
jinfo 2815

# 输出所有的参数
jinfo -flags 2815

# 查看指定的 jvm 参数的值
jinfo -flag PrintGC 2815

# 开启/关闭指定的JVM参数
jinfo -flag +PrintGC 2815

# 设置flag的参数
jinfo -flag name=value 2815

# 输出当前 jvm 进行的全部的系统属性
jinfo -sysprops 2815

•  jmap
命令jmap是一个多功能的命令。它可以生成 java 程序的 dump 文件， 也可以查看堆内对象示例的统计信息、查看 ClassLoader 的信息以及 finalizer 队列。

# 查看堆的情况
jmap -heap 2815

# dump
jmap -dump:live,format=b,file=/tmp/heap2.bin 2815
jmap -dump:format=b,file=/tmp/heap3.bin 2815

# 查看堆的占用
jmap -histo 2815 | head -10

•  jstat

jstat -gcutil 2815 1000

二、Java调试进阶工具
brace
•  查看当前谁调用了ArrayList的add方法，同时只打印当前ArrayList的size大于500的线程调用栈

@OnMethod(clazz = "java.util.ArrayList", method="add", location = @Location(value = Kind.CALL, clazz = "/./", method = "/./"))
public static void m(@ProbeClassName String probeClass, @ProbeMethodName String probeMethod, @TargetInstance Object instance, @TargetMethodOrField String method) {

    if(getInt(field("java.util.ArrayList", "size"), instance) > 479){
        println("check who ArrayList.add method:" + probeClass + "#" + probeMethod  + ", method:" + method + ", size:" + getInt(field("java.util.ArrayList", "size"), instance));
        jstack();
        println();
        println("===========================");
        println();
    }
}
•  监控当前服务方法被调用时返回的值以及请求的参数

@OnMethod(clazz = "com.taobao.sellerhome.transfer.biz.impl.C2CApplyerServiceImpl", method="nav", location = @Location(value = Kind.RETURN))
public static void mt(long userId, int current, int relation, String check, String redirectUrl, @Return AnyType result) {

    println("parameter# userId:" + userId + ", current:" + current + ", relation:" + relation + ", check:" + check + ", redirectUrl:" + redirectUrl + ", result:" + result);
}
注意:
•  经过观察，1.3.9的release输出不稳定，要多触发几次才能看到正确的结果
•  正则表达式匹配trace类时范围一定要控制，否则极有可能出现跑满CPU导致应用卡死的情况
•  由于是字节码注入的原理，想要应用恢复到正常情况，需要重启应用。

2. Greys
•  sc -df Java问题排查工具有哪些: 输出当前类的详情,包括源码位置和classloader结构
•  trace class method: 打印出当前方法调用的耗时情况，细分到每个方法, 对排查方法性能时很有帮助。

3. Arthas
•  Arthas是基于Greys。

4. javOSize
•  classes：通过修改了字节码，改变了类的内容，即时生效。 所以可以做到快速的在某个地方打个日志看看输出，缺点是对代码的侵入性太大。但是如果自己知道自己在干嘛，的确是不错的玩意儿。
•  其他功能Greys和btrace都能很轻易做的到，不说了。

JProfiler
之前判断许多问题要通过JProfiler，但是现在Greys和btrace基本都能搞定了。再加上出问题的基本上都是生产环境(网络隔离)，所以基本不怎么使用了，但是还是要标记一下。

## 面试总结

围绕「Java问题排查工具有哪些？」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

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
## 核心概念
Java问题排查工具有哪些？ 可以放在“JVM 运行时能力”这条主线里理解。复习时不要只背结论，要先说明它解决的核心问题，再解释关键机制、适用边界和代价。围绕这个知识点，重点关注：内存区域、对象生命周期、GC Roots、垃圾回收器、类加载、JIT、参数调优和故障定位。如果面试官继续追问，通常会从“为什么这样设计、在什么场景会失效、线上如何排查”三个方向展开。

## 面试回答与追问
- **标准回答**：先给出 Java问题排查工具有哪些？ 的定位，再说明它依赖的核心原理，最后结合业务场景说明如何使用。回答时要把“能解决什么问题”和“会带来什么成本”一起讲清楚。
- **常见追问**：如果数据量、并发量或调用链路继续放大，Java问题排查工具有哪些？ 的瓶颈会出现在哪里？如何观测、如何优化、如何回滚？
- **易错点**：不要把概念和具体实现混在一起，也不要只说 API 名称。面试中更重要的是说清楚边界条件、失败场景和取舍依据。

## 实战场景与排查
典型落地场景包括：服务出现 OOM、Full GC 频繁、启动慢、类冲突或延迟抖动时的定位与优化。实际处理线上问题时，可以按“现象确认 → 指标采集 → 假设验证 → 小步修复 → 复盘沉淀”的路径推进。先看日志、监控、链路追踪和核心指标，再判断是容量问题、配置问题、代码路径问题，还是外部依赖抖动。

## 总结
复习 Java问题排查工具有哪些？ 时，建议把它和相邻知识点放在一起比较：相同点是什么、区别在哪里、为什么当前场景选择它而不是替代方案。能讲清楚这些内容，才算真正掌握。
