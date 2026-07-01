# Comparable 与 Comparator 区别是什么

## 核心概念

`Comparable` 和 `Comparator` 都是 Java 用于对象排序的接口，但定位不同：

- **`Comparable`**：对象**自身**具备的"自然排序"能力。类实现 `Comparable`，重写 `compareTo`，定义"我天生该怎么排"。
- **`Comparator`**：**外部**传入的"自定义排序"策略。比较器独立于被比较的类，定义"按某种规则排"。

简单说：`Comparable` 是"我自己知道怎么排"，`Comparator` 是"别人告诉我怎么排"。

```java
// Comparable：类自带排序规则
class Student implements Comparable<Student> {
    private int score;
    @Override
    public int compareTo(Student o) {
        return Integer.compare(this.score, o.score);
    }
}

// Comparator：外部排序规则
Comparator<Student> byScore = Comparator.comparingInt(Student::getScore);
```

## 标准回答

`Comparable` 是内部排序（类自带 `compareTo`），`Comparator` 是外部排序（独立比较器）。要点：

1. **包路径**：`Comparable` 在 `java.lang`，`Comparator` 在 `java.util`。
2. **方法签名**：`Comparable.compareTo(T o)` 单参数；`Comparator.compare(T o1, T o2)` 双参数。
3. **侵入性**：`Comparable` 需要修改类本身；`Comparator` 不需要修改类。
4. **排序规则数量**：`Comparable` 通常只有一个自然排序；`Comparator` 可以定义多个。
5. **使用方式**：`Collections.sort(list)` 用 `Comparable`；`list.sort(comparator)` 或 `Collections.sort(list, comparator)` 用 `Comparator`。

## 实现原理

### 1. `Comparable` 接口

```java
package java.lang;

public interface Comparable<T> {
    int compareTo(T o);
}
```

类实现 `Comparable` 后，`compareTo` 返回值的语义：

- 负数：`this < o`
- `0`：`this == o`
- 正数：`this > o`

```java
public class Student implements Comparable<Student> {
    private final String name;
    private final int score;

    public Student(String name, int score) {
        this.name = name;
        this.score = score;
    }

    public String getName() { return name; }
    public int getScore() { return score; }

    @Override
    public int compareTo(Student o) {
        return Integer.compare(this.score, o.score);  // 按分数升序
    }
}
```

排序时直接 `Collections.sort(list)` 或 `list.sort(null)`，使用元素自身的 `compareTo`：

```java
List<Student> students = Arrays.asList(
    new Student("Tom", 80),
    new Student("Jerry", 90),
    new Student("Alice", 70)
);
Collections.sort(students);   // 用 Student.compareTo，按分数升序
```

### 2. `Comparator` 接口

```java
package java.util;

@FunctionalInterface
public interface Comparator<T> {
    int compare(T o1, T o2);
    boolean equals(Object obj);
    // 大量 default 方法：reversed、thenComparing、nullsFirst 等
}
```

`Comparator` 是函数式接口（Java 8+），可以用 Lambda 创建。`compare` 返回值语义同 `compareTo`。

```java
List<Student> students = ...;

// 用 Lambda 创建 Comparator
students.sort((a, b) -> Integer.compare(a.getScore(), b.getScore()));

// 用工厂方法（推荐，更清晰）
students.sort(Comparator.comparingInt(Student::getScore));

// 反向
students.sort(Comparator.comparingInt(Student::getScore).reversed());

// 多级排序：先按分数降序，分数相同按姓名升序
students.sort(
    Comparator.comparingInt(Student::getScore).reversed()
              .thenComparing(Student::getName)
);
```

### 3. `Comparator` 的强大之处

`Comparator` 提供丰富的 default 方法，链式组合排序规则：

```java
// 按某字段排序
Comparator.comparing(Student::getScore)
Comparator.comparingInt(Student::getScore)    // 基本类型版本，避免装箱
Comparator.comparingLong(User::getId)
Comparator.comparingDouble(Product::getPrice)

// 反向
.reversed()

// 多级排序
.thenComparing(Student::getName)
.thenComparingInt(Student::getAge)

// null 处理
.nullsFirst(Comparator.naturalOrder())
.nullsLast(Comparator.reverseOrder())

// 自然序/反序
Comparator.naturalOrder()    // 元素自身 Comparable
Comparator.reverseOrder()
```

### 4. `Comparable` vs `Comparator` 对比

