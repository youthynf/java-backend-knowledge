# String 类型与字符串常量池怎么关联

## 核心概念

`String` 是 Java 中不可变的字符序列。字符串常量池（String Pool）是 JVM 为了复用字符串字面量、减少内存浪费而维护的一块特殊区域。当代码中出现字符串字面量时，JVM 先去常量池里查一遍：

- 已经存在相同内容的字符串，直接返回池中的引用。
- 不存在，则在池中创建新字符串对象，再返回引用。

`String s1 = "abc"; String s2 = "abc";`，`s1 == s2` 为 `true`，因为它们指向常量池中同一个对象。这是常量池最直接的效果。

```java
String s1 = "abc";
String s2 = "abc";
System.out.println(s1 == s2);              // true，常量池复用

String s3 = new String("abc");
System.out.println(s1 == s3);              // false，new 出来的在堆上
System.out.println(s1 == s3.intern());     // true，intern 返回常量池引用
```

## 标准回答

`String` 是不可变类，所有字面量在编译期就被放入 class 文件常量池，类加载时进入运行时常量池，首次使用时进入字符串常量池。面试要点：

1. **常量池位置**：JDK 6 在永久代，JDK 7+ 移到 Java 堆。
2. **字面量 vs `new`**：字面量直接进常量池；`new String("x")` 会在堆上创建新对象，同时字面量 `"x"` 进常量池。
3. **`intern()` 语义**：保证常量池中存在等值字符串，并返回它的引用。JDK 7+ 不再复制字符串到永久代，而是直接记录堆中对象的引用。
4. **`==` vs `equals()`**：`==` 比引用地址，`equals()` 比内容。比较字符串内容必须用 `equals()`。
5. **`intern()` 用途**：去重和内存优化，但滥用会引起 Full GC 或 OOM。

## 实现原理

### 1. String 为什么不可变

`String` 内部用 `final char[] value`（JDK 9+ 改为 `byte[] value` 加编码标记）保存字符，类本身也是 `final` 修饰，无法继承。不可变带来四个好处：

- **哈希缓存**：`hashCode` 可以懒计算并缓存，做 HashMap key 时性能高。
- **线程安全**：不可变对象天然线程安全，无需同步。
- **安全性**：类加载器、网络连接、文件路径用 String 不会被恶意篡改。
- **常量池复用**：多个引用可以安全指向同一个 String 对象。

### 2. 常量池在 JVM 中的位置演变

| JDK 版本 | 字符串常量池位置 | 备注 |
|---------|----------------|------|
| JDK 6 及以前 | 永久代（PermGen） | 容易 OOM，intern 滥用会撑爆永久代 |
| JDK 7 | Java 堆 | 移到堆，更易受 GC 管理 |
| JDK 8+ | Java 堆（元空间只存类元数据） | 行为与 JDK 7 一致 |

迁移到堆的原因是：永久代大小固定且难以预估，大量 `intern()` 容易 `java.lang.OutOfMemoryError: PermGen space`。放堆上后，字符串常量池可以被普通 GC 回收，灵活性更高。

### 3. `new String("abc")` 创建几个对象

经典面试题。回答时区分"创建"和"常量池已有"两种情况：

- 如果常量池中没有 `"abc"`：会创建 **2 个**对象。一个在常量池（来自字面量 `"abc"`），一个在堆（来自 `new`）。
- 如果常量池中已有 `"abc"`：只创建 **1 个**对象，就是堆上的那个。

```java
String s1 = new String("abc"); // 假设常量池原本没有 "abc"：创建 2 个
String s2 = new String("abc"); // 常量池已有 "abc"：只创建 1 个堆对象
```

> 注意：`new String("a" + "b")` 这种涉及编译期常量折叠的情况，需要按 JLS 折叠规则分析，结果不是直观的"几个"。

### 4. `intern()` 的 JDK 版本差异

`intern()` 是 `String` 的 `native` 方法，语义是"确保常量池中存在等值字符串，并返回它的引用"。差异在实现细节：

