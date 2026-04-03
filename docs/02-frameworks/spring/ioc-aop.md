# Spring IOC 与 AOP 核心原理

## 一、Spring IOC（控制反转）

### 1.1 什么是 IOC？

**IOC (Inversion of Control)**：控制反转，将对象的创建和管理权交给 Spring 容器。

**传统方式：**
```java
// 对象自己创建依赖
public class UserController {
    private UserService userService = new UserServiceImpl();
}
```

**IOC 方式：**
```java
// Spring 容器注入依赖
@Controller
public class UserController {
    @Autowired
    private UserService userService;
}
```

**好处：**
- 解耦：对象不需要自己管理依赖
- 可测试：方便 Mock 进行单元测试
- 可维护：依赖关系清晰，便于修改

### 1.2 IOC 容器架构

```
BeanFactory (顶层接口)
    └── ApplicationContext (增强接口)
            ├── ClassPathXmlApplicationContext (XML 配置)
            ├── FileSystemXmlApplicationContext (文件系统)
            └── AnnotationConfigApplicationContext (注解配置)
```

**BeanFactory vs ApplicationContext：**

| 特性 | BeanFactory | ApplicationContext |
|------|-------------|---------------------|
| 初始化时机 | 懒加载（使用时创建） | 容器启动时创建 |
| 国际化支持 | 不支持 | 支持 |
| 事件机制 | 不支持 | 支持 |
| 自动装配 | 不支持 | 支持 |
| 使用场景 | 内存受限环境 | 企业应用 |

### 1.3 Bean 的生命周期

```
1. 实例化 (Instantiation)
   ↓
2. 属性赋值 (Populate Properties)
   ↓
3. 初始化前 (BeanPostProcessor.postProcessBeforeInitialization)
   ↓
4. 初始化 (InitializingBean.afterPropertiesSet / init-method)
   ↓
5. 初始化后 (BeanPostProcessor.postProcessAfterInitialization)
   ↓
6. 使用 (Ready)
   ↓
7. 销毁 (DisposableBean.destroy / destroy-method)
```

**代码示例：**

```java
@Component
public class LifeCycleBean implements InitializingBean, DisposableBean {
    
    private String name;
    
    // 1. 实例化（构造器）
    public LifeCycleBean() {
        System.out.println("1. 构造器执行");
    }
    
    // 2. 属性赋值
    @Value("${spring.application.name}")
    public void setName(String name) {
        this.name = name;
        System.out.println("2. 属性赋值");
    }
    
    // 3. 初始化前
    @PostConstruct
    public void postConstruct() {
        System.out.println("3. @PostConstruct");
    }
    
    // 4. 初始化（InitializingBean 接口）
    @Override
    public void afterPropertiesSet() throws Exception {
        System.out.println("4. afterPropertiesSet");
    }
    
    // 5. 自定义初始化方法
    public void init() {
        System.out.println("5. init-method");
    }
    
    // 6. 销毁前
    @PreDestroy
    public void preDestroy() {
        System.out.println("6. @PreDestroy");
    }
    
    // 7. 销毁（DisposableBean 接口）
    @Override
    public void destroy() throws Exception {
        System.out.println("7. destroy");
    }
}
```

### 1.4 Bean 的作用域

| 作用域 | 说明 | 使用场景 |
|--------|------|----------|
| singleton | 单例（默认） | 无状态 Bean |
| prototype | 每次获取创建新实例 | 有状态 Bean |
| request | 每个 HTTP 请求一个实例 | Web 应用 |
| session | 每个 Session 一个实例 | Web 应用 |
| application | ServletContext 生命周期 | Web 应用 |

**配置方式：**
```java
@Component
@Scope("prototype")
public class PrototypeBean {
    // 每次获取都创建新实例
}

// 或使用 @Scope(WebApplicationContext.SCOPE_REQUEST)
```

### 1.5 依赖注入方式

**1. 字段注入（不推荐）**
```java
@Controller
public class UserController {
    @Autowired
    private UserService userService;  // 不推荐：不利于测试，无法注入 final 字段
}
```

