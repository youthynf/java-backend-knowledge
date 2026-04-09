# 工厂模式 (Factory)

## 核心概念

将对象的创建逻辑封装起来，让客户端无需知道具体创建细节。

### 三种形式

| 模式 | 特点 |
|------|------|
| 简单工厂 | 一个工厂类创建所有产品 |
| 工厂方法 | 每个产品有对应的工厂 |
| 抽象工厂 | 创建产品族（相关产品集合） |

---

## 一、简单工厂

### 实现

```java
// 产品接口
public interface Product {
    void use();
}

// 具体产品A
public class ProductA implements Product {
    @Override
    public void use() {
        System.out.println("使用产品 A");
    }
}

// 具体产品B
public class ProductB implements Product {
    @Override
    public void use() {
        System.out.println("使用产品 B");
    }
}

// 简单工厂
public class SimpleFactory {
    public static Product create(String type) {
        switch (type) {
            case "A":
                return new ProductA();
            case "B":
                return new ProductB();
            default:
                throw new IllegalArgumentException("未知产品类型: " + type);
        }
    }
}

// 使用
Product product = SimpleFactory.create("A");
product.use();
```

### 优缺点

- **优点**：简单直接，适合产品种类少且固定的场景
- **缺点**：新增产品需要修改工厂类，违反开闭原则

---

## 二、工厂方法

### 实现

```java
// 产品接口
public interface Product {
    void use();
}

// 具体产品
public class ProductA implements Product {
    @Override
    public void use() {
        System.out.println("使用产品 A");
    }
}

public class ProductB implements Product {
    @Override
    public void use() {
        System.out.println("使用产品 B");
    }
}

// 工厂接口
public interface Factory {
    Product create();
}

// 具体工厂
public class FactoryA implements Factory {
    @Override
    public Product create() {
        return new ProductA();
    }
}

public class FactoryB implements Factory {
    @Override
    public Product create() {
        return new ProductB();
    }
}

// 使用
Factory factory = new FactoryA();
Product product = factory.create();
product.use();
```

### 优缺点

- **优点**：符合开闭原则，新增产品只需新增工厂类
- **缺点**：类数量增多

---

## 三、抽象工厂

### 实现

```java
// 产品族：数据库组件
public interface Connection {
    void connect();
}

public interface Statement {
    void execute(String sql);
}

// MySQL 产品族
public class MySqlConnection implements Connection {
    @Override
    public void connect() {
        System.out.println("MySQL 连接");
    }
}

public class MySqlStatement implements Statement {
    @Override
    public void execute(String sql) {
        System.out.println("MySQL 执行: " + sql);
    }
}

// PostgreSQL 产品族
public class PostgresConnection implements Connection {
    @Override
    public void connect() {
        System.out.println("PostgreSQL 连接");
    }
}

public class PostgresStatement implements Statement {
    @Override
    public void execute(String sql) {
        System.out.println("PostgreSQL 执行: " + sql);
    }
}

// 抽象工厂
public interface DatabaseFactory {
    Connection createConnection();
    Statement createStatement();
}

// MySQL 工厂
public class MySqlFactory implements DatabaseFactory {
    @Override
    public Connection createConnection() {
        return new MySqlConnection();
    }
    
    @Override
    public Statement createStatement() {
        return new MySqlStatement();
    }
}

// PostgreSQL 工厂
public class PostgresFactory implements DatabaseFactory {
    @Override
    public Connection createConnection() {
        return new PostgresConnection();
    }
    
    @Override
    public Statement createStatement() {
        return new PostgresStatement();
    }
}

// 使用
DatabaseFactory factory = new MySqlFactory();
Connection conn = factory.createConnection();
Statement stmt = factory.createStatement();
conn.connect();
stmt.execute("SELECT * FROM users");
```

---

## 面试高频问题

### Q1: 工厂方法 vs 抽象工厂？

| 对比 | 工厂方法 | 抽象工厂 |
|------|----------|----------|
| 产品维度 | 一种产品 | 产品族（多种相关产品） |
| 工厂数量 | 每个产品一个工厂 | 每个产品族一个工厂 |
| 新增产品 | 新增工厂类 | 需要修改工厂接口 |
| 新增产品族 | - | 新增工厂类 |

### Q2: 开闭原则如何体现？

**工厂方法**：
- 新增产品：新增产品类 + 工厂类，无需修改已有代码
- 修改产品：只需修改对应工厂

**简单工厂**：
- 新增产品需要修改工厂类的 if/switch，违反开闭原则

### Q3: Spring 如何使用工厂模式？

```java
// Spring BeanFactory
public interface BeanFactory {
    Object getBean(String name) throws BeansException;
    <T> T getBean(Class<T> requiredType) throws BeansException;
}

// ApplicationContext 继承了 BeanFactory
ApplicationContext context = new ClassPathXmlApplicationContext("beans.xml");
UserService userService = context.getBean(UserService.class);
```

---

## 实战场景

### 场景1：日志工厂

```java
public interface Logger {
    void log(String message);
}

public class ConsoleLogger implements Logger {
    @Override
    public void log(String message) {
        System.out.println("[CONSOLE] " + message);
    }
}

public class FileLogger implements Logger {
    @Override
    public void log(String message) {
        // 写入文件
    }
}

public class LoggerFactory {
    public static Logger getLogger(String type) {
        switch (type) {
            case "console":
                return new ConsoleLogger();
            case "file":
                return new FileLogger();
            default:
                throw new IllegalArgumentException("Unknown logger type");
        }
    }
}
```

### 场景2：支付工厂

```java
public interface PaymentProcessor {
    void pay(BigDecimal amount);
}

public class AlipayProcessor implements PaymentProcessor {
    @Override
    public void pay(BigDecimal amount) {
        System.out.println("支付宝支付: " + amount);
    }
}

public class WechatProcessor implements PaymentProcessor {
    @Override
    public void pay(BigDecimal amount) {
        System.out.println("微信支付: " + amount);
    }
}

@Component
public class PaymentFactory {
    private final Map<String, PaymentProcessor> processors;
    
    public PaymentFactory(List<PaymentProcessor> processorList) {
        this.processors = processorList.stream()
            .collect(Collectors.toMap(
                p -> p.getClass().getSimpleName().replace("Processor", "").toLowerCase(),
                p -> p
            ));
    }
    
    public PaymentProcessor getProcessor(String type) {
        PaymentProcessor processor = processors.get(type);
        if (processor == null) {
            throw new IllegalArgumentException("Unknown payment type: " + type);
        }
        return processor;
    }
}
```

---

## 延伸思考

1. **工厂模式 vs 建造者模式** 如何选择？
2. **Spring Bean 工厂** 是哪种工厂模式？
3. **依赖注入** 如何替代工厂模式？

---

## 参考资料

- [设计模式：可复用面向对象软件的基础](https://www.oreilly.com/library/view/design-patterns-elements/0201633612/)
- [Head First 设计模式](https://www.oreilly.com/library/view/head-first-design/0596007124/)

---

*最后更新: 2026-04-09*
