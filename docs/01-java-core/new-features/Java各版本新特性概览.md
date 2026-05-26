# Java各版本新特性概览

Java各版本新特性概览
JDK 8（2014年） - 里程碑版本
Lambda 表达式（函数式编程）

List<String> list = Arrays.asList("a", "b", "c");
list.forEach(s -> System.out.println(s));

2. Stream API（集合操作增强）

List<Integer> nums = Arrays.asList(1, 2, 3);
int sum = nums.stream().filter(n -> n > 1).mapToInt(n -> n).sum();

3. Optional（避免 NullPointerException）

Optional<String> opt = Optional.ofNullable(getName());
opt.ifPresent(System.out::println);

4. 新的日期时间 API（java.time）

LocalDate now = LocalDate.now();
Instant timestamp = Instant.now();

5. 默认方法（Default Methods）

interface MyInterface {
   default void log() { System.out.println("Default method"); }
}

方法引用（Method References）

list.forEach(System.out::println);

JDK 9（2017年） - 模块化
模块系统（JPMS, Java Platform Module System）
Java 平台模块系统，也就是 Project Jigsaw，把模块化开发实践引入到了 Java 平台中。在引入了模块系统之后，JDK 被重新组织成 94 个模块。Java 应用可以通过新增的 jlink 工具，创建出只包含所依赖的 JDK 模块的自定义运行时镜像。这样可以极大的减少 Java 运行时环境的大小。
JShell（REPL 交互式编程）
jshell是Java 9新增的一个实用工具，可用于直接输入表达式并查看其执行结果，方便快速调试。

jshell> var x = 10;
jshell> x + 5

3. 集合工厂方法（List.of(), Set.of(), Map.of()）
在集合上，Java 9 增加 了 List.of()、Set.of()、Map.of() 和 Map.ofEntries()等工厂方法来创建不可变集合。

List.of();
List.of("Hello", "World");
List.of(1, 2, 3);
Set.of();
Set.of("Hello", "World");
Set.of(1, 2, 3);
Map.of();
Map.of("Hello", 1, "World", 2);

4. 改进的 Stream API
Stream 中增加了新的方法 ofNullable、dropWhile、takeWhile 和 iterate。在 如下代码 中，流中包含了从 1 到 5 的 元素。断言检查元素是否为奇数。第一个元素 1 被删除，结果流中包含 4 个元素。

@Test
public void testDropWhile() throws Exception {
    final long count = Stream.of(1, 2, 3, 4, 5)
        .dropWhile(i -> i % 2 != 0)
        .count();
    assertEquals(4, count);
}

Collectors新增方法
Collectors 中增加了新的方法 filtering 和 flatMapping。

@Test
public void testFlatMapping() throws Exception {
    final Set<Integer> result = Stream.of("a", "ab", "abc")
        .collect(Collectors.flatMapping(v -> v.chars().boxed(),
            Collectors.toSet()));
    assertEquals(3, result.size());
}

Optional类新增方法
Optional 类中新增了 ifPresentOrElse、or 和 stream 等方法。

@Test
public void testStream() throws Exception {
    final long count = Stream.of(
        Optional.of(1),
        Optional.empty(),
        Optional.of(2)
    ).flatMap(Optional::stream)
        .count();
    assertEquals(2, count);
}

进程API（Process Handle）
Java 9 增加了 ProcessHandle 接口，可以对原生进程进行管理，尤其适合于管理长时间运行的进程。

final ProcessBuilder processBuilder = new ProcessBuilder("top")
    .inheritIO();
final ProcessHandle processHandle = processBuilder.start().toHandle();
processHandle.onExit().whenCompleteAsync((handle, throwable) -> {
    if (throwable == null) {
        System.out.println(handle.pid());
    } else {
        throwable.printStackTrace();
    }
});

JDK 10（2018年）
局部变量类型推断（var）
变量类型推断，从 Java 5 中引进泛型，到 Java 7 的 <> 操作符允许不绑定类型而初始化 List，再到 Java 8 中的 Lambda 表达式，再到现在 Java 10 中引入的局部变量类型推断。

var list = new ArrayList<String>(); // ArrayList<String>
var stream = list.stream(); // Stream<String>
使用限制：
•  只能用于局部变量上；
•  声明时必须初始化；
•  不能用作方法参数；
•  不能在 Lambda 表达式中使用。

