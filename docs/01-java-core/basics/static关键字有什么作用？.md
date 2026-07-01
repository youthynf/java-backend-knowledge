# static 关键字有什么作用

## 核心概念

`static` 表示"属于类本身"，而不是属于某个具体对象。它可以修饰变量、方法、代码块、内部类，含义分别是：

- **静态变量**：类级别共享变量，所有实例共用一份。
- **静态方法**：不依赖对象实例即可调用。
- **静态代码块**：类初始化时执行一次。
- **静态内部类**：不依赖外部类实例的内部类。

`static` 的本质是"把成员从对象级别提升到类级别"。类加载时初始化，类卸载时回收，生命周期比对象长。

```java
class Counter {
    static int total = 0;       // 所有实例共享
    int local = 0;              // 每个实例独有

    Counter() {
        total++;
        local++;
    }
}

new Counter();
new Counter();
System.out.println(Counter.total);  // 2
```

## 标准回答

`static` 是 Java 的修饰符，把成员从对象级别提升到类级别。要点：

1. **静态变量**：类共享，所有实例可见，类加载时初始化。
2. **静态方法**：可直接通过类名调用，不能访问非静态成员，不能用 `this`/`super`。
3. **静态代码块**：类初始化时执行一次，按代码顺序。
4. **静态内部类**：不依赖外部类实例，推荐用法（Effective Java Item 24）。
5. **`static final` 联用**：定义类常量，编译期内联优化。

## 实现原理

### 1. 静态变量

```java
class Counter {
    static int total = 0;       // 类级别
    int instanceCount = 0;      // 实例级别

    Counter() {
        total++;
        instanceCount++;
    }
}
```

| 对比项 | 静态变量 | 实例变量 |
|-------|---------|---------|
| 归属 | 类 | 对象实例 |
| 份数 | 类中一份 | 每个对象一份 |
| 访问方式 | `类名.变量` 或 `对象.变量`（推荐类名） | `对象.变量` |
| 生命周期 | 类加载到类卸载 | 对象创建到对象回收 |
| 初始化时机 | 类初始化阶段 | 对象构造时 |

静态变量存储在**方法区**（JDK 7 及以前在永久代，JDK 8+ 在元空间的类元数据中）。每个 `Class` 对象关联一份静态字段。

### 2. 静态方法

```java
class MathUtils {
    public static int max(int a, int b) {
        return a > b ? a : b;
    }
}

int m = MathUtils.max(1, 2);  // 直接类名调用
```

静态方法的限制：

- 不能直接访问非静态字段和非静态方法（非静态成员依赖 `this`，静态方法没有 `this`）。
- 不能使用 `this` 和 `super`。
- 不能被 `abstract` 修饰（抽象方法属于实例）。
- 不能被 `final` 修饰其实也可以，但 `final` 静态方法意义不大（静态方法本来就不能被重写，只能被隐藏）。

#### 静态方法的"隐藏"（Hiding）

```java
class Parent {
    public static void hello() { System.out.println("parent"); }
}
class Child extends Parent {
    public static void hello() { System.out.println("child"); }  // 隐藏，不是重写
}

Parent.hello();  // parent
Child.hello();   // child

Parent p = new Child();
p.hello();       // parent，静态方法看引用类型，不看对象类型
```

子类的同名静态方法是"隐藏"父类的，不是重写。调用时看引用类型，不看对象类型。这与实例方法的多态行为相反。

### 3. 静态代码块

```java
class Config {
    static {
        System.out.println("类初始化");
    }
}
```

静态代码块在类初始化阶段（`<clinit>`）执行，只执行一次。常用于初始化静态资源、加载配置文件、注册驱动等。

#### 多个静态代码块的执行顺序

```java
class A {
    static { System.out.println("1"); }
    static { System.out.println("2"); }
    static int x = init();   // 3
    static { System.out.println("4"); }

    static int init() {
        System.out.println("3");
        return 0;
    }
}
```

按代码出现顺序执行：1 -> 2 -> 3 -> 4。所有静态初始化（静态字段赋值 + 静态代码块）按代码顺序合并到 `<clinit>` 方法中。

### 4. 静态内部类

```java
class Outer {
    private static int x = 10;

    static class Inner {
        void access() {
            System.out.println(x);   // 可以访问外部类静态成员
        }
    }
}

Outer.Inner inner = new Outer.Inner();  // 不需要外部类实例
```

