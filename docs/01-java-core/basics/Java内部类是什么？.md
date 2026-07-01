# Java 内部类是什么

## 核心概念

内部类（Inner Class）是定义在另一个类内部的类。它表达类之间更紧密的从属关系，可以访问外部类成员，常用于封装实现细节、回调和事件监听。

Java 内部类分为四种：

1. **成员内部类**：定义在外部类的成员位置，依赖外部类实例。
2. **静态内部类**：用 `static` 修饰，不依赖外部类实例。
3. **局部内部类**：定义在方法或代码块内，只在当前作用域可见。
4. **匿名内部类**：没有类名，一次性实现接口或继承类。

```java
class Outer {
    private int x = 1;

    // 成员内部类
    class Inner {
        void access() { System.out.println(x); }
    }

    // 静态内部类
    static class StaticInner {
        void access() { System.out.println("static"); }
    }

    void method() {
        // 局部内部类
        class Local {
            void access() { System.out.println("local"); }
        }
        new Local().access();

        // 匿名内部类
        Runnable r = new Runnable() {
            @Override public void run() { System.out.println("anon"); }
        };
    }
}
```

## 标准回答

Java 内部类是定义在另一个类内部的类，分四种：成员内部类、静态内部类、局部内部类、匿名内部类。要点：

1. **成员内部类**依赖外部类实例，能访问外部类所有成员（含 `private`）；创建方式 `outer.new Inner()`。
2. **静态内部类**不依赖外部类实例，只能直接访问外部类静态成员；创建方式 `new Outer.Inner()`。
3. **局部内部类**只在方法内可见，可以访问方法的 `final` 或事实 `final` 局部变量。
4. **匿名内部类**没有类名，常用于一次性实现接口或继承类，Java 8 后多被 Lambda 替代。
5. **本质都是独立 `.class` 文件**，编译器生成 `Outer$Inner.class`，反编译能看到编译器合成的访问桥。

## 实现原理

### 1. 成员内部类

```java
class Outer {
    private int x = 10;

    class Inner {
        void access() {
            System.out.println(x);  // 直接访问外部类 private 字段
        }
    }
}
```

编译后生成两个文件：`Outer.class` 和 `Outer$Inner.class`。`Inner` 之所以能访问 `Outer` 的 `private` 字段，是因为编译器为 `Inner` 合成了一个指向 `Outer` 实例的引用字段 `this$0`，并通过 `package-private` 的"桥接方法"（如 `access$0(Outer)`）绕过 `private` 访问限制。

```java
// 反编译后的 Inner 大致结构
class Outer$Inner {
    final Outer this$0;   // 编译器合成的外部类引用
    Outer$Inner(Outer outer) { this.this$0 = outer; }
    void access() {
        System.out.println(Outer.access$0(this$0)); // 调用合成的 package-private 静态方法
    }
}
```

创建成员内部类必须先有外部类实例：

```java
Outer outer = new Outer();
Outer.Inner inner = outer.new Inner();
```

### 2. 静态内部类

```java
class Outer {
    private static int x = 10;
    private int y = 20;

    static class StaticInner {
        void access() {
            System.out.println(x);  // 可以访问外部类 static 成员
            // System.out.println(y);  // 编译错误：不能访问非 static 成员
        }
    }
}
```

静态内部类不持有外部类实例引用，所以不能访问外部类的非静态成员。创建不需要外部类实例：

```java
Outer.StaticInner inner = new Outer.StaticInner();
```

这是常用模式，`HashMap.Node`、`Map.Entry` 都是静态内部类，避免持有外部类引用、节省内存。

### 3. 局部内部类

```java
class Outer {
    void method(final int param) {
        final int local = 10;

        class Local {
            void access() {
                System.out.println(param); // 可以访问方法的 final 变量
                System.out.println(local);
            }
        }
        new Local().access();
    }
}
```

局部内部类定义在方法内，只在方法作用域可见。Java 8 前，只能访问 `final` 局部变量；Java 8+ 放宽为"事实 final"（effectively final），即没有 `final` 修饰但未被修改的变量也可以。

底层原理：局部内部类访问的局部变量会被编译器拷贝到内部类实例的字段中（捕获）。如果是基本类型直接拷贝值，引用类型拷贝引用。要求 `final` 是为了保证内部类持有的拷贝与外部方法的变量一致，避免"内部类修改了拷贝但外部变量没变"的语义混乱。

### 4. 匿名内部类

```java
Runnable task = new Runnable() {
    @Override
    public void run() {
        System.out.println("running");
    }
};
task.run();
```

匿名内部类没有类名，在 `new` 表达式中直接定义类的实现。它只能实现一个接口或继承一个类。生成的 class 文件名是 `Outer$1.class`、`Outer$2.class`，按出现顺序编号。

匿名内部类的本质和局部内部类一样，只是省去了类名。它同样可以访问外部类成员和事实 `final` 局部变量。

Java 8+ 引入 Lambda 后，函数式接口的匿名内部类通常用 Lambda 替代，更简洁：

```java
Runnable task = () -> System.out.println("running");
```

但 Lambda 和匿名内部类有本质区别：Lambda 通过 `invokedynamic` 在运行时生成适配类，不生成额外的 `.class` 文件，性能更好。

## 代码示例

### 静态内部类实现 Builder 模式

```java
public class User {
    private final String name;
    private final int age;
    private final String email;

    private User(Builder b) {
        this.name = b.name;
        this.age = b.age;
        this.email = b.email;
    }

    public static class Builder {
        private String name;
        private int age;
        private String email;

        public Builder name(String name) { this.name = name; return this; }
        public Builder age(int age) { this.age = age; return this; }
        public Builder email(String email) { this.email = email; return this; }

        public User build() {
            return new User(this);
        }
    }

    public static void main(String[] args) {
        User user = new User.Builder()
                .name("Tom")
                .age(20)
                .email("tom@example.com")
                .build();
    }
}
```

