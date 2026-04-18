# BigDecimal 金额计算

## 核心概念

### 为什么不能用 double/float 做金额计算？

```java
// ❌ 错误示范
double a = 0.1;
double b = 0.2;
System.out.println(a + b); // 0.30000000000000004

// ✅ 正确做法
BigDecimal a = new BigDecimal("0.1");
BigDecimal b = new BigDecimal("0.2");
System.out.println(a.add(b)); // 0.3
```

**原因：**
- 浮点数采用二进制存储，无法精确表示某些十进制小数
- 金额计算要求精确，不能有误差
- BigDecimal 使用十进制存储，可以精确表示

### BigDecimal 创建方式

```java
// ❌ 不要用 double 构造
BigDecimal bd1 = new BigDecimal(0.1); // 0.1000000000000000055511151231257827021181583404541015625

// ✅ 用 String 构造
BigDecimal bd2 = new BigDecimal("0.1"); // 0.1

// ✅ 或用 valueOf
BigDecimal bd3 = BigDecimal.valueOf(0.1); // 0.1
```

---

## 面试高频问题

### 1. 为什么金额计算要用 BigDecimal？

**回答要点：**
- 浮点数存在精度丢失问题
- 金额计算要求精确，不能有误差
- BigDecimal 可以精确表示任意精度的十进制数
- 金融、支付等场景必须使用 BigDecimal

### 2. BigDecimal 创建时应该用什么方式？

**回答要点：**
- 推荐使用 `new BigDecimal(String)` 或 `BigDecimal.valueOf(double)`
- 不要使用 `new BigDecimal(double)`，会有精度问题
- 因为 double 本身已经是不精确的，再转 BigDecimal 无法恢复

### 3. BigDecimal 的舍入模式有哪些？

**回答要点：**
```java
// 常用舍入模式
RoundingMode.UP           // 远离零方向舍入
RoundingMode.DOWN         // 向零方向舍入
RoundingMode.CEILING      // 向正无穷方向舍入
RoundingMode.FLOOR        // 向负无穷方向舍入
RoundingMode.HALF_UP      // 四舍五入（最常用）
RoundingMode.HALF_DOWN    // 五舍六入
RoundingMode.HALF_EVEN    // 银行家舍入法
```

### 4. 如何比较两个 BigDecimal 的大小？

**回答要点：**
```java
BigDecimal a = new BigDecimal("1.0");
BigDecimal b = new BigDecimal("1.00");

// ❌ 不要用 equals（会考虑 scale）
a.equals(b); // false

// ✅ 用 compareTo
a.compareTo(b) == 0; // true
```

---

## 代码示例

### 金额计算工具类

```java
public class MoneyUtils {
    private static final int SCALE = 2;
    private static final RoundingMode ROUNDING_MODE = RoundingMode.HALF_UP;
    
    /**
     * 加法
     */
    public static BigDecimal add(BigDecimal a, BigDecimal b) {
        return a.add(b).setScale(SCALE, ROUNDING_MODE);
    }
    
    /**
     * 减法
     */
    public static BigDecimal subtract(BigDecimal a, BigDecimal b) {
        return a.subtract(b).setScale(SCALE, ROUNDING_MODE);
    }
    
    /**
     * 乘法
     */
    public static BigDecimal multiply(BigDecimal a, BigDecimal b) {
        return a.multiply(b).setScale(SCALE, ROUNDING_MODE);
    }
    
    /**
     * 除法
     */
    public static BigDecimal divide(BigDecimal a, BigDecimal b) {
        return a.divide(b, SCALE, ROUNDING_MODE);
    }
}
```

### 比较金额

```java
public class MoneyComparator {
    /**
     * 判断是否相等（忽略精度差异）
     */
    public static boolean equals(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) == 0;
    }
    
    /**
     * 判断 a 是否大于 b
     */
    public static boolean greaterThan(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) > 0;
    }
    
    /**
     * 判断 a 是否小于 b
     */
    public static boolean lessThan(BigDecimal a, BigDecimal b) {
        return a.compareTo(b) < 0;
    }
}
```

---

## 实战场景

### 场景 1：订单金额计算

```java
public class OrderService {
    public BigDecimal calculateTotal(List<OrderItem> items) {
        BigDecimal total = BigDecimal.ZERO;
        for (OrderItem item : items) {
            BigDecimal itemTotal = item.getPrice()
                .multiply(BigDecimal.valueOf(item.getQuantity()));
            total = total.add(itemTotal);
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }
    
    public BigDecimal applyDiscount(BigDecimal total, BigDecimal discountRate) {
        BigDecimal discount = total.multiply(discountRate)
            .setScale(2, RoundingMode.HALF_UP);
        return total.subtract(discount);
    }
}
```

### 场景 2：利息计算

```java
public class InterestCalculator {
    /**
     * 计算复利
     * @param principal 本金
     * @param rate 年利率（如 0.05 表示 5%）
     * @param years 年数
     */
    public static BigDecimal compoundInterest(BigDecimal principal, 
                                               BigDecimal rate, int years) {
        BigDecimal result = principal;
        for (int i = 0; i < years; i++) {
            result = result.multiply(BigDecimal.ONE.add(rate))
                .setScale(2, RoundingMode.HALF_UP);
        }
        return result;
    }
}
```

---

## 延伸思考

- 数据库中金额字段应该用什么类型？（DECIMAL）
- 如何处理多币种金额？
- 性能优化：BigDecimal vs long（分为存储单位）

## 参考资料

- [Java BigDecimal 详解](https://www.baeldung.com/java-bigdecimal)
- [浮点数精度问题](https://0.30000000000000004.com/)
