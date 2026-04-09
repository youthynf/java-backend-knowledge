# 策略模式

> 定义一系列算法，把它们封装起来，并使它们可以相互替换

## 核心概念

### 什么是策略模式？

策略模式定义了算法族，分别封装，让它们之间可以相互替换。此模式让算法的变化独立于使用算法的客户。

### 使用场景

- 多种方式完成同一任务（支付方式、排序算法）
- 需要在运行时动态切换算法
- 有大量条件语句（if-else、switch）可以选择算法
- 不希望客户端知道算法的具体实现

---

## UML 结构

```
┌──────────────┐
│   Context    │─────────────┐
├──────────────┤             │ uses
│ - strategy   │◄────────────┘
│ + setStrategy()│
│ + execute()    │
└──────────────┘
        │
        │ holds
        ▼
┌──────────────────┐
│ <<interface>>    │
│   Strategy       │
├──────────────────┤
│ + algorithm()    │
└──────────────────┘
        △
        │ implements
   ┌────┴────┐
   │         │
┌──┴──┐   ┌──┴──┐
│StrA │   │StrB │
└─────┘   └─────┘
```

---

## 代码示例

### 基础实现

```java
// 策略接口
public interface PaymentStrategy {
    void pay(int amount);
}

// 具体策略：微信支付
public class WechatPay implements PaymentStrategy {
    public void pay(int amount) {
        System.out.println("微信支付: " + amount + "元");
    }
}

// 具体策略：支付宝
public class Alipay implements PaymentStrategy {
    public void pay(int amount) {
        System.out.println("支付宝支付: " + amount + "元");
    }
}

// 具体策略：信用卡
public class CreditCardPay implements PaymentStrategy {
    private String cardNo;
    
    public CreditCardPay(String cardNo) {
        this.cardNo = cardNo;
    }
    
    public void pay(int amount) {
        System.out.println("信用卡支付: " + amount + "元，卡号: " + cardNo);
    }
}

// 上下文
public class PaymentContext {
    private PaymentStrategy strategy;
    
    public PaymentContext(PaymentStrategy strategy) {
        this.strategy = strategy;
    }
    
    public void setStrategy(PaymentStrategy strategy) {
        this.strategy = strategy;
    }
    
    public void execute(int amount) {
        strategy.pay(amount);
    }
}

// 使用
PaymentContext context = new PaymentContext(new WechatPay());
context.execute(100);  // 微信支付: 100元

context.setStrategy(new Alipay());
context.execute(200);  // 支付宝支付: 200元
```

---

## 实战场景

### 1. 折扣策略

```java
// 折扣策略接口
public interface DiscountStrategy {
    BigDecimal calculate(BigDecimal originalPrice);
}

// 无折扣
@Component
public class NoDiscount implements DiscountStrategy {
    public BigDecimal calculate(BigDecimal price) {
        return price;
    }
}

// 打折策略
@Component
public class PercentageDiscount implements DiscountStrategy {
    private BigDecimal discount;  // 0.8 表示 8 折
    
    public PercentageDiscount(BigDecimal discount) {
        this.discount = discount;
    }
    
    public BigDecimal calculate(BigDecimal price) {
        return price.multiply(discount);
    }
}

// 满减策略
@Component
public class FullReductionDiscount implements DiscountStrategy {
    private BigDecimal threshold;
    private BigDecimal reduction;
    
    public FullReductionDiscount(BigDecimal threshold, BigDecimal reduction) {
        this.threshold = threshold;
        this.reduction = reduction;
    }
    
    public BigDecimal calculate(BigDecimal price) {
        return price.compareTo(threshold) >= 0 
            ? price.subtract(reduction) 
            : price;
    }
}

// 订单服务
@Service
public class OrderService {
    private DiscountStrategy discountStrategy;
    
    public void setDiscountStrategy(DiscountStrategy strategy) {
        this.discountStrategy = strategy;
    }
    
    public BigDecimal calculateTotal(BigDecimal price) {
        return discountStrategy.calculate(price);
    }
}
```

---

### 2. 排序策略