**2. 构造器注入（推荐）**
```java
@Controller
public class UserController {
    private final UserService userService;
    
    // @Autowired 可省略（Spring 4.3+，单个构造器时）
    public UserController(UserService userService) {
        this.userService = userService;
    }
}
```

**3. Setter 注入**
```java
@Controller
public class UserController {
    private UserService userService;
    
    @Autowired
    public void setUserService(UserService userService) {
        this.userService = userService;
    }
}
```

**推荐构造器注入的原因：**
1. 可以注入 final 字段（不可变）
2. 依赖关系明确
3. 方便单元测试（无需反射）
4. 避免空指针

### 1.6 循环依赖问题

**场景：**
```java
@Service
public class A {
    @Autowired
    private B b;
}

@Service
public class B {
    @Autowired
    private A a;
}
```

**Spring 解决方案（三级缓存）：**

```java
// 一级缓存：完整的 Bean
private final Map<String, Object> singletonObjects = new ConcurrentHashMap<>(256);

// 二级缓存：早期暴露的 Bean（未完成属性注入）
private final Map<String, Object> earlySingletonObjects = new HashMap<>(16);

// 三级缓存：Bean 工厂（用于处理 AOP）
private final Map<String, ObjectFactory<?>> singletonFactories = new HashMap<>(16);
```

**解决流程：**
1. A 实例化后，暴露到三级缓存
2. A 注入 B，发现 B 不存在
3. B 实例化，注入 A（从三级缓存获取 A 的早期引用）
4. B 完成初始化
5. A 完成注入和初始化

**无法解决的循环依赖：**
- 构造器注入的循环依赖
- @Async 注解的 Bean
- prototype 作用域的 Bean

---

## 二、Spring AOP（面向切面编程）

### 2.1 什么是 AOP？

**AOP (Aspect-Oriented Programming)**：将横切关注点（日志、事务、安全等）从业务逻辑中分离出来。

**核心概念：**

| 概念 | 说明 |
|------|------|
| 切面 (Aspect) | 横切关注点的模块化 |
| 连接点 (JoinPoint) | 程序执行的特定点（方法调用、异常抛出等） |
| 切点 (Pointcut) | 匹配连接点的表达式 |
| 通知 (Advice) | 在切点执行的动作 |
| 目标对象 (Target) | 被通知的对象 |
| 代理 (Proxy) | AOP 创建的代理对象 |
| 织入 (Weaving) | 将切面应用到目标对象的过程 |

### 2.2 通知类型

```java
@Aspect
@Component
public class LoggingAspect {
    
    // 前置通知
    @Before("execution(* com.example.service.*.*(..))")
    public void before(JoinPoint joinPoint) {
        System.out.println("方法执行前: " + joinPoint.getSignature().getName());
    }
    
    // 后置通知（方法执行后，无论是否异常）
    @After("execution(* com.example.service.*.*(..))")
    public void after(JoinPoint joinPoint) {
        System.out.println("方法执行后");
    }
    
    // 返回通知（方法成功返回后）
    @AfterReturning(pointcut = "execution(* com.example.service.*.*(..))", returning = "result")
    public void afterReturning(JoinPoint joinPoint, Object result) {
        System.out.println("方法返回值: " + result);
    }
    
    // 异常通知（方法抛出异常后）
    @AfterThrowing(pointcut = "execution(* com.example.service.*.*(..))", throwing = "ex")
    public void afterThrowing(JoinPoint joinPoint, Exception ex) {
        System.out.println("方法抛出异常: " + ex.getMessage());
    }
    
    // 环绕通知（最强大，可以控制方法执行）
    @Around("execution(* com.example.service.*.*(..))")
    public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.currentTimeMillis();
        
        // 执行目标方法
        Object result = joinPoint.proceed();
        
        long end = System.currentTimeMillis();
        System.out.println("方法执行时间: " + (end - start) + "ms");
        
        return result;
    }
}
```

### 2.3 切点表达式

**语法：**
```
execution(修饰符 返回类型 包名.类名.方法名(参数) 异常)
```

**常用表达式：**

