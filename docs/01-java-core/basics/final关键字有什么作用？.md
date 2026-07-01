# final 关键字有什么作用

## 核心概念

`final` 表示"最终的、不可再改变的"。它可以修饰变量、方法和类，含义分别是：

- **修饰变量**：变量只能赋值一次（不可重新赋值）。
- **修饰方法**：方法不能被子类重写。
- **修饰类**：类不能被继承。

关键认知：`final` 修饰的是"引用或声明本身不能再变"，**不一定代表对象内容完全不可变**。`final` 引用可以指向一个内容可变的对象，例如 `final List<String> list = new ArrayList<>()`，`list.add()` 仍然合法。

```java
final int count = 10;
// count = 20;                       // 编译错误

final List<String> list = new ArrayList<>();
list.add("Java");                    // 可以，修改的是对象内容
// list = new ArrayList<>();         // 编译错误，引用不能变
```

## 标准回答

`final` 是 Java 的修饰符，可以修饰变量、方法、类，含义分别是"变量不可重新赋值"、"方法不可重写"、"类不可继承"。要点：

1. **`final` 变量**：基本类型值不变；引用类型引用不变但对象内容可变。
2. **`final` 方法**：不能被重写，但可以重载。
3. **`final` 类**：不能被继承，如 `String`、`Integer`。
4. **`final` 参数**：方法内不能重新赋值（常用于 Lambda 捕获）。
5. **不可变类设计**：`final` 类 + `final` 字段 + 无修改方法是构建不可变类的标准模式。

## 实现原理

### 1. `final` 修饰变量

#### 基本类型

```java
final int max = 100;
// max = 200;  // 编译错误
```

基本类型 `final` 变量值一旦初始化就不能再修改。

#### 引用类型

```java
final StringBuilder sb = new StringBuilder("hello");
sb.append(" world");         // 可以，修改对象内容
// sb = new StringBuilder(); // 编译错误，引用不能变
```

`final` 只约束"引用本身不可变"，不约束"引用指向的对象内容"。要构建真正不可变对象，需要类设计层面保证（`final` 类 + `private final` 字段 + 不提供修改方法）。

#### 编译期常量 vs 运行时常量

```java
static final int MAX_SIZE = 100;                       // 编译期常量
static final long START_TIME = System.currentTimeMillis(); // 运行时常量
```

编译期常量（值在编译期可确定）会被编译器**内联**到使用处：

```java
// 源码
class Config {
    static final int SIZE = 100;
}
class Use {
    int s = Config.SIZE;
}

// 编译后 Use.class 中 SIZE 直接被替换为字面量 100
// 反编译可见：int s = 100;
```

如果后续修改 `Config.SIZE = 200` 重新编译 `Config.java`，但**不重新编译 `Use.java`**，`Use` 仍会使用旧的 `100`。这是 `final` 编译期常量的典型陷阱。

#### 空白 final（blank final）

```java
class User {
    private final String name;   // 声明时不初始化

    public User(String name) {
        this.name = name;        // 必须在构造器中初始化
    }
}
```

`final` 字段可以声明时不赋值，但**必须在构造器结束前初始化**。这种用法常用于"运行时才能确定的不可变值"。

### 2. `final` 修饰方法

```java
class Parent {
    public final void doSomething() {
        System.out.println("固定行为");
    }
}

class Child extends Parent {
    // public void doSomething() {}  // 编译错误：不能重写 final 方法
}
```

`final` 方法不能被子类重写，但可以重载。常见用途：

- 保护核心逻辑不被修改（如模板方法模式中"骨架方法"）。
- 性能优化：JIT 可能把 `final` 方法内联（旧版 JVM 优化，现代 JIT 已经不依赖 `final`）。

#### `private` 方法隐式 `final`

`private` 方法对子类不可见，无法被重写。子类定义同名方法不算重写，而是新方法。所以 `private` 方法效果等同 `final`。

#### `final` 方法和重载

```java
class Calculator {
    public final int add(int a, int b) { return a + b; }
    public final int add(int a, int b, int c) { return a + b + c; }  // 重载，可以
}
```

`final` 只禁止重写，不禁止重载。

### 3. `final` 修饰类

```java
public final class String { ... }  // String 是 final 类

class MyString extends String { }   // 编译错误
```

`final` 类不能被继承。常见 `final` 类：

