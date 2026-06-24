# Java 的数据类型与大小

## 核心概念

Java 的数据类型可以分为两大类：基本数据类型和引用数据类型。

- **基本数据类型**：直接保存值，包括整数、浮点数、字符和布尔类型。
- **引用数据类型**：保存对象引用，例如类、接口、数组、枚举等。

Java 一共有 8 种基本数据类型。

## 基本数据类型大小

| 类型 | 位数 | 字节数 | 默认值 | 说明 |
|---|---:|---:|---|---|
| `boolean` | JVM 规范未强制固定 | JVM 实现相关 | `false` | 表示 true/false |
| `byte` | 8 bit | 1 字节 | `0` | 有符号整数 |
| `char` | 16 bit | 2 字节 | `'\u0000'` | Unicode 字符 |
| `short` | 16 bit | 2 字节 | `0` | 有符号整数 |
| `int` | 32 bit | 4 字节 | `0` | 常用整数类型 |
| `float` | 32 bit | 4 字节 | `0.0f` | 单精度浮点数 |
| `long` | 64 bit | 8 字节 | `0L` | 长整数 |
| `double` | 64 bit | 8 字节 | `0.0d` | 双精度浮点数 |

> 注意：`boolean` 在 Java 语言层面只表示 `true` 和 `false`，JVM 规范没有强制规定它必须占 1 bit。实际存储大小依赖 JVM 实现和具体场景。

## 基本类型与包装类型

每个基本类型都有对应的包装类型。

| 基本类型 | 包装类型 |
|---|---|
| `boolean` | `Boolean` |
| `byte` | `Byte` |
| `char` | `Character` |
| `short` | `Short` |
| `int` | `Integer` |
| `float` | `Float` |
| `long` | `Long` |
| `double` | `Double` |

基本类型和包装类型之间的赋值可以通过自动装箱和自动拆箱完成。

```java
Integer value = 10; // 自动装箱：int -> Integer
int num = value;    // 自动拆箱：Integer -> int
```

## 常见注意点

### 包装类型可能为 null

基本类型有默认值，包装类型是对象，可能为 `null`。如果对 `null` 包装对象自动拆箱，会抛出 `NullPointerException`。

```java
Integer value = null;
// int num = value; // NullPointerException
```

### 金额计算不要用浮点数

`float` 和 `double` 使用二进制浮点表示，不能精确表示很多十进制小数。金额计算应该优先使用 `BigDecimal`。

```java
System.out.println(0.1 + 0.2); // 0.30000000000000004
```

### `char` 可以表示中文字符吗

`char` 是 16 位 Unicode 字符，可以表示一部分常见中文字符。但对于 Unicode 补充字符，一个 `char` 不一定够，需要使用代理对或按 code point 处理。

## 总结

- Java 有 8 种基本数据类型。
- 整数常用 `int`，长整数用 `long`；小数默认是 `double`。
- 基本类型保存值，包装类型是对象。
- 包装类型适合泛型、集合、反射等需要对象语义的场景。

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

