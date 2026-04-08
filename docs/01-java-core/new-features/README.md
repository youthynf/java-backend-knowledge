# Java 新特性

## 核心概念

Java 持续演进，每个 LTS 版本都带来重要改进。掌握新特性不仅能提升开发效率，也是面试高频考点。

### 版本时间线

| 版本 | 发布时间 | 类型 | 重要特性 |
|------|----------|------|----------|
| Java 8 | 2014.03 | LTS | Lambda、Stream、Optional、默认方法 |
| Java 11 | 2018.09 | LTS | var 局部变量、HTTP Client、String 增强 |
| Java 17 | 2021.09 | LTS | Sealed 类、Pattern Matching、Records 增强 |
| Java 21 | 2023.09 | LTS | 虚拟线程、分代 ZGC、Switch 模式匹配 |

---

## Java 8 核心特性

### Lambda 表达式

**语法**：`(parameters) -> expression` 或 `(parameters) -> { statements; }`

```java
// 传统写法
Runnable r1 = new Runnable() {
    @Override
    public void run() {
        System.out.println("Hello");
    }
};

// Lambda 写法
Runnable r2 = () -> System.out.println("Hello");

// 带参数
Comparator<String> comparator = (s1, s2) -> s1.compareTo(s2);

// 多行语句
Arrays.asList("a", "b", "c").forEach(s -> {
    String upper = s.toUpperCase();
    System.out.println(upper);
});
```

**函数式接口**：只有一个抽象方法的接口

```java
@FunctionalInterface
public interface Calculator {
    int calculate(int a, int b);
}

Calculator add = (a, b) -> a + b;
Calculator multiply = (a, b) -> a * b;
```

**常用函数式接口**：

| 接口 | 参数 | 返回 | 用途 |
|------|------|------|------|
| `Runnable` | 无 | 无 | 执行操作 |
| `Supplier<T>` | 无 | T | 供给型 |
| `Consumer<T>` | T | 无 | 消费型 |
| `Function<T,R>` | T | R | 转换型 |
| `Predicate<T>` | T | boolean | 判断型 |
| `BiFunction<T,U,R>` | T, U | R | 双参数转换 |

### Stream API

**创建 Stream**：

```java
// 集合
Stream<String> stream = list.stream();
Stream<String> parallelStream = list.parallelStream();

// 数组
Stream<Integer> stream = Arrays.stream(new Integer[]{1, 2, 3});

// 静态方法
Stream<Integer> stream = Stream.of(1, 2, 3);
Stream<Double> infinite = Stream.generate(Math::random);
Stream<Integer> range = IntStream.range(1, 10).boxed();
```

**中间操作**（延迟执行，返回新 Stream）：

```java
List<Integer> numbers = Arrays.asList(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

// filter - 过滤
numbers.stream()
    .filter(n -> n % 2 == 0)  // 偶数
    .forEach(System.out::println);  // 2, 4, 6, 8, 10

// map - 映射转换
numbers.stream()
    .map(n -> n * n)  // 平方
    .forEach(System.out::println);  // 1, 4, 9, 16, ...

// flatMap - 扁平化
List<List<Integer>> nested = Arrays.asList(
    Arrays.asList(1, 2), 
    Arrays.asList(3, 4)
);
nested.stream()
    .flatMap(Collection::stream)  // [1, 2, 3, 4]
    .forEach(System.out::println);

// sorted - 排序
numbers.stream()
    .sorted(Comparator.reverseOrder())  // 降序
    .forEach(System.out::println);

// distinct - 去重
Arrays.asList(1, 1, 2, 2, 3).stream()
    .distinct()  // [1, 2, 3]
    .forEach(System.out::println);

// limit / skip - 分页
numbers.stream()
    .skip(2)   // 跳过前2个
    .limit(3)  // 取3个
    .forEach(System.out::println);
```

**终端操作**（触发执行，产生结果）：

