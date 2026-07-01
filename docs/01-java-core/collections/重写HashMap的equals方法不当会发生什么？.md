# 重写 HashMap 的 equals 方法不当会发生什么

## 核心概念

严格说 HashMap 本身不需要重写 equals。这题问的是：**作为 HashMap key 的自定义对象，如果 `equals()` 和 `hashCode()` 重写不当，会发生什么问题？**

HashMap 判断 key 是否相同，看两步：

1. `hash` 是否相同——决定去哪个桶找。
2. `equals()` 是否为 true——决定桶内是不是同一个 key。

所以两者必须成对重写，且遵守约定：**`a.equals(b) == true` 必须 `a.hashCode() == b.hashCode()`**。只重写一个或不遵守约定，HashMap 就会出现"取不到值"、"重复 key"、"修改后找不到"等诡异问题。

## 标准回答

一句话结论：**HashMap key 的 equals 和 hashCode 必须成对重写且遵守约定（equals 相等则 hashCode 必相等）。只重写 equals 不重写 hashCode，会出现"逻辑相等的 key 取不到值"；equals 用可变字段，会出现"修改 key 后 get 不到"；equals 违反对称性/传递性，会出现"覆盖错误"、"contains 失败"等不可预测行为。**

四类典型问题：

1. **取不到值**：只重写 equals 不重写 hashCode，逻辑相等的对象落到不同桶。
2. **重复 key 或错误覆盖**：equals 写得过宽或过窄，错误判断"同一个 key"。
3. **修改 key 后失效**：equals/hashCode 依赖可变字段，put 后字段变化导致 get/remove 找不到。
4. **行为不可预测**：equals 违反对称性/传递性/一致性，HashMap 行为紊乱。

## 实现原理

### HashMap 用 equals 和 hashCode 的位置

```java
// HashMap.putVal 中判断同 key
if (p.hash == hash &&
    ((k = p.key) == key || (key != null && key.equals(k)))) {
    e = p;     // 同 key，准备覆盖 value
}
```

```java
// HashMap.getNode 中查找
if (first.hash == hash &&
    (first.key == key || (key != null && key.equals(first.key))))
    return first;
// ... 链表/红黑树遍历也用同样判断
```

逻辑：先比 hash（决定桶），再比 key 引用或 equals（决定是否同 key）。

### Object 的默认 equals 和 hashCode

```java
// Object.equals：比较引用
public boolean equals(Object obj) {
    return (this == obj);
}

// Object.hashCode：基于对象内存地址（JNI 调用）
public native int hashCode();
```

如果不重写，默认 `equals` 比较引用、`hashCode` 基于地址。两个 `new UserKey(1L)` 是不同对象，equals 返回 false，hashCode 也不同，HashMap 视为不同 key。

### 约定的 5 条规则（来自 Object Javadoc）

1. **自反性**：`x.equals(x) == true`。
2. **对称性**：`x.equals(y) == y.equals(x)`。
3. **传递性**：`x.equals(y) && y.equals(z)` 则 `x.equals(z)`。
4. **一致性**：多次调用 `x.equals(y)` 结果一致（字段不变时）。
5. **对 null**：`x.equals(null) == false`。

**关键约定**：`equals 相等 → hashCode 必相等`；`hashCode 相等 → equals 不一定相等`（这是哈希冲突）。

### 问题 1：只重写 equals 不重写 hashCode

```java
class UserKey {
    private final Long id;
    UserKey(Long id) { this.id = id; }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof UserKey)) return false;
        return Objects.equals(id, ((UserKey) o).id);
    }
    // 没重写 hashCode！
}
```

`new UserKey(1L).equals(new UserKey(1L))` 为 true，但 hashCode 不同（基于内存地址）。两次 put 用了两个不同对象，HashMap 把它们落到不同桶，导致：

```java
Map<UserKey, String> map = new HashMap<>();
map.put(new UserKey(1L), "Tom");
map.get(new UserKey(1L));   // null！两个对象 hashCode 不同，落到不同桶
```