| 维度 | `Comparable` | `Comparator` |
|------|-------------|--------------|
| 包 | `java.lang` | `java.util` |
| 方法 | `compareTo(T)` 单参数 | `compare(T, T)` 双参数 |
| 侵入性 | 需要修改类 | 不修改类 |
| 排序规则数量 | 通常一个（自然排序） | 可以多个 |
| 实现方式 | `implements Comparable` | 独立类 / Lambda |
| 触发方式 | `Collections.sort(list)` | `list.sort(comparator)` 或 `Collections.sort(list, comparator)` |
| 典型用途 | 类有"天生"的排序 | 业务按需排序 |
| 函数式接口 | 否 | 是（Java 8+） |

### 5. 怎么选

- **`Comparable`**：排序规则是对象天然属性的一部分，且全局唯一。例如 `String` 按字典序、`LocalDate` 按时间、`Integer` 按数值大小。
- **`Comparator`**：排序规则由业务场景决定，或同一对象在不同场景有不同排序。例如学生按成绩排、按年龄排、按姓名排。

实际开发中 `Comparator` 用得更多——业务排序需求多变，给每个类都实现 `Comparable` 不现实。

### 6. `compareTo` 与 `equals` 的一致性

`Comparable` 的 Javadoc 强烈建议：`compareTo` 返回 0 时 `equals` 也应返回 `true`。否则该类与 `TreeSet`/`TreeMap` 等基于 `compareTo` 的容器交互时行为可能异常。

```java
// 不一致：compareTo 按分数判等，equals 按整个对象判等
class Student implements Comparable<Student> {
    private final String name;
    private final int score;

    @Override
    public int compareTo(Student o) {
        return Integer.compare(this.score, o.score);
    }

    @Override
    public boolean equals(Object o) { /* 比较 name 和 score */ }
}

Set<Student> treeSet = new TreeSet<>();   // 用 compareTo 判等
Set<Student> hashSet = new HashSet<>();   // 用 equals 判等

// 两个分数相同但 name 不同的 Student
// treeSet 会认为是同一个元素，hashSet 不会
```

`BigDecimal` 是反例：`compareTo` 忽略 scale（`1.0` 和 `1.00` 返回 0），`equals` 比较 scale（`1.0` 和 `1.00` 不等）。所以 `BigDecimal` 用 `TreeSet` 时只保留一个，用 `HashSet` 时都保留。

## 代码示例

### `Comparable` 实现

```java
public class Product implements Comparable<Product> {
    private final long id;
    private final String name;
    private final double price;

    public Product(long id, String name, double price) {
        this.id = id;
        this.name = name;
        this.price = price;
    }

    public long getId() { return id; }
    public String getName() { return name; }
    public double getPrice() { return price; }

    @Override
    public int compareTo(Product o) {
        return Long.compare(this.id, o.id);  // 按主键排序
    }
}

List<Product> products = ...;
Collections.sort(products);  // 按 id 升序
```

### `Comparator` 多种排序

```java
import java.util.*;

public class ComparatorDemo {
    public static void main(String[] args) {
        List<Product> products = Arrays.asList(
            new Product(3, "Apple", 5.5),
            new Product(1, "Banana", 3.0),
            new Product(2, "Cherry", 8.0)
        );

        // 按价格升序
        products.sort(Comparator.comparingDouble(Product::getPrice));

        // 按价格降序
        products.sort(Comparator.comparingDouble(Product::getPrice).reversed());

        // 按名称字典序
        products.sort(Comparator.comparing(Product::getName));

        // 多级：价格升序 + 名称字典序
        products.sort(Comparator.comparingDouble(Product::getPrice)
                                .thenComparing(Product::getName));

        // null 安全：name 可能为 null，null 排最后
        products.sort(Comparator.comparing(Product::getName,
                Comparator.nullsLast(Comparator.naturalOrder())));
    }
}
```

### 自定义比较器类

```java
public class ProductByIdComparator implements Comparator<Product> {
    @Override
    public int compare(Product a, Product b) {
        return Long.compare(a.getId(), b.getId());
    }
}

products.sort(new ProductByIdComparator());
```

Java 8 之前常用这种写法，Java 8+ 一般用 Lambda 或方法引用替代。

### 复杂排序：链式比较器

