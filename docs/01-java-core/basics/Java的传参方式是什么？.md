# Java 的传参方式是什么

## 核心概念

Java 只有一种参数传递方式：**值传递**。无论是基本类型还是引用类型，方法接收到的都是"值"的副本，而不是变量本身。

容易混淆的地方在于"引用类型"：传的是引用地址的副本，所以方法内可以通过这个副本修改对象内容，但不能让外部引用指向新对象。这种"能改对象内容、不能改引用指向"的行为，常被误认为是"引用传递"，其实是"引用值的副本传递"。

```java
void change(int x) { x = 10; }                // 基本类型：改副本，外部不变
void changeName(User u) { u.setName("Tom"); }  // 引用类型：通过副本改对象内容，外部可见
void reset(User u) { u = new User(); }          // 引用类型：只改副本指向，外部不变
```

## 标准回答

Java 是值传递。基本类型传值的副本，引用类型传引用地址的副本。要点：

1. **基本类型**：方法内修改形参不影响外部变量。
2. **引用类型**：方法内可以通过形参修改对象内容（外部可见），但形参重新指向新对象不影响外部引用。
3. **String 看似特殊实际不是**：String 不可变，方法内 `s = "new"` 等同于"形参指向新对象"，外部不变。
4. **没有真正的"引用传递"**：C++ 的 `int& ref` 才是引用传递，Java 没有这个语法。
5. **数组也是引用类型**：传数组传的是数组对象引用的副本。

## 实现原理

### 1. 基本类型传参

```java
public static void change(int x) {
    x = 10;
}

public static void main(String[] args) {
    int a = 1;
    change(a);
    System.out.println(a);  // 1
}
```

`a` 的值 `1` 被复制一份传给 `x`，方法内 `x = 10` 只改了副本，外部 `a` 不变。

### 2. 引用类型传参

```java
class User {
    String name;
    User(String n) { this.name = n; }
}

public static void changeName(User u) {
    u.name = "Tom";          // 通过副本修改对象内容
}

public static void reset(User u) {
    u = new User("Jerry");   // 副本指向新对象
}

public static void main(String[] args) {
    User user = new User("Tom");
    changeName(user);
    System.out.println(user.name);  // Tom

    reset(user);
    System.out.println(user.name);  // 还是 Tom，不是 Jerry
}
```

关键点：

- `changeName` 中 `u` 是 `user` 引用的副本，两者指向同一个 `User` 对象。修改 `u.name` 等于修改 `user` 指向的对象内容。
- `reset` 中 `u = new User("Jerry")` 让 `u` 这个副本指向新对象，但 `user` 仍指向原对象。

### 3. 引用传递 vs 值传递

C++ 的引用传递：

```cpp
void change(int& x) { x = 10; }   // 真正的引用传递

int a = 1;
change(a);
// 此时 a == 10
```

`x` 不是 `a` 的副本，而是 `a` 的别名，对 `x` 的修改直接作用于 `a`。Java 没有这种语法。

### 4. String 的"看似特殊"

```java
public static void change(String s) {
    s = "new value";   // s 副本指向新 String，外部不变
}

public static void main(String[] args) {
    String str = "old";
    change(str);
    System.out.println(str);  // old
}
```

`String` 不可变，`s = "new value"` 不是修改原 String 的内容，而是让 `s` 指向新的 String 对象。这和 `reset` 让 `u` 指向新对象是同一种情况。

### 5. 数组也是引用类型

```java
public static void changeFirst(int[] arr) {
    arr[0] = 999;          // 修改对象内容，外部可见
}

public static void reassign(int[] arr) {
    arr = new int[]{1, 2}; // 副本指向新数组，外部不变
}

public static void main(String[] args) {
    int[] a = {0, 0};
    changeFirst(a);
    System.out.println(a[0]);  // 999

    reassign(a);
    System.out.println(a.length);  // 还是 2，不是新数组
}
```

## 代码示例

### 经典示例综合

```java
public class PassByValueDemo {
    static class User {
        String name;
        int age;
        User(String n, int a) { name = n; age = a; }
    }

    static void tryChangeInt(int x) { x = 999; }
    static void tryChangeUserField(User u) { u.name = "Tom"; u.age = 30; }
    static void tryReassignUser(User u) { u = new User("Jerry", 25); }
    static void tryChangeString(String s) { s = "new"; }
    static void tryChangeArray(int[] arr) { arr[0] = 999; }

    public static void main(String[] args) {
        int i = 1;
        tryChangeInt(i);
        System.out.println("int: " + i);   // 1

        User user = new User("Original", 20);
        tryChangeUserField(user);
        System.out.println("name: " + user.name + ", age: " + user.age); // Tom, 30

        tryReassignUser(user);
        System.out.println("name: " + user.name);  // 还是 Tom

        String s = "old";
        tryChangeString(s);
        System.out.println("string: " + s);  // old

        int[] arr = {1, 2, 3};
        tryChangeArray(arr);
        System.out.println("arr[0]: " + arr[0]);  // 999
    }
}
```