```java
// 排序策略接口
public interface SortStrategy {
    <T extends Comparable<T>> void sort(List<T> list);
}

// 快速排序
public class QuickSort implements SortStrategy {
    public <T extends Comparable<T>> void sort(List<T> list) {
        Collections.sort(list);  // 简化实现
        System.out.println("使用快速排序");
    }
}

// 归并排序
public class MergeSort implements SortStrategy {
    public <T extends Comparable<T>> void sort(List<T> list) {
        // 归并排序实现
        System.out.println("使用归并排序");
    }
}

// 排序器
public class Sorter {
    private SortStrategy strategy;
    
    public void setStrategy(SortStrategy strategy) {
        this.strategy = strategy;
    }
    
    public <T extends Comparable<T>> void sort(List<T> list) {
        strategy.sort(list);
    }
}
```

---

### 3. 消除 if-else（Spring 集成）

**传统写法：**

```java
@Service
public class PaymentService {
    public void pay(String type, int amount) {
        if ("wechat".equals(type)) {
            System.out.println("微信支付: " + amount);
        } else if ("alipay".equals(type)) {
            System.out.println("支付宝支付: " + amount);
        } else if ("card".equals(type)) {
            System.out.println("信用卡支付: " + amount);
        } else {
            throw new IllegalArgumentException("不支持的支付方式");
        }
    }
}
```

**策略模式 + Spring：**

```java
// 策略接口
public interface PaymentStrategy {
    void pay(int amount);
    String getType();  // 策略标识
}

// 具体策略
@Component
public class WechatPayStrategy implements PaymentStrategy {
    public void pay(int amount) {
        System.out.println("微信支付: " + amount);
    }
    public String getType() {
        return "wechat";
    }
}

@Component
public class AlipayStrategy implements PaymentStrategy {
    public void pay(int amount) {
        System.out.println("支付宝支付: " + amount);
    }
    public String getType() {
        return "alipay";
    }
}

// 策略工厂
@Component
public class PaymentStrategyFactory {
    private final Map<String, PaymentStrategy> strategies;
    
    @Autowired
    public PaymentStrategyFactory(List<PaymentStrategy> strategyList) {
        // Spring 自动注入所有策略实现
        strategies = strategyList.stream()
            .collect(Collectors.toMap(
                PaymentStrategy::getType,
                Function.identity()
            ));
    }
    
    public PaymentStrategy getStrategy(String type) {
        PaymentStrategy strategy = strategies.get(type);
        if (strategy == null) {
            throw new IllegalArgumentException("不支持的支付方式: " + type);
        }
        return strategy;
    }
}

// 服务类
@Service
public class PaymentService {
    @Autowired
    private PaymentStrategyFactory strategyFactory;
    
    public void pay(String type, int amount) {
        PaymentStrategy strategy = strategyFactory.getStrategy(type);
        strategy.pay(amount);
    }
}
```

**优点：**
- 新增策略只需添加新类，无需修改现有代码（符合开闭原则）
- 策略类可复用
- 代码清晰，易于维护

---

## 面试高频问题

### Q1: 策略模式 vs 状态模式？

| 维度 | 策略模式 | 状态模式 |
|------|---------|---------|
| 目的 | 算法可替换 | 状态可切换 |
| 客户端控制 | 客户端选择策略 | 状态自动切换 |
| 状态切换 | 不关心 | 状态间可转换 |
| 应用场景 | 支付方式、排序算法 | 订单状态、游戏状态 |

**状态模式示例：**

```java
// 状态自动切换
public class Order {
    private OrderState state = new PendingState();
    
    public void pay() {
        state.pay(this);  // 当前状态决定行为
    }
    
    public void setState(OrderState state) {
        this.state = state;
    }
}

interface OrderState {
    void pay(Order order);
}

class PendingState implements OrderState {
    public void pay(Order order) {
        System.out.println("支付成功");
        order.setState(new PaidState());  // 自动切换到已支付状态
    }
}

class PaidState implements OrderState {
    public void pay(Order order) {
        System.out.println("已支付，不能重复支付");
    }
}
```

---

### Q2: 策略模式的优缺点？

**优点：**
1. 符合开闭原则，新增策略无需修改现有代码
2. 避免使用多重条件语句（if-else、switch）
3. 提高代码可读性和可维护性
4. 策略可复用

**缺点：**
1. 客户端需要知道所有策略
2. 策略过多时类数量增加
3. 策略之间无法共享状态

---

### Q3: 策略模式在 JDK 中的应用？

**Comparator：