```java
// 匹配所有 public 方法
execution(public * *(..))

// 匹配指定包下所有方法
execution(* com.example.service.*.*(..))

// 匹配指定类的方法
execution(* com.example.service.UserService.*(..))

// 匹配特定方法名
execution(* save*(..))

// 匹配带参数的方法
execution(* com.example.service.*.find*(String))

// 匹配注解
@annotation(org.springframework.transaction.annotation.Transactional)

// 组合表达式（与、或、非）
@Pointcut("execution(* com.example.service.*.*(..)) && @annotation(com.example.Log)")
public void logPointcut() {}
```

### 2.4 AOP 实现原理

**JDK 动态代理 vs CGLIB：**

| 特性 | JDK 动态代理 | CGLIB |
|------|--------------|-------|
| 要求 | 目标类实现接口 | 目标类不能是 final |
| 原理 | 反射生成代理类 | 继承目标类生成子类 |
| 性能 | 调用较慢，生成快 | 调用快，生成慢 |
| Spring 默认 | 有接口时使用 | 无接口时使用 |

**强制使用 CGLIB：**
```java
@EnableAspectJAutoProxy(proxyTargetClass = true)
```

### 2.5 AOP 应用场景

**1. 日志记录**
```java
@Aspect
@Component
public class LogAspect {
    
    @Around("@annotation(com.example.annotation.Log)")
    public Object log(ProceedingJoinPoint joinPoint) throws Throwable {
        String method = joinPoint.getSignature().getName();
        Object[] args = joinPoint.getArgs();
        
        log.info("方法 {} 开始执行，参数: {}", method, args);
        
        try {
            Object result = joinPoint.proceed();
            log.info("方法 {} 执行成功，返回: {}", method, result);
            return result;
        } catch (Exception e) {
            log.error("方法 {} 执行异常", method, e);
            throw e;
        }
    }
}
```

**2. 性能监控**
```java
@Aspect
@Component
public class PerformanceAspect {
    
    @Around("execution(* com.example.service.*.*(..))")
    public Object monitor(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.currentTimeMillis();
        Object result = joinPoint.proceed();
        long elapsed = System.currentTimeMillis() - start;
        
        if (elapsed > 1000) {
            log.warn("方法 {} 执行耗时 {}ms，可能需要优化", 
                joinPoint.getSignature().getName(), elapsed);
        }
        
        return result;
    }
}
```

**3. 事务管理**
```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface MyTransactional {
}

@Aspect
@Component
public class TransactionAspect {
    
    @Around("@annotation(MyTransactional)")
    public Object manageTransaction(ProceedingJoinPoint joinPoint) throws Throwable {
        // 开启事务
        TransactionStatus status = transactionManager.getTransaction(definition);
        
        try {
            Object result = joinPoint.proceed();
            transactionManager.commit(status);
            return result;
        } catch (Exception e) {
            transactionManager.rollback(status);
            throw e;
        }
    }
}
```

---

## 三、Spring 事务管理

### 3.1 事务特性 (ACID)

| 特性 | 说明 |
|------|------|
| 原子性 (Atomicity) | 事务是不可分割的工作单位 |
| 一致性 (Consistency) | 事务前后数据完整性一致 |
| 隔离性 (Isolation) | 多个事务并发执行时互不干扰 |
| 持久性 (Durability) | 事务提交后永久保存 |

### 3.2 事务隔离级别

| 隔离级别 | 脏读 | 不可重复读 | 幻读 |
|----------|------|------------|------|
| READ UNCOMMITTED | ✓ | ✓ | ✓ |
| READ COMMITTED | ✗ | ✓ | ✓ |
| REPEATABLE READ | ✗ | ✗ | ✓ |
| SERIALIZABLE | ✗ | ✗ | ✗ |

**Spring 配置：**
```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
public void transfer() {
    // 业务逻辑
}
```

### 3.3 事务传播行为