2. 并行全垃圾回收器（G1 GC）
G1是JDK6引入，Java 9 中Hotspot的默认垃圾回收器，是以一种低延时的垃圾回收器来设计的，旨在避免进行 Full GC，但是当并发收集无法快速回收内存时，会触发垃圾回收器回退进行Full GC。之前Java版本中的G1垃圾回收器执行GC时采用的是基于单线程标记扫描压缩算法（mark-sweep-compact）。为了最大限度地减少Full GC造成的应用停顿的影响，Java 10中将为G1引入多线程并行GC，同时会使用与年轻代回收和混合回收相同的并行工作线程数量，从而减少了Full GC的发生，以带来更好的性能提升、更大的吞吐量。具体并行GC线程数量可以通过：-XX：ParallelGCThreads参数来调节。

JDK 11（2018年） - LTS（长期支持版）
var 支持 Lambda 参数
为了 Lambda 类型表达式中正式参数定义的语法与局部变量定义语法的不一致，且为了保持与其他局部变量用法上的一致性，希望能够使用关键字 var 隐式定义 Lambda 表达式的形参，并且可以将注释应用于局部变量和 Lambda 表达式。

(var x, var y) -> x + y
@Nonnull var x = new Foo();
(@Nonnull var x, @Nullable var y) -> x.process(y)

2. HTTP Client API 升级正式版
JDK9引入了 HTTP/2客户端 API（孵化器模块，需手动启用）。JDK 11将HttpClient 正式成为标准 API，默认支持 HTTP/2。Java 11 中的新 Http Client API，提供了对 HTTP/2 等业界前沿标准的支持，同时也向下兼容 HTTP/1.1，精简而又友好的 API 接口，与主流开源 API（如：Apache HttpClient、Jetty、OkHttp 等）类似甚至拥有更高的性能。

HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("http://openjdk.java.net/"))
    .build();
client.sendAsync(request, BodyHandlers.ofString())
    .thenApply(HttpResponse::body)
    .thenAccept(System.out::println)
    .join();

String 新增方法

"  abc  ".strip(); // 去除首尾空白（比 `trim()` 更智能）
"abc".repeat(3); // "abcabcabc"

4. Files.readString() / writeString()

String content = Files.readString(Path.of("file.txt"));

ZGC（低延迟垃圾回收器）（实验性）
ZGC 即 Z Garbage Collector（垃圾收集器或垃圾回收器），这应该是Java 11中最为瞩目的特性，没有之一。ZGC是一个可伸缩的、低延迟的垃圾收集器，主要为了满足如下目标进行设计：GC 停顿时间不超过 10ms即能处理几百 MB 的小堆，也能处理几个 TB 的大堆，应用吞吐能力不会下降超过15%（与 G1 回收算法相比），方便在此基础上引入新的GC特性和利用colord针以及Load barriers优化奠定基础，当前只支持 Linux/x64 位平台停顿时间在10ms以下，10ms 其实是一个很保守的数据，即便是10ms这个数据，也是 GC 调优几乎达不到的极值。根据 SPECjbb 2015 的基准测试，128G 的大堆下最大停顿时间才1.68ms，远低于10ms，和G1算法相比，改进非常明显。

JDK 12-17（2019-2021）
JDK 12
Switch 表达式（预览）

int day = switch (dayCode) {
   case 1 -> 1;
   case 2 -> 2;
   default -> 0;
};

2. Shenandoah GC（低延迟 GC，实验阶段）

