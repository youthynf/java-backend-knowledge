# Java 泛型机制是什么

## 核心概念

泛型（Generics）是 JDK 1.5 引入的特性，用于在编译期提供类型安全检查，并减少强制类型转换。它的核心思想是**把类型当作参数传入类、接口或方法中**，让一份代码可以处理多种类型，同时由编译器保证类型安全。

```java
List<String> list = new ArrayList<>();
list.add("Java");
String value = list.get(0);  // 不需要强转
```

没有泛型之前，集合存的是 `Object`，取出来要强转，类型错误只能在运行时炸。泛型把这种错误提前到编译期，"写错类型就编不过"。

## 标准回答

Java 泛型是参数化类型机制，编译期检查类型安全，运行时通过**类型擦除**实现兼容。要点：

1. **本质**：类型参数化，把类型当参数传。
2. **类型擦除**：编译后泛型信息被擦除，运行时 `List<String>` 和 `List<Integer>` 是同一个 `ArrayList`。
3. **通配符**：`<? extends T>` 上界（PE-CS 中的 Producer），`<? super T>` 下界（Consumer）。
4. **PECS 原则**：读多用 `extends`，写多用 `super`。
5. **局限**：基本类型不能做泛型参数、运行时拿不到泛型类型、不能 `new T()`、不能 `T.class`。

## 实现原理

### 1. 为什么需要泛型

泛型之前的写法：

```java
List list = new ArrayList();
list.add("hello");
list.add(123);              // 编译通过，运行时不报错
String s = (String) list.get(1);  // ClassCastException
```

集合装的是 `Object`，任何类型都能塞进去，取出来强转时类型不匹配就炸。这种错误在运行时才暴露，排查困难。泛型把类型检查提前到编译期：

```java
List<String> list = new ArrayList<>();
list.add("hello");
// list.add(123);          // 编译错误
String s = list.get(0);    // 无需强转
```

### 2. 类型擦除

Java 泛型的最大特点是**类型擦除（Type Erasure）**。编译时泛型信息用于类型检查，编译完成后泛型被擦除，运行时不存在泛型类型信息。

```java
List<String> a = new ArrayList<>();
List<Integer> b = new ArrayList<>();
System.out.println(a.getClass() == b.getClass());  // true
System.out.println(a.getClass().getName());        // java.util.ArrayList
```

擦除规则：

- 无界泛型 `T` 擦除为 `Object`。
- 有界泛型 `T extends Number` 擦除为 `Number`。
- 调用泛型方法时，编译器在调用处插入 `checkcast` 强转。

```java
// 源码
class Box<T> {
    private T value;
    public T get() { return value; }
    public void set(T v) { this.value = v; }
}

// 擦除后（伪代码）
class Box {
    private Object value;
    public Object get() { return value; }
    public void set(Object v) { this.value = v; }
}

// 调用处编译时插入 checkcast
Box<String> box = new Box<>();
box.set("hello");
String s = (String) box.get();   // 编译器插入强转
```

### 3. 为什么 Java 选择类型擦除

JDK 1.5 引入泛型时，Java 已经有大量非泛型代码。为了**二进制兼容**——让新的泛型代码能和老的非泛型代码互操作——Java 选择擦除实现。代价是泛型能力受限（运行时拿不到类型、不能 `new T()`）。

C# 的泛型是"真泛型"（reified generics），运行时保留类型信息，能力更强，但和老代码不兼容，需要重新设计运行时。

### 4. 桥接方法（Bridge Method）

类型擦除会带来方法签名冲突，编译器通过"桥接方法"解决：

```java
class Parent<T> {
    void set(T t) {}
}

class Child extends Parent<String> {
    @Override
    void set(String s) {}
}
```

擦除后 `Parent.set` 的签名是 `set(Object)`，子类 `set(String)` 不能算重写。编译器为 `Child` 合成桥接方法：

```java
// 合成的桥接方法
void set(Object t) {
    set((String) t);  // 转调具体方法
}
```

这就是为什么反射 `Child.class.getDeclaredMethods()` 可能看到 `set(Object)` 方法（标 `synthetic bridge`）。

### 5. 泛型通配符

#### 上界通配符 `<? extends T>`

表示"是 T 或 T 的子类型"，常用于读取场景。

```java
void printNumbers(List<? extends Number> list) {
    for (Number n : list) {
        System.out.println(n);   // 可以读为 Number
    }
    // list.add(1);  // 编译错误：不能写入，因为无法保证 List 的真实元素类型
}

printNumbers(new ArrayList<Integer>());
printNumbers(new ArrayList<Double>());
```

为什么不能写入？`List<? extends Number>` 可能是 `List<Integer>`，也可能是 `List<Double>`，编译器无法确定具体类型，索性禁止写入任何元素（除了 `null`）。这就是"生产者只读"。

#### 下界通配符 `<? super T>`

表示"是 T 或 T 的父类型"，常用于写入场景。

