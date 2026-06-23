# static关键字有什么作用？

static关键字有什么作用？
修饰数据：静态变量
静态变量，又称为类变量，也就是说这个变量属于类的，类所有的实例都共享静态变量，可以直接通过类名来访问它；静态变量在内存中只存在一份。区别于实例变量，每创建一个实例就会产生一个实例变量，它与该实例同生共死。
修饰方法：静态方法
静态方法在类加载的时候就存在了，它不依赖于任何实例，所以静态方法必须不能是抽象方法(abstract)，需要有方法实现。方法中只能访问当前所属类的静态字段和静态方法，并且方法中不能有 this 和 super 关键字。
修饰语句块：静态语句块
静态语句块在类初始化时运行一次。
修饰内部类：静态内部类
区别于非静态内部类，静态内部类支持直接 new 对象，而非静态内部类则需要依赖于外部类的实例。另外，静态内部类不能访问外部类的非静态的变量和方法。代码示例：

public class OuterClass {
   class InnerClass {
   }

   static class StaticInnerClass {
   }

   public static void main(String[] args) {
       // InnerClass innerClass = new InnerClass(); // 'OuterClass.this' cannot be referenced from a static context
       OuterClass outerClass = new OuterClass();
       InnerClass innerClass = outerClass.new InnerClass();
       StaticInnerClass staticInnerClass = new StaticInnerClass();
   }
}

静态导包
在使用静态变量和方法时不需要指明 ClassName，达到简化代码效果，但可读性大大降低。
特别说明：初始化顺序
静态变量和静态语句块优先于实例变量和普通语句块，静态变量和静态语句块的初始化按照它们在代码中的顺序执行，最后才是构造函数的初始化。存在继承的情况下，初始化顺序为：
优先静态变量和语句块：父静态变量/语句块→子静态变量/语句块
初始化：父实例变量/普通语句块/构造函数→子实例变量/普通语句块/构造函数。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- final 表示不可再赋值/不可重写/不可继承；static 表示类级成员。
- final 引用不可变不等于对象内容不可变；static 可变状态要注意线程安全。

### 面试官想考什么
- final/static 在变量、方法、类中的含义。
- 初始化顺序和类加载时机。

### 标准回答
final 适合表达不可变约束，static 适合表达类级共享或工具能力。二者常用于常量、工具方法、单例 Holder 等场景，但要避免全局可变状态。

### 深挖追问
- final 和 finally/finalize 区别？
- static 方法能访问实例变量吗？
- 静态代码块何时执行？

### 实战场景/代码示例
```java
final List<String> list=new ArrayList<>();
list.add("ok"); // 可以，引用未变
```

### 易错点/总结
- final 不是深度不可变。
- 可变 static 字段是并发和测试污染高发点。