| 版本 | 常量池位置 | intern 行为 |
|------|-----------|-------------|
| JDK 6 | 永久代 | 复制字符串对象到永久代，返回永久代引用 |
| JDK 7+ | 堆 | 直接把堆中对象的引用存入常量池，不复制 |

这个差异会导致同样的代码在 JDK 6 和 JDK 7+ 输出不同结果（见代码示例）。

### 5. 字符串拼接的字节码行为

```java
String s1 = "ab";
String s2 = "a" + "b";          // 编译期常量折叠，等价于 "ab"
String s3 = "a";
String s4 = s3 + "b";           // 运行期拼接，走 StringBuilder

System.out.println(s1 == s2);   // true
System.out.println(s1 == s4);   // false
System.out.println(s1 == s4.intern()); // true
```

`"a" + "b"` 是两个字面量拼接，编译期被折叠成 `"ab"`，直接进入常量池。`s3 + "b"` 涉及变量，编译器会生成 `StringBuilder.append`，结果在堆上，不在常量池。

> JDK 9+ 把 `StringBuilder.append` 优化成 `invokedynamic` + `StringConcatFactory`，但语义上仍然是"运行期拼接，结果在堆上"。

### 6. String、StringBuilder、StringBuffer 对比

| 类 | 可变性 | 线程安全 | 性能 | 场景 |
|----|--------|----------|------|------|
| `String` | 不可变 | 安全（不可变） | 低（频繁修改会创建大量对象） | 字符串常量、不可变值 |
| `StringBuilder` | 可变 | 不安全 | 高 | 单线程拼接 |
| `StringBuffer` | 可变 | 安全（synchronized） | 中 | 多线程拼接（罕见） |

## 代码示例

### 经典 intern 面试题

```java
public class InternPuzzle {
    public static void main(String[] args) {
        // 题目 1：字面量已存在的情况
        String s = new String("1");
        s.intern();
        String s2 = "1";
        // JDK 6 / 7+ 都是 false：s 在堆，s2 在常量池
        System.out.println(s == s2);

        // 题目 2：运行期拼接产生的新字符串
        String s3 = new String("1") + new String("1"); // 堆上的 "11"，常量池里还没有
        s3.intern();
        String s4 = "11";
        // JDK 6: false（intern 复制到永久代，s3 仍在堆）
        // JDK 7+: true（intern 把 s3 的引用存入常量池，s4 拿到的就是 s3）
        System.out.println(s3 == s4);
    }
}
```

**关键差别**：JDK 7+ 中，"11" 这个字符串此前不在常量池里，`s3.intern()` 把 `s3` 的堆引用记入常量池；之后字面量 `"11"` 拿到的就是 `s3` 的引用，所以 `s3 == s4`。JDK 6 是复制到永久代，`s3` 还在堆，两者不等。

### 大量重复字符串去重

```java
import java.util.HashMap;
import java.util.Map;

public class LogAnalyzer {
    private final Map<String, Integer> levelCount = new HashMap<>();

    public void analyze(Iterable<String> logs) {
        for (String log : logs) {
            // 日志级别只有 INFO/WARN/ERROR 等少量种类
            // intern 后所有相同级别指向同一对象，HashMap key 内存大幅节省
            String level = extractLevel(log).intern();
            levelCount.merge(level, 1, Integer::sum);
        }
    }

    private String extractLevel(String log) {
        return log.substring(0, log.indexOf(' '));
    }
}
```

### intern 慎用：动态字符串不要 intern

```java
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class InternAbuse {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>();
        for (int i = 0; i < 10_000_000; i++) {
            // 错误示范：UUID 几乎不重复，intern 不会去重，反而把大量字符串塞进常量池
            list.add(UUID.randomUUID().toString().intern());
        }
    }
}
```

