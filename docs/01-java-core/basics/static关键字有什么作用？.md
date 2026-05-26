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