```java
// collect - 收集
List<Integer> evenList = numbers.stream()
    .filter(n -> n % 2 == 0)
    .collect(Collectors.toList());

Set<Integer> evenSet = numbers.stream()
    .filter(n -> n % 2 == 0)
    .collect(Collectors.toSet());

Map<Integer, String> map = numbers.stream()
    .collect(Collectors.toMap(
        n -> n,           // key
        n -> "num-" + n   // value
    ));

String joined = Stream.of("a", "b", "c")
    .collect(Collectors.joining(","));  // "a,b,c"

// 统计
IntSummaryStatistics stats = numbers.stream()
    .mapToInt(Integer::intValue)
    .summaryStatistics();
stats.getMax();    // 10
stats.getMin();    // 1
stats.getSum();    // 55
stats.getAverage(); // 5.5

// reduce - 归约
int sum = numbers.stream()
    .reduce(0, Integer::sum);  // 初始值 + 累加器
int product = numbers.stream()
    .reduce(1, (a, b) -> a * b);

// 匹配
boolean anyEven = numbers.stream().anyMatch(n -> n % 2 == 0);  // 是否存在偶数
boolean allPositive = numbers.stream().allMatch(n -> n > 0);   // 是否全为正数
boolean noneNegative = numbers.stream().noneMatch(n -> n < 0); // 是否没有负数

// 查找
Optional<Integer> first = numbers.stream().findFirst();
Optional<Integer> any = numbers.stream().findAny();
Optional<Integer> max = numbers.stream().max(Integer::compare);
```

**并行流注意事项**：

```java
// 并行流
list.parallelStream().forEach(System.out::println);

// 注意事项
// 1. 避免共享可变状态
List<Integer> unsafe = new ArrayList<>();  // ❌ 错误！
IntStream.range(0, 1000).parallel()
    .forEach(i -> unsafe.add(i));  // 数据竞争

// 2. 使用线程安全的收集器
List<Integer> safe = IntStream.range(0, 1000).parallel()
    .boxed()
    .collect(Collectors.toList());  // ✅ 安全

// 3. 适合计算密集型任务，不适合 I/O 操作
```

### Optional 类

**解决空指针异常**，明确表达"值可能为空"。

```java
// 创建 Optional
Optional<String> opt1 = Optional.of("value");      // 非空值，null 会抛 NPE
Optional<String> opt2 = Optional.ofNullable(null); // 可为空
Optional<String> opt3 = Optional.empty();          // 空值

// 取值
String value = opt1.get();                    // 不推荐，空时抛异常
String value2 = opt1.orElse("default");       // 空时返回默认值
String value3 = opt1.orElseGet(() -> compute()); // 空时懒加载计算
String value4 = opt1.orElseThrow(() -> new RuntimeException()); // 空时抛异常

// 判断
boolean present = opt1.isPresent();    // 是否有值
opt1.ifPresent(v -> System.out.println(v));  // 有值时执行
opt1.ifPresentOrElse(
    v -> System.out.println("Value: " + v),
    () -> System.out.println("Empty")
);

// 转换
Optional<Integer> length = opt1.map(String::length);
Optional<Integer> flatMapped = opt1.flatMap(v -> Optional.of(v.length()));
Optional<String> filtered = opt1.filter(s -> s.length() > 3);
```

**最佳实践**：

```java
// ❌ 避免
public String getName(User user) {
    if (user != null) {
        Address address = user.getAddress();
        if (address != null) {
            return address.getCity();
        }
    }
    return "Unknown";
}

// ✅ 推荐
public String getName(User user) {
    return Optional.ofNullable(user)
        .map(User::getAddress)
        .map(Address::getCity)
        .orElse("Unknown");
}

// Optional 不适合作为字段或方法参数
// 应该用于返回值类型，表达"可能为空"的语义
```

### 接口默认方法与静态方法

```java
public interface MyInterface {
    // 抽象方法
    void abstractMethod();
    
    // 默认方法 - 子类可覆盖
    default void defaultMethod() {
        System.out.println("Default implementation");
    }
    
    // 静态方法 - 接口级别工具方法
    static void staticMethod() {
        System.out.println("Static method");
    }
}

// 实现类
public class MyClass implements MyInterface {
    @Override
    public void abstractMethod() {
        System.out.println("Implementation");
    }
    
    // 可选覆盖默认方法
    @Override
    public void defaultMethod() {
        System.out.println("Overridden default");
    }
}
```

