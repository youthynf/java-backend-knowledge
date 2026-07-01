# Java 注解机制是什么

## 核心概念

注解（Annotation）是 Java 5 引入的元数据机制，可以为类、方法、字段、参数等程序元素添加额外说明。注解本身不直接改变业务逻辑，但编译器、运行时框架、工具可以读取注解并据此生成代码、执行校验、完成依赖注入或控制流程。

注解的本质是一个**继承自 `java.lang.annotation.Annotation` 的接口**。在源码层是注解，在运行时通过反射拿到的是实现了该接口的动态代理对象。

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Log {
    String value() default "";
}
```

注解的强大在于：它把"声明式编程"带入 Java。Spring 的 `@Component`、`@Autowired`、`@RequestMapping`，JUnit 的 `@Test`，Hibernate 的 `@Entity`、`@Column`，Lombok 的 `@Data`、`@Getter`，都是注解驱动的。

## 标准回答

注解是 Java 的元数据机制，本质是继承 `Annotation` 的接口，编译后生成 `.class`，运行时通过反射读取。要点：

1. **元注解**：`@Target`（作用位置）、`@Retention`（保留阶段）、`@Documented`、`@Inherited`、`@Repeatable`。
2. **三种保留策略**：`SOURCE`（编译期丢弃）、`CLASS`（保留到 class 文件，运行时不可读，默认）、`RUNTIME`（运行时可反射读取）。
3. **注解属性**：用方法形式声明，必须有默认值或使用时提供。
4. **读取方式**：`Class#isAnnotationPresent`、`getAnnotation`、`Method#getAnnotations` 等反射 API。
5. **典型应用**：Spring 全家桶、JUnit、Lombok、Hibernate、JSR-303 校验。

## 实现原理

### 1. 注解的本质

注解在源码层是一个接口，继承 `java.lang.annotation.Annotation`。

```java
// 自定义注解源码
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface MyAnnotation {
    String value();
}

// 编译后的字节码等价于
interface MyAnnotation extends java.lang.annotation.Annotation {
    String value();
}
```

运行时通过反射拿到的注解对象，是 JVM 生成的动态代理实例（`Proxy` + `AnnotationInvocationHandler`），它实现了注解接口，并持有注解属性值。

### 2. 元注解

元注解是修饰注解的注解，共 5 个（Java 8+）：

| 元注解 | 作用 |
|--------|------|
| `@Target` | 注解可以作用的元素类型（TYPE、METHOD、FIELD、PARAMETER、CONSTRUCTOR、LOCAL_VARIABLE、ANNOTATION_TYPE、PACKAGE、TYPE_PARAMETER、TYPE_USE） |
| `@Retention` | 保留策略：SOURCE / CLASS / RUNTIME |
| `@Documented` | 是否包含在 JavaDoc 中 |
| `@Inherited` | 子类是否继承父类的注解（仅对类上的注解有效） |
| `@Repeatable` | 是否可重复声明（Java 8+） |

### 3. `@Retention` 的三种策略

```java
// 1. SOURCE：仅源码保留，编译后丢弃
@Retention(RetentionPolicy.SOURCE)
@interface Override {}     // @Override、@SuppressWarnings 都是 SOURCE

// 2. CLASS：保留到 class 文件，运行时 JVM 不加载（默认值）
@Retention(RetentionPolicy.CLASS)
@interface MyMarker {}

// 3. RUNTIME：运行时可反射读取
@Retention(RetentionPolicy.RUNTIME)
@interface MyRuntime {}
```

不同策略的用途：

- **SOURCE**：给编译器看（`@Override` 检查重写、`@SuppressWarnings` 抑制警告），或给注解处理器（APT）生成代码用（Lombok 的 `@Data`）。运行时不需要。
- **CLASS**：默认值，给字节码工具用（如 ByteBuddy、ASM），但运行时反射读不到。很少直接使用。
- **RUNTIME**：运行时框架用（Spring、JUnit、Hibernate），必须设为这个策略才能反射读取。

### 4. `@Target` 的元素类型

```java
@Target({
    ElementType.TYPE,           // 类、接口、注解、枚举
    ElementType.FIELD,          // 字段（含枚举常量）
    ElementType.METHOD,         // 方法
    ElementType.PARAMETER,      // 方法参数
    ElementType.CONSTRUCTOR,    // 构造器
    ElementType.LOCAL_VARIABLE, // 局部变量
    ElementType.ANNOTATION_TYPE,// 注解类型
    ElementType.PACKAGE,        // 包
    ElementType.TYPE_PARAMETER, // 类型参数 <T>（Java 8+）
    ElementType.TYPE_USE        // 类型使用处（Java 8+）
})
```

