# Java 注解机制是什么？

## 核心概念

注解（Annotation）是 Java 提供的一种元数据机制。它可以为类、方法、字段、参数等程序元素添加额外说明，并由编译器、运行时框架或工具读取处理。

注解本身不直接改变业务逻辑，但框架可以根据注解生成代码、执行校验、完成依赖注入或控制运行流程。

## 常见内置注解

- `@Override`：标记方法重写父类或接口方法。
- `@Deprecated`：标记元素已过时。
- `@SuppressWarnings`：抑制编译器警告。

## 自定义注解

```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Log {
    String value() default "";
}
```

## 元注解

元注解是用来修饰注解的注解。

### `@Target`

指定注解可以作用的位置，例如类、方法、字段、参数等。

### `@Retention`

指定注解保留到哪个阶段：

- `SOURCE`：只保留在源码中。
- `CLASS`：保留到字节码中，但运行时不可读取。
- `RUNTIME`：运行时仍可通过反射读取。

### `@Documented`

表示注解会被包含到 JavaDoc 文档中。

### `@Inherited`

表示注解可以被子类继承，仅对类上的注解生效。

## 常见应用场景

- Spring MVC：`@Controller`、`@RequestMapping`。
- Spring IOC：`@Component`、`@Autowired`。
- 参数校验：`@NotNull`、`@Size`。
- ORM 映射：`@Table`、`@Column`。
- AOP 切面：自定义日志、权限、审计注解。

## 总结

注解的本质是元数据。它经常和反射、动态代理、AOP、编译期处理器配合使用，是 Java 框架实现声明式编程的重要基础。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- 注解是元数据，必须被编译器、APT、框架或反射解析才有业务效果。
- Retention 决定保留阶段，Target 决定作用目标。

### 面试官想考什么
- 元注解和运行期读取。
- Spring 注解为什么能生效。

### 标准回答
注解本身不改变逻辑；它描述元数据，处理器或框架读取后执行增强、校验、扫描、生成代码等行为。

### 深挖追问
- @Retention 三种策略？
- 注解能继承吗？
- 如何自定义并读取注解？

### 实战场景/代码示例
```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@interface Audit { String value(); }
```

### 易错点/总结
- 只定义注解没有处理器通常无效果。
- 大量运行期扫描要注意性能。

