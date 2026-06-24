# JDK8 新特性之 Optional 类详解

## 核心概念

`Optional<T>` 是 Java 8 提供的“可能有值，也可能无值”的容器。它的目标不是彻底消灭 `null`，而是让方法返回值的空语义显式化，提醒调用方必须处理“查不到/不存在”的分支。

常用方法：

| 方法 | 作用 | 注意点 |
| --- | --- | --- |
| `Optional.of(value)` | 包装确定非空的值 | value 为 null 会抛 NPE |
| `Optional.ofNullable(value)` | 包装可能为空的值 | 最常用 |
| `Optional.empty()` | 返回空容器 | 不要返回 null 的 Optional |
| `map` | 有值时做转换 | 返回值会被再次包装 |
| `flatMap` | 转换函数本身返回 Optional | 避免嵌套 Optional |
| `filter` | 有值且满足条件才保留 | 不满足返回 empty |
| `orElse` | 无值时返回默认值 | 参数会立即计算 |
| `orElseGet` | 无值时延迟创建默认值 | 默认值昂贵时推荐 |
| `orElseThrow` | 无值时抛异常 | 常用于强依赖数据 |

## 面试官想考什么

- Optional 解决什么问题，是否只是“包一层 null”；
- `of` 和 `ofNullable` 的区别；
- `orElse` 和 `orElseGet` 的执行时机；
- `map` 与 `flatMap` 的区别；
- 为什么不建议 Optional 用作实体字段、方法参数或集合元素。

## 标准回答

> Optional 是 Java 8 引入的空值容器，推荐用于方法返回值，表达结果可能不存在。创建时，确定非空用 `of`，可能为空用 `ofNullable`；使用时不建议直接 `get()`，而应通过 `map/filter/orElseGet/orElseThrow` 等方式处理。Optional 不能替代所有 null 判断，也不推荐作为字段或参数；集合无结果时一般返回空集合，而不是 `Optional<List<T>>`。

## 深挖追问

### Optional 能彻底避免 NPE 吗？

不能。Optional 只是把空语义显式化。如果 Optional 变量本身被赋值为 null，或者调用方直接 `get()`，仍可能出错。正确做法是永远不要返回 `null` 的 Optional，并避免无判断 `get()`。

### `orElse` 和 `orElseGet` 有什么区别？

`orElse` 的参数会立即求值，不管 Optional 是否有值；`orElseGet` 接收 `Supplier`，只有 Optional 为空时才执行。

```java
User user1 = userOpt.orElse(createDefaultUser());        // 总会执行 createDefaultUser
User user2 = userOpt.orElseGet(this::createDefaultUser); // 只有 empty 时执行
```

### `map` 和 `flatMap` 有什么区别？

`map` 适合把值转换为普通对象；`flatMap` 适合转换函数本身已经返回 Optional 的场景，避免 `Optional<Optional<T>>`。

```java
Optional<String> city = userOpt
        .map(User::getAddress)
        .map(Address::getCity);

Optional<String> phone = userOpt
        .flatMap(User::getPhoneOptional);
```

### 为什么不推荐 Optional 做字段？

实体字段涉及序列化、ORM、JSON 映射、Bean 规范等，Optional 字段会增加框架兼容成本，也让模型表达变复杂。字段是否允许为空应通过校验注解、构造器、领域规则或数据库约束表达。

## 实战场景/代码示例

### 查询用户并校验状态

```java
public Optional<User> findAvailableUser(Long userId) {
    return userRepository.findById(userId)
            .filter(User::isEnabled)
            .filter(user -> !user.isDeleted());
}

User user = findAvailableUser(userId)
        .orElseThrow(() -> new IllegalArgumentException("用户不存在或不可用"));
```

### 避免多层 null 判断

传统写法：

```java
String city = null;
if (user != null && user.getAddress() != null) {
    city = user.getAddress().getCity();
}
```

Optional 写法：

```java
String city = Optional.ofNullable(user)
        .map(User::getAddress)
        .map(Address::getCity)
        .orElse("未知城市");
```

### 空集合不要再包 Optional

```java
// 推荐
public List<Order> listOrders(Long userId) {
    return orderRepository.findByUserId(userId); // 没有订单时返回 Collections.emptyList()
}

// 不推荐
public Optional<List<Order>> listOrders(Long userId) { ... }
```

## 易错点/总结

- `Optional.of(null)` 会直接抛 NPE；可能为空时用 `ofNullable`；
- 不要把 `isPresent() + get()` 写成新式 null 判断，优先用链式处理；
- 默认值创建成本高时，用 `orElseGet` 而不是 `orElse`；
- Optional 推荐用于返回值，不推荐用于字段、参数、集合元素；
- `Optional` 本身也不应该为 null；
- 复杂业务中 Optional 链过长会降低可读性，必要时拆成普通判断。

## 参考资料

- Java 8 `java.util.Optional` API
- Effective Java：Return optionals judiciously