Java 8 新增 `TYPE_PARAMETER` 和 `TYPE_USE`，支持在泛型参数和使用位置加注解：

```java
public class Box<@NonNull T> {                  // TYPE_PARAMETER
    private @NonNull T value;                   // TYPE_USE
    public void set(@NonNull T v) { value = v; }
}
```

### 5. 注解属性

注解的属性用方法形式声明，类型只能是：

- 基本类型（`int`、`long`、`boolean` 等）
- `String`
- `Class`
- 枚举
- 注解类型
- 上述类型的一维数组

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface Service {
    String value() default "";           // 属性，带默认值
    String name() default "";
    boolean lazy() default false;
    Class<?>[] dependsOn() default {};   // Class 数组
}
```

属性如果名为 `value`，使用时可以省略名字：

```java
@Service("userService")
@Service(value = "userService", lazy = true)
```

### 6. 反射读取注解

```java
import java.lang.annotation.*;
import java.lang.reflect.Method;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@interface Logged {
    String value() default "";
}

class Service {
    @Logged("执行查询")
    public void query() {}
}

public class AnnotationDemo {
    public static void main(String[] args) throws Exception {
        Method m = Service.class.getMethod("query");
        if (m.isAnnotationPresent(Logged.class)) {
            Logged logged = m.getAnnotation(Logged.class);
            System.out.println(logged.value());  // 执行查询
        }
    }
}
```

注意：注解必须标记 `RUNTIME` 保留策略，反射才能读到。`SOURCE` 和 `CLASS` 策略的注解运行时拿不到。

### 7. 注解处理时机

注解可以在三个阶段被处理：

1. **编译期**：注解处理器（APT/Pluggable Annotation Processing）读取注解，生成新类或修改字节码。Lombok、AutoValue、Dagger 都是这个机制。
2. **类加载期**：字节码工具（ASM、ByteBuddy、CGLIB）读取 class 文件中的注解，运行时增强字节码。
3. **运行期**：Spring 等框架通过反射读取注解，做 IoC/AOP。

Lombok 的 `@Data` 是编译期处理：Lombok 修改 AST（抽象语法树）添加 getter/setter，编译后的 class 文件里就有这些方法。

## 代码示例

### 自定义校验注解

```java
import java.lang.annotation.*;
import java.lang.reflect.Field;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface Range {
    int min() default 0;
    int max() default Integer.MAX_VALUE;
    String message() default "数值超出范围";
}

class UserForm {
    @Range(min = 0, max = 150, message = "年龄必须在 0~150 之间")
    private int age;

    @Range(min = 1, max = 32, message = "用户名长度非法")
    private int nameLength;

    public void setAge(int age) { this.age = age; }
    public void setNameLength(int n) { this.nameLength = n; }
}

public class Validator {
    public static void validate(Object obj) throws Exception {
        for (Field f : obj.getClass().getDeclaredFields()) {
            if (f.isAnnotationPresent(Range.class)) {
                f.setAccessible(true);
                int value = f.getInt(obj);
                Range r = f.getAnnotation(Range.class);
                if (value < r.min() || value > r.max()) {
                    throw new IllegalArgumentException(r.message());
                }
            }
        }
    }

    public static void main(String[] args) throws Exception {
        UserForm form = new UserForm();
        form.setAge(200);
        Validator.validate(form);  // 抛 IllegalArgumentException
    }
}
```

### AOP 切面 + 注解

```java
import java.lang.annotation.*;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface AuditLog {
    String action();
}

// 借助 Spring AOP 切面
// @Aspect @Component
// public class AuditAspect {
//     @Around("@annotation(auditLog)")
//     public Object around(ProceedingJoinPoint pjp, AuditLog auditLog) throws Throwable {
//         log.info("操作: {}", auditLog.action());
//         return pjp.proceed();
//     }
// }

class OrderService {
    @AuditLog(action = "创建订单")
    public void createOrder(String orderNo) {
        System.out.println("创建订单: " + orderNo);
    }
}
```

### 重复注解（Java 8+）

```java
import java.lang.annotation.*;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
@Repeatable(Schedules.class)  // 标记可重复
public @interface Schedule {
    String cron();
}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface Schedules {
    Schedule[] value();
}

