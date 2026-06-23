# Java 的传参方式是什么？

## 结论

Java 只有一种参数传递方式：**值传递**。

无论参数是基本数据类型还是引用数据类型，方法接收到的都是“值”的副本。

## 基本数据类型传参

基本数据类型传递的是变量值的副本。方法内部修改形参，不会影响外部实参。

```java
public static void change(int x) {
    x = 10;
}

public static void main(String[] args) {
    int a = 1;
    change(a);
    System.out.println(a); // 1
}
```

## 引用数据类型传参

引用数据类型传递的是对象引用地址的副本。方法内部可以通过这个副本修改对象内容，但不能让外部引用指向新对象。

```java
public static void changeName(User user) {
    user.setName("Tom");
}
```

这里修改的是同一个对象的属性，所以外部可以看到变化。

但如果方法内部重新赋值：

```java
public static void reset(User user) {
    user = new User("Jerry");
}
```

只是让形参副本指向新对象，不会改变外部变量的指向。

## 容易混淆的点

很多人误以为“引用类型能被修改”就说明 Java 是引用传递。实际上，Java 传递的是引用地址的副本，不是引用变量本身。

## 总结

Java 是值传递：

- 基本类型：传递具体值的副本。
- 引用类型：传递引用地址的副本。
- 方法内修改对象内容可能影响外部对象。
- 方法内重新给形参赋值不会改变外部引用。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- Java 只有值传递；对象参数传递的是引用值的副本。
- 修改同一对象内部状态外部可见，重新给形参赋值外部不可见。

### 面试官想考什么
- 区分值传递和引用传递。
- 解释 swap(Object a,Object b) 为什么失败。

### 标准回答
Java 调用方法会复制实参给形参。基本类型复制数值；引用类型复制对象地址这个值。因此形参能通过同一地址修改对象内容，但不能改变调用方变量本身的指向。

### 深挖追问
- String 参数为什么看起来改不了？
- 数组作为参数修改元素为什么生效？
- Java 是否存在真正引用传递？

### 实战场景/代码示例
```java
static void change(StringBuilder sb){
  sb.append("A");
  sb = new StringBuilder("B");
}
```

### 易错点/总结
- 不要把对象内容可变误认为引用传递。
- 不可变对象会让值传递现象更明显。