每个 UUID 都不相同，`intern()` 既起不到去重作用，又会把这些字符串长期保留在常量池，最终可能 OOM。

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 大量重复短字符串 | `str.intern()` 后做 key | 适合种类少、重复多的场景，如状态码、日志级别 |
| 高频字符串相等判断 | `intern()` 后用 `==` 替代 `equals()` | 仅在能保证两边都 intern 过时使用，否则仍是 `equals()` 更安全 |
| 配置项解析 | 把读到的配置值 `intern()` | 减少内存，但要注意配置项种类有限 |
| 序列化/反序列化 | Jackson 等库内部已做类似优化 | 业务侧一般不需要手动 intern |
| 状态机/枚举字符串 | 用 `enum` 替代字符串常量 | 优先用枚举，比 intern 更安全、更可读 |

## 深挖追问

### 1. 常量池满了会怎样

JDK 6 下，常量池在永久代，撑爆会抛 `java.lang.OutOfMemoryError: PermGen space`。JDK 7+ 常量池在堆上，会触发 Full GC，仍装不下时抛 `java.lang.OutOfMemoryError: Java heap space`。

### 2. 为什么 JDK 7 把常量池移到堆

永久代大小固定，调参困难，且 GC 频率低。常量池中字符串生命周期可能很短（如临时拼接的字符串 intern 后），放堆上可以更及时回收。

### 3. G1 字符串去重和 `intern` 的区别

G1 字符串去重（`-XX:+UseStringDeduplication`，JEP 192）是 JVM 在 GC 时自动识别值相同的字符串，让它们共享底层 `char[]`/`byte[]`。它对应用透明，不需要改代码。`intern()` 是应用层手动去重，会改变对象引用。两者可以共存，但 G1 去重更安全（不修改对象身份）。

### 4. `intern()` 有性能开销吗

有。`intern()` 是 `native` 方法，需要查表、可能加锁（HotSpot 中 StringTable 是全局哈希表，多线程访问需要同步）。在大量并发 `intern` 的场景下，可能成为性能瓶颈。

### 5. `String s = new String("abc")` 创建几个对象——如果再调 `intern()`

如果常量池原本没有 `"abc"`：

- `new String("abc")`：常量池 1 个 + 堆 1 个 = 2 个。
- 之后调 `s.intern()`：常量池已经有 `"abc"`（字面量那次进的），`intern` 直接返回常量池引用，不再创建新对象。

如果常量池已有 `"abc"`：`new String("abc")` 只创建堆上 1 个；`intern` 不创建新对象。

## 易错点

- 用 `==` 比较字符串内容，结果在常量池范围内 `true`、堆对象 `false`，难以排查。统一用 `equals()`。
- 误以为 `new String("abc")` 只创建 1 个对象，忽略字面量也会进常量池。
- 误以为 `intern()` 在 JDK 7+ 会"复制"字符串到常量池，实际上是存堆引用。
- 对动态生成的大量字符串（如 UUID、时间戳）调用 `intern()`，导致常量池膨胀甚至 OOM。
- 在循环里用 `+` 拼接字符串，每次都生成 `StringBuilder` 和新 `String`，应直接用 `StringBuilder`。
- 误以为 `"a" + "b"` 和 `s1 + "b"` 行为相同，前者编译期折叠，后者运行期拼接。
- 把 `intern` 当成性能优化"万能药"，忽视了它本身的查表开销和潜在锁竞争。

## 总结

`String` 的不可变性 + 字符串常量池的组合，让 Java 既能复用字符串节省内存，又能保证线程安全。常量池的关键事实：JDK 7+ 在堆上、`intern()` 存引用不复制、字面量编译期进池、`new` 出来的在堆。生产中比较字符串内容用 `equals()`，对种类有限的重复字符串可以用 `intern()` 做内存优化，但对动态字符串不要 `intern()`。面试时把这四点讲清楚，就覆盖了 80% 的考点。

## 参考资料

- [JLS §3.10.5 String Literals](https://docs.oracle.com/javase/specs/jls/se17/html/jls-3.html#jls-3.10.5)
- [String API (Java SE 17)](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/String.html)
- [JEP 192: String Deduplication in G1](https://openjdk.org/jeps/192)
- [Baeldung - Java String Pool](https://www.baeldung.com/java-string-pool)

---
