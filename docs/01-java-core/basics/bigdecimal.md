# BigDecimal 详解

## 核心概念

`BigDecimal` 是 Java 提供的高精度十进制数类型，常用于金额、费率、结算等对精度要求很高的场景。

`float` 和 `double` 使用二进制浮点数表示，无法精确表示很多十进制小数，例如 `0.1`、`0.2`。因此涉及金额计算时，应优先使用 `BigDecimal`。

```java
System.out.println(0.1 + 0.2); // 0.30000000000000004
```

## 为什么不能直接用 double 计算金额

二进制浮点数只能精确表示一部分小数，很多十进制小数会被转换成近似值。多次计算后，误差可能累积，最终导致金额、账单、库存金额等结果不准确。

```java
double price = 0.1;
double total = price * 3;
System.out.println(total); // 0.30000000000000004
```

## BigDecimal 的创建方式

### 推荐：使用字符串构造

```java
BigDecimal a = new BigDecimal("0.1");
BigDecimal b = new BigDecimal("0.2");
System.out.println(a.add(b)); // 0.3
```

字符串可以准确表达十进制值，避免先经过 `double` 近似表示。

### 推荐：使用 valueOf

```java
BigDecimal a = BigDecimal.valueOf(0.1);
BigDecimal b = BigDecimal.valueOf(0.2);
System.out.println(a.add(b)); // 0.3
```

`BigDecimal.valueOf(double)` 内部会使用 `Double.toString(double)` 的字符串结果，相比 `new BigDecimal(double)` 更安全。

### 不推荐：直接传入 double

```java
BigDecimal a = new BigDecimal(0.1);
System.out.println(a);
// 0.1000000000000000055511151231257827021181583404541015625
```

此时传入的已经不是精确的十进制 `0.1`，而是 `double` 的二进制近似值。

## 常用运算方法

`BigDecimal` 是不可变对象，所有运算都会返回新对象。

```java
BigDecimal a = new BigDecimal("10.00");
BigDecimal b = new BigDecimal("3.00");

BigDecimal sum = a.add(b);       // 加法
BigDecimal diff = a.subtract(b); // 减法
BigDecimal product = a.multiply(b); // 乘法
BigDecimal quotient = a.divide(b, 2, RoundingMode.HALF_UP); // 除法
```

## 除法与舍入模式

使用 `divide()` 时，如果结果是无限循环小数，必须指定精度和舍入模式，否则会抛出 `ArithmeticException`。

```java
BigDecimal a = new BigDecimal("10");
BigDecimal b = new BigDecimal("3");

BigDecimal result = a.divide(b, 2, RoundingMode.HALF_UP);
System.out.println(result); // 3.33
```

常见舍入模式：

| 舍入模式 | 含义 |
|---|---|
| `HALF_UP` | 四舍五入，最常见 |
| `HALF_EVEN` | 银行家舍入，减少累计偏差 |
| `DOWN` | 直接截断 |
| `UP` | 远离零方向进位 |

## 比较方式

### `equals()` 会比较数值和精度

```java
BigDecimal a = new BigDecimal("1.0");
BigDecimal b = new BigDecimal("1.00");
System.out.println(a.equals(b)); // false
```

### `compareTo()` 只比较数值大小

```java
System.out.println(a.compareTo(b)); // 0
```

业务中比较金额是否相等时，通常使用 `compareTo()`。

## 常见注意事项

- 金额计算不要使用 `float` 或 `double`。
- 创建 `BigDecimal` 优先使用字符串或 `BigDecimal.valueOf()`。
- 除法要指定精度和舍入模式。
- `BigDecimal` 是不可变对象，计算结果要接收返回值。
- 比较数值大小优先使用 `compareTo()`，不要直接依赖 `equals()`。

## 总结

`BigDecimal` 适合处理精确十进制计算。面试中重点说明三点即可：为什么需要它、如何正确创建它、除法和比较时有哪些坑。

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

