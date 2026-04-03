# Spring Framework

## 核心概念

### IOC（控制反转）

**Bean 生命周期**：
1. 实例化（Instantiation）
2. 属性赋值（Populate）
3. 初始化前（BeanPostProcessor.postProcessBeforeInitialization）
4. 初始化（InitializingBean.afterPropertiesSet、init-method）
5. 初始化后（BeanPostProcessor.postProcessAfterInitialization）
6. 销毁（DisposableBean.destroy、destroy-method）

**循环依赖解决**：
- 三级缓存
  1. singletonObjects：完整 Bean
  2. earlySingletonObjects：早期引用（未完成初始化）
  3. singletonFactories：ObjectFactory（用于生成代理）

**三级缓存流程**：
```
A 创建 → 注入 B → B 创建 → 注入 A 
→ 从三级缓存获取 A 的 ObjectFactory → 生成 A 的早期引用 → B 完成 → A 完成
```

### AOP（面向切面编程）

**实现方式**：
- JDK 动态代理：基于接口
- CGLIB：基于类继承

**核心概念**：
- Joinpoint：连接点（方法调用）
- Pointcut：切点（匹配规则）
- Advice：通知（Before、After、Around、AfterReturning、AfterThrowing）
- Aspect：切面（Pointcut + Advice）

**代理选择**：
- 有接口 → JDK 动态代理
- 无接口 → CGLIB
- 可配置 `proxy-target-class=true` 强制使用 CGLIB

### 事务管理

**传播机制**：

| 传播行为 | 说明 |
|----------|------|
| REQUIRED | 有则加入，无则新建（默认） |
| REQUIRES_NEW | 新建事务，挂起当前 |
| SUPPORTS | 有则加入，无则非事务运行 |
| NOT_SUPPORTED | 非事务运行，挂起当前 |
| MANDATORY | 必须有事务，否则抛异常 |
| NEVER | 必须无事务，否则抛异常 |
| NESTED | 嵌套事务（保存点） |

**事务失效场景**：
1. 方法非 public
2. 同类方法调用（绕过代理）
3. 异常被 catch 吞掉
4. 抛出 checked 异常
5. 数据库引擎不支持事务

---

## 面试高频问题

### 1. Spring Bean 的生命周期？

**回答要点**：
- 实例化 → 属性赋值 → 初始化 → 销毁
- 各阶段的扩展点（BeanPostProcessor、InitializingBean 等）
- AOP 代理在初始化后生成

### 2. Spring 如何解决循环依赖？

**回答要点**：
- 三级缓存机制
- 只能解决单例、非构造函数注入的循环依赖
- 多例和构造函数注入的循环依赖无法解决

### 3. Spring AOP 如何选择代理方式？

**回答要点**：
- 默认：有接口用 JDK，无接口用 CGLIB
- `proxy-target-class=true` 强制 CGLIB
- Spring Boot 2.x 默认使用 CGLIB

### 4. @Transactional 如何保证事务？

**回答要点**：
- 通过 AOP 生成代理
- 方法执行前开启事务
- 方法正常执行后提交事务
- 抛出 RuntimeException 回滚事务

### 5. Spring Boot 自动配置原理？

**回答要点**：
- @EnableAutoConfiguration
- spring.factories 文件
- @Conditional 条件注解
- Starter 依赖

---

## 代码示例

### BeanPostProcessor 示例

```java
@Component
public class MyBeanPostProcessor implements BeanPostProcessor {
    
    @Override
    public Object postProcessBeforeInitialization(Object bean, String beanName) {
        System.out.println("Before: " + beanName);
        return bean;
    }
    
    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        System.out.println("After: " + beanName);
        return bean;
    }
}
```

### 事务传播示例

```java
@Service
public class OrderService {
    
    @Transactional
    public void createOrder(Order order) {
        // 主事务
        orderDao.insert(order);
        
        // 新事务：即使主事务回滚，日志仍然保存
        logService.saveLog(order);
    }
}

@Service
public class LogService {
    
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveLog(Order order) {
        logDao.insert(new Log(order));
    }
}
```

---

## 实战场景

### 循环依赖调试

```java
// 检查是否有循环依赖
// 查看三级缓存内容
DefaultSingletonBeanRegistry registry = (DefaultSingletonBeanRegistry) 
    applicationContext.getBeanFactory();

// 打印三级缓存
registry.getSingleton("beanA");  // 一级
registry.getEarlySingletonObjects().get("beanA");  // 二级
registry.getSingletonFactories().get("beanA");  // 三级
```

### 事务失效修复

```java
// 错误：同类方法调用
@Transactional
public void methodA() {
    this.methodB();  // 事务失效
}

// 正确方式 1：注入自己
@Autowired
private MyService self;

@Transactional
public void methodA() {
    self.methodB();  // 事务生效
}

// 正确方式 2：AopContext
@Transactional
public void methodA() {
    ((MyService) AopContext.currentProxy()).methodB();
}
```

---

## 延伸思考

- Spring 如何处理多例 Bean 的循环依赖？
- Spring 如何实现条件装配？
- Spring 事件机制是如何工作的？
- 如何设计一个 Starter？

## 参考资料

- [Spring 官方文档](https://docs.spring.io/spring-framework/docs/current/reference/html/)
- [Spring 源码深度解析](https://book.douban.com/subject/26676889/)
