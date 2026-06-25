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
