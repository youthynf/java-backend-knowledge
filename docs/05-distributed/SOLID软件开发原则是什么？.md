# SOLID 软件开发原则是什么？

## 核心概念

SOLID 是 Robert C. Martin 在 2000 年提出的五条面向对象设计原则的首字母缩写，目标是让软件在面对需求变化时更容易扩展、更难被破坏、更易测试。它不是框架也不是模式，而是一组"设计味道"判断标准：当代码出现大块 `if-else` 切换类型、依赖具体类导致难以单测、接口被迫实现空方法时，多半是违反了某条原则。

五条原则分别是：单一职责（SRP）、开闭（OCP）、里氏替换（LSP）、接口隔离（ISP）、依赖倒置（DIP）。它们彼此关联——开闭原则是目标，里氏替换是基础，依赖倒置是手段，接口隔离和单一职责是约束。理解 SOLID 的关键不是背缩写，而是想清楚"未来的变化方向在哪里"，再决定哪里该抽象、哪里不该。

## 标准回答

> SOLID 是面向对象设计的五条原则：单一职责要求一个类只有一个变化原因；开闭原则要求通过扩展而非修改应对变化；里氏替换要求子类能无副作用地替换父类；接口隔离要求接口小而专；依赖倒置要求依赖抽象而非具体实现。它们共同的目标是降低耦合、提高内聚，让系统在需求变化时只影响局部。落地时不能为了原则而制造过度抽象，要结合业务复杂度判断：简单 CRUD 不需要策略工厂，复杂计费规则不写 `if-else` 才合理。

## 实现原理

### 单一职责原则（SRP）

一个类应该只有一个引起它变化的原因。判断标准不是"这个类做了几件事"，而是"有几种角色的需求变化会迫使这个类修改"。例如 `Order` 类既承担数据持久化、又承担邮件通知、又承担价格计算，运维改通知模板、运营改计费规则、DBA 改表结构都会动这个类，就该拆。

### 开闭原则（OCP）

软件实体应该对扩展开放、对修改关闭。新增一种支付方式时，理想情况是新增一个 `PaymentStrategy` 实现类，主流程一行不动。实现关键是把变化点抽象成接口（策略、模板方法、责任链），通过工厂或容器注入具体实现。前提是变化方向可预测——盲目抽象反而增加复杂度。

### 里氏替换原则（LSP）

子类对象必须能替换掉所有父类对象，而程序行为不变。经典反例：正方形继承长方形后重写 `setWidth` 同时改 height，调用方按长方形语义使用时行为异常。LSP 的本质是"子类不能加强前置条件、不能削弱后置条件、不能抛出新的受检异常"。

### 接口隔离原则（ISP）

客户端不应被迫依赖它不使用的方法。一个臃肿的 `IService` 包含 CRUD、批量、导入导出、统计等十几个方法，瘦客户端实现时被迫写一堆抛 `UnsupportedOperationException` 的空方法。拆成 `Readable`、`Writable`、`Importable` 等小接口，客户端按需依赖。

### 依赖倒置原则（DIP）

高层模块不应依赖低层模块，两者都应依赖抽象；抽象不应依赖细节，细节应依赖抽象。Spring 的依赖注入是这条原则的工程实现：Controller 依赖 Service 接口而非 ServiceImpl，便于单测时 Mock。

## 代码示例

### 违反 OCP 的反例

```java
// 每新增一种支付方式都要改这个方法，违反开闭原则
public class PaymentService {
    public PayResult pay(String type, Order order) {
        if ("alipay".equals(type)) {
            return payByAlipay(order);
        } else if ("wechat".equals(type)) {
            return payByWechat(order);
        } else if ("bank".equals(type)) {
            return payByBank(order);
        }
        throw new IllegalArgumentException("unsupported type: " + type);
    }
}
```

### 符合 OCP + DIP 的正例

```java
// 抽象是接口，扩展点开放
public interface PaymentStrategy {
    String type();
    PayResult pay(Order order);
}

@Service
public class AlipayStrategy implements PaymentStrategy {
    public String type() { return "alipay"; }
    public PayResult pay(Order order) { /* 调支付宝 SDK */ }
}

@Service
public class WechatStrategy implements PaymentStrategy {
    public String type() { return "wechat"; }
    public PayResult pay(Order order) { /* 调微信 SDK */ }
}

// 主流程依赖抽象，新增支付方式只需新增策略类，主流程一行不动
@Service
public class PaymentService {
    private final Map<String, PaymentStrategy> strategyMap;

    // Spring 自动注入所有 PaymentStrategy 实现，按 type() 建立查找表
    public PaymentService(List<PaymentStrategy> strategies) {
        this.strategyMap = strategies.stream()
            .collect(Collectors.toMap(PaymentStrategy::type, s -> s));
    }

    public PayResult pay(String type, Order order) {
        PaymentStrategy strategy = strategyMap.get(type);
        if (strategy == null) {
            throw new IllegalArgumentException("unsupported type: " + type);
        }
        return strategy.pay(order);
    }
}
```

