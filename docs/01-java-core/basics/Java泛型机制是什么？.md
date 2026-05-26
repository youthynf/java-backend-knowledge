# Java泛型机制是什么？

Java泛型机制是什么？
一、概述
Java泛型是从JDK 1.5才开始加入的重要特性，它主要用于提供了编译时类型安全检查机制，以及减少了强制类型转换的需要。
二、Java泛型的本质
参数化类型：指在定义类/接口/方法时使用类型参数，在使用时指定具体类型的编程范式。例如List<String>就是一个参数化类型，其中 List 是原始类型，<String>是类型参数，整体表示元素类型为String的List；
编译时检查：在编译时确保类型安全；
类型擦除：运行时泛型信息会被擦除；

三、Java泛型的好处
类型安全
消除强制类型转换
提高代码复用性
使API更加灵活

四、泛型的基本使用
参数化类型可以用在类、接口、方法中，分别被称为泛型类、泛型接口、泛型方法。
泛型类

public class Box<T> {
    private T content;
    
    public void setContent(T content) {
        this.content = content;
    }
    
    public T getContent() {
        return content;
    }
}

// 使用
Box<String> stringBox = new Box<>();
stringBox.setContent("Hello");
String content = stringBox.getContent(); // 无需强制转换

泛型接口

public interface List<T> {
    void add(T element);
    T get(int index);
}

// 实现
public class ArrayList<T> implements List<T> {
    // 实现方法...
}

泛型方法

public <T> T getFirst(List<T> list) {
    if (list == null || list.isEmpty()) {
        return null;
    }
    return list.get(0);
}

// 使用
String first = getFirst(Arrays.asList("a", "b", "c"));

五、泛型高级特性
类型通配符

// 无界通配符
public void printList(List<?> list) {
    for (Object elem : list) {
        System.out.println(elem);
    }
}

// 上界通配符,extends 关键字声明了类型的上界，表示参数化的类型可能是所指定的类型，或者是此类型的子类
public double sumOfList(List<? extends Number> list) {
    double sum = 0.0;
    for (Number num : list) {
        sum += num.doubleValue();
    }
    return sum;
}

// 下界通配符，super 关键字声明了类型的下界，表示参数化的类型可能是指定的类型，或者是此类型的父类
public void addNumbers(List<? super Integer> list) {
    for (int i = 1; i <= 10; i++) {
        list.add(i);
    }
}

泛型边界

// 多重边界
public class MultiBoundClass<T extends Number & Comparable<T> & Serializable> {
    // T必须是Number的子类，且实现Comparable和Serializable
}

类型推断

// Java 7+ 钻石操作符
List<String> list = new ArrayList<>();  // 类型推断

// 泛型方法类型推断
Collections.<String>emptyList();  // 显式类型
Collections.emptyList();         // 类型推断

六、泛型与数组
泛型数组限制

// 不能直接创建泛型数组
// List<String>[] array = new List<String>[10]; // 编译错误

// 解决方案：使用通配符类型
List<?>[] array = new List<?>[10];

安全使用泛型数组

@SuppressWarnings("unchecked")
public <T> T[] createArray(Class<T> type, int size) {
    return (T[]) Array.newInstance(type, size);
}

// 使用
String[] strings = createArray(String.class, 10);

七、泛型擦除
为了兼容之前的版本，Java泛型的实现采取了“伪泛型”的策略，即Java在语法上支持泛型，但是在编译阶段会进行所谓的“类型擦除”（Type Erasure），将所有的泛型表示（尖括号中的内容）都替换为具体的类型（其对应的原生态类型），就像完全没有泛型一样。

擦除规则
•  擦除类定义中的类型参数 - 无限制类型擦除：直接被替换为Object，即形如<T>和<?>的类型参数都被替换为Object；
•  擦除类定义中的类型参数 - 有限制类型擦除：在类型擦除中替换为"最近"的父类，比如形如<T extends Number>和<? extends Number>的类型参数被替换为Number，<? super Number>被替换为Object；
•  擦除方法定义中的类型参数：擦除方法定义中的类型参数原则和擦除类定义中的类型参数是一样的。

桥方法
当对泛型类/接口进行继承并进行重写时，由于泛型擦除，泛型类/接口中的泛型会被擦除为 Object 类型，而由于子类指定了具体的类型，本意是需要重写方法，但实际上泛型擦除后实际方法与父类方法形成了重载关系。JVM 为了解决这种泛型擦除与多态冲突，通过自动生成对应的桥方法，即生成对应重写父类中的方法，并在自动生成的方法中调用子类实际的方法，从而保持了多态性：

// 原始代码
interface Comparable<T> {
    int compareTo(T other);
}

class String implements Comparable<String> {
    public int compareTo(String other) { ... }
}

// 编译器生成
class String implements Comparable {
    public int compareTo(Object other) { // 桥方法
        return compareTo((String) other);
    }
    
    public int compareTo(String other) { ... } // 实际方法
}