- `String`、`StringBuilder`、`StringBuffer`
- 包装类型：`Integer`、`Long`、`Boolean` 等
- `Math`、`Arrays`、`Collections` 等工具类
- `LocalDate`、`LocalTime`、`LocalDateTime`（Java 8 时间 API）

设计 `final` 类的目的：

- **保证不可变性**：防止子类破坏不可变语义。
- **安全性**：防止子类伪装成父类破坏安全（如 `String` 在类加载、安全检查中作为参数）。
- **简化优化**：JVM 可以做更激进的优化。

### 4. `final` 参数

```java
public void process(final int x, final User user) {
    // x = 10;                  // 编译错误
    // user = new User();       // 编译错误
    user.setName("Tom");        // 可以，修改对象内容
}
```

`final` 参数在方法内不能重新赋值。Lambda 表达式和匿名内部类捕获外部局部变量时，要求变量是 `final` 或事实 `final`（Java 8+），原因：捕获的是变量副本，必须保证副本与外部一致。

### 5. `final` 与 JIT 优化

老说法是"`final` 方法/字段能被 JIT 内联优化"。现代 HotSpot JIT 已经不依赖 `final` 关键字做内联——它会基于运行时类型分析（CHA）动态判断。所以为了性能加 `final` 在现代 JVM 上几乎没意义，加 `final` 应该是为了**语义**（"这个方法不该被重写"、"这个类不该被继承"），而不是性能。

### 6. `final` 字段的内存语义

`final` 字段有特殊的内存语义：**构造器对 `final` 字段的写入，在构造器结束时对其他线程可见**，不需要 `volatile` 或同步。这是 Java 内存模型（JMM）保证的，前提是构造器没有把 `this` 引用泄漏出去。

```java
public class SafeImmutable {
    private final int x;
    private final int y;

    public SafeImmutable(int x, int y) {
        this.x = x;
        this.y = y;
        // 不要在这里发布 this
    }
}
```

这就是为什么"不可变对象天然线程安全"——`final` 字段的值在构造完成后对所有线程可见，且不可变。

## 代码示例

### 不可变类设计

```java
import java.util.Collections;
import java.util.List;

public final class ImmutablePoint {     // 1. 类是 final
    private final double x;             // 2. 字段是 final
    private final double y;

    public ImmutablePoint(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public double getX() { return x; }
    public double getY() { return y; }

    // 修改返回新对象，不修改原对象
    public ImmutablePoint translate(double dx, double dy) {
        return new ImmutablePoint(x + dx, y + dy);
    }
}
```

不可变类的标准模式：`final` 类 + `final` 字段 + 无 setter + 修改方法返回新对象。

### 不可变类含可变字段（防御性拷贝）

```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class Order {
    private final String orderId;
    private final List<String> items;   // 可变类型字段

    public Order(String orderId, List<String> items) {
        this.orderId = orderId;
        // 防御性拷贝，避免外部修改影响不可变性
        this.items = new ArrayList<>(items);
    }

    public List<String> getItems() {
        // 返回不可变视图，外部不能修改
        return Collections.unmodifiableList(items);
    }
}
```

不可变类如果必须持有可变字段，构造和读取都要做防御性拷贝。

### `final` 参数与 Lambda

```java
import java.util.function.Supplier;

public class ClosureDemo {
    public static void main(String[] args) {
        final int factor = 10;  // 必须是 final 或事实 final
        Supplier<Integer> multiplier = () -> factor * 2;
        // factor = 20;  // 编译错误，会破坏 Lambda 捕获
        System.out.println(multiplier.get());  // 20
    }
}
```

### 模板方法模式（`final` 保护骨架）

