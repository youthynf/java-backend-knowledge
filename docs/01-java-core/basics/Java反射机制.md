# Java 反射机制

## 核心概念

反射（Reflection）是 Java 在运行时检查和操作类、方法、字段等结构的能力。它打破了编译期的静态绑定，让程序可以动态地：

- 获取类的完整结构信息（字段、方法、构造器、注解）
- 运行时创建对象、调用方法、访问字段
- 实现框架的底层机制（Spring IOC、MyBatis、JUnit 等）

```java
// 反射的入口：Class 对象
Class<?> clazz = Class.forName("com.example.User");

// 三种获取 Class 的方式
Class<?> c1 = User.class;                     // 类名.class
Class<?> c2 = new User().getClass();          // 对象.getClass()
Class<?> c3 = Class.forName("com.example.User"); // 全限定名（最灵活）
```

## 面试高频问题

### 1. 反射能做什么？

| 能力 | API | 示例 |
|------|-----|------|
| 获取类名 | `getName()` / `getSimpleName()` | `"com.example.User"` |
| 获取字段 | `getDeclaredFields()` | 包括 private 字段 |
| 获取方法 | `getDeclaredMethods()` | 包括 private 方法 |
| 创建实例 | `newInstance()` / 构造器 | 绕过 new 关键字 |
| 调用方法 | `Method.invoke()` | 动态调用任意方法 |
| 访问私有成员 | `setAccessible(true)` | 突破访问控制 |

### 2. 反射为什么慢？

- **安全检查**：每次反射调用都要检查访问权限
- **无法内联**：JIT 无法内联反射调用的方法
- **参数装箱**：基本类型参数需要装箱
- **方法查找**：运行时按名称查找方法，无法编译期优化

> 优化方案：`MethodHandle`（Java 7）和 `VarHandle`（Java 9）比反射更快

### 3. setAccessible(true) 是否破坏封装？

```java
Field field = User.class.getDeclaredField("password");
field.setAccessible(true);  // 绕过 private 限制
field.set(user, "hacked");  // 修改私有字段

// ⚠️ 模块化系统（Java 9+）限制了这种操作
// 需要模块声明 opens 或 JVM 参数 --add-opens
```

> 面试回答：**是的**，`setAccessible` 突破了访问控制。Java 9 模块化对其做了进一步限制，但为了向后兼容，大部分场景仍可使用。

### 4. 反射和泛型的关系？

```java
// 泛型擦除后，运行时拿不到泛型信息？不完全对！
// 通过签名（Signature）可以获取部分泛型信息

Method method = Dao.class.getMethod("getList");
Type returnType = method.getGenericReturnType();

if (returnType instanceof ParameterizedType) {
    ParameterizedType pt = (ParameterizedType) returnType;
    Type[] typeArgs = pt.getActualTypeArguments();
    System.out.println(typeArgs[0]); // 输出: class java.lang.String
}
```

## 代码示例

### 框架底层：简易 IOC 容器

```java
public class SimpleContainer {
    private final Map<Class<?>, Object> instances = new ConcurrentHashMap<>();
    
    public <T> T getInstance(Class<T> clazz) throws Exception {
        // 单例缓存
        if (instances.containsKey(clazz)) {
            return clazz.cast(instances.get(clazz));
        }
        
        // 反射创建实例
        Constructor<T> constructor = clazz.getDeclaredConstructor();
        constructor.setAccessible(true);
        T instance = constructor.newInstance();
        
        // 依赖注入：扫描 @Autowired 字段
        for (Field field : clazz.getDeclaredFields()) {
            if (field.isAnnotationPresent(Autowired.class)) {
                field.setAccessible(true);
                Object dependency = getInstance(field.getType());
                field.set(instance, dependency);
            }
        }
        
        instances.put(clazz, instance);
        return instance;
    }
}
```

### 动态代理：AOP 的基础

```java
// JDK 动态代理（基于接口）
Object proxy = Proxy.newProxyInstance(
    target.getClass().getClassLoader(),
    target.getClass().getInterfaces(),
    (obj, method, args) -> {
        System.out.println("Before: " + method.getName());
        Object result = method.invoke(target, args);  // 反射调用
        System.out.println("After: " + method.getName());
        return result;
    }
);
```

## 实战场景

| 场景 | 反射用途 |
|------|----------|
| **Spring IOC** | 扫描 `@Component`，反射创建 Bean，注入 `@Autowired` |
| **MyBatis** | Mapper 接口无实现类，运行时反射 + 动态代理生成 |
| **JUnit** | 扫描 `@Test` 方法，反射执行 |
| **Jackson/Gson** | 反射读取字段值序列化为 JSON |
| **Spring MVC** | 反射调用 Controller 方法，解析参数 |

## 延伸思考

- **MethodHandle vs 反射**：MethodHandle 是 Java 7 引入的更底层、更高效的动态调用机制，但 API 更复杂
- **模块化系统的限制**：Java 9+ 的 `--add-opens` 参数是什么？为什么 Spring Boot 2.x 需要？
- **Record 类与反射**：Java 14+ 的 Record 类如何通过反射获取构造器参数名？

## 参考资料

- [JLS §15.12 - Method Invocation Expressions](https://docs.oracle.com/javase/specs/jls/se17/html/jls-15.html#jls-15.12)
- [The Reflection API Tutorial](https://docs.oracle.com/javase/tutorial/reflect/)

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- 反射允许运行期获取类结构、创建对象、访问字段、调用方法。
- 核心类型有 Class、Constructor、Field、Method。

### 面试官想考什么
- 动态性、性能成本和封装破坏风险。
- Spring/ORM/序列化为何依赖反射。

### 标准回答
反射让程序可基于类名、注解或配置执行逻辑，提升框架扩展性；缺点是性能和可读性较差，可能绕过封装，生产中应缓存反射元数据。

### 深挖追问
- Class.forName 和 Xxx.class 区别？
- setAccessible 风险？
- 反射和动态代理关系？

### 实战场景/代码示例
```java
Class<?> c=Class.forName("com.example.User");
Object o=c.getDeclaredConstructor().newInstance();
Method m=c.getDeclaredMethod("setName",String.class);
m.invoke(o,"Tom");
```

### 易错点/总结
- 不要吞反射异常。
- 模块化环境下访问非公开成员可能受限制。