### 问题 2：equals 写得过宽

```java
class BadKey {
    Long id;
    String name;
    // 错误：只比较 id，不比较 name
    @Override
    public boolean equals(Object o) {
        if (!(o instanceof BadKey)) return false;
        return Objects.equals(id, ((BadKey) o).id);
    }
    @Override
    public int hashCode() { return Objects.hash(id); }
}

Map<BadKey, String> map = new HashMap<>();
map.put(new BadKey(1L, "Tom"), "v1");
map.put(new BadKey(1L, "Jerry"), "v2");   // 覆盖了 v1！
```

逻辑上 Tom 和 Jerry 是不同用户，但 equals 认为相等，导致 v1 被覆盖。

### 问题 3：可变字段作为 key

```java
class OrderKey {
    Long orderId;          // 可变！

    OrderKey(Long id) { this.orderId = id; }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof OrderKey)) return false;
        return Objects.equals(orderId, ((OrderKey) o).orderId);
    }
    @Override
    public int hashCode() { return Objects.hash(orderId); }
}

OrderKey key = new OrderKey(100L);
Map<OrderKey, String> map = new HashMap<>();
map.put(key, "order-100");

key.orderId = 200L;       // 修改 key 字段
map.get(key);             // null！key 已经按 100 的 hash 放入桶，现在按 200 找不到
```

key 还在 map 中，但用同一个对象引用 get 不到，remove 也删不掉——这就是"内存泄漏"型问题。

### 问题 4：违反对称性

```java
class A {
    String s;
    public boolean equals(Object o) {
        if (o instanceof A) return Objects.equals(s, ((A) o).s);
        if (o instanceof B) return Objects.equals(s, ((B) o).s);   // 跨类比较
        return false;
    }
}

class B {
    String s;
    public boolean equals(Object o) {
        return o instanceof B && Objects.equals(s, ((B) o).s);
        // 不识别 A，导致 a.equals(b) != b.equals(a)
    }
}
```

这种 equals 在 HashMap 中查找/覆盖时行为不可预测，调试困难。

## 代码示例

### 正确写法 1：手写 equals + hashCode

```java
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

public final class UserKey {
    private final Long userId;       // 不可变字段
    private final String tenantId;

    public UserKey(Long userId, String tenantId) {
        this.userId = userId;
        this.tenantId = tenantId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UserKey)) return false;
        UserKey other = (UserKey) o;
        return Objects.equals(userId, other.userId)
            && Objects.equals(tenantId, other.tenantId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(userId, tenantId);
    }
}

class Demo {
    public static void main(String[] args) {
        Map<UserKey, String> map = new HashMap<>();
        map.put(new UserKey(1L, "A"), "Tom");
        System.out.println(map.get(new UserKey(1L, "A")));   // Tom
    }
}
```

### 正确写法 2：用 record 自动生成

```java
public record UserKey(Long userId, String tenantId) {}

Map<UserKey, String> map = new HashMap<>();
map.put(new UserKey(1L, "A"), "Tom");
map.get(new UserKey(1L, "A"));   // Tom
```

record 会基于所有组件自动生成 equals 和 hashCode，且组件默认 final，是理想的 HashMap key。

### 正确写法 3：Lombok @EqualsAndHashCode

```java
import lombok.EqualsAndHashCode;
import lombok.Getter;

@Getter
@EqualsAndHashCode
public final class UserKey {
    private final Long userId;
    private final String tenantId;

    public UserKey(Long userId, String tenantId) {
        this.userId = userId;
        this.tenantId = tenantId;
    }
}
```

