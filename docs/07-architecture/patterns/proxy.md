# 代理模式

> 为对象提供代理，控制对原对象的访问

## 核心概念

### 什么是代理模式？

代理模式是一种结构型设计模式，让你能够提供对象的替代品或占位符。代理控制着对原对象的访问，并允许在将请求提交给对象前后进行一些处理。

### 使用场景

- **远程代理**：为远程对象提供本地代理（RPC）
- **虚拟代理**：延迟创建开销大的对象（懒加载图片）
- **保护代理**：控制对对象的访问权限
- **智能代理**：在访问对象时增加额外逻辑（日志、缓存）

---

## 实现方式

### 1. 静态代理

代理类在编译时就确定。

```java
// 接口
public interface UserService {
    void save();
    void delete();
}

// 目标对象
public class UserServiceImpl implements UserService {
    public void save() {
        System.out.println("保存用户");
    }
    public void delete() {
        System.out.println("删除用户");
    }
}

// 代理对象
public class UserServiceProxy implements UserService {
    private UserService target;
    
    public UserServiceProxy(UserService target) {
        this.target = target;
    }
    
    public void save() {
        before();
        target.save();
        after();
    }
    
    public void delete() {
        before();
        target.delete();
        after();
    }
    
    private void before() {
        System.out.println("开启事务");
    }
    
    private void after() {
        System.out.println("提交事务");
    }
}

// 使用
UserService userService = new UserServiceProxy(new UserServiceImpl());
userService.save();
```

**缺点：** 一个代理类只能代理一个接口，代码冗余。

---

### 2. JDK 动态代理

运行时动态生成代理类，基于接口。

```java
// InvocationHandler
public class LogHandler implements InvocationHandler {
    private Object target;
    
    public LogHandler(Object target) {
        this.target = target;
    }
    
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        before(method.getName());
        Object result = method.invoke(target, args);
        after(method.getName());
        return result;
    }
    
    private void before(String methodName) {
        System.out.println("[" + methodName + "] 开始执行");
    }
    
    private void after(String methodName) {
        System.out.println("[" + methodName + "] 执行完成");
    }
}

// 创建代理对象
UserService target = new UserServiceImpl();
UserService proxy = (UserService) Proxy.newProxyInstance(
    target.getClass().getClassLoader(),
    target.getClass().getInterfaces(),
    new LogHandler(target)
);

proxy.save();
```

**输出：**
```
[save] 开始执行
保存用户
[save] 执行完成
```

**JDK 动态代理原理：**

```java
// 代理类大致结构（简化）
public class $Proxy0 implements UserService {
    private InvocationHandler h;
    
    public void save() {
        try {
            Method m = UserService.class.getMethod("save");
            h.invoke(this, m, null);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

---

### 3. CGLIB 动态代理

基于继承，代理类继承目标类。

```java
// 需要引入 cglib 依赖
// import net.sf.cglib.proxy.*;

// MethodInterceptor
public class TransactionInterceptor implements MethodInterceptor {
    @Override
    public Object intercept(Object obj, Method method, Object[] args, MethodProxy proxy) throws Throwable {
        before();
        Object result = proxy.invokeSuper(obj, args);  // 调用父类方法
        after();
        return result;
    }
    
    private void before() {
        System.out.println("开启事务");
    }
    
    private void after() {
        System.out.println("提交事务");
    }
}

// 创建代理对象
Enhancer enhancer = new Enhancer();
enhancer.setSuperclass(UserServiceImpl.class);
enhancer.setCallback(new TransactionInterceptor());
UserServiceImpl proxy = (UserServiceImpl) enhancer.create();

proxy.save();
```

**输出：**
```
开启事务
保存用户
提交事务
```

**注意：** CGLIB 无法代理 final 类和 final 方法。

---

## JDK vs CGLIB

| 维度 | JDK 动态代理 | CGLIB 动态代理 |
|------|-------------|---------------|
| 实现方式 | 基于接口 | 基于继承 |
| 目标类要求 | 必须实现接口 | 不能是 final 类 |
| 方法要求 | 任意 | 不能是 final 方法 |
| 性能 | 生成代理快，调用慢 | 生成代理慢，调用快 |
| Spring 默认 | 有接口时使用 | 无接口时使用 |

**Spring AOP 配置：**

```java
@Configuration
@EnableAspectJAutoProxy(proxyTargetClass = true)  // 强制使用 CGLIB
public class AopConfig { }
```

---

## 实战场景

### 1. AOP 日志代理

```java
@Component
public class LoggingAspect {
    
