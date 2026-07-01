# 面向对象设计的 SOLID 原则是什么

## 核心概念

SOLID 是面向对象设计中五个原则的缩写，由 Robert C. Martin（Uncle Bob）提出。这五个原则共同指导如何设计高内聚、低耦合、易扩展、易维护的面向对象系统。

| 缩写 | 原则 | 核心思想 |
|------|------|---------|
| **S** | 单一责任原则（Single Responsibility Principle, SRP） | 一个类只负责一类职责 |
| **O** | 开闭原则（Open Closed Principle, OCP） | 对扩展开放，对修改关闭 |
| **L** | 里氏替换原则（Liskov Substitution Principle, LSP） | 子类应能替换父类且不破坏行为 |
| **I** | 接口隔离原则（Interface Segregation Principle, ISP） | 不强迫依赖不需要的方法 |
| **D** | 依赖倒置原则（Dependency Inversion Principle, DIP） | 面向抽象编程，而非具体实现 |

SOLID 不是教条，而是控制"变化影响范围"的工具。理解它要把握一点：所有原则都为了应对"变化"——让代码在需求变化时改动最小、风险最低。

## 标准回答

SOLID 是面向对象设计的五大原则：单一责任、开闭、里氏替换、接口隔离、依赖倒置。要点：

1. **SRP**：一个类只有一个变化的理由。
2. **OCP**：扩展功能时不修改已有代码，通过新增类或实现接口完成。
3. **LSP**：子类对象能替换父类对象，程序行为不变。
4. **ISP**：客户端不被迫依赖它不使用的方法，接口要小而专。
5. **DIP**：高层模块依赖抽象，不依赖具体实现，Spring IoC 是典型实践。

## 实现原理

### 1. 单一责任原则（SRP）

**定义**：一个类应该只有一个引起它变化的原因。

**理解**：每个类只承担一类职责。如果一个类同时负责业务计算、数据访问、日志打印、报表导出，那么"业务规则变化"、"数据源切换"、"日志格式调整"、"报表样式修改"任何一个原因都会修改这个类。职责越多，变化越频繁，bug 风险越大。

```java
// 违反 SRP：一个类既负责业务又负责持久化又负责日志
class UserService {
    public void register(User user) {
        // 业务校验
        if (user.getName() == null) throw new IllegalArgumentException();
        // 数据库操作
        Connection conn = DriverManager.getConnection(...);
        PreparedStatement ps = conn.prepareStatement(...);
        ps.executeUpdate();
        // 日志
        System.out.println("register user: " + user.getName());
    }
}

// 符合 SRP：拆分职责
class UserService {
    private final UserRepository repo;
    private final Logger logger;
    public UserService(UserRepository repo, Logger logger) { ... }
    public void register(User user) {
        if (user.getName() == null) throw new IllegalArgumentException();
        repo.save(user);
        logger.info("register user: " + user.getName());
    }
}
class UserRepository { public void save(User u) { /* 数据库操作 */ } }
class Logger { public void info(String msg) { /* 日志 */ } }
```

#### 怎么判断"单一责任"

不要把"单一责任"理解成"一个类只有一个方法"。判断标准是"变化的理由"：如果两个职责的变化原因不同（一个因业务规则变、一个因日志格式变），就该拆分。

### 2. 开闭原则（OCP）

**定义**：软件实体（类、模块、函数）应该对扩展开放，对修改关闭。

**理解**：新增功能时不修改已有代码，通过新增类、实现接口、扩展策略完成。这样能降低"改老代码引入 bug"的风险。

```java
// 违反 OCP：新增支付方式要改 PaymentService
class PaymentService {
    public void pay(String type, String orderNo) {
        if ("ali".equals(type)) {
            // 支付宝逻辑
        } else if ("wechat".equals(type)) {
            // 微信逻辑
        } else if ("bank".equals(type)) {
            // 银行卡逻辑
        }
        // 新增支付方式必须改这里
    }
}

// 符合 OCP：定义接口，新增支付方式新增类
interface PaymentStrategy {
    void pay(String orderNo);
}

class AliPayStrategy implements PaymentStrategy {
    @Override public void pay(String orderNo) { /* 支付宝 */ }
}

class WeChatPayStrategy implements PaymentStrategy {
    @Override public void pay(String orderNo) { /* 微信 */ }
}

class PaymentService {
    private final PaymentStrategy strategy;
    public PaymentService(PaymentStrategy strategy) { this.strategy = strategy; }
    public void pay(String orderNo) { strategy.pay(orderNo); }
    // 新增支付方式只需要新增一个实现类，不修改 PaymentService
}
```

