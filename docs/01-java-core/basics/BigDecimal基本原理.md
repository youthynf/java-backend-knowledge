# BigDecimal 基本原理

## 核心概念

`BigDecimal` 适合用于金额、费率、结算等需要精确十进制计算的场景。它可以避免 `float`、`double` 因二进制浮点数表示导致的精度问题。

从实现思路上看，`BigDecimal` 会把十进制数拆成两个关键部分：

- **未缩放的整数值**：真实参与计算的整数部分。
- **scale 精度位数**：表示小数点的位置。

例如 `123.45` 可以理解为整数 `12345` 加上 `scale = 2`。计算时本质上是在做整数运算，再根据 scale 还原小数位置。

## 使用注意事项

### 创建 BigDecimal 时避免直接传 double

不要使用：

```java
new BigDecimal(0.1)
```

因为 `0.1` 这个 `double` 本身已经存在二进制精度误差，传入 `BigDecimal` 后只是把这个误差保留下来。

推荐方式：

```java
new BigDecimal("0.1");
BigDecimal.valueOf(0.1);
```

### equals 和 compareTo 的区别

`equals()` 不仅比较数值大小，还会比较精度 `scale`。

```java
new BigDecimal("1.0").equals(new BigDecimal("1.00")); // false
```

如果业务只关心数值是否相等，应该使用 `compareTo()`：

```java
new BigDecimal("1.0").compareTo(new BigDecimal("1.00")) == 0; // true
```

### 除法必须明确精度和舍入模式

如果除法结果是无限小数，且没有指定精度和舍入模式，会抛出 `ArithmeticException`。

```java
BigDecimal result = new BigDecimal("1")
    .divide(new BigDecimal("3"), 2, RoundingMode.HALF_UP);
```

### 字符串输出方式

- `toString()`：可能使用科学计数法。
- `toPlainString()`：按普通十进制形式输出。
- `toEngineeringString()`：使用工程计数法输出。

## 总结

金融金额计算中应优先使用 `BigDecimal`，并注意构造方式、比较方式、除法舍入规则和输出格式。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- BigDecimal 用整数值和 scale 表示精确十进制。
- 推荐用字符串或 valueOf 创建，避免 new BigDecimal(double)。

### 面试官想考什么
- 金额为什么不能用 double。
- scale、舍入模式、equals/compareTo 差异。

### 标准回答
BigDecimal 适合金额等精确计算。业务中要明确精度和舍入策略；除法常需指定 scale 和 RoundingMode；数值相等比较通常用 compareTo。

### 深挖追问
- new BigDecimal(0.1) 为什么不准？
- divide 何时抛异常？
- 10.0 和 10.00 的 equals 是否相等？

### 实战场景/代码示例
```java
BigDecimal r = new BigDecimal("10.00")
  .multiply(new BigDecimal("0.06"))
  .setScale(2, RoundingMode.HALF_UP);
```

### 易错点/总结
- 统一币种、单位和舍入规则。
- 批量计算要关注对象创建成本。