---

## Java 11 核心特性

### var 局部变量类型推断

```java
// 编译器自动推断类型
var list = new ArrayList<String>();  // ArrayList<String>
var map = new HashMap<String, Integer>();  // HashMap<String, Integer>
var stream = list.stream();  // Stream<String>

// 注意事项
var a = "Hello";  // String
var b = 10;       // int
var c = 10.0;     // double

// ❌ 不能用于
// 1. 字段
// 2. 方法参数
// 3. 方法返回值
// 4. 初始化为 null
// 5. 没有初始化
var x;  // ❌ 编译错误
var y = null;  // ❌ 编译错误

// Lambda 表法式需要显式类型
var predicate = (Predicate<String>) s -> s.length() > 3;  // 需要指定类型
```

### String 增强

```java
// isBlank - 判断是否为空白
"  ".isBlank();  // true
"Hello".isBlank();  // false

// lines - 按行分割
"Line1\nLine2\nLine3".lines().forEach(System.out::println);

// strip - 去除首尾空白（比 trim 更智能）
"  Hello  ".strip();  // "Hello"
"  Hello  ".stripLeading();  // "Hello  "
"  Hello  ".stripTrailing();  // "  Hello"

// repeat - 重复
"Abc".repeat(3);  // "AbcAbcAbc"
```

### HTTP Client（标准化）

```java
// 创建客户端
HttpClient client = HttpClient.newBuilder()
    .version(HttpClient.Version.HTTP_2)
    .connectTimeout(Duration.ofSeconds(10))
    .build();

// GET 请求
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users"))
    .GET()
    .build();

// 同步请求
HttpResponse<String> response = client.send(request, 
    HttpResponse.BodyHandlers.ofString());
System.out.println(response.statusCode());
System.out.println(response.body());

// 异步请求
CompletableFuture<HttpResponse<String>> future = client.sendAsync(request,
    HttpResponse.BodyHandlers.ofString());
future.thenAccept(r -> System.out.println(r.body()));

// POST 请求
HttpRequest postRequest = HttpRequest.newBuilder()
    .uri(URI.create("https://api.example.com/users"))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString("{\"name\":\"John\"}"))
    .build();
```

---

## Java 17 核心特性

### Records（记录类）

**不可变数据载体**，自动生成 equals、hashCode、toString、getter。

```java
// 定义 Record
public record User(String name, int age) {
    // 自动生成：
    // - 构造器 User(String name, int age)
    // - getter: name(), age()
    // - equals, hashCode, toString
}

// 使用
User user = new User("Alice", 25);
user.name();  // "Alice"
user.age();   // 25

// 紧凑构造器（验证逻辑）
public record User(String name, int age) {
    public User {
        if (age < 0) {
            throw new IllegalArgumentException("Age cannot be negative");
        }
        Objects.requireNonNull(name);
    }
}

// Record 实现接口
public record User(String name, int age) implements Comparable<User> {
    @Override
    public int compareTo(User other) {
        return Integer.compare(this.age, other.age);
    }
}

// 本地 Record（方法内定义）
public void process() {
    record Point(int x, int y) {}
    Point p = new Point(1, 2);
}
```

### Sealed Classes（密封类）

**限制继承**，明确指定允许的子类。

```java
// 密封接口
public sealed interface Shape 
    permits Circle, Rectangle, Triangle {
    
    double area();
}

// 允许的子类
public final class Circle implements Shape {
    private final double radius;
    
    public Circle(double radius) { this.radius = radius; }
    
    @Override
    public double area() {
        return Math.PI * radius * radius;
    }
}

public final class Rectangle implements Shape {
    private final double width, height;
    
    public Rectangle(double w, double h) { 
        this.width = w; 
        this.height = h; 
    }
    
    @Override
    public double area() {
        return width * height;
    }
}

// non-sealed 允许进一步继承
public non-sealed class Triangle implements Shape {
    // 可以被其他类继承
}
```

### Pattern Matching for instanceof

```java
// 传统写法
if (obj instanceof String) {
    String s = (String) obj;
    System.out.println(s.length());
}

// Java 17 写法
if (obj instanceof String s) {
    System.out.println(s.length());
}

// 带条件
if (obj instanceof String s && s.length() > 5) {
    System.out.println("Long string: " + s);
}
```

