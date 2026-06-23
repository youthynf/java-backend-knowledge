# Java 泛型机制是什么？

## 核心概念

Java 泛型是 JDK 1.5 引入的特性，用于在编译期提供类型安全检查，并减少强制类型转换。

泛型的核心思想是：**把类型当作参数传入类、接口或方法中**。

```java
List<String> list = new ArrayList<>();
list.add("Java");
String value = list.get(0); // 不需要强转
```

## 泛型的本质

### 参数化类型

在定义类、接口或方法时，把具体类型抽象成类型参数。

```java
class Box<T> {
    private T value;

    public T getValue() {
        return value;
    }

    public void setValue(T value) {
        this.value = value;
    }
}
```

### 类型擦除

Java 泛型主要在编译期生效，编译后大部分泛型信息会被擦除。

```java
List<String> list1 = new ArrayList<>();
List<Integer> list2 = new ArrayList<>();

System.out.println(list1.getClass() == list2.getClass()); // true
```

这说明运行时两者都是 `ArrayList`，泛型信息主要用于编译期检查。

## 泛型通配符

### `? extends T`

表示上界通配符，只能接收 `T` 或 `T` 的子类，适合读取数据。

```java
List<? extends Number> list;
```

### `? super T`

表示下界通配符，只能接收 `T` 或 `T` 的父类，适合写入数据。

```java
List<? super Integer> list;
```

## 泛型的优点

- 编译期类型检查，减少运行时类型错误。
- 减少强制类型转换。
- 提高代码复用性和可读性。

## 总结

泛型是 Java 类型安全和代码复用的重要机制。面试中要重点理解类型擦除，以及 `extends`、`super` 通配符的使用边界。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- 泛型主要在编译期做类型检查，运行期类型擦除。
- PECS：生产者 extends，消费者 super。

### 面试官想考什么
- 类型擦除、泛型不变性、上下界通配符。
- 为什么 List<Object> 不是 List<String> 父类型。

### 标准回答
泛型把类型错误提前到编译期，减少强转。由于擦除，不能直接 new T 或创建泛型数组；API 设计时按读写方向选择 extends/super。

### 深挖追问
- 什么是桥接方法？
- List<?> 和原始类型 List 区别？
- 如何读取泛型元数据？

### 实战场景/代码示例
```java
void copy(List<? extends Number> src, List<? super Number> dst){
  for(Number n:src) dst.add(n);
}
```

### 易错点/总结
- 少用原始类型。
- 泛型不是协变的。