| 传播行为 | 说明 |
|----------|------|
| REQUIRED（默认） | 有事务就加入，没有就新建 |
| REQUIRES_NEW | 总是新建事务，挂起当前事务 |
| SUPPORTS | 有事务就加入，没有就以非事务运行 |
| NOT_SUPPORTED | 以非事务运行，挂起当前事务 |
| MANDATORY | 必须在事务中运行，否则抛异常 |
| NEVER | 以非事务运行，有事务就抛异常 |
| NESTED | 嵌套事务（外层回滚，内层也回滚） |

**使用示例：**
```java
@Service
public class OrderService {
    
    @Transactional(propagation = Propagation.REQUIRED)
    public void createOrder() {
        // 主事务
    }
}

@Service
public class LogService {
    
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveLog() {
        // 独立事务，不受主事务回滚影响
    }
}
```

### 3.4 事务失效场景

```java
@Service
public class UserService {
    
    // 1. 方法不是 public
    @Transactional
    private void privateMethod() { }  // 事务失效
    
    // 2. 同类方法调用（绕过代理）
    public void methodA() {
        this.methodB();  // methodB 的事务失效
    }
    
    @Transactional
    public void methodB() { }
    
    // 3. 异常被捕获
    @Transactional
    public void methodC() {
        try {
            // 业务代码抛异常
        } catch (Exception e) {
            e.printStackTrace();  // 异常被捕获，事务不回滚
        }
    }
    
    // 4. 抛出检查异常
    @Transactional  // 默认只回滚 RuntimeException
    public void methodD() throws IOException {
        throw new IOException();  // 事务不回滚
    }
    
    // 正确做法：指定回滚异常
    @Transactional(rollbackFor = Exception.class)
    public void methodE() throws IOException {
        throw new IOException();  // 事务回滚
    }
}
```

---

## 四、Spring Bean 循环依赖详解

### 4.1 为什么需要三级缓存？

**一级缓存不够：** 无法区分正在创建和已完成的 Bean
**二级缓存不够：** 无法处理 AOP 代理

**三级缓存的作用：**
- 一级缓存（singletonObjects）：存放完整的 Bean
- 二级缓存（earlySingletonObjects）：存放早期的 Bean 引用
- 三级缓存（singletonFactories）：存放 Bean 工厂，用于生成代理

### 4.2 解决流程图

```
创建 A → 实例化 A → 暴露到三级缓存 → 注入 B
                                          ↓
                                    创建 B → 实例化 B
                                          ↓
                                    注入 A（从三级缓存获取）
                                          ↓
                                    B 完成初始化
                                          ↓
A ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← 完成注入
↓
A 完成初始化
```

---

## 五、面试高频问题

### Q1: IOC 容器启动流程？

1. 准备环境（Environment）
2. 创建 BeanFactory
3. 加载 BeanDefinition（扫描注解/XML）
4. 注册 BeanPostProcessor
5. 初始化单例 Bean
6. 发布容器就绪事件

### Q2: BeanFactory 和 FactoryBean 的区别？

- **BeanFactory**：Spring 容器的顶层接口，管理 Bean
- **FactoryBean**：用于创建复杂 Bean 的工厂 Bean

```java
public interface FactoryBean<T> {
    T getObject();      // 返回 Bean 实例
    Class<?> getObjectType();  // 返回 Bean 类型
    default boolean isSingleton() { return true; }
}
```

### Q3: @Autowired 和 @Resource 的区别？

| 特性 | @Autowired | @Resource |
|------|------------|-----------|
| 来源 | Spring | JDK (JSR-250) |
| 匹配方式 | 默认按类型 | 默认按名称 |
| 指定名称 | @Qualifier | name 属性 |

### Q4: Spring 如何解决循环依赖？

通过三级缓存 + 提前暴露早期引用解决字段注入的单例循环依赖。

**无法解决的情况：**
- 构造器注入
- prototype 作用域
- @Async 等创建代理的场景

---

## 参考资料

- [Spring 官方文档](https://docs.spring.io/spring-framework/)
- [Spring 源码解析](https://github.com/spring-projects/spring-framework)
- [JavaGuide - Spring 面试题](https://javaguide.cn/system-design/framework/spring/spring-knowledge-and-interview-questions.html)