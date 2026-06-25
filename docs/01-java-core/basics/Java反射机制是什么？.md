# Java反射机制是什么？

## 核心概念

反射是 Java 在运行时动态获取类信息、创建对象、访问字段、调用方法和处理注解的一套机制。正常代码通常在编译期就确定要调用哪个类和方法，而反射可以在程序运行时再决定操作哪个类。

简单说，反射让程序具备“运行时自省和动态调用”的能力。

常见入口是 `Class` 对象：

```java
Class<String> c1 = String.class;
Class<?> c2 = "hello".getClass();
Class<?> c3 = Class.forName("java.lang.String");
```

拿到 `Class` 后，就可以进一步获取构造器、字段、方法、注解等元信息，并进行动态操作。

## 面试官想考什么

这道题通常不是只问定义，而是想确认你是否理解：

- 反射能做什么。
- `Class` 对象是什么，如何获取。
- 反射创建对象、调用方法、访问字段的基本流程。
- 反射在框架中的典型应用。
- 反射的性能、安全和封装性问题。

## 标准回答

Java 反射机制是指程序在运行期间，可以动态获取类的结构信息，并动态创建对象、访问成员变量、调用方法和读取注解。

反射的核心类主要包括：

- `Class`：表示一个类或接口的运行时元信息。
- `Constructor`：表示构造方法。
- `Field`：表示成员变量。
- `Method`：表示成员方法。
- `Annotation`：表示注解信息。

### 1. 获取 Class 对象

```java
Class<User> clazz1 = User.class;

User user = new User();
Class<?> clazz2 = user.getClass();

Class<?> clazz3 = Class.forName("com.example.User");
```

三种方式都可以拿到 `Class` 对象。其中 `Class.forName()` 常用于配置化加载，例如 JDBC 驱动加载、框架扫描类名等场景。

### 2. 获取类的结构信息

```java
Class<?> clazz = Class.forName("com.example.User");

String className = clazz.getName();
String simpleName = clazz.getSimpleName();
int modifiers = clazz.getModifiers();
Package pkg = clazz.getPackage();
```

也可以获取字段、方法和构造器：

```java
Field[] fields = clazz.getDeclaredFields();
Method[] methods = clazz.getDeclaredMethods();
Constructor<?>[] constructors = clazz.getDeclaredConstructors();
```

### 3. 创建对象

推荐通过构造器创建对象：

```java
Constructor<?> constructor = clazz.getDeclaredConstructor(String.class, Integer.class);
constructor.setAccessible(true);
Object obj = constructor.newInstance("Tom", 18);
```

`Class#newInstance()` 已不推荐使用，因为它只能调用无参构造器，异常表达也不够清晰。

### 4. 访问字段

```java
Object user = clazz.getDeclaredConstructor().newInstance();

Field nameField = clazz.getDeclaredField("name");
nameField.setAccessible(true);
nameField.set(user, "Tom");

Object value = nameField.get(user);
```

`setAccessible(true)` 可以绕过 Java 语言层面的访问检查，但也意味着破坏封装，使用时要谨慎。

### 5. 调用方法

```java
Method method = clazz.getDeclaredMethod("sayHello", String.class);
method.setAccessible(true);
Object result = method.invoke(user, "Jerry");
```

反射调用方法时，参数类型必须匹配，否则容易出现 `NoSuchMethodException` 或 `IllegalArgumentException`。

### 6. 读取注解

```java
if (clazz.isAnnotationPresent(Service.class)) {
    Service service = clazz.getAnnotation(Service.class);
    System.out.println(service.value());
}
```

Spring、MyBatis、JUnit 等框架都大量使用反射和注解来实现自动装配、对象映射和测试发现。

## 深挖追问

### 1. 反射为什么会影响性能？

反射调用通常比直接方法调用慢，原因包括：

- 需要运行时解析类、方法和字段信息。
- 调用过程涉及访问检查、参数封装和异常包装。
- 编译器和 JIT 对反射调用的优化空间相对有限。

不过在大多数业务场景里，反射常用于框架初始化、对象创建、配置解析等非高频路径，性能影响可以接受。真正的热点路径应避免频繁反射，或者做缓存。

### 2. setAccessible(true) 的作用是什么？

它用于关闭 Java 语言层面的访问检查，使反射可以访问 private 构造器、字段和方法。

但它会破坏封装，也可能受到模块系统、安全策略或运行环境限制。在 Java 9 之后，模块化系统对深反射访问有更严格的限制。

### 3. 反射和动态代理有什么关系？

JDK 动态代理依赖接口和反射调用。代理对象接收到方法调用后，会把方法信息封装成 `Method` 对象，并交给 `InvocationHandler#invoke()` 处理。

```java
Object proxy = Proxy.newProxyInstance(
        target.getClass().getClassLoader(),
        target.getClass().getInterfaces(),
        (obj, method, args) -> method.invoke(target, args)
);
```

Spring AOP 中，如果目标类有接口，默认可以使用 JDK 动态代理；如果没有接口，通常使用 CGLIB 生成子类代理。

### 4. getFields 和 getDeclaredFields 有什么区别？

- `getFields()`：只能获取 public 字段，包括父类 public 字段。
- `getDeclaredFields()`：获取当前类声明的所有字段，包括 private，但不包括父类字段。

方法和构造器也有类似区别，例如 `getMethods()` 和 `getDeclaredMethods()`。

## 实战场景

### 场景 1：Spring IoC 创建 Bean

Spring 扫描到类后，可以通过反射读取注解、选择构造器、创建对象，再通过反射或方法句柄进行依赖注入。

```java
Class<?> clazz = Class.forName("com.example.UserService");
Object bean = clazz.getDeclaredConstructor().newInstance();
```

这就是为什么 Spring 可以根据配置或注解在运行时创建对象，而不是在代码里手动 `new`。

### 场景 2：ORM 框架映射对象

MyBatis、Hibernate 等框架会把数据库查询结果映射成 Java 对象。它们可以根据字段名或注解找到 Java 属性，再通过反射赋值。

```java
Field field = User.class.getDeclaredField("name");
field.setAccessible(true);
field.set(user, resultSet.getString("name"));
```

### 场景 3：通用工具方法

例如写一个对象字段打印工具：

```java
public static void printFields(Object obj) throws Exception {
    Class<?> clazz = obj.getClass();
    for (Field field : clazz.getDeclaredFields()) {
        field.setAccessible(true);
        System.out.println(field.getName() + "=" + field.get(obj));
    }
}
```

这种工具不需要提前知道具体类，就可以处理不同对象。

## 易错点

- 反射不是编译期能力，而是运行时动态操作能力。
- `Class.forName()` 可能触发类初始化，要注意副作用。
- `setAccessible(true)` 会破坏封装，不应滥用。
- `Class#newInstance()` 已不推荐，优先使用 `Constructor#newInstance()`。
- 反射高频调用要缓存 `Class`、`Field`、`Method` 等元信息。
- Java 9 之后模块系统可能限制对非开放包的深反射。

## 总结

Java 反射机制让程序可以在运行时获取类结构并动态操作对象，是 Spring、MyBatis、JUnit 等框架的重要基础。面试回答时建议从定义讲起，再说明 Class、Field、Method、Constructor 的用法，最后补充框架应用、性能损耗和封装破坏等注意点。