### swap 不可能直接实现

```java
// 这个 swap 在 Java 中不能交换 a 和 b
public static void swap(Integer a, Integer b) {
    Integer tmp = a;
    a = b;
    b = tmp;
    // 只交换了形参副本的指向，外部不变
}
```

由于 Java 是值传递，无法实现 C++ 那样的 `swap(int& a, int& b)`。要交换两个变量的值，只能用数组或返回值间接实现。

### 通过数组模拟引用传递

```java
public static void swap(int[] arr, int i, int j) {
    int tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}

int[] pair = {1, 2};
swap(pair, 0, 1);
System.out.println(Arrays.toString(pair));  // [2, 1]
```

## 实战场景

| 场景 | 行为 | 注意点 |
|------|------|--------|
| 修改对象内容 | 通过形参修改字段，外部可见 | 注意线程安全，对象可能被并发修改 |
| 重新指向对象 | 形参 `obj = new ...` 外部不可见 | 业务代码中常因此产生 bug |
| 不可变对象 | `String`、`Integer` 看似"传值不生效" | 实际是不可变 + 值传递的组合效果 |
| 集合作为参数 | 方法内 `list.add()` 外部可见，`list = new ArrayList<>()` 不可见 | 注意并发修改异常 |
| 防御性拷贝 | 接收外部可变对象时复制一份 | 避免外部修改破坏内部状态 |
| 返回多个值 | 用数组、容器或 record 包装 | Java 没有真正的多返回值 |

## 深挖追问

### 1. 为什么 Java 设计成只有值传递

值传递的好处是**语义清晰**：方法内对形参的修改不影响外部变量（基本类型），或者只通过共享对象引用影响对象内容（引用类型）。这种"副本"语义避免了引用传递可能导致的"方法内副作用外部不可见"的问题，符合 Java"简单可靠"的设计哲学。

### 2. `Integer` 类型的传参行为

```java
public static void incr(Integer n) {
    n++;  // 等价于 n = Integer.valueOf(n.intValue() + 1)
}

Integer x = 1;
incr(x);
System.out.println(x);  // 1
```

`n++` 在自动拆箱后做加法，再自动装箱，相当于 `n = 新 Integer`，形参指向新对象，外部不变。所以"在方法里 `++` 一个 Integer 不会改变外部值"。

### 3. C++ 的引用传递和 Java 的引用类型传参有什么区别

- C++ `int& ref`：`ref` 是变量的别名，对 `ref` 的修改直接作用于原变量。
- Java `User u`：`u` 是引用的副本，可以通过 `u` 修改对象内容，但不能让原变量指向新对象。

C++ 引用传递可以 `swap(a, b)`，Java 不行。

### 4. Java 的 `final` 参数有意义吗

`void method(final User u)` 表示方法内不能给 `u` 重新赋值，但可以修改 `u` 的字段。`final` 在形参上的作用是"防止误改形参指向"，不能阻止修改对象内容。Lambda 表达式捕获外部变量时要求事实 `final`，与此相关。

### 5. 方法参数为什么不能返回值赋给原变量

```java
void reset(User u) { u = new User(); }
// 调用 reset(user) 后，user 仍指向原对象
```

因为 `u` 是 `user` 引用的副本，方法返回后 `u` 被丢弃。Java 没有"输出参数"概念，要返回新对象只能用返回值。

### 6. Java 17 record 值传递有什么变化

没有变化。record 只是用更简洁的语法定义不可变类，本质仍是引用类型。传 record 传的是引用的副本，但 record 不可变，所以方法内只能读取不能修改。

## 易错点

- 误以为引用类型传参是"引用传递"，导致 `obj = new ...` 后期望外部也变。
- 在方法内 `String s = "new"` 期望外部 String 也变。
- 在方法内 `list = new ArrayList<>()` 期望外部 list 也变。
- 用 `swap(Integer, Integer)` 期望交换两个 Integer 变量，实际不行。
- 把数组当基本类型，期望方法内修改数组元素不影响外部（实际会影响）。
- 在方法内 `++` 一个 `Integer` 形参，期望外部也加 1。
- 防御性拷贝只复制引用（浅拷贝），方法仍能通过原引用修改对象内容。

## 总结

Java 只有值传递。基本类型传值副本，引用类型传引用地址的副本。判断方法内操作是否影响外部，看是"修改对象内容"（影响）还是"形参重新指向新对象"（不影响）。`String` 和包装类型看起来"传值不变"，是"不可变 + 值传递"叠加的结果，不是特殊语法。理解这一点，能解释绝大多数 Java 参数传递的"奇怪"行为。

## 参考资料

- [JLS §8.4.1 Formal Parameters](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.4.1)
- [The Java Tutorials - Passing Information to a Method or a Constructor](https://docs.oracle.com/javase/tutorial/java/javaOO/arguments.html)
- [Effective Java - Item 50: Make defensive copies when needed](https://www.oreilly.com/library/view/effective-java/9780134686097/)

---
