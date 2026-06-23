# String 类型与字符串常量池怎么关联？

## 核心概念

`String` 是 Java 中不可变的字符串类型。字符串常量池是 JVM 为了复用字符串字面量、减少内存浪费而设计的一块特殊区域。

当代码中出现字符串字面量时，JVM 会优先从字符串常量池中查找是否已经存在相同内容的字符串：

- 如果存在，直接复用池中的引用。
- 如果不存在，则在池中创建新的字符串对象。

## 字面量创建字符串

```java
String s1 = "abc";
String s2 = "abc";
System.out.println(s1 == s2); // true
```

`s1` 和 `s2` 都指向字符串常量池中的同一个 `"abc"` 对象。

## new 创建字符串

```java
String s1 = new String("abc");
String s2 = "abc";
System.out.println(s1 == s2); // false
```

`new String("abc")` 通常会在堆上创建一个新的 `String` 对象，而字面量 `"abc"` 位于字符串常量池中，所以两个引用不同。

## intern 方法

`intern()` 会尝试把字符串放入常量池，并返回常量池中的引用。

```java
String s1 = new String("abc");
String s2 = s1.intern();
String s3 = "abc";

System.out.println(s2 == s3); // true
```

## 总结

字符串常量池的核心作用是复用字符串字面量。面试中要重点区分 `==` 比较引用、`equals()` 比较内容，以及字面量、`new String()`、`intern()` 三者的关系。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- String 不可变，字面量通常进入字符串常量池。
- intern 返回常量池中等值字符串引用；编译期常量拼接可折叠。

### 面试官想考什么
- new String、字面量、intern 的引用关系。
- 不可变性和常量池复用的意义。

### 标准回答
回答时先区分内容相等和引用相同，再区分编译期常量与运行期对象。String 不可变，适合做 Map key；大量动态拼接应使用 StringBuilder。

### 深挖追问
- StringBuilder/StringBuffer 区别？
- 为什么 String 可以缓存 hash？
- 循环拼接字符串有什么问题？

### 实战场景/代码示例
```java
String a="he"+"llo";
String b="hello";
System.out.println(a==b); // 通常 true
```

### 易错点/总结
- == 比引用，equals 比内容。
- intern 细节与 JDK 版本有关，避免绝对化。