静态内部类不持有外部类实例引用，是 Effective Java 推荐的内部类形式。常见用法：

- Builder 模式：`User.Builder`
- 集合节点：`HashMap.Node`
- 工具类辅助：`Collections.UnmodifiableList`

### 5. 静态导入

```java
import static java.lang.Math.max;
import static java.util.Collections.emptyList;

int m = max(1, 2);
List<?> list = emptyList();
```

静态导入可以省略类名，直接用静态成员。但过度使用会降低可读性（不知道方法来自哪个类）。

### 6. 类初始化时机

JVM 在以下情况触发类初始化（执行 `<clinit>`）：

1. 创建实例（`new`）。
2. 访问静态字段（非 `final` 编译期常量）。
3. 调用静态方法。
4. 反射调用（`Class.forName`）。
5. 初始化子类时，父类若未初始化则先初始化。
6. JVM 启动时的主类（含 `main` 的类）。

不会触发初始化的情况：

- 访问 `final` 编译期常量（已被内联）。
- `Class.forName(name, false, loader)` 显式不初始化。
- 通过子类访问父类的静态字段，只初始化父类不初始化子类。
- 创建数组（`new Outer[10]`）不触发元素类型的初始化。

### 7. 类初始化顺序

存在继承时的初始化顺序：

```java
class Parent {
    static  { System.out.println("1 父类静态代码块"); }
            { System.out.println("3 父类实例代码块"); }
    public Parent() { System.out.println("4 父类构造器"); }
}

class Child extends Parent {
    static  { System.out.println("2 子类静态代码块"); }
            { System.out.println("5 子类实例代码块"); }
    public Child() { System.out.println("6 子类构造器"); }
}

new Child();
// 输出：
// 1 父类静态代码块
// 2 子类静态代码块
// 3 父类实例代码块
// 4 父类构造器
// 5 子类实例代码块
// 6 子类构造器
```

顺序：父类静态 → 子类静态 → 父类实例代码块 + 父类构造器 → 子类实例代码块 + 子类构造器。

### 8. `static final` 常量

```java
public class Constants {
    public static final int MAX_RETRY = 3;
    public static final String APP_NAME = "MyApp";
}
```

`static final` 是定义类常量的标准方式。编译期常量（值在编译期可确定）会被编译器内联到使用处，性能等同于直接写字面量。

注意：`static final` 但值在运行时才能确定（如 `static final long START = System.currentTimeMillis()`）不是编译期常量，不会被内联，访问时会触发类初始化。

## 代码示例

### 单例模式（静态内部类实现）

```java
public class Singleton {
    private Singleton() {}

    // 静态内部类持有实例，懒加载 + 线程安全
    private static class Holder {
        private static final Singleton INSTANCE = new Singleton();
    }

    public static Singleton getInstance() {
        return Holder.INSTANCE;
    }
}
```

利用类加载机制保证线程安全，利用静态内部类实现懒加载。这是 Effective Java 推荐的单例实现之一。

### 工具类

```java
public final class StringUtils {
    private StringUtils() {}  // 私有构造器，防止实例化

    public static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    public static String reverse(String s) {
        return new StringBuilder(s).reverse().toString();
    }
}
```

工具类应该：`final` 类 + 私有构造器 + 全静态方法。

### 静态代码块加载配置

```java
public class AppConfig {
    private static final Properties props = new Properties();

    static {
        try (InputStream in = AppConfig.class.getResourceAsStream("/app.properties")) {
            if (in != null) {
                props.load(in);
            }
        } catch (IOException e) {
            throw new ExceptionInInitializerError("加载配置失败: " + e);
        }
    }

    public static String get(String key) {
        return props.getProperty(key);
    }
}
```

静态代码块失败应抛 `ExceptionInInitializerError`，让类初始化失败，避免后续使用未初始化的静态字段。

### 静态工厂方法

