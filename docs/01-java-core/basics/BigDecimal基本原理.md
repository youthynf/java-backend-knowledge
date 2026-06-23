# BigDecimal基本原理

BigDecimal基本原理
基本原理
BigDecimal 在计算时，实际会把数值扩大10(n)倍，变成一个long型整数进行计算，整数计算时自然可以实现精度不丢失。同时结合精度函数setScale(位数,模式)，实现最终结果的计算。

注意事项：
通过构造方法创建时，入参需要是字符串类型，否则会丢失精度，或者使用BigDecimal.valueOf()初始化，因为部分float和double无法使用二进制精确表示；
equals()不仅比较值大小，还比较精度，精度不同时使用compareTo()替代；
如果除法结果是一个无限小数，不设置精度会导致抛异常；
使用toString()转字符串会出现科学计数法，可以使用toPlainString()原样打印所有有效数字，或者toEngineringString()工程计数法表示。

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