```java
// 学生排序：先按班级（升序），再按成绩（降序），再按姓名（升序）
Comparator<Student> comparator = Comparator
    .comparingInt(Student::getClassNo)
    .thenComparing(Student::getScore, Comparator.reverseOrder())
    .thenComparing(Student::getName);

students.sort(comparator);
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 实体类按主键排序 | `Comparable` 实现 `compareTo` | 主键是天然排序属性 |
| 业务多维度排序 | `Comparator.comparing` + `thenComparing` | 业务变化时改比较器，不改类 |
| 分页查询排序 | 用 `Comparator` 处理 `ORDER BY` | 与 SQL 排序保持一致 |
| Top N 选择 | 用 `PriorityQueue` + `Comparator` | 小顶堆找前 N 大 |
| 去重排序 | `TreeSet` + `Comparable` | 注意 `compareTo == 0` 时去重 |
| 配置化排序 | 用户传入排序字段 | 反射或 `Comparator.comparing(field)` |
| Null 安全排序 | `Comparator.nullsFirst/nullsLast` | 字段可能为 null 时使用 |

## 深挖追问

### 1. 为什么 `Comparable` 在 `java.lang`，`Comparator` 在 `java.util`

`Comparable` 是类自身的能力，几乎所有类都可能需要"自然排序"（`String`、`Integer`、`LocalDate` 都实现了），所以放在 `java.lang` 自动可见。`Comparator` 是工具，用于集合排序等场景，放在 `java.util` 合理。

### 2. `compareTo` 返回值的语义

返回 `int` 而不是 `boolean`：`compareTo` 表达"小于、等于、大于"三种关系，需要三种状态。返回负数、0、正数分别对应三种。

不要写 `compareTo` 返回 `this.score - o.score`——相减可能溢出（如 `Integer.MIN_VALUE - 1` 是 `Integer.MAX_VALUE`，符号反转）。用 `Integer.compare(a, b)` 安全。

### 3. `Comparable` 和 `equals` 不一致有什么后果

`TreeSet`/`TreeMap` 用 `compareTo` 判等：`compareTo == 0` 视为同一元素。如果 `compareTo == 0` 但 `equals == false`，`TreeSet` 会"丢"元素。`HashSet`/`HashMap` 用 `equals` 判等，行为不同。混用时会出现"`HashSet` 包含但 `TreeSet` 不包含"的诡异现象。

`BigDecimal` 是经典反例：`compareTo` 忽略 scale、`equals` 比较 scale。

### 4. Java 8 之前怎么写 `Comparator`

Java 8 之前只能写匿名内部类：

```java
Collections.sort(students, new Comparator<Student>() {
    @Override
    public int compare(Student a, Student b) {
        return Integer.compare(a.getScore(), b.getScore());
    }
});
```

Java 8+ 用 Lambda 或方法引用更简洁：

```java
students.sort(Comparator.comparingInt(Student::getScore));
```

### 5. `Comparator` 是函数式接口吗

是。`Comparator` 标注了 `@FunctionalInterface`，可以用 Lambda 创建。但注意 `Comparator` 还有 `equals` 方法（继承自 `Object`），不影响函数式接口性质（Object 方法不计入抽象方法计数）。

### 6. `Comparable` 修改排序规则会破坏兼容性

会。`Comparable` 的 `compareTo` 一旦发布，调用方（如 `Collections.sort`、`TreeSet`）依赖其排序结果。修改 `compareTo` 可能导致已有代码行为变化。所以 `Comparable` 应该定义稳定的"自然排序"，多变业务排序用 `Comparator`。

## 易错点

- 用 `a.score - b.score` 实现 `compareTo`，整数溢出导致排序错乱。
- `compareTo == 0` 但 `equals == false`，与 `HashSet`/`TreeSet` 行为不一致。
- `Comparable` 修改类源码，破坏已有调用方依赖。
- `Comparator` 用 Lambda 时返回 `boolean` 而非 `int`，编译错误。
- 排序字段为 `null` 时未用 `nullsFirst`/`nullsLast`，抛 NPE。
- 期望 `Comparable` 能定义多个排序规则，实际只能一个。
- 在 `compareTo` 中调用 `equals`，逻辑混乱。
- 链式比较器顺序写错，多级排序结果不符合预期。

## 总结

`Comparable` 是对象自身的"自然排序"能力（`compareTo` 单参数），适合类有天生排序属性的场景；`Comparator` 是外部比较器（`compare` 双参数），适合业务多变的排序需求。生产中 `Comparator` 更常用——通过 `Comparator.comparing` + `thenComparing` 可以组合出任意复杂的排序规则，且不修改类源码。注意 `compareTo` 不要用减法实现（避免溢出），保持 `compareTo` 与 `equals` 一致避免与 `TreeSet`/`HashSet` 行为不一致。Java 8+ 的 Lambda 和函数式接口让 `Comparator` 写法极其简洁，是日常排序的首选。

## 参考资料

- [Comparable API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Comparable.html)
- [Comparator API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Comparator.html)
- [Effective Java - Item 14: Consider implementing Comparable](https://www.oreilly.com/library/view/effective-java/9780134686097/)

---