OCP 的典型实现模式：策略模式、模板方法模式、工厂模式、装饰器模式。

### 3. 里氏替换原则（LSP）

**定义**：所有引用基类（父类）的地方必须能透明地使用其子类的对象。

**理解**：子类替换父类后，程序行为不变。这意味着子类必须遵守父类的"行为契约"：不能加强前置条件，不能削弱后置条件，不能抛出新的受检异常。

```java
// 违反 LSP：经典的长方形/正方形问题
class Rectangle {
    protected int width, height;
    public void setWidth(int w) { width = w; }
    public void setHeight(int h) { height = h; }
    public int area() { return width * height; }
}

class Square extends Rectangle {
    @Override public void setWidth(int w) { width = height = w; }
    @Override public void setHeight(int h) { width = height = h; }
}

// 用 Rectangle 的代码在传入 Square 时行为异常
void resize(Rectangle r) {
    while (r.area() < 100) {
        r.setWidth(r.width + 1);   // Square 会让 height 一起变，可能死循环
    }
}
```

`Square` 违反了 `Rectangle` 的契约（"setWidth 只改 width"），导致 `resize` 在传入 `Square` 时行为异常。这种"子类破坏父类契约"的设计就是 LSP 违例。

#### LSP 的工程含义

- 子类不要抛出父类没声明的新异常。
- 子类不要加强方法前置条件（参数校验更严格）。
- 子类不要削弱方法后置条件（返回值范围更大）。
- 子类不要有不期望的副作用。

如果子类做不到"完全替换父类"，应该重新设计继承关系，或改用组合。

### 4. 接口隔离原则（ISP）

**定义**：客户端不应该被迫依赖它不使用的方法。多个专门的接口比一个臃肿的接口好。

**理解**：大而全的接口会让实现类被迫实现不需要的方法（通常空实现或抛异常）。把接口按能力拆分，让实现类只实现需要的接口。

```java
// 违反 ISP：胖接口
interface Worker {
    void work();
    void eat();
    void sleep();
}

// 机器人实现 Worker，但不需要 eat/sleep
class RobotWorker implements Worker {
    @Override public void work() { /* 工作 */ }
    @Override public void eat() { /* 空实现或抛异常 */ }
    @Override public void sleep() { /* 空实现或抛异常 */ }
}

// 符合 ISP：按能力拆分
interface Workable { void work(); }
interface Eatable { void eat(); }
interface Sleepable { void sleep(); }

class RobotWorker implements Workable {
    @Override public void work() { /* 只实现需要的 */ }
}

class HumanWorker implements Workable, Eatable, Sleepable {
    @Override public void work() { }
    @Override public void eat() { }
    @Override public void sleep() { }
}
```

ISP 在 Java 中的典型例子：`java.util.Collection` 拆分出 `List`、`Set`、`Queue`，`List` 又拆分出 `ArrayList`、`LinkedList` 等。`Map` 不继承 `Collection` 也是因为接口语义不匹配。

### 5. 依赖倒置原则（DIP）

**定义**：
1. 高层模块不应该依赖低层模块，二者都应该依赖抽象。
2. 抽象不应该依赖细节，细节应该依赖抽象。

**理解**：业务代码（高层）不应该直接依赖具体实现（低层），而应依赖接口（抽象）。具体实现通过依赖注入、配置、工厂等方式替换。

