# Java 内部类是什么？

## 核心概念

内部类是定义在另一个类内部的类。它可以表达类之间更紧密的从属关系，也可以访问外部类成员。

Java 内部类主要分为四类：

1. 成员内部类
2. 静态内部类
3. 局部内部类
4. 匿名内部类

## 成员内部类

成员内部类定义在外部类的成员位置，依赖外部类实例存在。

```java
class Outer {
    private String name = "outer";

    class Inner {
        void print() {
            System.out.println(name);
        }
    }
}
```

特点：

- 可以访问外部类的实例变量和实例方法。
- 创建时需要依赖外部类对象。

```java
Outer outer = new Outer();
Outer.Inner inner = outer.new Inner();
```

## 静态内部类

静态内部类使用 `static` 修饰，不依赖外部类实例。

```java
class Outer {
    static class Inner {
        void print() {
            System.out.println("static inner");
        }
    }
}
```

特点：

- 可以直接通过外部类名创建。
- 只能直接访问外部类的静态成员。

```java
Outer.Inner inner = new Outer.Inner();
```

## 局部内部类

局部内部类定义在方法或代码块中，只能在当前作用域内使用。

```java
void method() {
    class LocalInner {
        void print() {
            System.out.println("local inner");
        }
    }
    new LocalInner().print();
}
```

## 匿名内部类

匿名内部类没有类名，通常用于一次性实现接口或继承类。

```java
Runnable task = new Runnable() {
    @Override
    public void run() {
        System.out.println("running");
    }
};
```

Java 8 之后，很多匿名内部类可以被 Lambda 表达式替代。

## 总结

内部类的本质仍然是编译后生成的独立 `.class` 文件。它常用于表达强关联关系、封装实现细节，以及实现回调、事件监听等场景。

---
