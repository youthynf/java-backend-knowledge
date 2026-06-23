# final重排序规则详解

final重排序规则详解
写final域重排规则
写final域的重排规则禁止对final域的写与构造方法重排序，这个规则主要包含两个方面：
JMM禁止编译器把final域的写操作重排序到构造函数之外（不能把写操作独立于构造函数而后执行）;
编译器会在final域写之后，构造函数return之前，插入一个storestore内存屏障；

示例代码：

public class FinalDemo {
    private int a;  //普通域
    private final int b; //final域
    private static FinalDemo finalDemo;

    public FinalDemo() {
        a = 1; // 1. 写普通域
        b = 2; // 2. 写final域
    }

    public static void writer() {
        finalDemo = new FinalDemo();
    }

    public static void reader() {
        FinalDemo demo = finalDemo; // 3.读对象引用
        int a = demo.a;    //4.读普通域
        int b = demo.b;    //5.读final域
    }
}
线程A执行writer()方法，线程B执行reader()方法。根据重排规则，会禁止final修饰的变量b重排序到构造函数之外，也就是确保在对象引用为其他任意线程可见之前，对象的final域已经被正确初始化过了，因此线程B访问final域变量b拿到的是初始化后的值。而普通变量没有这个保障，访问到的引用，允许普通变量尚未完成初始化，因此线程B有可能拿到未被初始化的普通变量a。

读final域重排序规则
读final域重排序规则是指一个线程中，初次读对象引用和初次读该对象包含的final域，JMM会禁止这两个操作重排序。注意这个规则仅仅针对处理器，处理器会在读final域操作的前面插入一个LoadLoad屏障。

read()方法主要包含三个操作：
•  初次读引用变量finalDemo；
•  初次读引用变量finalDemo的普通域a；
•  初次读引用变量finalDemo的final域b；
对于普通域a的读取，可能会发生在读取对象引用finalDemo前面，这个操作显然是错误的，而final域的读操作就限定了在读取final变量前已经读到了该对象的引用，从而避免这种情况。也就是说：读final域的重排规则可以确保在读取一个对象的final域之前，一定会读取这个包含这个final域的对象的引用。

final域为引用类型
针对引用类型，final域写操作针对编译器和处理器重排序增加了这样的约束：在构造函数内对一个final修饰的对象的成员域的写入，与随后在构造函数之外把这个被构造的对象的引用赋给一个引用变量，这两个操作是不能被重排序的。也就是将构造完成的对象进行赋值之前，构造函数内的对final修饰的对象的成员域必须完成写入。

针对引用类型final域的读操作，JMM确保其他任意线程能看到访问对象的final域引用对象的成员域的写入，否则可能存在数据竞争问题。

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **final重排序规则详解**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

并发关键字要从 Java 内存模型（JMM）角度回答：它们分别解决可见性、有序性、原子性或互斥问题。`volatile` 更偏向可见性和禁止特定重排序，不保证复合操作原子性；`synchronized` 提供互斥和可见性；`final` 关注安全发布和初始化语义。回答时要区分“能保证什么”和“不能保证什么”。

## 深挖追问

- 可见性、原子性、有序性分别是什么？
- `volatile` 为什么不能替代锁？
- `synchronized` 的锁对象是什么？锁升级或优化大致解决什么问题？
- Happens-Before 规则如何帮助我们判断线程间可见性？

## 实战场景/代码示例

```java
class ConfigHolder {
    private volatile boolean initialized;

    void init() {
        // 初始化配置
        initialized = true; // 写 volatile，发布初始化完成信号
    }

    boolean ready() {
        return initialized; // 读 volatile，看到其他线程写入结果
    }
}
```

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