### Switch 表达式（Java 14 预览，17 正式）

```java
// 表达式形式
String result = switch (day) {
    case MONDAY, FRIDAY -> "Work";
    case TUESDAY, WEDNESDAY, THURSDAY -> "Midweek";
    case SATURDAY, SUNDAY -> "Weekend";
    default -> "Unknown";
};

// 带yield的代码块
int numLetters = switch (day) {
    case MONDAY, FRIDAY, SUNDAY -> 6;
    case TUESDAY -> 7;
    case THURSDAY, SATURDAY -> 8;
    case WEDNESDAY -> {
        System.out.println("Mid-week");
        yield 9;
    }
    default -> {
        yield 0;
    }
};
```

---

## Java 21 核心特性

### 虚拟线程（Virtual Threads）

**轻量级线程**，由 JVM 调度，可创建百万级。

```java
// 创建虚拟线程
Thread vt = Thread.ofVirtual().start(() -> {
    System.out.println("Hello from virtual thread");
});

// 使用 ExecutorService
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 1000000; i++) {
        executor.submit(() -> {
            Thread.sleep(1000);
            return "Done";
        });
    }
}

// ThreadFactory
ThreadFactory factory = Thread.ofVirtual().factory();
Thread t = factory.newThread(() -> System.out.println("Virtual"));

// 与平台线程对比
// 平台线程：1MB 栈空间，操作系统调度
// 虚拟线程：几 KB 栈空间，JVM 调度，阻塞时自动让出

// 适用场景
// ✅ 高并发 I/O 操作（数据库、HTTP 请求）
// ✅ 大量阻塞任务
// ❌ CPU 密集型任务（无优势）
// ❌ 使用 synchronized 块（会钉住载体线程）
```

**虚拟线程 vs 平台线程**：

| 特性 | 平台线程 | 虚拟线程 |
|------|----------|----------|
| 栈空间 | ~1MB | ~2KB（可增长） |
| 创建成本 | 高 | 极低 |
| 调度 | 操作系统 | JVM |
| 适用场景 | CPU 密集 | I/O 密集 |
| 最大数量 | 数千 | 百万级 |
| 阻塞影响 | 占用线程 | 自动让出 |

**最佳实践**：

```java
// ❌ 不要使用线程池
ExecutorService pool = Executors.newFixedThreadPool(200);  // 不需要
pool.execute(task);

// ✅ 直接使用虚拟线程
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    IntStream.range(0, 10000).forEach(i -> 
        executor.submit(() -> {
            Thread.sleep(Duration.ofSeconds(1));
            return i;
        })
    );
}

// ❌ 避免 synchronized，使用 ReentrantLock
// synchronized 会"钉住"虚拟线程，无法让出
public synchronized void blocking() {  // ❌
    // blocking operation
}

// ✅ 使用 ReentrantLock
private final Lock lock = new ReentrantLock();
public void nonBlocking() {
    lock.lock();
    try {
        // blocking operation
    } finally {
        lock.unlock();
    }
}
```

### 分代 ZGC

**ZGC 分代模式**，区分年轻代和老年代，提升性能。

```bash
# 启用分代 ZGC
java -XX:+UseZGC -XX:+ZGenerational -jar app.jar

# ZGC 特点
# - 停顿时间 < 1ms
# - 支持 TB 级堆内存
# - 适合低延迟应用
```

### Switch 模式匹配

```java
// 类型模式匹配
static String formatter(Object obj) {
    return switch (obj) {
        case Integer i -> "Integer: " + i;
        case Long l -> "Long: " + l;
        case Double d -> "Double: " + d;
        case String s -> "String: " + s;
        case null -> "Null value";
        default -> "Unknown";
    };
}

// 带守卫条件
static String categorize(Object obj) {
    return switch (obj) {
        case Integer i && i < 0 -> "Negative: " + i;
        case Integer i && i > 0 -> "Positive: " + i;
        case Integer i -> "Zero";
        case String s && s.length() > 5 -> "Long string: " + s;
        case String s -> "Short string: " + s;
        default -> "Other";
    };
}

// Record 解构
record Point(int x, int y) {}

static void printPoint(Object obj) {
    switch (obj) {
        case Point(int x, int y) -> System.out.println("Point(" + x + ", " + y + ")");
        default -> System.out.println("Not a point");
    }
}

// 嵌套解构
record Box(Point point) {}

static void processBox(Object obj) {
    switch (obj) {
        case Box(Point(int x, int y)) -> 
            System.out.println("Box with point at " + x + ", " + y);
        default -> System.out.println("Unknown");
    }
}
```

