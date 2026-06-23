# 一行代码优化掉1G内存

> 来源：[阿里云开发者 - 一行代码优化掉1G内存](https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247539469&idx=1&sn=ba583cf12dadae2de3b432e9c6763631&scene=21#wechat_redirect)

## 核心概念

- **String.intern()优化**：通过一行`str = str.intern()`代码，利用JVM字符串常量池去重，消除大量重复字符串对象的内存占用
- **字符串常量池（StringTable）**：JVM中存储字符串字面量和intern字符串的哈希表，Java 7+位于堆内存中
- **内存去重原理**：当多个String对象值相同时，intern()使它们指向常量池中同一个String实例，原对象可被GC回收
- **-XX:+UseStringDeduplication**：G1/ZGC提供的JVM级字符串自动去重选项，在GC时自动识别并去重String的底层byte[]数组
- **String去重与intern的区别**：intern去重整个String对象引用，UseStringDeduplication只去重底层byte[]数组，String对象本身不变

## 面试高频问题

1. **String.intern()如何节省内存？原理是什么？**
   - intern()检查常量池是否存在相同值的字符串，存在则返回池中引用，不存在则将当前字符串加入池中
   - 原来指向不同String对象的引用变为指向同一个对象，多余的String对象可被GC回收
   - 适合大量重复字符串值的数据集

2. **intern()有什么潜在问题？**
   - StringTable是全局哈希表，高并发下可能成为瓶颈
   - Java 6中StringTable在PermGen，过多intern可能导致PermGen OOM
   - Java 7+移到堆中，但StringTable大小仍有限，hash冲突增加时性能下降
   - 可以通过`-XX:StringTableSize`调整桶数量

3. **UseStringDeduplication和手动intern的区别？**
   - UseStringDeduplication是G1/ZGC在GC阶段自动去重，只替换底层byte[]引用，对应用透明
   - intern()需要开发者手动调用，去重整个String对象引用
   - UseStringDeduplication不需要修改代码，但只在GC时生效，有延迟

## 实战场景

- **大批量数据加载**：从数据库/文件加载上百万条记录，其中某些字段值大量重复（状态码、类别名、地区编码等）
- **缓存系统**：缓存Key字符串去重，减少内存占用
- **日志系统**：日志中的类名、方法名、日志级别等字符串大量重复

## 代码示例

```java
// 场景：加载1000万条用户数据，status字段只有5个不同值
// 但每条记录都创建了独立的String对象

// 优化前：每条记录的status字段都是新String对象
public class UserRecord {
    private String status; // "ACTIVE"/"INACTIVE"/"SUSPENDED"/"DELETED"/"PENDING"
    // 1000万条记录，5种值，但创建了1000万个String对象
    // 每个String约48 bytes = 约480MB仅status字段
}

// 优化后：一行代码
public class UserRecord {
    private String status;
    public void setStatus(String status) {
        this.status = status.intern(); // 一行代码优化！
        // 1000万条记录，5种值，intern后只保留5个String对象
        // 约 5 * 48 = 240 bytes，节省约480MB
    }
}
```

```java
// JVM级自动去重（无需修改代码）
// 启动参数：
// java -XX:+UseG1GC -XX:+UseStringDeduplication \
//      -XX:+PrintStringDeduplicationStatistics \
//      -jar app.jar

// 监控去重效果：
// jcmd <pid> GC.string_deduplication_statistics
```

```bash
# 调整StringTable大小
# 默认大小取决于内存，可通过-XX:StringTableSize指定桶数
# 建议设为数据量的2-4倍以减少hash冲突
java -XX:StringTableSize=2000003 -jar app.jar
```

## 延伸思考

- **何时选择intern vs UseStringDeduplication**：如果数据集明确有大量重复值且加载时就能确定，手动intern更及时；如果不确定或不想改代码，用JVM级去重
- **StringTable性能调优**：通过`jcmd <pid> VM.stringtable`查看StringTable使用情况，如果bucket占用率过高，增大StringTableSize
- **Compact Strings（JEP 254）**：Java 9引入，String底层从char[]改为byte[]+coder，Latin-1字符用1字节存储，本身就是一种内存优化
- **Valhalla项目的价值类型**：未来Java的value types可能让小对象不再有对象头开销，从语言层面解决内存膨胀问题

## 参考资料

- [原文 - 一行代码优化掉1G内存](https://mp.weixin.qq.com/s?__biz=MzIzOTU0NTQ0MA==&mid=2247539469&idx=1&sn=ba583cf12dadae2de3b432e9c6763631&scene=21#wechat_redirect)
- [JEP 254: Compact Strings](https://openjdk.org/jeps/254)
- [JEP 192: String Deduplication in G1](https://openjdk.org/jeps/192)

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **一行代码优化掉1G内存**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

回答时先明确概念边界，再结合 JVM 或并发体系说明原理，最后落到实际使用、监控和排查方法。对于和 JDK 版本、垃圾收集器实现相关的内容，要说明适用前提。

## 深挖追问

- 这个知识点解决什么问题？不使用它会有什么风险？
- 它和相近概念的区别是什么？
- 生产环境中如何验证它是否生效或是否成为瓶颈？

## 实战场景/代码示例

结合业务压测、日志、监控和 JVM 工具验证结论，不建议只凭经验调整参数或下判断。

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

