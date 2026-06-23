# Java内部类是什么？

Java内部类是什么？
一、Java内部类分类
成员内部类（Member Inner Class）：定义在类中的普通类；
静态内部类（Static Nested Class）：定义在类中被static修饰的普通类；
局部内部类（Local Inner Class）：定义在方法中或者作用域类的类；
匿名内部类（Anonymous Inner Class）：

二、Java内部类概述
成员内部类：
•  声明方式：定义在外部类的成员位置；
•  使用方式：依赖外部类的实例对象来创建内部类对象；
•  作用范围：支持访问所有非静态的外部类成员变量、方法，以及 static final 修饰的常量；
•  特殊属性：成员内部类会隐式持有外部类的引用；
•  生成形式：编译后会生成独立的 .class 文件（如Outer$Inner.class）;

public class Outer {
    private int outerField = 10;
    
    public class Inner {
        public void print() {
            System.out.println("访问外部类字段: " + outerField);
        }
    }
    
    public Inner getInner() {
        return new Inner();
    }
}

// 使用方式
Outer outer = new Outer();
// 需要依赖外部类来创建对象
Outer.Inner inner = outer.new Inner();  // 或 outer.getInner();
inner.print();

静态内部类：
•  声明方式：使用 static 关键字修饰的成员内部类；
•  使用方式：不需要依赖外部类实例对象就可以创建内部类对象；
•  作用范围：只支持访问静态成员变量、方法；

public class Outer {
    private static int staticField = 20;
    
    public static class StaticInner {
        public void print() {
            System.out.println("访问外部类静态字段: " + staticField);
        }
    }
}

// 使用方式
Outer.StaticInner staticInner = new Outer.StaticInner();
staticInner.print();

局部内部类：
•  定义方式：定义在方法或作用域内的类；
•  作用范围：只能访问 final 或 effectively final 的局部变量，作用域仅限于定义它的块中；

public class Outer {
    public void method() {
        final int localVar = 30;
        
        class LocalInner {
            public void print() {
                System.out.println("局部变量: " + localVar);
            }
        }
        
        LocalInner inner = new LocalInner();
        inner.print();
    }
}

匿名内部类：
•  声明方式：没有类名的内部类，且必须继承一个类或者实现一个接口；
•  使用方式：只能创建一次实例；

// 接口方式
Runnable runnable = new Runnable() {
    @Override
    public void run() {
        System.out.println("匿名内部类实现");
    }
};

// 抽象类方式
Thread thread = new Thread() {
    @Override
    public void run() {
        System.out.println("匿名Thread子类");
    }
};

三、Java内部类的好处
更好的封装性：将只在一个地方使用的类逻辑上组织在一起；
访问特权：可以访问外部类的私有成员；
代码简洁：匿名内部类可以减少代码量；
多重继承：通过内部类实现类似多重继承的效果；

四、内部类的原理
编译后，内部类会被转换为独立的类文件：
成员内部类会持有外部类的引用（通过合成构造函数参数），仅限成员内部类；
访问外部类私有成员是通过编译器生成的访问方法；

五、特殊用法
在内部类中明确的引用外部类实例：Outer.this.outerField
.this 与 .new使用：Outer.Inner inner = outer.new Inner();

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