```java
public abstract class DataPipeline {
    // 模板方法：骨架不可变
    public final void execute() {
        extract();
        transform();
        load();
    }

    protected abstract void extract();
    protected abstract void transform();
    protected abstract void load();
}

public class CsvToDbPipeline extends DataPipeline {
    @Override protected void extract() { /* 从 CSV 读取 */ }
    @Override protected void transform() { /* 转换 */ }
    @Override protected void load() { /* 写入数据库 */ }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 不可变类 | `final` 类 + `final` 字段 + 无 setter | 配合防御性拷贝处理可变字段 |
| 常量定义 | `static final` 定义类常量 | 注意编译期内联陷阱 |
| 模板方法 | `final` 修饰骨架方法 | 防止子类破坏执行流程 |
| 工具类 | `final` 类 + 私有构造器 | 防止实例化和继承 |
| Lambda 捕获 | 捕获的局部变量事实 `final` | 否则编译错误 |
| 并发对象 | `final` 字段保证可见性 | 配合不可变模式实现无锁线程安全 |
| 防止重写 | 核心算法方法加 `final` | 注意 `private` 方法隐式 `final` |

## 深挖追问

### 1. `final` 修饰引用类型，对象内容能改吗

能。`final` 只约束引用本身不可重新指向，不约束引用指向的对象内容。`final List<String> list = new ArrayList<>()` 后 `list.add()` 仍合法。要构建真正不可变对象，需要类设计层面保证：`final` 类 + `final` 字段 + 无修改方法。

### 2. 编译期常量有什么陷阱

编译期常量会被编译器内联到使用处。如果修改了常量值但只重新编译定义类，不重新编译使用类，使用类仍会看到旧值。多模块项目尤其要注意：依赖 jar 里的常量变了，使用方必须重新编译。

### 3. `final` 方法真的能提升性能吗

在早期 JVM 中可以，因为编译器能确定方法不会被重写，可以直接内联。但现代 HotSpot JIT 已经能通过运行时类型分析（CHA）动态判断，不依赖 `final` 关键字。所以为了性能加 `final` 意义不大，应该为语义而加。

### 4. `final` 字段和 `volatile` 字段的区别

- `final` 字段：构造完成后对所有线程可见，且不可变。JMM 保证 final 字段的初始化安全。
- `volatile` 字段：每次读写都直接刷新到主内存，保证可见性，但可变。

`final` 适合"一次写入、永不修改"的字段；`volatile` 适合"频繁修改、需立即可见"的字段。

### 5. 反射能修改 `final` 字段吗

可以，但有风险。通过反射 `Field.setAccessible(true)` 后调用 `set()` 能修改 `final` 字段。但：

- 编译期常量已被内联到使用处，反射修改字段值不影响已被内联的代码。
- JMM 不再保证修改后的可见性。
- Java 9+ 模块系统对反射修改 `final` 字段做了进一步限制。

生产中不要依赖反射修改 `final` 字段，这是反模式。

### 6. 为什么 `String` 是 `final` 类

- **不可变性保证**：防止子类破坏不可变语义，从而保证 `String` 的哈希缓存、常量池复用、线程安全等特性。
- **安全性**：`String` 用于类加载器、安全检查、网络连接等场景，防止子类伪装。
- **性能**：JVM 可以对 `final` 类做更激进的优化。

## 易错点

- 误以为 `final List` 是不可变 List，实际只是引用不变，内容可变。
- 修改编译期常量但只重新编译定义类，使用方仍读到旧值。
- 期望反射修改 `final` 字段后所有使用处都生效，实际编译期常量已被内联。
- `final` 字段在构造器中泄漏 `this`，破坏 JMM 的初始化安全保证。
- 把 `private` 方法当成"未 `final`"，实际隐式 `final`。
- 误以为 `final` 方法不能重载，实际可以。
- 不可变类有可变字段（如 `List`）忘记防御性拷贝，导致外部修改破坏不可变性。
- 局部变量被 Lambda 捕获后又修改，触发"Variable used in lambda expression should be final or effectively final"。

## 总结

`final` 是 Java 的修饰符，作用于变量、方法、类。变量只能赋值一次、方法不能重写、类不能继承。`final` 引用不变 ≠ 对象内容不可变，构建真正不可变对象需要"final 类 + final 字段 + 无修改方法"的组合。`final` 字段有 JMM 保证的初始化安全，是不可变对象天然线程安全的基础。现代 JVM 已不依赖 `final` 做性能优化，加 `final` 应为语义而非性能。生产中常用于常量定义、不可变类、模板方法、Lambda 捕获。

## 参考资料

- [JLS §4.12.4 final Variables](https://docs.oracle.com/javase/specs/jls/se17/html/jls-4.html#jls-4.12.4)
- [JLS §8.1.1.2 final Classes](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.1.1.2)
- [JLS §17.5 final Field Semantics](https://docs.oracle.com/javase/specs/jls/se17/html/jls-17.html#jls-17.5)
- [Effective Java - Item 17: Minimize mutability](https://www.oreilly.com/library/view/effective-java/9780134686097/)

---
