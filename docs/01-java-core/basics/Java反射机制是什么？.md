# Java 反射机制是什么

## 核心概念

反射（Reflection）是 Java 在运行时检查和操作类、方法、字段、构造器、注解等结构的能力。普通代码在编译期就确定了调用哪个类、哪个方法，而反射让程序在运行时再决定操作谁，从而支持配置化、插件化、框架化。

它的入口是 `Class` 对象。每个被加载的类在 JVM 里都对应一个唯一的 `Class` 实例，反射的所有操作都围绕它展开。

```java
Class<String> c1 = String.class;                       // 类名.class
Class<?> c2 = "hello".getClass();                      // 对象.getClass()
Class<?> c3 = Class.forName("java.lang.String");       // 全限定名，最灵活
```

拿到 `Class` 之后，就可以获取构造器、字段、方法、注解，并完成创建对象、调用方法、修改字段值等动态操作。Spring 的 IoC、MyBatis 的 Mapper 代理、JUnit 的测试发现、Jackson 的 JSON 序列化，本质上都是反射。

## 标准回答

Java 反射机制指程序在运行期可以动态获取类结构信息，并据此创建对象、访问字段、调用方法、读取注解。核心要点：

1. **入口是 `Class` 对象**，三种获取方式：`.class`、`getClass()`、`Class.forName()`。
2. **核心 API**：`Constructor`、`Field`、`Method`、`Annotation`，分别对应构造器、字段、方法、注解。
3. **创建对象**推荐 `Constructor#newInstance()`，`Class#newInstance()` 已废弃。
4. **私有成员访问**通过 `setAccessible(true)` 绕过 Java 语言层访问检查，但破坏封装。
5. **典型应用**是 Spring、MyBatis、JUnit 等框架；性能比直接调用慢，热点路径要缓存 `Method`/`Field`。

## 实现原理

### 1. Class 对象是什么

每个类被类加载器加载后，JVM 会在方法区（JDK 8 永久代、JDK 9+ 元空间）生成一个 `Class` 实例，作为这个类的"运行时元数据"。同一个类在同一个 ClassLoader 下只有一个 `Class` 实例，所以 `obj.getClass() == SomeClass.class` 总是成立。

### 2. 获取 Class 的三种方式对比

| 方式 | 是否触发类初始化 | 典型用途 |
|------|----------------|---------|
| `SomeClass.class` | 否 | 编译期已知类型，常用于参数类型 |
| `obj.getClass()` | 否（对象已经存在，类必然已加载） | 运行时根据实例拿类型 |
| `Class.forName(name)` | 是（默认执行 `<clinit>`） | 配置化加载，如 JDBC 驱动、SPI |

`Class.forName(name)` 默认会触发目标类的静态初始化块。如果只想拿 `Class` 不想触发初始化，用 `Class.forName(name, false, loader)`。

### 3. 反射 API 速览

```java
Class<?> clazz = Class.forName("com.example.User");

// 元信息
String name = clazz.getName();              // com.example.User
String simpleName = clazz.getSimpleName();  // User
int mods = clazz.getModifiers();            // 修饰符
Class<?> superClass = clazz.getSuperclass();
Class<?>[] interfaces = clazz.getInterfaces();

// 字段
Field[] publicFields = clazz.getFields();                // public 字段，含继承
Field[] allFields = clazz.getDeclaredFields();           // 本类声明的所有字段，含 private

// 方法
Method[] publicMethods = clazz.getMethods();
Method[] allMethods = clazz.getDeclaredMethods();
Method m = clazz.getDeclaredMethod("sayHello", String.class);

// 构造器
Constructor<?>[] ctors = clazz.getDeclaredConstructors();
Constructor<?> ctor = clazz.getDeclaredConstructor(String.class, int.class);

// 注解
boolean hasAnno = clazz.isAnnotationPresent(Service.class);
Service anno = clazz.getAnnotation(Service.class);
```

`getXxx()` 和 `getDeclaredXxx()` 的区别是面试高频：

- `getXxx()`：只返回 `public` 成员，包括父类和接口的。
- `getDeclaredXxx()`：返回本类声明的所有成员（含 `private`），但不包括父类。