@Schedule(cron = "0 0 * * *")
@Schedule(cron = "0 30 * * *")
public class ScheduledTask {}
```

## 实战场景

| 场景 | 注解 | 处理时机 |
|------|------|---------|
| Spring IoC | `@Component`、`@Service`、`@Autowired` | 运行时反射 |
| Spring MVC | `@Controller`、`@RequestMapping`、`@RequestParam` | 运行时反射 |
| 参数校验 | `@NotNull`、`@Size`、`@Range`（JSR-303） | 运行时反射 |
| ORM 映射 | `@Entity`、`@Table`、`@Column`（JPA） | 运行时反射 |
| AOP 切面 | 自定义注解 + `@Around` | 运行时反射 |
| 测试 | `@Test`、`@BeforeEach`、`@ParameterizedTest`（JUnit） | 运行时反射 |
| 字节码增强 | Lombok `@Data`、`@Getter` | 编译期 APT |
| 依赖注入编译期 | Dagger `@Inject`、`@Module` | 编译期 APT |

## 深挖追问

### 1. 注解的本质是什么

注解在源码层是继承 `java.lang.annotation.Annotation` 的接口。编译后是普通的 `.class` 文件。运行时通过反射拿到的注解对象，是 JVM 通过 `Proxy.newProxyInstance` 生成的动态代理实例，它实现了注解接口并持有属性值。

### 2. `@Retention` 默认值是什么

默认是 `RetentionPolicy.CLASS`：保留到 class 文件中，但运行时反射读不到。所以自定义注解如果要在运行时用，必须显式标注 `@Retention(RetentionPolicy.RUNTIME)`。这是新手最常踩的坑——忘了写 `RUNTIME`，反射读不到。

### 3. `@Inherited` 对接口方法注解有效吗

无效。`@Inherited` 只对类上的注解生效：子类继承父类时，会继承父类的 `@Inherited` 注解。接口上的注解不会被实现类继承，接口方法上的注解也不会被实现类的方法继承。

### 4. Lombok 是怎么工作的

Lombok 利用编译期注解处理器（Pluggable Annotation Processing API）访问 Java 编译器的 AST（抽象语法树），在编译过程中**修改 AST** 添加 getter/setter/构造器等代码。编译后的 class 文件里就有这些方法。

注意：Lombok 不是通过反射运行时生成方法，也不是通过字节码增强。它是直接修改编译器内部的 AST，所以代码里没有 `@Getter` 但 class 文件里有 getter。这种"修改 AST"的做法属于非公开 API，不同 JDK 版本可能不兼容。

### 5. Spring 怎么处理 `@Component`

Spring 启动时通过 `ClassPathBeanDefinitionScanner` 扫描指定包下的类，对每个类检查是否有 `@Component`（或其派生注解 `@Service`、`@Repository` 等）。有则创建 `BeanDefinition`，注册到 `BeanFactory`。后续实例化、依赖注入都基于 `BeanDefinition` 完成。

整个过程是运行时反射，因此 `@Component` 必须 `@Retention(RUNTIME)`。

### 6. 注解能继承吗

注解本身不能继承（不能 `extends` 别的注解，因为注解本质是接口，但 JLS 不允许注解 extends 其他注解）。`@Inherited` 是"子类继承父类注解"的机制，不是"注解之间的继承"。

注解可以"派生"——Spring 的 `@Service`、`@Repository`、`@Controller` 都"派生"自 `@Component`，但这种派生是 Spring 自己的元注解机制（通过 `AnnotationUtils.findAnnotation` 递归查找元注解），不是 Java 语言本身的特性。

## 易错点

- 自定义注解忘记 `@Retention(RUNTIME)`，运行时反射读不到。
- 注解属性类型用错（如用 `List`、`Map`），编译错误。
- 注解属性没有默认值，使用时又没提供，编译错误。
- `@Target` 写错，注解作用在错误位置，编译错误。
- 误以为 `@Inherited` 对接口注解也生效，实际不生效。
- 注解属性名为 `value` 时，传多个属性必须显式写 `value = ...`。
- 把 `@Retention(CLASS)` 当 `RUNTIME` 用，运行时反射拿不到。
- 期望子类继承父类方法上的注解，实际 Java 不支持（`@Inherited` 只对类注解生效）。

## 总结

注解是 Java 的元数据机制，本质是继承 `Annotation` 的接口，运行时通过反射读取。掌握三个核心：元注解（`@Target`/`@Retention`/`@Inherited` 等）、保留策略（SOURCE/CLASS/RUNTIME 决定能否运行时反射读取）、处理时机（编译期 APT / 类加载期字节码增强 / 运行时反射）。注解是 Java 框架生态实现声明式编程的基础，Spring、JUnit、Hibernate、Lombok 全靠它。理解注解的"接口本质"和"动态代理对象"，对阅读框架源码很有帮助。

## 参考资料

- [JLS §9.6 Annotation Types](https://docs.oracle.com/javase/specs/jls/se17/html/jls-9.html#jls-9.6)
- [Annotation API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/annotation/package-summary.html)
- [JEP 104: Annotation Types (Java 5)](https://openjdk.org/jeps/104)
- [JEP 120: Repeating Annotations (Java 8)](https://openjdk.org/jeps/120)

---
