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
jps -l xxx.xxx.xx.xx # 远程查看
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
•  sc -df xxx: 输出当前类的详情,包括源码位置和classloader结构
•  trace class method: 打印出当前方法调用的耗时情况，细分到每个方法, 对排查方法性能时很有帮助。

3. Arthas
•  Arthas是基于Greys。

4. javOSize
•  classes：通过修改了字节码，改变了类的内容，即时生效。 所以可以做到快速的在某个地方打个日志看看输出，缺点是对代码的侵入性太大。但是如果自己知道自己在干嘛，的确是不错的玩意儿。
•  其他功能Greys和btrace都能很轻易做的到，不说了。

JProfiler
之前判断许多问题要通过JProfiler，但是现在Greys和btrace基本都能搞定了。再加上出问题的基本上都是生产环境(网络隔离)，所以基本不怎么使用了，但是还是要标记一下。

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **Java问题排查工具有哪些？**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

JVM 排查题要先稳定现场，再定位范围：CPU、内存、线程、GC、IO 或外部依赖。回答时要给出工具链和判断依据，例如 `top`/`jstack` 定位高 CPU 线程，`jmap`/堆转储分析内存，GC 日志判断停顿来源，最后给出修复和复盘措施。

## 深挖追问

- CPU 飙高时如何把 OS 线程 id 对应到 Java 线程栈？
- OOM 后如何区分堆溢出、元空间、直接内存、线程数过多？
- 线上抓取 dump 有什么风险，如何降低对服务的影响？
- 调参前后如何验证收益，避免只凭感觉修改参数？

## 实战场景/代码示例

```bash
jcmd <pid> Thread.print > thread-dump.txt
jcmd <pid> GC.heap_dump /tmp/heap.hprof
jcmd <pid> VM.native_memory summary   # 需提前开启 NMT 才有完整信息
```

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