### 违反 ISP 的反例

```java
// 胖接口：实现"只读配置"的客户端也被迫实现写方法
public interface ConfigService {
    String get(String key);
    void set(String key, String value);
    void delete(String key);
    void batchImport(Map<String, String> configs);
    void export();
}

public class ReadOnlyConfigClient implements ConfigService {
    public String get(String key) { return ... }
    public void set(String key, String value) { throw new UnsupportedOperationException(); }
    public void delete(String key) { throw new UnsupportedOperationException(); }
    // ... 多个空实现
}
```

拆分后：

```java
public interface ConfigReadable { String get(String key); }
public interface ConfigWritable extends ConfigReadable { void set(String key, String value); void delete(String key); }
public interface ConfigImportable { void batchImport(Map<String, String> configs); }

public class ReadOnlyConfigClient implements ConfigReadable {
    public String get(String key) { return ... }
}
```

## 实战场景

| 场景 | 违反原则 | 重构手法 |
|------|----------|----------|
| 订单状态机用 switch 处理各状态流转 | OCP | 状态模式，每个状态一个类 |
| 三方登录新增 QQ 微信反复改 AuthController | OCP + DIP | 抽象 `OAuthStrategy`，工厂选择 |
| 大单体 Service 类几千行 | SRP | 按职责拆 Service，组合而非继承 |
| 单测时必须连真实数据库才能跑 | DIP | 依赖 Repository 接口，Mock 注入 |
| 子类抛 `UnsupportedOperationException` | LSP | 接口拆小或改用组合 |

## 深挖追问

### 单一职责是不是类越小越好？

不是。SRP 强调"变化原因单一"，不是机械拆小。一个 200 行的 `OrderService` 如果所有方法都围绕"订单"这一个领域对象且变化原因单一，完全合理；硬拆成 `OrderQueryService`、`OrderUpdateService`、`OrderValidateService` 反而让调用链变长、事务边界变模糊。判断标准是"变化轴"而非行数。

### 开闭原则的前提是什么？

是"知道变化方向"。OCP 要求预先识别出变化点并抽象成接口，盲目抽象会制造不必要的间接层。一个只在原型期用一次的脚本，硬套工厂+策略+配置反而拖慢迭代。工程实践是：第一次写直白代码，第二次类似变化出现时再重构抽象（Rule of Three）。

### 里氏替换和接口隔离怎么区分？

LSP 关注"父子类行为契约一致"，是继承关系的约束；ISP 关注"客户端不该看到用不到的方法"，是接口宽度的约束。一个是垂直方向（继承层级），一个是水平方向（接口暴露面）。

### 依赖倒置和依赖注入是一回事吗？

不是。DIP 是设计原则（依赖抽象而非具体），DI 是实现手段（容器把抽象的实例注入到使用方）。DIP 可以不用 DI 实现（例如手写工厂），DI 也可以注入具体类（这时违反了 DIP）。Spring 的 `@Autowired` 注入接口才算完整的 DIP + DI。

### SOLID 和设计模式什么关系？

设计模式是 SOLID 原则在特定场景的具体落地。策略模式是 OCP 的典型实现、模板方法体现 DIP、装饰器体现 SRP 和 OCP、适配器体现 ISP。学模式不学原则容易"手里拿锤子看什么都像钉子"；学原则不学模式则缺少落地工具。

## 易错点

- 把 SRP 理解成"每个方法只做一件事" → SRP 是类级别，方法级别那叫"函数短小"。
- 为了 OCP 给每个 if 都抽象成策略 → 过度设计，只有反复出现的变化才值得抽象。
- LSP 只看方法签名不看行为契约 → 子类悄悄改了不变量，调用方按父类语义踩坑。
- ISP 拆接口拆到每个方法一个接口 → 走向另一个极端，接口爆炸。
- DIP 当成"必须用 Spring" → DIP 是思想，Java SE 也能写抽象类 + 工厂实现。
- 把 SOLID 当教条强行套简单代码 → CRUD 实体类不需要任何原则，直接写。

## 总结

SOLID 五条原则的核心是"识别变化方向，把变化点抽象出来"，目标是让代码对扩展开放、对修改关闭。落地时必须结合业务复杂度权衡：简单业务直白写，复杂业务才上抽象。面试中讲 SOLID 最好结合一个真实重构案例——从违反原则的坏味道讲到重构后的结构，再讲为什么选这种模式而不是另一种，远比背五条定义有说服力。

## 参考资料

- [Robert C. Martin: The Principles of OOD](https://butunclebob.com/ArticleS.UncleBob.PrinciplesOfOod)
- [Clean Architecture, Robert C. Martin](https://www.oreilly.com/library/view/clean-architecture/9780134494272/)
- [Refactoring Guru: SOLID 原则](https://refactoringguru.cn/solid)
