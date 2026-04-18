# equals 和 hashCode 重写

## 核心概念

### 为什么重写 equals 必须重写 hashCode？

**契约关系：**
1. 如果两个对象 equals 返回 true，它们的 hashCode 必须相同
2. 如果两个对象 equals 返回 false，hashCode 不必不同（但不同更好）

**问题场景：**
```java
public class Person {
    private String name;
    private int age;
    
    // 只重写 equals
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Person person = (Person) o;
        return age == person.age && Objects.equals(name, person.name);
    }
    // 没有重写 hashCode
}

// 问题：作为 HashMap 的 key
Map<Person, String> map = new HashMap<>();
Person p1 = new Person("张三", 20);
Person p2 = new Person("张三", 20);

map.put(p1, "A");
System.out.println(map.get(p2)); // null！因为 hashCode 不同
```

---

## 面试高频问题

### 1. equals 和 == 的区别？

**回答要点：**
- `==` 比较基本类型的值，比较引用类型的地址
- `equals` 默认也是比较地址（Object 类实现）
- 重写 equals 后可以比较内容
- String、Integer 等已经重写了 equals

### 2. hashCode 的作用是什么？

**回答要点：**
- 快速定位对象在哈希表中的位置
- 减少 equals 比较次数
- 先比较 hashCode，不同则直接判定不相等
- 相同再用 equals 详细比较

### 3. 如何正确重写 equals 和 hashCode？

**回答要点：**
```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;           // 1. 引用相等
    if (o == null) return false;          // 2. null 检查
    if (getClass() != o.getClass()) return false;  // 3. 类型检查
    Person person = (Person) o;           // 4. 强转
    return age == person.age &&           // 5. 比较字段
           Objects.equals(name, person.name);
}

@Override
public int hashCode() {
    return Objects.hash(name, age);       // 使用 Objects.hash
}
```

### 4. 为什么 JDK 7 引入了 Objects.hash？

**回答要点：**
- 简化 hashCode 的编写
- 自动处理 null 值
- 内部使用 Arrays.hashCode
- 推荐使用而不是手写

---

## 代码示例

### 标准实现

```java
public class Person {
    private String name;
    private int age;
    private String idCard;
    
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Person person = (Person) o;
        return age == person.age 
            && Objects.equals(name, person.name)
            && Objects.equals(idCard, person.idCard);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(name, age, idCard);
    }
}
```

### 使用 Lombok

```java
import lombok.EqualsAndHashCode;

@EqualsAndHashCode
public class Person {
    private String name;
    private int age;
    private String idCard;
}
```

### IDE 生成（IntelliJ IDEA）

```java
// Code -> Generate -> equals() and hashCode()
// 自动生成，包含完整实现
```

---

## 实战场景

### 场景 1：实体类去重

```java
public class UserService {
    public List<User> removeDuplicates(List<User> users) {
        // 利用 Set 去重，需要正确实现 equals/hashCode
        return new ArrayList<>(new LinkedHashSet<>(users));
    }
}
```

### 场景 2：作为 HashMap 的 Key

```java
public class CacheKey {
    private final String module;
    private final String key;
    
    // 必须重写 equals/hashCode，否则无法正确缓存
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        CacheKey cacheKey = (CacheKey) o;
        return Objects.equals(module, cacheKey.module) 
            && Objects.equals(key, cacheKey.key);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(module, key);
    }
}
```

### 场景 3：业务唯一标识

```java
public class Order {
    private String orderNo;
    private String customerId;
    private BigDecimal amount;
    private LocalDateTime createTime;
    
    // 业务上只比较订单号
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Order order = (Order) o;
        return Objects.equals(orderNo, order.orderNo);
    }
    
    @Override
    public int hashCode() {
        return Objects.hash(orderNo);
    }
}
```

---

## 延伸思考

- 可变对象作为 HashMap 的 Key 会有什么问题？
- 为什么重写 equals 还要考虑对称性、传递性？
- TreeSet/TreeMap 需要实现 equals/hashCode 吗？（需要实现 Comparable）

## 参考资料

- [Object 类文档](https://docs.oracle.com/javase/8/docs/api/java/lang/Object.html)
- [Effective Java 第 10、11 条](https://book.douban.com/subject/27025416/)
