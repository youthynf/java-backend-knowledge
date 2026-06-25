# Java 基本类型

## 核心概念

Java 是强类型语言，基本类型（Primitive Types）是语言内建的、不通过对象表示的数据类型。共有 **8 种基本类型**，分为四大类：

| 类别 | 类型 | 大小 | 范围 | 默认值 |
|------|------|------|------|--------|
| **整型** | `byte` | 1 字节 | -128 ~ 127 | 0 |
| | `short` | 2 字节 | -32768 ~ 32767 | 0 |
| | `int` | 4 字节 | -2³¹ ~ 2³¹-1 | 0 |
| | `long` | 8 字节 | -2⁶³ ~ 2⁶³-1 | 0L |
| **浮点** | `float` | 4 字节 | ±3.4E38（6~7位有效） | 0.0f |
| | `double` | 8 字节 | ±1.8E308（15位有效） | 0.0d |
| **字符** | `char` | 2 字节 | 0 ~ 65535（Unicode） | '\u0000' |
| **布尔** | `boolean` | JVM决定 | true / false | false |

## 面试高频问题

### 1. 为什么基本类型不是对象？

- **性能**：基本类型直接存储值，无需对象头（16字节开销）和引用间接访问
- **简洁**：`int a = 1` 比 `Integer a = new Integer(1)` 简洁直观
- **历史**：Java 从 C/C++ 继承了基本类型，兼顾性能和习惯

### 2. 自动装箱（Autoboxing）和拆箱（Unboxing）

```java
// 自动装箱：基本类型 → 包装类
Integer obj = 100;  // 编译器自动转为 Integer.valueOf(100)

// 自动拆箱：包装类 → 基本类型
int val = obj;      // 编译器自动转为 obj.intValue()
```

> ⚠️ **坑**：频繁装箱拆箱会产生大量临时对象，影响性能。循环中尤其明显。

### 3. Integer 缓存池陷阱

```java
Integer a = 127;
Integer b = 127;
System.out.println(a == b);  // true ✅ 缓存池范围内

Integer c = 128;
Integer d = 128;
System.out.println(c == d);  // false ❌ 超出缓存池，堆上新对象

// 缓存池范围：-128 ~ 127（可配置上限）
// IntegerCache.high 可通过 -XX:AutoBoxCacheMax=<size> 调整
```

> 🔑 **面试答案**：比较包装类用 `equals()`，不用 `==`。

### 4. float 和 double 的精度问题

```java
double a = 0.1 + 0.2;
System.out.println(a);  // 0.30000000000000004 ❌

// 正确做法：金额用 BigDecimal
BigDecimal price = new BigDecimal("0.1");
BigDecimal tax = new BigDecimal("0.2");
System.out.println(price.add(tax));  // 0.3 ✅

// ❌ 错误：BigDecimal(double) 也有精度问题
BigDecimal bad = new BigDecimal(0.1);  // 0.100000000000000005551115123...
// ✅ 正确：用字符串构造
BigDecimal good = new BigDecimal("0.1");
```

### 5. 类型转换规则

```java
// 自动类型转换（小 → 大，安全）
int → long → float → double

// 强制类型转换（大 → 小，可能丢失精度）
double d = 3.14;
int i = (int) d;  // i = 3，小数部分截断

// ⚠️ 特殊情况
byte b1 = 1, b2 = 2;
byte b3 = b1 + b2;  // ❌ 编译错误！byte 运算自动提升为 int
byte b4 = (byte)(b1 + b2);  // ✅ 需要显式强转
```

## 代码示例

### 判断数据类型范围

```java
// 查看各类型的极值
System.out.println("int范围: " + Integer.MIN_VALUE + " ~ " + Integer.MAX_VALUE);
System.out.println("long范围: " + Long.MIN_VALUE + " ~ " + Long.MAX_VALUE);
System.out.println("double最大值: " + Double.MAX_VALUE);
System.out.println("double正最小值: " + Double.MIN_VALUE);  // 注意：不是负数！
```

### 安全的数值计算

```java
// 检测 int 溢出
int a = Integer.MAX_VALUE;
int b = 1;
// ❌ int sum = a + b;  // 溢出变为负数
// ✅ 使用 Math.addExact，溢出时抛出 ArithmeticException
int sum = Math.addExact(a, b);  // throws ArithmeticException
```

## 实战场景

| 场景 | 推荐类型 | 原因 |
|------|----------|------|
| 金额计算 | `BigDecimal` | float/double 有精度丢失 |
| 大文件大小 | `long` | 文件可能超过 2GB（int 最大约 2G） |
| 循环计数 | `int` | 默认选择，够用 |
| 位标志集合 | `int` / `long` | 每一位代表一个布尔开关 |
| 字符处理 | `char` | Unicode 编码，注意代理对（surrogate pair） |

## 延伸思考

- **Valhalla 项目**：Java 未来可能引入值类型（Value Types），模糊基本类型和对象的界限
- **`boolean` 的真实大小**：JVM 规范没有定义 boolean 的确切大小，实际中通常按 int（4字节）处理，数组中按 byte 处理
- **`char` 和 Unicode**：Java 的 char 是 UTF-16 code unit，emoji 和生僻字需要两个 char（代理对），应用 `int codePoint` 处理

## 参考资料

- [JLS §4.2 - Primitive Types and Values](https://docs.oracle.com/javase/specs/jls/se17/html/jls-4.html#jls-4.2)
- [Effective Java - Item 61: Prefer primitive types to boxed primitives](https://www.oreilly.com/library/view/effective-java/9780134686097/)

---
