# static 关键字有什么作用？

## 核心概念

`static` 表示“属于类本身”，而不是属于某个具体对象。它可以修饰变量、方法、代码块和内部类。

- 静态变量：类级别共享变量。
- 静态方法：不依赖对象实例即可调用的方法。
- 静态代码块：类初始化时执行一次。
- 静态内部类：不依赖外部类实例的内部类。

## 修饰变量：静态变量

静态变量也叫类变量，属于类本身，所有实例共享同一份数据。

```java
class Counter {
    static int total = 0;

    Counter() {
        total++;
    }
}
```

与实例变量相比：

| 对比项 | 静态变量 | 实例变量 |
|---|---|---|
| 归属 | 类 | 对象实例 |
| 份数 | 类中一份 | 每个对象一份 |
| 访问方式 | 类名或对象访问，推荐类名访问 | 通过对象访问 |
| 生命周期 | 随类加载和卸载 | 随对象创建和回收 |

## 修饰方法：静态方法

静态方法属于类，不依赖对象实例，可以通过类名直接调用。

```java
class MathUtils {
    public static int max(int a, int b) {
        return a > b ? a : b;
    }
}

int result = MathUtils.max(1, 2);
```

静态方法中需要注意：

- 不能直接访问非静态字段和非静态方法。
- 不能使用 `this` 和 `super`。
- 静态方法不能是抽象方法，因为它属于类而不是实例。

## 修饰代码块：静态代码块

静态代码块在类初始化阶段执行，并且只执行一次。

```java
class Config {
    static {
        System.out.println("load config");
    }
}
```

它常用于初始化静态资源，但不建议放入过重、容易失败或依赖外部环境的逻辑。

## 修饰内部类：静态内部类

静态内部类不依赖外部类实例，可以直接创建对象；非静态内部类则必须依赖外部类实例。

```java
public class OuterClass {
    class InnerClass {
    }

    static class StaticInnerClass {
    }

    public static void main(String[] args) {
        OuterClass outer = new OuterClass();
        InnerClass inner = outer.new InnerClass();
        StaticInnerClass staticInner = new StaticInnerClass();
    }
}
```

静态内部类不能直接访问外部类的非静态成员。

## 静态导入

静态导入可以让代码在使用静态变量或静态方法时省略类名。

```java
import static java.lang.Math.max;

int value = max(1, 2);
```

静态导入可以简化代码，但过度使用会降低可读性，因为调用方不容易看出方法来自哪个类。

## 初始化顺序

类初始化时，静态变量和静态代码块优先于实例变量、普通代码块和构造方法。

没有继承时，顺序通常是：

1. 静态变量和静态代码块，按代码顺序执行。
2. 实例变量和普通代码块，按代码顺序执行。
3. 构造方法。

存在继承时，顺序通常是：

1. 父类静态变量和静态代码块。
2. 子类静态变量和静态代码块。
3. 父类实例变量、普通代码块、构造方法。
4. 子类实例变量、普通代码块、构造方法。

## 总结

`static` 的本质是类级别共享。它适合定义常量、工具方法、类级缓存或静态内部类，但可变的静态状态容易带来并发问题和测试污染，需要谨慎使用。

---
