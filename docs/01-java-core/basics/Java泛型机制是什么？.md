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

---

<!-- interview-detail-2026-06-24 -->

## 面试版详细讲解补充

### 核心概念
- 泛型把类型参数化，主要在编译期保证类型安全；Java 采用类型擦除实现。
- 复习时不要只记一句结论，要把“定义、底层原因、使用边界、工程取舍”串起来。

### 面试官想考什么
- 类型擦除、泛型不变性、PECS、桥接方法、原始类型风险。
- 能否把该知识点和常见线上问题、代码设计、性能/并发/可维护性联系起来。

### 标准回答
泛型把 ClassCastException 尽量前置到编译期。读数据用 ? extends T，写数据用 ? super T；既读又写使用具体 T。

如果是口述面试，建议先给一句结论，再补充 2~3 个关键细节，最后用项目场景收尾。这样既有结构，也能给面试官继续追问的抓手。

### 深挖追问
- List<?>、List<Object>、List 原始类型区别？为什么不能 new T()？
- 如果让你在项目里落地这个知识点，你会如何设计测试用例验证边界？
- 遇到性能、并发或可维护性问题时，有哪些替代方案？

### 示例/实战场景
```java
static <T> void copy(List<? extends T> src, List<? super T> dst){ for(T t:src) dst.add(t); }
```

实战中建议把该知识点放到具体场景里理解：例如接口参数校验、集合选型、线程池治理、金额计算、JVM 排障或框架扩展点，而不是孤立背概念。

### 易错点/总结
- 原始类型会绕过检查；泛型不是协变；不能创建泛型数组。
- 面试表达要避免绝对化，例如“永远”“一定”“只会”，很多 Java 行为都与版本、实现、参数和上下文有关。
- 最后用一句话收束：先讲清楚它解决什么问题，再讲清楚它的限制和替代方案。

