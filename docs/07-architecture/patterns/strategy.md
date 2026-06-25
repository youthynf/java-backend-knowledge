# 策略模式

## 核心概念

策略模式把一组可互换的算法或业务规则封装成独立策略类，调用方通过统一接口使用它们。它适合“同一个业务动作有多种实现，并且会持续扩展”的场景，例如支付渠道、优惠计算、物流计费、风控规则。

策略模式的核心收益是消除庞大的 `if-else/switch`，让新增策略符合开闭原则。代价是类数量增加，并需要策略注册、选择和兜底机制。

## 面试官想考什么

- 是否能说明策略模式解决什么问题；
- 是否知道策略模式和工厂模式如何配合；
- 是否能结合 Spring `Map<String, Bean>` 实现；
- 是否理解策略选择、默认策略、异常处理。

## 标准回答

> 策略模式是把不同算法封装到实现同一接口的类中，运行时根据上下文选择具体策略。它能减少分支判断，提高扩展性。实际项目中常用工厂或 Spring 容器维护策略映射，例如按支付渠道找到对应 `PayStrategy`。新增策略时新增类即可，不改核心流程。

## 深挖追问

### 策略模式和模板方法有什么区别？

策略模式通过组合在运行时切换行为；模板方法通过继承固定流程骨架，让子类实现某些步骤。策略更灵活，模板方法更适合流程稳定但局部步骤不同的场景。

### 策略太多怎么治理？

要统一命名、注册 key、默认策略、监控指标和单元测试。复杂规则可以结合规则引擎或配置化，但不要把简单逻辑过度平台化。

## 实战场景 / 代码示例

优惠计算策略：

```java
public interface DiscountStrategy {
    String type();
    BigDecimal discount(Order order);
}

@Component
class FullReductionStrategy implements DiscountStrategy {
    public String type() { return "FULL_REDUCTION"; }
    public BigDecimal discount(Order order) { return new BigDecimal("20"); }
}

@Component
class DiscountStrategyFactory {
    private final Map<String, DiscountStrategy> strategyMap;

    DiscountStrategyFactory(List<DiscountStrategy> strategies) {
        this.strategyMap = strategies.stream()
            .collect(Collectors.toMap(DiscountStrategy::type, Function.identity()));
    }

    DiscountStrategy get(String type) {
        return Optional.ofNullable(strategyMap.get(type))
            .orElseThrow(() -> new IllegalArgumentException("unknown discount type"));
    }
}
```

## 易错点 / 总结

- 策略模式适合变化点明确的算法族；
- 不要为了两个简单分支强行拆十几个类；
- 策略选择逻辑要集中管理，避免散落在各处；
- 要设计默认策略、异常提示和监控；
- 策略可以配合工厂、枚举、注解或配置中心使用。