```java
// 违反 DIP：高层直接依赖低层
class OrderService {
    private MySQLDatabase db = new MySQLDatabase();   // 直接 new 具体类
    public void create(Order o) { db.save(o); }
}

// 符合 DIP：高层依赖抽象
interface OrderRepository {
    void save(Order o);
}

class MySQLOrderRepository implements OrderRepository {
    @Override public void save(Order o) { /* MySQL 实现 */ }
}

class OrderService {
    private final OrderRepository repo;
    public OrderService(OrderRepository repo) {  // 依赖注入
        this.repo = repo;
    }
    public void create(Order o) { repo.save(o); }
}

// 测试时可以注入 MockOrderRepository，业务代码无需改
```

Spring 的 IoC/DI 是 DIP 的典型实践：

```java
@Service
public class OrderService {
    private final OrderRepository repo;
    @Autowired
    public OrderService(OrderRepository repo) { this.repo = repo; }
}
```

`OrderService` 依赖 `OrderRepository` 接口，Spring 在运行时注入具体实现。切换数据库只需要换 `@Repository` 的实现类，`OrderService` 代码不变。

## 代码示例

### 完整的 SOLID 应用：通知系统

```java
// SRP + ISP：消息发送能力抽象
interface MessageSender {
    void send(String to, String content);
}

class EmailSender implements MessageSender {
    @Override public void send(String to, String content) {
        System.out.println("email to " + to + ": " + content);
    }
}

class SmsSender implements MessageSender {
    @Override public void send(String to, String content) {
        System.out.println("sms to " + to + ": " + content);
    }
}

// OCP + DIP：通知服务依赖抽象，新增渠道不修改代码
class NotificationService {
    private final MessageSender sender;
    public NotificationService(MessageSender sender) { this.sender = sender; }
    public void notify(String to, String content) { sender.send(to, content); }
}

// 使用
NotificationService emailNotifier = new NotificationService(new EmailSender());
emailNotifier.notify("tom@example.com", "Hello");

NotificationService smsNotifier = new NotificationService(new SmsSender());
smsNotifier.notify("10086", "Hello");
```

新增"站内信"渠道只需要新增 `InnerMessageSender implements MessageSender`，`NotificationService` 不改。这是 OCP 和 DIP 的体现。

### LSP 应用：模板方法不破坏契约

```java
abstract class Account {
    public final void withdraw(long amount) {
        if (amount <= 0) throw new IllegalArgumentException();
        if (!canWithdraw(amount)) throw new IllegalStateException("余额不足");
        doWithdraw(amount);
    }
    protected abstract boolean canWithdraw(long amount);
    protected abstract void doWithdraw(long amount);
}

class SavingsAccount extends Account {
    private long balance;
    @Override protected boolean canWithdraw(long amount) { return balance >= amount; }
    @Override protected void doWithdraw(long amount) { balance -= amount; }
}

class CreditAccount extends Account {
    private long balance;
    private final long creditLimit;
    CreditAccount(long limit) { creditLimit = limit; }
    @Override protected boolean canWithdraw(long amount) {
        return balance + creditLimit >= amount;  // 信用卡可透支
    }
    @Override protected void doWithdraw(long amount) { balance -= amount; }
}
```

`Account` 定义了 `withdraw` 的契约：先校验、再执行。`SavingsAccount` 和 `CreditAccount` 子类替换父类后行为一致——都遵循"先校验、再执行"的契约。这就是 LSP。

## 实战场景

| 场景 | 原则 | 应用 |
|------|------|------|
| 拆分胖 Service | SRP | 业务逻辑、数据访问、日志分别拆类 |
| 支付方式扩展 | OCP | 策略模式 + 接口 |
| 模板方法模式 | LSP | 父类定义骨架，子类填步骤不破坏契约 |
| Spring `BeanPostProcessor` | ISP | 不同子接口处理不同阶段 |
| 依赖注入 | DIP | `@Autowired` 注入接口实现 |
| 适配器模式 | ISP | 把胖接口适配为客户端需要的窄接口 |
| 框架扩展点 | OCP + DIP | 用户实现框架接口，框架运行时调用 |

## 深挖追问

### 1. SOLID 原则之间有什么关系

