# String 常量池

## 核心概念

### String 的不可变性

```java
String s1 = "hello";
String s2 = "hello";
// s1 和 s2 指向常量池中同一个对象
System.out.println(s1 == s2); // true

String s3 = new String("hello");
// s3 在堆中创建新对象
System.out.println(s1 == s3); // false
System.out.println(s1 == s3.intern()); // true
```

**为什么 String 不可变？**
1. **安全性** - String 常用于类加载器、网络连接等，不可变防止被篡改
2. **哈希缓存** - hashCode 可以缓存，提高性能
3. **线程安全** - 不可变对象天然线程安全
4. **常量池** - 支持字符串常量池，节省内存

### 常量池位置

| JDK 版本 | 常量池位置 |
|----------|-----------|
| JDK 6 | 方法区（永久代） |
| JDK 7+ | 堆内存 |
| JDK 8+ | 元空间（Metaspace） |

---

## 面试高频问题

### 1. String s = new String("abc") 创建了几个对象？

**回答要点：**
- **1 或 2 个对象**
- 如果常量池中没有 "abc"：创建 2 个（常量池 1 个 + 堆 1 个）
- 如果常量池中已有 "abc"：创建 1 个（只有堆中的）

```java
String s1 = new String("abc");  // 创建 2 个对象
String s2 = new String("abc");  // 创建 1 个对象（常量池已存在）
```

### 2. intern() 方法的作用？

**回答要点：**
- 返回字符串在常量池中的引用
- 如果常量池中没有，则将当前字符串加入常量池
- JDK 6：复制字符串到永久代
- JDK 7+：记录堆中对象的引用

```java
String s1 = new String("hello");
String s2 = s1.intern();
String s3 = "hello";
System.out.println(s2 == s3); // true（JDK 7+）
```

### 3. String、StringBuilder、StringBuffer 的区别？

| 类 | 可变性 | 线程安全 | 性能 | 场景 |
|----|--------|----------|------|------|
| String | 不可变 | 安全 | 低 | 少量字符串 |
| StringBuilder | 可变 | 不安全 | 高 | 单线程拼接 |
| StringBuffer | 可变 | 安全 | 中 | 多线程拼接 |

### 4. String 为什么设计成 final？

**回答要点：**
1. **安全性** - 防止子类破坏不可变性
2. **效率** - JVM 可以优化 final 类
3. **哈希缓存** - 保证 hashCode 一致
4. **常量池** - 确保字符串唯一性

---

## 代码示例

### 常量池验证

```java
public class StringPoolDemo {
    public static void main(String[] args) {
        // 字面量创建，直接进入常量池
        String s1 = "hello";
        String s2 = "hello";
        System.out.println(s1 == s2); // true
        
        // new 创建，堆中新建对象
        String s3 = new String("hello");
        System.out.println(s1 == s3); // false
        
        // intern 返回常量池引用
        String s4 = s3.intern();
        System.out.println(s1 == s4); // true
        
        // 编译期优化
        String s5 = "hel" + "lo";
        System.out.println(s1 == s5); // true（编译器优化）
        
        // 运行期拼接
        String s6 = "hel";
        String s7 = s6 + "lo";
        System.out.println(s1 == s7); // false（StringBuilder 拼接）
        System.out.println(s1 == s7.intern()); // true
    }
}
```

### intern 性能优化

```java
public class InternDemo {
    static final int MAX = 1000000;
    
    public static void main(String[] args) {
        // 不使用 intern
        String[] arr1 = new String[MAX];
        long start = System.currentTimeMillis();
        for (int i = 0; i < MAX; i++) {
            arr1[i] = new String("hello" + i % 100);
        }
        System.out.println("不使用 intern: " + (System.currentTimeMillis() - start) + "ms");
        
        // 使用 intern
        String[] arr2 = new String[MAX];
        start = System.currentTimeMillis();
        for (int i = 0; i < MAX; i++) {
            arr2[i] = new String("hello" + i % 100).intern();
        }
        System.out.println("使用 intern: " + (System.currentTimeMillis() - start) + "ms");
    }
}
```

---

## 实战场景

### 场景 1：大量重复字符串去重

```java
public class LogProcessor {
    // 处理日志时，大量重复的日志级别字符串
    public void process(String[] logs) {
        for (String log : logs) {
            // 使用 intern 减少内存
            String level = extractLevel(log).intern();
            processLog(log, level);
        }
    }
}
```

### 场景 2：字符串比较优化

```java
public class PermissionChecker {
    private static final String ADMIN = "admin".intern();
    
    public boolean isAdmin(String role) {
        // intern 后可以直接用 == 比较
        return ADMIN == role.intern();
    }
}
```

---

## 延伸思考

- 常量池大小有限制吗？（有，受堆内存限制）
- intern 滥用会有什么问题？（OOM）
- 字符串拼接优化？（编译器自动 StringBuilder）

## 参考资料

- [Java String 源码](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/lang/String.java)
- [JVM 字符串常量池](https://www.baeldung.com/java-string-pool)