注意：Lombok 默认包含所有非静态字段，可读性不如 record，且要小心 `@EqualsAndHashCode(callSuper = true)` 是否需要。

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 多租户缓存 key | 同时用 tenantId + userId | 缺一不可，否则跨租户覆盖 |
| 不可变值对象 | 用 `record` 自动生成 | 推荐 |
| 复合主键 | 用所有主键字段参与 equals/hashCode | 缺字段会错误覆盖 |
| 可变 DTO 作为 key | **不要用** | 改用不可变 key 包装 |
| 数组作为 key | **不要用** | 数组 equals 比较引用，应用 List 或包装类 |
| Lombok 实体类 | `@EqualsAndHashCode` 默认包含所有字段 | 注意 `callSuper` 和字段选择 |

## 深挖追问

### HashMap put 时先比 hashCode 还是 equals？

**先比 hash 决定桶，再在桶内比 hash 是否相等 + key 引用/equals**。简化逻辑：

```java
if (node.hash == hash && (node.key == key || key.equals(node.key))) {
    // 同 key
}
```

注意是先比 `hash`（int 比较，快），如果 hash 不等直接跳过；hash 相等才调 `equals`（可能慢）。所以 hashCode 实现质量直接影响 HashMap 性能。

### 为什么 equals 相等 hashCode 必须相等？

HashMap 先用 hashCode 决定桶位置。如果两个 equals 相等的对象 hashCode 不同，它们会被分到不同桶，HashMap 在查找时根本不会去另一个桶调用 equals，结果就是"逻辑相等的 key 找不到"。这是 HashMap 工作的前提。

### hashCode 相等 equals 一定相等吗？

不一定。hashCode 是 32 位整数，对象空间无限大，必然存在多个对象 hashCode 相同——这就是**哈希冲突**。HashMap 在同一个桶内继续用 equals 判断是否同一个 key。

### 为什么用可变字段做 key 危险？

put 时 HashMap 按 hashCode 决定桶位置。如果之后修改了字段，对象的 hashCode 变了，但 HashMap 不会自动把节点搬到新桶——节点仍按旧 hashCode 在旧桶里。之后 get 时用新 hashCode 找新桶，自然找不到。

更严重的是：原对象在 HashMap 里"丢失"了引用，但 HashMap 还持有它，导致内存泄漏。

### 数组可以作为 HashMap key 吗？

技术上可以，但实际不要用。数组的 `equals` 比较引用（不比较内容），`hashCode` 基于地址。两个看起来一样的 `new int[]{1, 2}` 是不同的 key。要用 `List` 或自定义包装类。

### record 是否完美？

接近完美。record 默认：
- 所有组件 `final`（不可变）。
- 自动生成 `equals` + `hashCode`（基于所有组件）。
- 自动生成 `toString`。

唯一注意点：record 组件如果是可变对象（如 `List`），equals 比较的是 List 引用而非内容。如果组件本身需要"内容相等"，组件也要是不可变值类型。

## 易错点

- 只重写 equals 不重写 hashCode，是 HashMap key 的经典错误。
- equals 里用可变字段，put 后字段变化导致 get/remove 失效。
- hashCode 相同不等于 key 相同，HashMap 还要调 equals 判断。
- equals 不能只比较部分关键字段，否则可能错误覆盖。
- 数组作为 key 比较的是引用，不是内容。
- Lombok `@EqualsAndHashCode` 默认不含父类字段，需要时显式 `callSuper = true`。

## 总结

HashMap key 必须保证 equals 和 hashCode 语义一致：hashCode 决定桶位置，equals 决定桶内是否同一个 key。两者不匹配会出现取不到值、重复 key、错误覆盖、修改后失效等问题。工程上优先使用不可变 key，用 `record` 或 IDE 生成 equals/hashCode，避免手写出错。牢记约定："equals 相等则 hashCode 必相等"。

## 参考资料

- [Effective Java - Item 11: Override hashCode when you override equals](https://www.oreilly.com/library/view/effective-java-3rd/9780134686097/)
- [Object.equals Javadoc](https://docs.oracle.com/javase/8/docs/api/java/lang/Object.html#equals-java.lang.Object-)
- [OpenJDK HashMap.getNode 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/HashMap.java#L557)
