# final 关键字有什么作用？

## 核心概念

`final` 表示“最终的、不可再改变的”。在 Java 中，它可以修饰变量、方法和类，含义分别是：

- 修饰变量：变量只能赋值一次。
- 修饰方法：方法不能被子类重写。
- 修饰类：类不能被继承。

`final` 关注的是“引用或声明本身不能再变”，并不一定代表对象内容完全不可变。

## 修饰变量

`final` 修饰变量时，表示变量一旦初始化后就不能再次赋值。

### 基本类型变量

如果修饰基本类型，变量保存的值不能改变。

```java
final int count = 10;
// count = 20; // 编译错误
```

### 引用类型变量

如果修饰引用类型，表示引用不能再指向其他对象，但引用指向的对象内容仍然可以修改。

```java
final List<String> list = new ArrayList<>();
list.add("Java");      // 可以，修改的是对象内容
// list = new ArrayList<>(); // 编译错误，引用不能变
```

### 编译期常量与运行时常量

`final` 变量可以是编译期常量，也可以是运行时初始化后不可变的常量。

```java
static final int MAX_SIZE = 100;              // 编译期即可确定
final long startTime = System.currentTimeMillis(); // 运行时初始化
```

## 修饰方法

`final` 修饰方法时，表示该方法不能被子类重写。

```java
class Parent {
    public final void doSomething() {
        System.out.println("fixed behavior");
    }
}

class Child extends Parent {
    // public void doSomething() {} // 编译错误
}
```

需要注意的是，`private` 方法对子类不可见，因此它并不是通常意义上的“可重写方法”。如果子类定义了同名同参的 `private` 方法，并不是重写父类方法，而是在子类中声明了一个新方法。

## 修饰类

`final` 修饰类时，表示该类不能被继承。

```java
public final class String {
    // JDK 中 String 就是 final 类
}
```

常见的 `final` 类包括 `String`、包装类型等。这样可以避免子类破坏类本身的不可变性或安全语义。

## 常见使用场景

- 定义常量，例如 `static final int DEFAULT_SIZE = 16`。
- 保护核心方法不被子类随意改变。
- 构建不可变类，例如 `String`。
- 在匿名内部类、Lambda 或并发场景中表达变量不可重新赋值。

## 总结

- `final` 修饰变量：只能赋值一次。
- `final` 修饰方法：不能被重写。
- `final` 修饰类：不能被继承。
- `final` 引用不变，不等于引用对象内容不可变。

---
