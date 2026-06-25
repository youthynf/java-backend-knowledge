# 重写 HashMap 的 equals 方法不当会发生什么？

## 核心概念

严格来说，HashMap 本身不需要我们“重写 equals 方法”。面试里这个问题通常想问的是：**作为 HashMap key 的自定义对象，如果 equals() 和 hashCode() 重写不当，会发生什么问题？**

HashMap 判断 key 是否相同，主要看两步：

1. hash 值是否相同，用来快速定位桶位。
2. `equals()` 是否返回 true，用来确认是否是同一个逻辑 key。

所以自定义对象作为 key 时，必须遵守基本约定：

- 如果 `a.equals(b) == true`，那么 `a.hashCode()` 必须等于 `b.hashCode()`。
- 如果 `a.hashCode() == b.hashCode()`，`a.equals(b)` 不一定必须为 true。
- equals 要满足自反性、对称性、传递性、一致性，以及对 null 返回 false。

## 面试官想考什么

这道题重点考察：

- 你是否知道 equals 和 hashCode 必须成对重写。
- HashMap put/get 时如何使用 hashCode 和 equals。
- 只重写 equals、不重写 hashCode 会发生什么。
- 可变对象作为 key 为什么危险。
- equals 实现违反约定会造成哪些诡异问题。

## 标准回答

如果 HashMap 的 key 对象 equals/hashCode 重写不当，可能导致：

### 1. 逻辑相等的 key 取不到值

如果只重写 `equals()`，但没有重写 `hashCode()`，两个逻辑相等的对象可能有不同 hashCode，最终落到不同桶。

```java
class UserKey {
    private final Long id;

    UserKey(Long id) {
        this.id = id;
    }

    @Override
    public boolean equals(Object obj) {
        if (!(obj instanceof UserKey)) return false;
        return java.util.Objects.equals(id, ((UserKey) obj).id);
    }

    // 没有重写 hashCode：错误
}
```

使用时会出现：

```java
Map<UserKey, String> map = new HashMap<>();
map.put(new UserKey(1L), "Tom");

System.out.println(map.get(new UserKey(1L))); // 可能是 null
```

两个 key 的 id 一样，equals 认为相等，但 hashCode 不同，HashMap 可能根本查到另一个桶里。

### 2. 重复数据或覆盖异常

如果 equals 写得过宽，可能把本不相同的对象判断成相同 key，导致 put 时覆盖旧值。

如果 equals 写得过窄，又可能让本应相同的对象无法匹配，导致 Map 中出现重复逻辑 key。

### 3. key 修改后无法查找

如果 key 的 hashCode 依赖可变字段，put 之后修改字段，会导致 key 所在桶位置和当前 hashCode 不一致。

```java
class OrderKey {
    Long orderId;

    OrderKey(Long orderId) {
        this.orderId = orderId;
    }

    @Override
    public boolean equals(Object obj) {
        if (!(obj instanceof OrderKey)) return false;
        return java.util.Objects.equals(orderId, ((OrderKey) obj).orderId);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(orderId);
    }
}
```

错误使用：

```java
OrderKey key = new OrderKey(100L);
Map<OrderKey, String> map = new HashMap<>();
map.put(key, "order-100");

key.orderId = 200L;
System.out.println(map.get(key)); // 可能取不到
```

因为对象原来按 100 的 hash 放入桶中，现在按 200 的 hash 去查找，自然可能找不到。

### 4. equals 违反约定导致行为不可预测

例如 equals 不满足对称性：

```java
a.equals(b) == true
b.equals(a) == false
```

这种情况下 HashMap 在查找、覆盖、去重时可能出现很难定位的问题。

## 深挖追问

### 1. HashMap put 时是先比较 hashCode 还是 equals？

通常先根据 hashCode 定位桶，再在桶内比较节点。桶内比较时会先看 hash 是否相等，再看 key 是否是同一个引用或 equals 是否相等。

简化逻辑：

```java
if (node.hash == hash && (node.key == key || key.equals(node.key))) {
    // 认为是同一个 key，覆盖 value
}
```

所以 hashCode 决定“去哪里找”，equals 决定“是不是它”。

### 2. 为什么 equals 相等时 hashCode 必须相等？

因为 HashMap 先用 hashCode 决定桶位置。如果两个逻辑相等的对象 hashCode 不同，它们可能被分配到不同桶，HashMap 就没有机会调用 equals 比较，最终导致 get 不到或重复插入。

### 3. hashCode 相同是否一定 equals 相等？

不一定。hashCode 空间有限，不同对象可能有相同 hashCode，这就是哈希冲突。HashMap 会在同一个桶内继续用 equals 判断是否同一个 key。

### 4. 自定义 key 推荐怎么写？

推荐使用不可变字段作为 key 的身份标识，并同时重写 equals 和 hashCode。可以用 IDE、Lombok、record 自动生成，减少手写错误。

```java
public record UserKey(Long userId, String tenantId) {
}
```

Java record 默认会基于所有组件生成 equals 和 hashCode，很适合作为简单不可变 key。

## 实战场景

### 场景 1：多租户缓存 key

```java
public final class CacheKey {
    private final String tenantId;
    private final Long userId;

    public CacheKey(String tenantId, Long userId) {
        this.tenantId = tenantId;
        this.userId = userId;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof CacheKey)) return false;
        CacheKey that = (CacheKey) o;
        return java.util.Objects.equals(tenantId, that.tenantId)
                && java.util.Objects.equals(userId, that.userId);
    }

    @Override
    public int hashCode() {
        return java.util.Objects.hash(tenantId, userId);
    }
}
```

这里必须同时使用 tenantId 和 userId，否则不同租户的同一用户 ID 可能互相覆盖。

### 场景 2：避免可变 key

不要把会变化的 DTO 直接作为 HashMap key。如果必须作为 key，应只使用不可变字段参与 equals/hashCode，或者先转换成不可变 key 对象。

```java
CacheKey key = new CacheKey(request.getTenantId(), request.getUserId());
cache.put(key, value);
```

## 易错点

- 只重写 equals 不重写 hashCode，是 HashMap key 的经典错误。
- equals 里使用可变字段，put 后字段变化会导致 get/remove 失败。
- hashCode 相同只是冲突，不代表两个 key 相同。
- equals 不能只比较部分关键字段，否则可能错误覆盖。
- 使用数组作为 key 时要注意，数组默认 equals 比较引用，不比较内容。

## 总结

HashMap 的 key 必须保证 equals 和 hashCode 语义一致。面试回答时可以用一句话概括：hashCode 决定桶位置，equals 决定桶内是否同一个 key；如果两者不匹配，就会出现取不到值、重复 key、错误覆盖或修改 key 后失效等问题。工程上优先使用不可变 key，并让 IDE、record 或 Lombok 生成 equals/hashCode。
