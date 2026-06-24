# JDK8 新特性概览

## 核心概念

Java 8 是 Java 语言和生态的一次关键升级，核心变化集中在“函数式编程、集合批处理、时间处理、异步编排和 JVM 内存模型调整”。

| 特性 | 解决的问题 | 面试关注点 |
| --- | --- | --- |
| Lambda / 方法引用 | 简化匿名内部类，支持行为参数化 | 变量捕获、`this` 指向、函数式接口 |
| 函数式接口 | 给 Lambda 提供目标类型 | `@FunctionalInterface`、常用接口 |
| Stream API | 集合声明式处理 | 中间/终止操作、惰性、并行流风险 |
| Optional | 显式表达返回值可能为空 | 不滥用、不直接 `get()` |
| 接口默认方法 | 接口演进时兼容旧实现类 | 多继承冲突、与抽象类区别 |
| 新日期时间 API | 替代 `Date/Calendar` 的可变和线程安全问题 | `LocalDateTime`、`Instant`、时区 |
| CompletableFuture | 异步任务编排 | 与 Future 区别、线程池、异常处理 |
| Metaspace | 替代永久代 | 类元数据位于本地内存 |

## 面试官想考什么

- 是否能按语言层、类库层、JVM 层系统回答 Java 8；
- 是否理解 Lambda 和函数式接口的关系；
- 是否知道 Stream 的执行模型、短路、惰性和并行流坑点；
- 是否会合理使用 Optional 和 `java.time`；
- 是否知道 PermGen 被 Metaspace 替代的原因和影响。

## 标准回答

> Java 8 的核心特性包括 Lambda 表达式、方法引用、函数式接口、Stream API、Optional、默认方法、新日期时间 API、CompletableFuture，以及 JVM 层面的 Metaspace。语言层面，Lambda 让 Java 支持行为参数化和函数式风格；类库层面，Stream 提供集合声明式处理，Optional 显式表达空值，`java.time` 解决旧日期 API 可变且线程不安全的问题；JVM 层面，永久代被本地内存中的 Metaspace 替代。实际项目中最常用的是 Lambda + Stream 处理集合，Optional 处理查询结果，`java.time` 处理时间。

## 深挖追问

### Lambda 和匿名内部类有什么区别？

- Lambda 只能用于函数式接口，匿名内部类可以实现普通接口或继承抽象类；
- Lambda 中的 `this` 指向外部类实例，匿名内部类中的 `this` 指向匿名内部类对象；
- Lambda 捕获局部变量要求 final 或 effectively final；
- 编译实现上 Lambda 通常通过 `invokedynamic`，不是简单生成匿名内部类源码。

### Stream 为什么不能随便替代 for 循环？

Stream 适合无副作用的数据转换、过滤、聚合。复杂分支、频繁异常处理、需要调试中间状态或修改外部状态时，普通循环更直观。并行流只有在数据量大、CPU 密集、任务可拆分、没有共享状态时才可能收益明显。

### 默认方法解决了什么问题？

接口新增方法时，旧实现类原本会全部编译失败。默认方法允许接口提供默认实现，实现接口演进。但如果一个类实现的多个接口提供同名默认方法，实现类必须显式重写解决冲突。

### Metaspace 和 PermGen 有什么区别？

PermGen 属于 JVM 堆内存的一部分，容量固定时容易因类元数据过多触发 `OutOfMemoryError: PermGen space`；Metaspace 使用本地内存，默认可动态扩展，但仍应通过 `-XX:MaxMetaspaceSize` 控制上限，避免无限占用系统内存。

## 实战场景/代码示例

### Stream 统计已支付订单金额

```java
Map<Long, BigDecimal> amountByUser = orders.stream()
        .filter(o -> o.getStatus() == OrderStatus.PAID)
        .collect(Collectors.groupingBy(
                Order::getUserId,
                Collectors.mapping(Order::getAmount,
                        Collectors.reducing(BigDecimal.ZERO, BigDecimal::add))));
```

### Optional 处理查询结果

```java
User user = userRepository.findById(userId)
        .filter(User::isEnabled)
        .orElseThrow(() -> new IllegalArgumentException("用户不存在或已禁用"));
```

### 新日期时间 API

```java
LocalDate today = LocalDate.now();
LocalDateTime deadline = today.plusDays(7).atTime(23, 59, 59);
Instant instant = deadline.atZone(ZoneId.of("Asia/Shanghai")).toInstant();
```

### CompletableFuture 异步聚合

```java
CompletableFuture<User> userFuture = CompletableFuture.supplyAsync(
        () -> userService.getUser(userId), bizPool);
CompletableFuture<List<Order>> orderFuture = CompletableFuture.supplyAsync(
        () -> orderService.listRecent(userId), bizPool);

UserProfile profile = userFuture.thenCombine(orderFuture, UserProfile::new)
        .exceptionally(ex -> UserProfile.empty(userId))
        .join();
```

## 易错点/总结

- Stream 只能消费一次，复用会抛 `IllegalStateException`；
- `parallelStream()` 使用公共 ForkJoinPool，可能影响其他任务；
- Optional 不建议用作字段、参数或集合元素；
- `orElse()` 会提前计算默认值，昂贵默认值用 `orElseGet()`；
- `LocalDateTime` 不含时区，跨系统时间建议用 `Instant` 或带时区类型；
- 接口默认方法发生冲突时必须显式重写。

## 参考资料

- Oracle Java 8 Documentation
- Java Stream API / java.time API 文档