---

## 面试高频问题

### 1. Lambda 表达式的原理是什么？

**回答要点**：

Lambda 表达式在编译时不会生成匿名内部类，而是通过 `invokedynamic` 字节码指令实现。

**编译过程**：
1. 编译器将 Lambda 转换为 `invokedynamic` 指令
2. 运行时通过 `LambdaMetafactory` 生成实现类
3. 使用方法句柄（MethodHandle）调用目标方法

**与匿名内部类区别**：

```java
// 匿名内部类 - 编译后生成 .class 文件
Runnable r1 = new Runnable() {
    @Override
    public void run() {
        System.out.println("Anonymous");
    }
};
// 编译后：OuterClass$1.class

// Lambda - 不生成额外 .class 文件
Runnable r2 = () -> System.out.println("Lambda");
// 编译后：使用 invokedynamic 指令
```

**优点**：
- 更少的类文件，减少类加载开销
- 延迟绑定，运行时决定实现
- 更好的性能（特别是重复调用时）

### 2. Stream 流的执行原理？

**回答要点**：

Stream 使用**管道模式**和**延迟执行**。

**执行流程**：
1. 创建 Stream - 数据源（集合、数组、生成器）
2. 中间操作 - 返回新 Stream，延迟执行
3. 终端操作 - 触发执行，产生结果

**延迟执行示例**：

```java
List<String> list = Arrays.asList("a", "b", "c");

Stream<String> stream = list.stream()
    .filter(s -> {
        System.out.println("Filtering: " + s);  // 不会立即执行
        return s.length() > 0;
    })
    .map(s -> {
        System.out.println("Mapping: " + s);  // 不会立即执行
        return s.toUpperCase();
    });

// 直到终端操作才执行
stream.forEach(s -> System.out.println("Result: " + s));
```

**短路操作优化**：

```java
// findFirst 会短路，不会处理所有元素
Optional<String> first = list.stream()
    .filter(s -> {
        System.out.println("Filter: " + s);
        return s.startsWith("a");
    })
    .findFirst();
// 输出：Filter: a（找到后就停止）
```

### 3. Optional 如何避免空指针？

**回答要点**：

Optional 通过**类型系统强制**处理空值。

```java
// 传统方式 - 容易忘记空检查
String city = user.getAddress().getCity();  // NPE!

// Optional 方式 - 强制处理空值
Optional.ofNullable(user)
    .map(User::getAddress)
    .map(Address::getCity)
    .orElse("Unknown");  // 必须处理空值情况
```

**设计原则**：
1. **返回值用 Optional** - 表达"可能为空"
2. **不用作字段/参数** - 增加序列化复杂度
3. **不用 get()** - 或先检查 isPresent()
4. **用 orElse/orElseGet** - 提供默认值

### 4. 虚拟线程与传统线程的区别？

**回答要点**：

| 特性 | 平台线程 | 虚拟线程 |
|------|----------|----------|
| 实现 | 操作系统线程 | JVM 管理的轻量线程 |
| 栈空间 | 固定 ~1MB | 动态，初始 ~2KB |
| 调度 | 操作系统内核 | JVM 用户态 |
| 创建成本 | 高（系统调用） | 极低（Java 对象） |
| 最大数量 | 数千（受内存限制） | 百万级 |
| 阻塞代价 | 占用操作系统线程 | 自动让出载体线程 |
| 适用场景 | CPU 密集型 | I/O 密集型 |

**关键点**：
- 虚拟线程适合**高并发 I/O 场景**（HTTP 请求、数据库调用）
- 阻塞时自动让出载体线程，不占用操作系统资源
- 不要用线程池，直接 `newVirtualThreadPerTaskExecutor()`
- 避免 `synchronized`，会"钉住"载体线程