`Builder` 是静态内部类，可以独立于 `User` 实例创建，符合 Builder 模式的语义。

### 匿名内部类实现回调

```java
import java.util.*;

public class EventSource {
    private final List<Runnable> listeners = new ArrayList<>();

    public void addListener(Runnable listener) {
        listeners.add(listener);
    }

    public void fire() {
        for (Runnable r : listeners) r.run();
    }

    public static void main(String[] args) {
        EventSource source = new EventSource();
        // 匿名内部类作为回调
        source.addListener(new Runnable() {
            @Override
            public void run() {
                System.out.println("事件触发");
            }
        });
        source.fire();
    }
}
```

### 闭包式访问（事实 final）

```java
import java.util.function.Supplier;

public class ClosureDemo {
    public static Supplier<Integer> counter() {
        int[] count = {0};  // 数组是引用，可以"绕过"final 限制
        return () -> ++count[0];
    }

    public static void main(String[] args) {
        Supplier<Integer> c = counter();
        System.out.println(c.get());  // 1
        System.out.println(c.get());  // 2
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| Builder 模式 | 静态内部类构建不可变对象 | `StringBuilder`、`User.Builder` 都是经典用法 |
| 集合的节点 | `HashMap.Node`、`LinkedList.Node` | 静态内部类，避免持有外部类引用 |
| 回调 / 监听器 | 匿名内部类实现 `Runnable`、`Comparator` | Java 8+ 优先用 Lambda |
| 工具类的辅助类 | 静态内部类封装工具方法 | 不需要外部类实例 |
| 策略模式 | 局部内部类定义一次性策略 | 只在方法内可见，作用域收敛 |
| 迭代器实现 | `Iterator` 作为内部类访问外部集合私有字段 | 经典集合实现方式 |

## 深挖追问

### 1. 内部类为什么能访问外部类 `private` 成员

编译器为内部类合成了 `package-private` 的"访问桥"静态方法（如 `access$0`），内部类调用这些方法间接访问外部类 `private` 字段。这是 Java 编译器层面的"语法糖"，JVM 层面并没有真正的"内部类访问外部私有"语义。

### 2. 成员内部类和静态内部类怎么选

优先用静态内部类。原因：

- 成员内部类隐式持有外部类实例引用，浪费内存，还可能导致外部类无法 GC。
- 静态内部类独立，不持有外部类实例，更适合做工具类、Builder、节点等。
- 只有当内部类**需要访问外部类实例成员**时，才用成员内部类。

Effective Java Item 24 明确建议：**优先使用静态内部类**。

### 3. 为什么局部内部类只能访问 `final` 变量

局部内部类捕获的是变量的"副本"（基本类型）或引用的"副本"（引用类型）。如果不限制为 `final`，会出现"内部类修改了副本，外部方法变量没变"的语义分裂。Java 8 引入"事实 final"放宽限制：只要变量在初始化后没被修改过，即使没标 `final` 也能被捕获。

### 4. Lambda 和匿名内部类的区别

| 维度 | 匿名内部类 | Lambda |
|------|-----------|--------|
| 编译产物 | 生成 `Outer$N.class` | 不生成 class 文件，运行时 `invokedynamic` 生成 |
| `this` 指向 | 指向匿名内部类实例 | 指向外部类实例 |
| 实现接口数量 | 一个接口或一个类 | 只能是函数式接口 |
| 性能 | 每次创建新对象 | 可能复用 `LambdaMetafactory` 生成的对象 |
| 状态 | 可以有字段 | 不能有字段 |

### 5. 内部类会导致内存泄漏吗

成员内部类隐式持有外部类实例引用。如果成员内部类实例被长期持有（如缓存、静态字段），外部类实例也无法被 GC，导致内存泄漏。解决方案：用静态内部类 + 弱引用，或显式提供释放方法。匿名内部类如果捕获了外部类 `this`（访问了实例字段），也会持有外部类引用。

## 易错点

- 在静态方法中创建成员内部类实例，没有外部类实例可用，编译错误。
- 在静态内部类中访问外部类非静态成员，编译错误。
- 局部内部类访问非 `final` 且非"事实 final"的局部变量，编译错误。
- 用 `Outer.Inner inner = new Outer.Inner()` 创建成员内部类，应为 `outer.new Inner()`。
- 匿名内部类访问外部 `this` 时用 `Outer.this`，直接 `this` 指向匿名内部类实例。
- 把成员内部类当工具类用，浪费内存又导致外部类无法 GC（改用静态内部类）。
- Lambda 中误以为可以修改捕获的局部变量，实际只能读取。

## 总结

Java 内部类是表达类之间紧密关系的语法糖，编译后都是独立的 `.class` 文件。四种内部类对应不同场景：成员内部类访问外部实例、静态内部类做工具/Builder/节点、局部内部类做一次性策略、匿名内部类做回调。生产实践中**优先用静态内部类**，避免隐式持有的外部类引用导致内存泄漏。Java 8 后，函数式接口的匿名内部类应该用 Lambda 替代，更简洁、性能更好。

## 参考资料

- [JLS §8.5 Member Types](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.5)
- [JLS §15.9.5 Anonymous Class Declarations](https://docs.oracle.com/javase/specs/jls/se17/html/jls-15.html#jls-15.9.5)
- [Effective Java - Item 24: Favor static member classes over nonstatic](https://www.oreilly.com/library/view/effective-java/9780134686097/)

---