    @Around("execution(* com.example.service.*.*(..))")
    public Object logAround(ProceedingJoinPoint joinPoint) throws Throwable {
        String methodName = joinPoint.getSignature().getName();
        Object[] args = joinPoint.getArgs();
        
        System.out.println(">>> " + methodName + " 开始，参数: " + Arrays.toString(args));
        
        long start = System.currentTimeMillis();
        Object result = joinPoint.proceed();  // 执行目标方法
        long end = System.currentTimeMillis();
        
        System.out.println("<<< " + methodName + " 完成，耗时: " + (end - start) + "ms");
        
        return result;
    }
}
```

---

### 2. 缓存代理

```java
public class CacheProxy implements InvocationHandler {
    private Object target;
    private Map<String, Object> cache = new HashMap<>();
    
    public CacheProxy(Object target) {
        this.target = target;
    }
    
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        // 生成缓存 key
        String key = method.getName() + Arrays.toString(args);
        
        // 检查缓存
        if (cache.containsKey(key)) {
            System.out.println("缓存命中: " + key);
            return cache.get(key);
        }
        
        // 执行方法并缓存
        Object result = method.invoke(target, args);
        cache.put(key, result);
        System.out.println("缓存未命中，已缓存: " + key);
        
        return result;
    }
}
```

---

### 3. 保护代理（权限控制）

```java
public class PermissionProxy implements InvocationHandler {
    private Object target;
    private String userRole;
    
    public PermissionProxy(Object target, String userRole) {
        this.target = target;
        this.userRole = userRole;
    }
    
    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        // 检查权限
        if ("delete".equals(method.getName()) && !"admin".equals(userRole)) {
            throw new SecurityException("无删除权限");
        }
        
        return method.invoke(target, args);
    }
}

// 使用
UserService target = new UserServiceImpl();
UserService adminProxy = (UserService) Proxy.newProxyInstance(
    target.getClass().getClassLoader(),
    target.getClass().getInterfaces(),
    new PermissionProxy(target, "admin")
);
adminProxy.delete();  // 允许

UserService userProxy = (UserService) Proxy.newProxyInstance(
    target.getClass().getClassLoader(),
    target.getClass().getInterfaces(),
    new PermissionProxy(target, "user")
);
userProxy.delete();  // 抛出 SecurityException
```

---

## 面试高频问题

### Q1: 静态代理 vs 动态代理？

| 维度 | 静态代理 | 动态代理 |
|------|---------|---------|
| 代理类生成 | 编译时确定 | 运行时生成 |
| 代码量 | 多（每个类都需要代理类） | 少（一个 Handler 可代理多个类） |
| 灵活性 | 低（修改需重新编译） | 高（运行时决定） |
| 性能 | 高 | 稍低（反射开销） |

---

### Q2: JDK 动态代理为什么必须实现接口？

JDK 动态代理生成的代理类继承了 `Proxy` 类，Java 不支持多继承，所以只能实现接口。

```java
// 生成的代理类结构
public final class $Proxy0 extends Proxy implements UserService {
    // ...
}
```

---

### Q3: Spring AOP 用的是什么代理？

- **默认规则：**
  - 目标类实现了接口 → JDK 动态代理
  - 目标类没实现接口 → CGLIB

- **强制使用 CGLIB：**
  ```java
  @EnableAspectJAutoProxy(proxyTargetClass = true)
  ```

- **Spring Boot 2.x 默认使用 CGLIB**（`proxyTargetClass = true`）

---

### Q4: 代理模式 vs 装饰器模式？

| 维度 | 代理模式 | 装饰器模式 |
|------|---------|-----------|
| 目的 | 控制访问 | 增强功能 |
| 创建方式 | 代理创建目标对象 | 装饰器由客户端创建 |
| 关系 | 代理和目标对象同级 | 装饰器和被装饰对象同级 |
| 应用 | AOP、远程代理 | IO 流、集合包装 |

**装饰器模式示例：**

```java
// 装饰器
BufferedReader br = new BufferedReader(new FileReader("file.txt"));

// 多层装饰
InputStream is = new BufferedInputStream(
    new GZIPInputStream(
        new FileInputStream("file.gz")
    )
);
```

---

## 参考资料

- [代理模式 - Refactoring Guru](https://refactoring.guru/design-patterns/proxy)
- [JDK 动态代理源码分析](https://tech.meituan.com/2018/09/07/jdk-dynamic-proxy.html)
- [Spring AOP 详解](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#aop)

---

*最后更新: 2026-04-09*
