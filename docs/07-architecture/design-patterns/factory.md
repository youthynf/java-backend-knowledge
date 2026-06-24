# 工厂模式

## 核心概念

工厂模式用于封装对象创建过程，让调用方不直接依赖具体类。它常见形态包括简单工厂、工厂方法和抽象工厂：简单工厂用一个工厂类根据参数创建对象；工厂方法把创建逻辑下放到子类；抽象工厂用于创建一组相关对象。

它解决的是“创建逻辑复杂、具体实现多、调用方不应关心 new 哪个类”的问题。代价是类数量和抽象层次增加，过度使用会让代码绕。

## 面试官想考什么

- 是否知道简单工厂、工厂方法、抽象工厂区别；
- 是否能说明工厂模式和策略模式、Spring BeanFactory 的关系；
- 是否理解开闭原则和依赖倒置；
- 是否能在业务场景中落地，而不是只画 UML。

## 标准回答

> 工厂模式把对象创建从业务代码中抽离出来，调用方依赖接口而不是具体实现。简单工厂适合类型少、创建逻辑集中；工厂方法适合每类产品由独立工厂创建；抽象工厂适合创建一族相关产品。它能提升扩展性和可测试性，但会增加抽象层级，简单对象没必要强行使用。

## 深挖追问

### 工厂模式和策略模式有什么区别？

策略模式关注“运行时选择哪种算法/行为”，工厂模式关注“如何创建对象”。实际项目中经常组合使用：先用工厂根据业务类型拿到某个策略，再调用策略执行业务逻辑。

### Spring 中哪里体现了工厂思想？

`BeanFactory`/`ApplicationContext` 管理对象创建、依赖注入和生命周期，业务代码通常依赖接口和 Bean 名称/类型，而不是到处手动 `new`。

## 实战场景 / 代码示例

支付渠道工厂：

```java
public interface PayHandler {
    PayResult pay(PayCommand command);
}

@Component("ALI")
class AliPayHandler implements PayHandler { /* ... */ }

@Component("WX")
class WxPayHandler implements PayHandler { /* ... */ }

@Component
public class PayHandlerFactory {
    private final Map<String, PayHandler> handlers;

    public PayHandlerFactory(Map<String, PayHandler> handlers) {
        this.handlers = handlers;
    }

    public PayHandler get(String channel) {
        PayHandler handler = handlers.get(channel);
        if (handler == null) throw new IllegalArgumentException("unknown channel: " + channel);
        return handler;
    }
}
```

新增支付渠道时新增实现类并注册即可，调用方不用写大量 `if-else`。

## 易错点 / 总结

- 工厂不是为了消灭所有 `new`，而是封装有变化的创建逻辑；
- 类型很少且稳定时，简单代码比复杂模式更好；
- 工厂返回接口，避免调用方依赖具体实现；
- 工厂经常和策略、模板方法、依赖注入一起使用；
- 抽象工厂适合产品族，不要为单个对象强行套用。

