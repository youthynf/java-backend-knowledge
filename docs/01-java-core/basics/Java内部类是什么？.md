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

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- 内部类包括成员、静态、局部、匿名内部类。
- 非静态内部类持有外部类实例引用，静态内部类不持有。

### 面试官想考什么
- 不同内部类场景和访问规则。
- 静态内部类单例为什么线程安全。

### 标准回答
内部类用于增强封装、表达强绑定关系或简化回调。非静态内部类依赖外部对象；静态内部类适合工具结构和懒加载单例。

### 深挖追问
- 匿名内部类访问局部变量为何要求 effectively final？
- 内部类可能导致内存泄漏吗？
- Lambda 与匿名内部类区别？

### 实战场景/代码示例
```java
class Holder{
  private static class Inner{ static final Holder I=new Holder(); }
  static Holder get(){ return Inner.I; }
}
```

### 易错点/总结
- 警惕非静态内部类长期持有外部对象。
- Lambda 不能完全替代匿名内部类。

---

<!-- interview-detail-2026-06-24 -->

## 面试版详细讲解补充

### 核心概念
- 内部类包括成员、静态、局部和匿名内部类；非静态内部类隐式持有外部类引用，静态内部类不持有。
- 复习时不要只记一句结论，要把“定义、底层原因、使用边界、工程取舍”串起来。

### 面试官想考什么
- 不同内部类访问范围、生命周期、内存泄漏风险、Holder 单例原理。
- 能否把该知识点和常见线上问题、代码设计、性能/并发/可维护性联系起来。

### 标准回答
强依赖外部实例时用成员内部类；仅逻辑归属时用静态内部类；一次性回调用匿名内部类或 Lambda。

如果是口述面试，建议先给一句结论，再补充 2~3 个关键细节，最后用项目场景收尾。这样既有结构，也能给面试官继续追问的抓手。

### 深挖追问
- 匿名内部类访问局部变量为什么要求 effectively final？Lambda 的 this 指向谁？
- 如果让你在项目里落地这个知识点，你会如何设计测试用例验证边界？
- 遇到性能、并发或可维护性问题时，有哪些替代方案？

### 示例/实战场景
```java
static class Holder { static final Singleton I = new Singleton(); }
```

实战中建议把该知识点放到具体场景里理解：例如接口参数校验、集合选型、线程池治理、金额计算、JVM 排障或框架扩展点，而不是孤立背概念。

### 易错点/总结
- 非静态内部类被长生命周期对象持有可能导致外部类无法回收。
- 面试表达要避免绝对化，例如“永远”“一定”“只会”，很多 Java 行为都与版本、实现、参数和上下文有关。
- 最后用一句话收束：先讲清楚它解决什么问题，再讲清楚它的限制和替代方案。

