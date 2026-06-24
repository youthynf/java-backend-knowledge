# Java 各版本新特性概览

## 核心概念

Java 的版本演进可以分为几个阶段：Java 8 奠定函数式和现代类库基础；Java 9 引入模块化并开始小步快跑；Java 10 之后以半年一个版本持续演进；Java 11、17、21 是长期支持版本（LTS），企业项目升级时最常被讨论。

| 版本 | 代表特性 | 面试/项目关注点 |
| --- | --- | --- |
| Java 8 | Lambda、Stream、Optional、java.time、默认方法、Metaspace | 现代 Java 编程基础 |
| Java 9 | 模块系统 JPMS、JShell、集合工厂方法 | 模块化、JDK 内部 API 收敛 |
| Java 10 | `var` 局部变量类型推断 | 只用于局部变量，可读性边界 |
| Java 11 | 标准 HTTP Client、String 新方法、运行单文件源码、ZGC 实验 | LTS 升级常见目标 |
| Java 14/15 | switch 表达式、文本块 | 简化语法，提高字符串可读性 |
| Java 16 | record、pattern matching for instanceof | 不可变数据载体、模式匹配 |
| Java 17 | sealed class、强封装 JDK 内部 API | LTS，Spring Boot 3 基础版本之一 |
| Java 21 | 虚拟线程、结构化并发、模式匹配增强、Sequenced Collections | 高并发服务和新并发模型 |

## 面试官想考什么

- 是否知道企业常用 LTS 版本：8、11、17、21；
- 是否能说清 Java 8、17、21 的关键变化和业务价值；
- 是否理解 `var`、record、sealed class、虚拟线程等特性的适用边界；
- 是否了解升级 JDK 时的兼容性问题：依赖、反射、GC、构建工具、框架版本；
- 是否能从“项目收益”角度回答，而不是只背版本列表。

## 标准回答

> Java 8 是现代 Java 的分水岭，引入 Lambda、Stream、Optional、java.time 和 Metaspace；Java 9 引入模块系统；Java 11 是重要 LTS，提供标准 HTTP Client 等；Java 17 是当前很多企业升级目标，包含 record、sealed class、增强的 switch、强封装等能力；Java 21 是新的 LTS，最大亮点是虚拟线程，能显著降低高并发 IO 场景下的线程成本。项目升级时不仅要看语言特性，还要评估 Spring、Maven/Gradle、数据库驱动、监控探针、容器镜像和 GC 参数兼容性。

## 深挖追问

### Java 8 为什么重要？

Java 8 改变了 Java 代码风格：Lambda 和函数式接口让行为参数化更自然；Stream 让集合处理更声明式；`java.time` 解决旧时间 API 可变且线程不安全的问题；Optional 显式表达空值；永久代被 Metaspace 替代。

### `var` 是动态类型吗？

不是。`var` 是局部变量类型推断，编译期已经确定静态类型，运行时没有动态类型特性。它不能用于字段、方法参数、返回值。适合右侧类型明显的场景，不适合牺牲可读性。

```java
var list = new ArrayList<String>(); // 编译后类型仍是 ArrayList<String>
```

### record 适合替代所有 POJO 吗？

不适合。record 适合不可变数据载体，如 DTO、查询结果、配置项。它默认 final，字段也是 private final，并自动生成构造器、访问器、`equals/hashCode/toString`。如果对象需要复杂可变状态、继承层次或 ORM 代理，普通 class 更合适。

```java
public record UserView(Long id, String name, Integer age) {}
```

### sealed class 解决什么问题？

sealed class 限制一个类或接口只能被指定类型继承/实现，适合表达封闭领域模型，例如支付结果、订单状态事件。它能让编译器更好地做穷尽性检查。

```java
public sealed interface PayResult permits Success, Failed, Processing {}
public record Success(String tradeNo) implements PayResult {}
public record Failed(String reason) implements PayResult {}
public record Processing() implements PayResult {}
```

### Java 21 虚拟线程是什么？

虚拟线程是 JVM 管理的轻量级线程，适合大量阻塞 IO 场景。它不是让 CPU 计算变快，而是降低每个并发请求占用的平台线程成本。使用时仍要注意数据库连接池、限流、锁竞争和 ThreadLocal 泄漏。

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    IntStream.range(0, 1000).forEach(i -> executor.submit(() -> callRemoteService(i)));
}
```

## 实战场景/代码示例

### Java 11 HTTP Client

```java
HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.example.com/users/1"))
        .GET()
        .build();
String body = client.send(request, HttpResponse.BodyHandlers.ofString()).body();
```

### switch 表达式

```java
String label = switch (status) {
    case 0 -> "INIT";
    case 1 -> "SUCCESS";
    case 2 -> "FAILED";
    default -> "UNKNOWN";
};
```

### instanceof 模式匹配

```java
if (obj instanceof User user && user.isEnabled()) {
    System.out.println(user.getName());
}
```

## 易错点/总结

- LTS 版本更适合作为企业升级目标，不必追每个短期版本；
- JDK 升级前要检查框架、插件、镜像、GC 参数和非法反射；
- `var` 不是动态类型，不要滥用于可读性差的表达式；
- record 是不可变数据载体，不适合所有实体类；
- 虚拟线程适合 IO 密集，不解决数据库连接数、限流和下游容量问题；
- Java 17+ 对 JDK 内部 API 更严格，依赖旧反射技巧的库可能出问题。

## 参考资料

- OpenJDK JEP Index
- Oracle Java Release Notes
