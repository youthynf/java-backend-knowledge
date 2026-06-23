# Java的数据类型与大小

Java的数据类型与大小
boolean，1bit
byte，8bit
char，16bit
short，16bit
int，32bit
float，32bit
long，64bit
double，64bit
基本类型都有对应的包装类型，基本类型与其对应的包装类型之间的赋值使用自动装箱与拆箱完成。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- Java 有 8 种基本类型，包装类型用于对象语义、集合和泛型。
- 装箱通常调用 valueOf，Integer 默认缓存 -128~127；拆箱调用 xxxValue。

### 面试官想考什么
- 基本类型大小、默认值和包装类型区别。
- 包装类型 ==、equals、缓存和 NPE 风险。

### 标准回答
基本类型直接保存值，包装类型是对象。自动装箱/拆箱提升编码便利性，但比较时要区分引用相等和值相等；包装对象可能为 null，拆箱会抛出 NullPointerException。

### 深挖追问
- 为什么集合不能直接存 int？
- Integer 127 和 128 的 == 为什么不同？
- char 能不能存中文？

### 实战场景/代码示例
```java
Integer a=127,b=127,c=128,d=128;
System.out.println(a==b); // 通常 true
System.out.println(c==d); // 通常 false
```

### 易错点/总结
- 业务比较不要依赖包装类型 ==。
- 金额不要用 float/double，优先 BigDecimal。