- **SRP 是基础**：职责单一了，其他原则才好实现。
- **OCP 是目标**：通过抽象、多态实现扩展性。
- **LSP 是 OCP 的保障**：子类不破坏父类契约，才能安全替换、扩展。
- **ISP 让抽象更精确**：接口小而专，依赖更可控。
- **DIP 提供实现路径**：依赖抽象而非具体，是 OCP 和 LSP 的落地手段。

### 2. 怎么判断"违反 SRP"

不是看"类有几个方法"，而是看"变化的理由"。如果一个类的两个方法会因为不同的原因变化（如业务规则、技术栈），就该拆。例如 `UserService` 的 `register` 和 `exportToExcel`，前者因业务变、后者因报表格式变，应该拆。

### 3. OCP 怎么落地

通过抽象（接口/抽象类）+ 多态实现：

1. 找出可能变化的部分，抽象成接口。
2. 业务代码依赖接口，不依赖具体实现。
3. 新增变化时，新增实现类，业务代码不改。

策略模式、模板方法、装饰器、工厂都是 OCP 的典型应用。

### 4. LSP 和"重写"有什么区别

重写是 Java 语法层面的机制，LSP 是设计原则。重写不一定符合 LSP——子类重写父类方法时如果改变了契约（如抛新异常、加强前置条件），就违反 LSP。LSP 要求重写后的子类方法"语义上"等价于父类方法。

### 5. ISP 和 SRP 有什么区别

- **SRP**：针对类的职责，"一个类只做一件事"。
- **ISP**：针对接口的方法，"客户端不依赖不需要的方法"。

一个胖接口可能由多个 SRP 单一的类实现，但客户端仍被迫依赖不需要的方法。ISP 要求把接口本身拆分。

### 6. DIP 和"依赖注入"是什么关系

DIP 是设计原则，"依赖注入"是实现 DIP 的具体手段。DIP 说"依赖抽象"，依赖注入说"通过构造器/setter/字段把抽象的具体实现传进来"。Spring IoC 容器自动完成依赖注入，是 DIP 的工业级实践。

### 7. SOLID 会不会过度设计

会。SOLID 不是教条，过度应用会让代码"接口爆炸"、"抽象冗余"。判断标准：

- 简单且不会变化的代码：直接写，别套模式。
- 有明确扩展点的代码：应用 OCP/DIP。
- 多人协作、需求频繁变化：SOLID 价值最大。

Effective Java 和 Clean Code 都强调"先简单后抽象"，KISS（Keep It Simple, Stupid）原则优先。

## 易错点

- 把 SRP 理解成"一个类一个方法"，导致类爆炸。
- 把 OCP 理解成"绝不能改老代码"，导致过度抽象。
- 子类重写时抛新异常或加强校验，违反 LSP。
- 接口设计过大，实现类被迫空实现，违反 ISP。
- 高层模块直接 `new` 低层具体类，违反 DIP。
- 把 SOLID 当教条强行套用，简单代码也搞一堆接口。
- SRP 拆分时把强相关的职责拆开，反而增加耦合。
- 抽象层和实现层混淆，接口暴露实现细节。

## 总结

SOLID 是面向对象设计的五大原则：单一责任、开闭、里氏替换、接口隔离、依赖倒置。它们的核心目的是控制变化的影响范围——让代码在需求变化时改动最小、风险最低。生产实践中：SRP 拆分胖 Service、OCP 用策略/模板/工厂扩展功能、LSP 保证子类不破坏父类契约、ISP 拆分胖接口、DIP 通过依赖注入面向抽象编程。Spring 框架是 SOLID 的集大成者，理解 SOLID 对阅读 Spring 源码、设计可扩展业务系统至关重要。原则不是教条，要结合业务复杂度权衡，避免过度设计。

## 参考资料

- [Robert C. Martin - The Principles of OOD](https://butunclebob.com/ArticleS.UncleBob.PrinciplesOfOod)
- [Clean Architecture - Robert C. Martin](https://www.oreilly.com/library/view/clean-architecture/9780134494166/)
- [Head First Object-Oriented Analysis and Design](https://www.oreilly.com/library/view/head-first-object-oriented/0596008678/)
- [Effective Java - Item 18: Favor composition over inheritance](https://www.oreilly.com/library/view/effective-java/9780134686097/)

---