```java
public class User {
    private final String name;
    private final int age;

    private User(String name, int age) {
        this.name = name;
        this.age = age;
    }

    public static User create(String name, int age) {
        return new User(name, age);
    }

    public static User admin(String name) {
        return new User(name, -1);
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 类常量 | `public static final` | 编译期内联，修改需重新编译使用方 |
| 工具类 | `final` 类 + 私有构造器 + 静态方法 | 防止实例化和继承 |
| 单例模式 | 静态内部类持有实例 | 懒加载 + 线程安全 |
| 全局计数器 | `static int count` | 注意线程安全，用 `AtomicInteger` |
| 配置加载 | 静态代码块 | 失败应抛 `ExceptionInInitializerError` |
| 静态工厂 | `User.of(...)` 替代构造器 | 比 `new` 更可读，可缓存实例 |
| 集合节点 | `HashMap.Node` 静态内部类 | 不持有外部类引用，节省内存 |

## 深挖追问

### 1. 静态方法能不能被重写

不能。子类可以定义同名同参同返回的静态方法，这叫"隐藏"（hiding），不是"重写"（overriding）。重写是基于运行时多态的，而静态方法不属于实例，没有多态。调用静态方法时看引用类型，不看对象类型。

### 2. 为什么静态方法不能访问非静态成员

非静态成员依赖 `this`（当前对象实例），而静态方法没有 `this`——它属于类，调用时可能根本没有任何实例存在。所以编译器禁止静态方法访问非静态成员。

### 3. 静态变量在内存中怎么存储

JDK 7 及以前，静态变量存储在方法区（永久代）。JDK 8+ 永久代被移除，类的元数据存到元空间，但**静态变量本身仍随 `Class` 对象存储在 Java 堆中**（不是元空间）。`Class` 对象是堆上的普通对象，它持有静态字段的引用。

### 4. 静态代码块和实例代码块的区别

| 维度 | 静态代码块 | 实例代码块 |
|------|-----------|-----------|
| 修饰 | `static {}` | `{}` |
| 触发时机 | 类初始化时（一次） | 每次创建实例时 |
| 用途 | 初始化静态资源 | 初始化实例资源 |
| 执行顺序 | 在实例代码块和构造器之前 | 在构造器之前 |

### 5. `static final` 和 `final` 的区别

- `final`：变量只能赋值一次。
- `static final`：类级别常量，所有实例共享，且只能赋值一次。
- `final` 实例变量：每个对象一份，构造后不变。
- `static final` 变量：类一份，编译期常量会被内联。

### 6. 静态字段会内存泄漏吗

会。如果静态字段引用了大对象且未及时清理，该对象会一直存在到类卸载（通常等于 JVM 生命周期）。常见场景：静态 `Map` 当缓存用但没有淘汰策略、静态 `List` 不断 add 不清理。这种泄漏叫"静态集合泄漏"，排查时用 MAT 看静态字段引用链。

### 7. 接口里的字段都是 `static final` 吗

是的。接口里声明的字段隐式 `public static final`，是常量。Java 8+ 接口可以有 `default` 和 `static` 方法，但字段仍是常量。

## 易错点

- 把可变静态字段当成"全局变量"用，多线程下竞态条件频发。
- 静态代码块里抛异常未处理，类初始化失败，后续访问抛 `NoClassDefFoundError`。
- 期望静态方法能被重写，实际只能隐藏，多态不生效。
- 在静态方法中访问非静态字段或 `this`，编译错误。
- 多个静态代码块和静态字段初始化顺序混乱，依赖未初始化的字段。
- 修改 `static final` 编译期常量但只重编译定义类，使用方仍读旧值。
- 静态集合当缓存用没有清理策略，长期运行导致内存泄漏。
- 子类访问父类静态字段，触发子类初始化（实际只触发父类）。

## 总结

`static` 把成员从对象级别提升到类级别，常用于常量、工具方法、单例、类初始化。核心几点：静态方法不能访问非静态成员、静态方法只能被隐藏不能被重写、静态代码块在类初始化时执行一次、静态内部类不持有外部类引用。生产中要警惕可变静态字段的线程安全和内存泄漏问题。`final` 类 + 私有构造器 + 全静态方法是工具类的标准写法。`static final` 编译期常量有内联优化，但要注意修改后使用方需重新编译。

## 参考资料

- [JLS §8.3.1.1 static Fields](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.3.1.1)
- [JLS §8.4.3.2 static Methods](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.4.3.2)
- [JLS §12.4 Initialization of Classes and Interfaces](https://docs.oracle.com/javase/specs/jls/se17/html/jls-12.html#jls-12.4)
- [Effective Java - Item 24: Favor static member classes over nonstatic](https://www.oreilly.com/library/view/effective-java/9780134686097/)

---