```java
void addNumbers(List<? super Integer> list) {
    list.add(1);   // 可以写入 Integer
    list.add(2);
    // Number n = list.get(0);  // 编译错误：读取只能拿到 Object
}

addNumbers(new ArrayList<Integer>());
addNumbers(new ArrayList<Number>());
addNumbers(new ArrayList<Object>());
```

为什么读取只能拿 `Object`？`List<? super Integer>` 可能是 `List<Number>` 或 `List<Object>`，编译器只能保证最小公倍数 `Object`。

#### PECS 原则

**P**roducer **E**xtends, **C**onsumer **S**uper：频繁读取用 `extends`，频繁写入用 `super`。

```java
// 经典示例：把 src 的元素复制到 dest
public static <T> void copy(List<? super T> dest, List<? extends T> src) {
    for (T t : src) {
        dest.add(t);
    }
}

List<Number> nums = new ArrayList<>();
List<Integer> ints = Arrays.asList(1, 2, 3);
copy(nums, ints);  // dest 消费 Integer，src 生产 Integer
```

### 6. 泛型方法

泛型方法在返回值前用 `<T>` 声明类型参数，可以独立于类的泛型参数。

```java
public class Util {
    public static <T> T firstOf(List<T> list) {
        return list.isEmpty() ? null : list.get(0);
    }

    // 多类型参数
    public static <K, V> Map<K, V> mapOf(K key, V value) {
        Map<K, V> map = new HashMap<>();
        map.put(key, value);
        return map;
    }

    // 有界类型参数
    public static <T extends Comparable<T>> T max(T a, T b) {
        return a.compareTo(b) >= 0 ? a : b;
    }
}
```

### 7. 泛型的局限

```java
class Box<T> {
    // T t = new T();           // 编译错误：不能 new T()
    // T[] arr = new T[10];     // 编译错误：不能 new T[]
    // if (t instanceof T) {}   // 编译错误：instanceof 不能用类型参数
    // Class<T> c = T.class;    // 编译错误：拿不到 T.class
}
```

原因都是类型擦除：运行时 `T` 不存在，没有具体类型可以 `new` 或 `instanceof`。

解决方法：传入 `Class<T>` 参数，通过反射创建。

```java
class Box<T> {
    private final Class<T> type;

    public Box(Class<T> type) { this.type = type; }

    public T newInstance() throws Exception {
        return type.getDeclaredConstructor().newInstance();
    }
}
```

### 8. 反射获取泛型信息

虽然运行时类型被擦除，但 class 文件里通过 `Signature` 属性保留了泛型签名。反射可以通过 `getGenericSuperclass()`、`getGenericReturnType()` 等方法取到。

```java
class GenericList extends ArrayList<String> {}

// 拿父类的泛型参数
Type type = GenericList.class.getGenericSuperclass();
if (type instanceof ParameterizedType pt) {
    System.out.println(pt.getActualTypeArguments()[0]); // class java.lang.String
}
```

这种用法常见于 Jackson、Gson 的泛型反序列化。

## 代码示例

### 泛型容器

```java
public class Box<T> {
    private T value;

    public Box(T value) { this.value = value; }
    public T get() { return value; }
    public void set(T value) { this.value = value; }

    public <R> Box<R> map(Function<T, R> fn) {
        return new Box<>(fn.apply(value));
    }

    public static void main(String[] args) {
        Box<String> b1 = new Box<>("hello");
        Box<Integer> b2 = b1.map(String::length);
        System.out.println(b2.get());  // 5
    }
}
```

### 泛型 + 有界类型参数

```java
public class Repository<T extends Identifiable> {
    private final Map<Long, T> data = new HashMap<>();

    public void save(T entity) {
        data.put(entity.getId(), entity);
    }

    public T findById(long id) {
        return data.get(id);
    }
}

interface Identifiable {
    long getId();
}

class User implements Identifiable {
    private final long id;
    public User(long id) { this.id = id; }
    @Override public long getId() { return id; }
}
```

### PECS 实战

```java
import java.util.*;

public class PecsDemo {
    // src 是生产者：用 extends
    // dest 是消费者：用 super
    public static <T> void copy(List<? super T> dest, List<? extends T> src) {
        for (T t : src) {
            dest.add(t);
        }
    }

    public static void main(String[] args) {
        List<Number> dest = new ArrayList<>();
        List<Integer> src = Arrays.asList(1, 2, 3);
        copy(dest, src);  // Number 是 Integer 的父类
        System.out.println(dest);  // [1, 2, 3]
    }
}
```

### 类型标记（Type Token）模式

```java
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.*;

public abstract class TypeReference<T> {
    private final Type type;

    protected TypeReference() {
        Type superClass = getClass().getGenericSuperclass();
        this.type = ((ParameterizedType) superClass).getActualTypeArguments()[0];
    }

    public Type getType() { return type; }

    public static void main(String[] args) {
        TypeReference<List<String>> ref = new TypeReference<>() {};
        System.out.println(ref.getType());  // java.util.List<java.lang.String>
    }
}
```

