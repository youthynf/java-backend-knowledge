# JDK8 新特性之函数式编程详解

## 核心概念

函数式编程强调把“行为”作为值传递。Java 8 通过 Lambda 表达式、方法引用和函数式接口让这一点成为可能。它并不是替代面向对象，而是补充面向对象：对象承载状态，函数式接口承载可传递的行为。

函数式接口是 Lambda 的目标类型：只包含一个抽象方法的接口。`@FunctionalInterface` 不是必须的，但推荐使用，因为编译器会帮你校验接口是否仍然只有一个抽象方法。

| 接口 | 抽象方法 | 典型用途 |
| --- | --- | --- |
| `Predicate<T>` | `boolean test(T t)` | 过滤、条件判断 |
| `Function<T,R>` | `R apply(T t)` | 类型转换、字段提取 |
| `Consumer<T>` | `void accept(T t)` | 消费数据，无返回 |
| `Supplier<T>` | `T get()` | 延迟创建对象 |
| `UnaryOperator<T>` | `T apply(T t)` | 同类型转换 |
| `BinaryOperator<T>` | `T apply(T a, T b)` | 聚合、归约 |

## 面试官想考什么

- Lambda、方法引用、函数式接口三者关系；
- 什么是 effectively final，为什么 Lambda 捕获局部变量有这个限制；
- 常用函数式接口的使用场景；
- 函数式写法如何提升代码复用和可读性；
- 函数式编程的边界：副作用、异常处理、调试和性能。

## 标准回答

> Java 8 的函数式编程基于函数式接口实现。Lambda 本身没有独立类型，必须赋值给一个只包含单个抽象方法的接口，例如 `Predicate`、`Function`、`Consumer`、`Supplier`。方法引用是部分 Lambda 的简写形式。实际开发中常用它来传递过滤条件、转换规则、回调逻辑，并配合 Stream API 处理集合。使用时要避免在 Lambda 中修改共享状态，复杂业务也不应强行写成很长的链式调用。

## 深挖追问

### 什么是函数式接口？

只有一个抽象方法的接口就是函数式接口。接口中的 `default` 方法、`static` 方法，以及从 `Object` 继承来的公共方法，不计入抽象方法数量。

```java
@FunctionalInterface
public interface IdGenerator {
    String nextId(String prefix);
}
```

### Lambda 为什么只能捕获 effectively final 变量？

局部变量存放在线程栈上，生命周期随方法结束而结束。Lambda 可能在方法返回后才执行，Java 捕获的是变量值的副本。为了避免外部变量继续变化带来的语义混乱，要求被捕获的局部变量不能再赋值。

```java
int base = 10;
Function<Integer, Integer> add = x -> x + base; // base 后续没有被修改，所以是 effectively final
```

### 方法引用有哪些形式？

```java
User::getName        // 对象实例方法引用
System.out::println  // 特定对象实例方法引用
Integer::parseInt    // 静态方法引用
ArrayList::new       // 构造器引用
```

### 函数式写法有什么缺点？

过长链式调用不易调试；Lambda 中处理受检异常比较繁琐；如果在 `map/filter/forEach` 中修改外部集合或计数器，会引入副作用和线程安全问题；简单循环被强行改造成复杂 Stream 反而降低可维护性。

## 实战场景/代码示例

### 行为参数化：通用过滤

```java
public static <T> List<T> filter(List<T> source, Predicate<T> predicate) {
    List<T> result = new ArrayList<>();
    for (T item : source) {
        if (predicate.test(item)) {
            result.add(item);
        }
    }
    return result;
}

List<User> activeUsers = filter(users, User::isActive);
List<User> vipUsers = filter(users, u -> u.getLevel() >= 5);
```

### Function 组合转换

```java
Function<String, String> trim = String::trim;
Function<String, Integer> parse = Integer::parseInt;
Function<String, Integer> normalizeAndParse = trim.andThen(parse);

Integer count = normalizeAndParse.apply(" 42 ");
```

### Supplier 延迟加载

```java
public User getOrLoad(Long userId, Supplier<User> loader) {
    User user = cache.get(userId);
    return user != null ? user : loader.get();
}

User user = getOrLoad(userId, () -> userRepository.findById(userId)
        .orElseThrow(() -> new IllegalArgumentException("用户不存在")));
```

### Predicate 组合业务规则

```java
Predicate<Order> paid = o -> o.getStatus() == OrderStatus.PAID;
Predicate<Order> highAmount = o -> o.getAmount().compareTo(new BigDecimal("1000")) > 0;

List<Order> riskyOrders = orders.stream()
        .filter(paid.and(highAmount))
        .toList();
```

## 易错点/总结

- Lambda 不等于函数式编程全部，它只是语法基础；
- Lambda 捕获的局部变量必须是 final 或 effectively final；
- Lambda 中的 `this` 指向外部类实例，不是 Lambda 对象；
- 不要在 Lambda/Stream 中修改共享状态；
- 能用方法引用提升可读性时再用，不要牺牲直观性；
- 复杂业务建议拆成具名方法，便于测试、复用和排查。

## 参考资料

- Java 8 `java.util.function` API
- Effective Java：Prefer lambdas to anonymous classes
