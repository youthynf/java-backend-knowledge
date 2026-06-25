# 面向对象设计的 SOLID 原则是什么？

## 核心概念

SOLID 是面向对象设计中五个常见原则的缩写，用来提升代码的可维护性、可扩展性和可测试性。

| 缩写 | 原则 | 核心思想 |
|---|---|---|
| S | 单一责任原则 | 一个类只负责一类职责 |
| O | 开闭原则 | 对扩展开放，对修改关闭 |
| L | 里氏替换原则 | 子类应能替换父类且不破坏行为 |
| I | 接口隔离原则 | 不强迫依赖不需要的方法 |
| D | 依赖倒置原则 | 面向抽象编程，而不是面向具体实现 |

## 单一责任原则：Single Responsibility Principle

单一责任原则要求一个类只承担一种类型的职责。当一个类承担了过多职责时，任何一个职责变化都可能影响其他职责。

### 说明

- 一个类应该只有一个引起它变化的原因。
- 如果一个类同时负责业务计算、数据访问、日志打印、报表导出，通常就需要拆分。
- 单一责任不是说一个类只能有一个方法，而是说这些方法应该服务于同一类职责。

## 开闭原则：Open Closed Principle

开闭原则要求软件实体应该**对扩展开放，对修改关闭**。

### 说明

- 新增功能时，优先通过新增类、实现接口、扩展策略来完成。
- 尽量避免频繁修改已有稳定代码，降低引入回归缺陷的风险。
- 常见实现方式包括策略模式、模板方法模式、工厂模式等。

## 里氏替换原则：Liskov Substitution Principle

里氏替换原则要求：如果一个子类实例能够替换任何父类实例，并且程序行为仍然正确，那么它们之间才是真正合理的 `is-a` 关系。

### 说明

- 子类不能破坏父类已经承诺的行为。
- 子类重写方法时，不应随意加强前置条件或削弱后置结果。
- 违反里氏替换原则通常说明继承关系设计不合理。

## 接口隔离原则：Interface Segregation Principle

接口隔离原则要求使用多个专门的接口，而不是一个臃肿的大接口。

### 说明

- 客户端不应该被迫依赖它不使用的方法。
- 大而全的接口容易导致实现类出现大量空实现或无意义实现。
- 可以把接口按角色、能力或使用场景拆分。

## 依赖倒置原则：Dependency Inversion Principle

依赖倒置原则要求高层模块不应该直接依赖低层模块，二者都应该依赖抽象；抽象不应该依赖细节，细节应该依赖抽象。

### 说明

- 业务代码应依赖接口，而不是依赖具体实现类。
- 具体实现可以通过依赖注入、配置、工厂等方式替换。
- Spring 的 IoC/DI 就是依赖倒置思想的典型实践。

## 示例：使用接口解耦具体实现

```java
interface MessageSender {
    void send(String message);
}

class EmailSender implements MessageSender {
    @Override
    public void send(String message) {
        System.out.println("send email: " + message);
    }
}

class NotifyService {
    private final MessageSender sender;

    public NotifyService(MessageSender sender) {
        this.sender = sender;
    }

    public void notify(String message) {
        sender.send(message);
    }
}
```

`NotifyService` 依赖的是 `MessageSender` 抽象，而不是具体的 `EmailSender`。如果以后改成短信、站内信或 MQ，只需要替换实现。

## 总结

SOLID 原则不是为了增加设计复杂度，而是为了控制变化带来的影响范围。实际开发中要结合业务复杂度取舍，避免过度设计。

---