### 5. Java 8 到 Java 21 最重要特性是什么？

**回答要点**：

**Java 8（2014）** - 现代Java的起点
- Lambda 表达式：函数式编程
- Stream API：声明式数据处理
- Optional：空值安全

**Java 11（2018）** - 开发体验提升
- var 类型推断：减少样板代码
- HTTP Client：现代 HTTP 支持
- String 增强：实用方法

**Java 17（2021）** - 数据建模增强
- Records：不可变数据类
- Sealed Classes：限制继承
- Pattern Matching：类型安全

**Java 21（2023）** - 并发革命
- **虚拟线程**：改变并发编程模型
- 分代 ZGC：大内存低延迟
- Switch 模式匹配：更强的类型检查

---

## 实战场景

### 场景1：批量数据处理

```java
// 处理大量订单，需要过滤、转换、分组
List<Order> orders = orderRepository.findAll();

// 传统方式
Map<String, List<Order>> result = new HashMap<>();
for (Order order : orders) {
    if (order.getStatus() == Status.COMPLETED) {
        String key = order.getCustomer().getCity();
        result.computeIfAbsent(key, k -> new ArrayList<>()).add(order);
    }
}

// Stream 方式
Map<String, List<Order>> result = orders.stream()
    .filter(o -> o.getStatus() == Status.COMPLETED)
    .collect(Collectors.groupingBy(o -> o.getCustomer().getCity()));

// 并行处理（大量数据时）
Map<String, List<Order>> result = orders.parallelStream()
    .filter(o -> o.getStatus() == Status.COMPLETED)
    .collect(Collectors.groupingBy(o -> o.getCustomer().getCity()));
```

### 场景2：高并发 HTTP 调用

```java
// Java 11 HTTP Client + 虚拟线程
public class ApiClient {
    private final HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();
    
    // 使用虚拟线程并发调用
    public List<String> fetchAll(List<String> urls) {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<String>> futures = urls.stream()
                .map(url -> executor.submit(() -> fetch(url)))
                .toList();
            
            return futures.stream()
                .map(this::getOrThrow)
                .toList();
        }
    }
    
    private String fetch(String url) {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .GET()
            .build();
        
        HttpResponse<String> response = client.send(
            request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }
    
    private String getOrThrow(Future<String> future) {
        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
```

### 场景3：数据传输对象（Record）

```java
// API 响应 DTO
public record ApiResponse<T>(
    int code,
    String message,
    T data,
    LocalDateTime timestamp
) {
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(200, "success", data, LocalDateTime.now());
    }
    
    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, message, null, LocalDateTime.now());
    }
}

// 使用
ApiResponse<User> response = ApiResponse.success(user);
ApiResponse<List<Order>> listResponse = ApiResponse.success(orders);
```

---

## 延伸思考

### Q1: Stream 并行流什么情况下使用？

**判断标准**：
- ✅ 数据量大（>10000）
- ✅ 计算密集型操作
- ✅ 无共享可变状态
- ✅ 操作之间无依赖
- ❌ 数据量小
- ❌ I/O 操作
- ❌ 有共享状态

### Q2: Record 可以实现接口吗？可以继承吗？

- 可以实现接口
- 不能继承其他类（隐式继承 `java.lang.Record`）
- 不能被继承（隐式 final）
- 可以定义静态方法和实例方法

### Q3: 虚拟线程适合哪些场景？

**适合**：
- 高并发 HTTP 调用
- 数据库查询
- 文件 I/O
- 微服务调用

**不适合**：
- CPU 密集计算
- 长时间持有锁（synchronized）
- Native 方法调用

---

## 参考资料

- [Oracle Java Documentation](https://docs.oracle.com/en/java/javase/)
- [JEP 425: Virtual Threads](https://openjdk.org/jeps/425)
- [JEP 395: Records](https://openjdk.org/jeps/395)
- [Java Language Updates](https://docs.oracle.com/en/java/javase/21/language/)
- 《Effective Java》（第三版）
- 《Java 8 实战》