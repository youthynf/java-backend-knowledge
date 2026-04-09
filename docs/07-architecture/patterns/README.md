# 设计模式

> 面试高频设计模式，掌握核心思想与代码实现

## 目录

- [单例模式](./singleton.md) - 保证一个类只有一个实例
- [工厂模式](./factory.md) - 封装对象创建逻辑
- [策略模式](./strategy.md) - 算法可相互替换
- [责任链模式](./chain-of-responsibility.md) - 请求沿链传递
- [模板方法模式](./template-method.md) - 定义算法骨架
- [代理模式](./proxy.md) - 控制对象访问
- [观察者模式](./observer.md) - 一对多依赖通知
- [装饰器模式](./decorator.md) - 动态增强功能

## 设计模式分类

### 创建型模式

处理对象创建机制：

- **单例模式** - 唯一实例
- **工厂模式** - 创建对象
- **建造者模式** - 复杂对象构建
- **原型模式** - 克隆创建对象

### 结构型模式

处理类和对象的组合：

- **代理模式** - 控制访问
- **装饰器模式** - 动态增强
- **适配器模式** - 接口转换
- **组合模式** - 树形结构

### 行为型模式

处理对象间的通信：

- **策略模式** - 算法封装
- **责任链模式** - 请求传递
- **模板方法模式** - 算法骨架
- **观察者模式** - 事件通知

## 面试高频问题

### Q1: 你在项目中用过哪些设计模式？

**回答要点：**

1. **单例模式** - 数据库连接池、配置管理器
2. **策略模式** - 支付方式选择、折扣策略
3. **责任链模式** - 登录校验链、审批流程
4. **模板方法** - 导出报表流程、数据处理流程
5. **代理模式** - AOP、事务控制、日志记录
6. **工厂模式** - Bean 工厂、策略工厂

### Q2: Spring 框架用了哪些设计模式？

| 设计模式 | Spring 应用 |
|---------|------------|
| 单例模式 | Bean 默认作用域 |
| 工厂模式 | BeanFactory、FactoryBean |
| 代理模式 | AOP、事务管理 |
| 模板方法 | JdbcTemplate、RedisTemplate |
| 策略模式 | HandlerMapping、ViewResolver |
| 责任链模式 | Filter、Interceptor |
| 观察者模式 | ApplicationEvent、事件监听 |
| 装饰器模式 | BeanWrapper、HttpServletRequestWrapper |

### Q3: 如何选择设计模式？

1. **需要唯一实例？** → 单例模式
2. **对象创建复杂？** → 工厂模式、建造者模式
3. **需要动态切换算法？** → 策略模式
4. **需要增强功能？** → 装饰器模式、代理模式
5. **需要流程标准化？** → 模板方法模式
6. **需要解耦通知？** → 观察者模式
7. **需要逐步处理请求？** → 责任链模式

## 设计原则（SOLID）

### 单一职责原则（SRP）

一个类只有一个变化原因。

```java
// ❌ 违反 SRP
public class UserService {
    public void save() { /* 保存用户 */ }
    public void sendEmail() { /* 发送邮件 */ }
}

// ✅ 符合 SRP
public class UserService {
    public void save() { /* 保存用户 */ }
}
public class EmailService {
    public void send() { /* 发送邮件 */ }
}
```

### 开闭原则（OCP）

对扩展开放，对修改关闭。

```java
// ✅ 策略模式符合 OCP
public interface DiscountStrategy {
    BigDecimal calculate(BigDecimal price);
}

// 新增折扣策略，无需修改现有代码
public class VipDiscount implements DiscountStrategy {
    public BigDecimal calculate(BigDecimal price) {
        return price.multiply(new BigDecimal("0.8"));
    }
}
```

### 里氏替换原则（LSP）

子类可以替换父类。

```java
// ❌ 违反 LSP
public class Bird {
    public void fly() { }
}
public class Penguin extends Bird {
    public void fly() {
        throw new UnsupportedOperationException("企鹅不会飞");
    }
}

// ✅ 符合 LSP
public abstract class Bird { }
public class FlyingBird extends Bird {
    public void fly() { }
}
public class Penguin extends Bird { }
```

### 接口隔离原则（ISP）

客户端不应依赖它不需要的接口。

```java
// ❌ 违反 ISP
public interface Worker {
    void work();
    void eat();
}

// ✅ 符合 ISP
public interface Workable {
    void work();
}
public interface Eatable {
    void eat();
}
```

### 依赖倒置原则（DIP）

依赖抽象，不依赖具体。

```java
// ❌ 违反 DIP
public class UserService {
    private MySQLDatabase db = new MySQLDatabase();
}

// ✅ 符合 DIP
public class UserService {
    private Database db;  // 依赖抽象
    
    public UserService(Database db) {
        this.db = db;
    }
}
```

---

## 参考资料

- [Design Patterns - Refactoring Guru](https://refactoring.guru/design-patterns)
- [Head First 设计模式](https://book.douban.com/subject/2243615/)
- [设计模式之美 - 王争](https://time.geekbang.org/column/intro/100039001)

---

*最后更新: 2026-04-09*