这是 Jackson `TypeReference`、Spring `ParameterizedTypeReference` 的核心原理。

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 集合类型安全 | `List<User>` 替代 `List` | 编译期检查 |
| 通用工具类 | `Box<T>`、`Result<T>`、`Optional<T>` | 注意 `T` 不能 `new` |
| DAO/Repository | `<T extends Identifiable>` 限定类型 | 有界类型参数 |
| 序列化框架 | `TypeReference<T>` 保留泛型 | 解决类型擦除 |
| 函数式接口 | `Function<T, R>`、`Predicate<T>` | Java 8+ |
| 事件总线 | `EventBus<T>` 区分事件类型 | 注意类型擦除下的 type token |

## 深挖追问

### 1. 类型擦除有什么不好

- 运行时拿不到泛型类型，不能 `instanceof T`、`new T()`、`T.class`。
- 不能创建泛型数组 `new T[10]`（数组协变 + 类型擦除会破坏类型安全）。
- 基本类型不能做泛型参数，必须用包装类型（`List<int>` 不合法）。
- 方法重载冲突：`void m(List<String>)` 和 `void m(List<Integer>)` 擦除后签名相同，不能共存。

### 2. 为什么不能 `new T()`

类型擦除后 `T` 在运行时不存在，编译器不知道要 `new` 哪个具体类。解决办法：传入 `Class<T>` 或 `Supplier<T>`。

```java
class Factory<T> {
    private final Supplier<T> supplier;
    public Factory(Supplier<T> supplier) { this.supplier = supplier; }
    public T create() { return supplier.get(); }
}

Factory<User> f = new Factory<>(User::new);
```

### 3. 为什么不能创建泛型数组

Java 数组是协变的（`Integer[]` 是 `Number[]` 的子类型），且数组在运行时知道元素类型。如果允许 `T[] arr = new T[10]`，擦除后变成 `Object[]`，可以塞入任何类型，但运行时数组检查会抛 `ArrayStoreException`。为了避免这种"编译期通过、运行时炸"的不一致，Java 禁止泛型数组。

### 4. 泛型类型参数命名约定

- `T`：Type（任意类型）
- `E`：Element（集合元素）
- `K`、`V`：Key、Value
- `R`：Result / Return
- `N`：Number
- `S`、`U`：第二、第三个类型参数

这是约定俗成的命名，编译器并不强制。

### 5. `<? extends T>` 和 `<T extends X>` 的区别

- `<T extends X>`：定义类型参数，T 在整个类/方法内可用。
- `<? extends T>`：使用通配符，表示"某种 T 的子类型"，但具体类型未知，常用于参数。

前者是"声明类型参数"，后者是"使用通配符类型"。

### 6. 反射能拿到泛型类型吗

部分能。运行时类型被擦除，但 class 文件的 `Signature` 属性保留了泛型签名。通过 `Method.getGenericReturnType()`、`Class.getGenericSuperclass()` 等可以取到 `ParameterizedType`。这是 Jackson、Gson 等序列化框架能反序列化 `List<User>` 的关键。

## 易错点

- 用 `List<int>` 等基本类型做泛型参数，编译错误，必须用 `List<Integer>`。
- 误以为 `List<String>` 和 `List<Integer>` 是不同 class，实际运行时同一个。
- `T t = new T()` 编译错误，运行时拿不到类型。
- `instanceof T` 编译错误。
- `<? extends T>` 写入元素，编译错误（除 `null`）。
- `<? super T>` 读取为 `T` 类型，编译错误（只能读 `Object`）。
- 子类泛型不协变：`List<Integer>` 不是 `List<Number>` 的子类型，不能传给 `List<Number>` 参数（要 `List<? extends Number>`）。
- 静态字段/方法不能用类的泛型参数，因为泛型参数属于实例，静态属于类。
- 重载 `void m(List<String>)` 和 `void m(List<Integer>)`，擦除后冲突，编译错误。

## 总结

Java 泛型是参数化类型机制，编译期类型检查 + 类型擦除实现，兼顾类型安全和二进制兼容。核心要点：擦除规则（`T -> Object`、`T extends X -> X`）、通配符 PECS 原则（producer extends、consumer super）、桥接方法解决签名冲突。生产中用泛型写工具类、Repository、Result 包装，几乎不用考虑底层擦除机制；理解擦除能解释为什么不能 `new T()`、为什么运行时拿不到泛型类型，对排查框架源码很有帮助。

## 参考资料

- [JLS §4.5 Parameterized Types](https://docs.oracle.com/javase/specs/jls/se17/html/jls-4.html#jls-4.5)
- [JLS §4.6 Type Erasure](https://docs.oracle.com/javase/specs/jls/se17/html/jls-4.html#jls-4.6)
- [The Java Tutorials - Generics](https://docs.oracle.com/javase/tutorial/java/generics/)
- [Effective Java - Item 28-32: Generics](https://www.oreilly.com/library/view/effective-java/9780134686097/)

---