JDK 13
文本块（""" 多行字符串）（预览）

String json = """
   {
       "name": "John",
       "age": 30
   }
   """;

JDK 14
instanceof 模式匹配（预览）

if (obj instanceof String s) {
   System.out.println(s.length());
}

2. Records（数据类）（预览）

record Point(int x, int y) {}
Point p = new Point(1, 2);
System.out.println(p.x()); // 自动生成 getter

Switch表达式（JDK12，13预览，14正式）
switch 语句一般使用冒号 ：来作为语句分支代码的开始，而 switch 表达式则提供了新的分支切换方式，即 -> 符号右则表达式方法体在执行完分支方法之后，自动结束 switch 分支，同时 -> 右则方法块中可以是表达式、代码块或者是手动抛出的异常。

int dayOfWeek = switch (day) {
    case MONDAY, FRIDAY, SUNDAY -> 6;
    case TUESDAY                -> 7;
    case THURSDAY, SATURDAY     -> 8;
case WEDNESDAY              -> 9;
    default              -> 0;

};

JDK 15
Sealed Classes（密封类）（预览）

public sealed class Shape permits Circle, Square {}

文本块（JDK13,14预览，15正式）
Text Blocks首次是在JDK 13中以预览功能出现的，然后在JDK 14中又预览了一次，终于在JDK 15中被确定下来，可放心使用了。

public static void main(String[] args) {
    String query = """
           SELECT * from USER \
           WHERE `id` = 1 \
           ORDER BY `id`, `name`;\
           """;
    System.out.println(query);
}

JDK 16
instanceof 模式匹配（JDK14,15预览，16正式）
通过instanceof检查对象的类型的同时完成类型转换，避免了原来需要单独进行强制转换后进行不同的处理、实现不同的逻辑，具体可以参考如下：

if (person instanceof Student student) {
    student.say();
   // other student operations
} else if (person instanceof Teacher teacher) {
    teacher.say();
    // other teacher operations
}

Records（JDK14,15预览，16正式）
Record 类型允许在代码中使用紧凑的语法形式来声明类，而这些类能够作为不可变数据类型的封装持有者。作用是避免面编写大量的无实际业务、重复性质的代码，包括：构造函数、属性调用、访问以及 equals() 、hashCode()、toString() 等方法，因此在 Java 14 中引入了 Record 类型，其效果有些类似 Lombok 的 @Data 注解。

public record Person(String name, int age) {
    public static String address;

    public String getName() {
        return name;
    }
}
对上述代码进行编译，然后反编译之后可以看到如下结果：

public final class Person extends java.lang.Record {
    private final java.lang.String name;
    private final java.lang.String age;

    public Person(java.lang.String name, java.lang.String age) { /* compiled code */ }

    public java.lang.String getName() { /* compiled code */ }

    public java.lang.String toString() { /* compiled code */ }

    public final int hashCode() { /* compiled code */ }

    public final boolean equals(java.lang.Object o) { /* compiled code */ }

    public java.lang.String name() { /* compiled code */ }

    public java.lang.String age() { /* compiled code */ }
}

Vector API（SIMD 优化）

JDK 17（2021年） - LTS
密封的类和接口Sealed Classes（JDK15，16预览，17正式）
封闭类可以是封闭类和或者封闭接口，用来增强 Java 编程语言，防止其他类或接口扩展或实现它们。引入了sealed class或interfaces，这些class或者interfaces只允许被指定的类或者interface进行扩展和实现。这是一个很增强很实用的特性，可以限制类的层次结构。

// 添加sealed修饰符，permits后面跟上只能被继承的子类名称
public sealed class Person permits Teacher, Worker, Student{ } //人
 
// 子类可以被修饰为 final
final class Teacher extends Person { }//教师
 
// 子类可以被修饰为 non-sealed，此时 Worker类就成了普通类，谁都可以继承它
non-sealed class Worker extends Person { }  //工人
// 任何类都可以继承Worker
class AnyClass extends Worker{}
 
//子类可以被修饰为 sealed,同上
sealed class Student extends Person permits MiddleSchoolStudent,GraduateStudent{ } //学生
 
 
final class MiddleSchoolStudent extends Student { }  //中学生
 
final class GraduateStudent extends Student { }  //研究生

switch 模式匹配（预览）

String result = switch (obj) {
   case Integer i -> "int: " + i;
   case String s -> "string: " + s;
   default -> "unknown";
};

JDK 18-21（2022-2023）
JDK 18
UTF-8 默认字符集
简单 Web 服务器（jwebserver）

jwebserver -p 8000

JDK 19
虚拟线程（Virtual Threads）（预览）

Thread.startVirtualThread(() -> System.out.println("Hello"));

2. 结构化并发（Structured Concurrency）（预览）

JDK 20
Scoped Values（替代 ThreadLocal）
Record Patterns

if (obj instanceof Point(int x, int y)) {
   System.out.println(x + ", " + y);
}

JDK 21（2023年） - LTS
虚拟线程（正式）

try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
   executor.submit(() -> System.out.println("Running in virtual thread"));
}

2. Sequenced Collections（有序集合增强）

List<Integer> list = new ArrayList<>();
list.addFirst(1); // JDK 21 新增

3. String 模板（预览）

String name = "John";
String info = STR."My name is \{name}";