### 4. 创建对象

```java
// 推荐：通过 Constructor
Constructor<User> ctor = User.class.getDeclaredConstructor(String.class, int.class);
ctor.setAccessible(true);
User user = ctor.newInstance("Tom", 18);

// 已废弃：Class.newInstance() 只能调无参构造器，且异常处理不清晰
User user2 = User.class.newInstance();
```

### 5. 访问字段

```java
Field nameField = User.class.getDeclaredField("name");
nameField.setAccessible(true);
nameField.set(user, "Jerry");
Object value = nameField.get(user);
```

`setAccessible(true)` 关闭 Java 语言层访问检查，让反射能读写 `private` 字段。注意它**不会**绕过安全管理器或模块系统的强约束。

### 6. 调用方法

```java
Method sayHello = User.class.getDeclaredMethod("sayHello", String.class);
sayHello.setAccessible(true);
Object result = sayHello.invoke(user, "hi");
```

`invoke()` 第一个参数是接收者（静态方法传 `null`），后面是可变参数。基本类型参数会自动装箱。

### 7. 反射和动态代理

JDK 动态代理基于接口和反射。代理对象接到调用后，把方法信息封装成 `Method` 对象，交给 `InvocationHandler#invoke()` 处理。

```java
Object proxy = Proxy.newProxyInstance(
        target.getClass().getClassLoader(),
        target.getClass().getInterfaces(),
        (obj, method, args) -> {
            System.out.println("before " + method.getName());
            Object ret = method.invoke(target, args);
            System.out.println("after " + method.getName());
            return ret;
        });
```

Spring AOP 在目标类有接口时默认使用 JDK 动态代理，无接口时退回 CGLIB。

## 代码示例

### 简易 IoC 容器

```java
import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class SimpleContainer {
    private final Map<Class<?>, Object> instances = new ConcurrentHashMap<>();

    @SuppressWarnings("unchecked")
    public <T> T getInstance(Class<T> clazz) throws Exception {
        return (T) instances.computeIfAbsent(clazz, this::createBean);
    }

    private Object createBean(Class<?> clazz) {
        try {
            Constructor<?> ctor = clazz.getDeclaredConstructor();
            ctor.setAccessible(true);
            Object instance = ctor.newInstance();
            // 简化版依赖注入：扫描 @Autowired 字段
            for (Field field : clazz.getDeclaredFields()) {
                if (field.isAnnotationPresent(Autowired.class)) {
                    field.setAccessible(true);
                    field.set(instance, getInstance(field.getType()));
                }
            }
            return instance;
        } catch (Exception e) {
            throw new RuntimeException("创建 Bean 失败: " + clazz, e);
        }
    }
}
```

### 通用对象字段打印工具

```java
import java.lang.reflect.Field;

public class FieldPrinter {
    public static void print(Object obj) throws IllegalAccessException {
        Class<?> clazz = obj.getClass();
        for (Field f : clazz.getDeclaredFields()) {
            f.setAccessible(true);
            System.out.println(f.getName() + " = " + f.get(obj));
        }
    }
}
```

### 通过反射读取泛型返回类型

泛型擦除后，运行时 `Class` 拿不到泛型参数，但方法签名的 `Signature` 属性保留了泛型信息，反射可以通过 `getGenericReturnType()` 取到。

```java
import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.List;

class UserDao {
    public List<String> getList() { return null; }
}

public class GenericReflectionDemo {
    public static void main(String[] args) throws Exception {
        Method m = UserDao.class.getMethod("getList");
        Type type = m.getGenericReturnType();
        if (type instanceof ParameterizedType pt) {
            Type[] args2 = pt.getActualTypeArguments();
            System.out.println(args2[0]); // class java.lang.String
        }
    }
}
```

## 实战场景

