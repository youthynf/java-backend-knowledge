# String intern() 方法详解

## 核心概念

intern() 是 String 类的一个 native 方法，用于将字符串加入常量池。

### 方法签名

```java
public native String intern();
```

### 返回值

- 返回字符串在常量池中的引用
- 如果常量池中没有该字符串，将其加入并返回引用

---

## JDK 版本差异（重要！）

### JDK 6

```java
String s = new String("abc");
String intern = s.intern();
// 常量池在永久代
// intern() 会复制字符串到永久代
// s 和 intern 是不同的对象
System.out.println(s == intern); // false
```

### JDK 7+

```java
String s = new String("abc");
String intern = s.intern();
// 常量池在堆中
// intern() 记录堆中对象的引用
// s 和 intern 可能是同一个对象！
System.out.println(s == intern); // true（JDK 7+）
```

---

## 面试高频问题

### 1. intern() 的作用是什么？

**回答要点：**
- 确保字符串在常量池中有唯一引用
- 用于字符串去重和内存优化
- 可以用 == 替代 equals 提高比较效率

### 2. JDK 6 和 JDK 7 的 intern() 有什么区别？

**回答要点：**

| 版本 | 常量池位置 | intern() 行为 |
|------|-----------|--------------|
| JDK 6 | 永久代 | 复制字符串到永久代 |
| JDK 7+ | 堆 | 记录堆对象引用 |

**影响：**
- JDK 6：可能产生大量永久代内存占用
- JDK 7+：节省内存，引用共享

### 3. 什么场景使用 intern()？

**回答要点：**
1. **大量重复字符串** - 如日志级别、状态码、国家代码
2. **频繁字符串比较** - intern 后可用 == 比较
3. **内存优化** - 减少重复字符串占用

**不适合场景：**
- 字符串种类多且不重复
- 动态生成的唯一字符串（如 UUID）

### 4. 这段代码输出什么？

```java
String s1 = new String("he") + new String("llo");
String s2 = s1.intern();
String s3 = "hello";
System.out.println(s1 == s2); // JDK 6: false, JDK 7+: true
System.out.println(s2 == s3); // true
```

**分析：**
- s1 在堆中创建 "hello"（运行时拼接）
- s1.intern() 将 s1 加入常量池
- JDK 7+ 常量池记录 s1 的引用
- s3 直接使用常量池引用，就是 s1

---

## 代码示例

### 经典面试题

```java
public class InternTest {
    public static void main(String[] args) {
        // 题目 1
        String s = new String("1");
        s.intern();
        String s2 = "1";
        System.out.println(s == s2); // JDK 6: false, JDK 7: false
        
        // 题目 2
        String s3 = new String("1") + new String("1");
        s3.intern();
        String s4 = "11";
        System.out.println(s3 == s4); // JDK 6: false, JDK 7: true
    }
}
```

### 内存优化示例

```java
public class MemoryOptimization {
    // 大量重复的用户地区信息
    static Map<String, UserInfo> users = new HashMap<>();
    
    public void addUser(String userId, String region) {
        // region 可能重复，使用 intern 减少内存
        UserInfo info = new UserInfo();
        info.region = region.intern();
        users.put(userId, info);
    }
    
    public void queryByRegion(String region) {
        // intern 后可以用 == 比较，更快
        String internRegion = region.intern();
        for (UserInfo info : users.values()) {
            if (info.region == internRegion) {
                // 找到匹配用户
            }
        }
    }
}
```

---

## 实战场景

### 场景 1：日志处理优化

```java
public class LogAnalyzer {
    // 日志级别只有几种，使用 intern
    public void analyze(List<String> logs) {
        Map<String, Integer> levelCount = new HashMap<>();
        for (String log : logs) {
            String level = extractLevel(log).intern();
            levelCount.merge(level, 1, Integer::sum);
        }
    }
}
```

### 场景 2：状态码映射

```java
public class StatusCodeMapper {
    private static final Map<String, String> STATUS_MAP = new HashMap<>();
    
    static {
        // 预定义状态码
        STATUS_MAP.put("200".intern(), "OK");
        STATUS_MAP.put("404".intern(), "Not Found");
        STATUS_MAP.put("500".intern(), "Server Error");
    }
    
    public String getStatus(String code) {
        // 使用 intern 后可以直接 == 比较
        return STATUS_MAP.get(code.intern());
    }
}
```

---

## 延伸思考

- 常量池满了会怎样？（Full GC）
- 为什么 JDK 7 把常量池移到堆？（避免永久代 OOM）
- G1 字符串去重功能与 intern 的区别？

## 参考资料

- [JEP 192: String Deduplication in G1](https://openjdk.org/jeps/192)
- [Java String intern() 详解](https://www.baeldung.com/java-string-intern)