| 场景 | 反射用途 | 注意点 |
|------|----------|--------|
| Spring IoC | 扫描 `@Component`，反射创建 Bean，注入 `@Autowired` 字段 | 启动期一次性开销，可接受 |
| MyBatis Mapper | 接口无实现类，运行时反射 + 动态代理生成 | 配合 `MapperProxy` 实现 SQL 绑定 |
| JUnit | 扫描 `@Test` 方法，反射执行 | 测试方法访问控制由 JUnit 自己处理 |
| Jackson/Gson | 反射读写字段做 JSON 序列化 | Java 9+ 需要模块 `opens` |
| Spring MVC | 反射调用 Controller 方法，解析参数 | 缓存 `Method` 和参数解析器 |

## 深挖追问

### 1. 反射为什么慢

- **运行时解析**：每次调用都要查找方法、检查访问权限、装箱基本类型。
- **JIT 难优化**：反射调用入口是 native，JIT 难以内联。
- **方法对象开销**：`Method.invoke` 走的是 JNI 路径，参数要装箱、可变参数要打包。

实际项目中，反射常用于启动期、配置解析等低频路径，性能影响可忽略。高频热点路径应缓存 `Method`/`Field`，或改用 `MethodHandle`（Java 7+）、`VarHandle`（Java 9+）。

### 2. `setAccessible(true)` 是否破坏封装

是的，它跳过 Java 语言层的访问检查。Java 9 引入模块系统后，对跨模块深反射做了限制：非 `opens` 包中的非 `public` 成员，反射访问会抛 `InaccessibleObjectException`。需要在被访问模块的 `module-info.java` 中声明 `opens`，或加 JVM 参数 `--add-opens`。Spring Boot 2.x 在 Java 9+ 上运行时，启动脚本会预置一批 `--add-opens`。

### 3. `getFields` 和 `getDeclaredFields` 的区别

- `getFields()`：返回本类和所有父类的 `public` 字段。
- `getDeclaredFields()`：返回本类声明的所有字段（含 `private`），不包括父类字段。

要拿父类的 `private` 字段，需要沿 `getSuperclass()` 往上递归。

### 4. `Class.newInstance()` 为什么被废弃

它只能调用无参构造器，且把构造器抛出的异常原样包装成 `InvocationTargetException` 之外的多种异常，类型检查不友好。`Constructor#newInstance()` 可以指定参数类型，异常语义清晰，是推荐写法。

### 5. MethodHandle 比反射快在哪

`MethodHandle` 是 Java 7 引入的更低层动态调用机制。JVM 可以对它做内联优化，调用性能接近直接调用。它的缺点是 API 复杂、签名严格。如果只是做几次反射调用，用 `Method` 即可；如果是高性能场景反复调用同一个方法，可以考虑 `MethodHandle`。

## 易错点

- 把反射当成"万能工具"，凡事必反射，破坏封装、影响可读性、增加维护成本。
- 高频路径每次都 `getDeclaredMethod()`，正确做法是缓存 `Method`/`Field`。
- `Class.forName(name)` 默认触发 `<clinit>`，可能引起静态块副作用。
- `Method.invoke()` 传错参数类型会抛 `IllegalArgumentException`，运行时才发现。
- `setAccessible(true)` 在 Java 9+ 模块系统下不万能，跨模块访问非开放包仍会被拒。
- 把 `getXxx()` 当成"返回所有成员"，实际上它只返回 `public` 的，拿不到 `private`。
- 反射修改 `final` 字段不一定生效，JIT 可能已经把 `final` 值内联到使用处。

## 总结

反射是 Java 框架生态的基石。它的本质是"运行时操作类的元数据"，所有动态特性（动态代理、注解处理、IoC、ORM）都建立在它之上。面试中重点讲清三点：核心 API（`Class`/`Field`/`Method`/`Constructor`）、典型应用场景（Spring/MyBatis/JUnit）、性能与封装性权衡（慢、能绕过 `private`、受模块系统限制）。生产中避免滥用，热点路径要缓存元数据。

## 参考资料

- [The Reflection API Tutorial](https://docs.oracle.com/javase/tutorial/reflect/)
- [JLS §15.12 Method Invocation Expressions](https://docs.oracle.com/javase/specs/jls/se17/html/jls-15.html#jls-15.12)
- [Class API (Java SE 17)](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Class.html)
- [JEP 261: Module System（--add-opens 说明）](https://openjdk.org/jeps/261)

---
