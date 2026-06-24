# Java 异常机制是什么？

## 核心概念

Java 异常机制用于处理程序运行过程中的错误或意外情况。它把正常业务逻辑和错误处理逻辑分离，使程序具备更好的可读性和可靠性。

所有异常和错误的根类都是 `java.lang.Throwable`。

## 异常体系

```text
Throwable
├── Error
└── Exception
    ├── RuntimeException
    └── 其他受检异常
```

### Error

`Error` 表示 JVM 或系统层面的严重问题，通常程序无法恢复，例如：

- `OutOfMemoryError`
- `StackOverflowError`

这类错误一般不建议业务代码主动捕获处理。

### Exception

`Exception` 表示程序可以捕获和处理的异常，主要分为两类：

- **受检异常**：编译器强制要求处理，例如 `IOException`、`SQLException`。
- **非受检异常**：继承自 `RuntimeException`，编译器不强制处理，例如 `NullPointerException`、`IndexOutOfBoundsException`。

## 异常处理方式

### try-catch

```java
try {
    // 可能抛异常的代码
} catch (IOException | SQLException e) {
    // 异常处理逻辑
}
```

### finally

`finally` 通常用于释放资源，无论是否发生异常都会执行。

```java
try {
    // 使用资源
} finally {
    // 关闭资源
}
```

### try-with-resources

实现了 `AutoCloseable` 的资源推荐使用 try-with-resources 自动关闭。

```java
try (InputStream in = new FileInputStream("a.txt")) {
    // 使用输入流
}
```

### throws

方法内部不处理异常时，可以通过 `throws` 声明向上抛出。

```java
public void read() throws IOException {
    // ...
}
```

## 总结

异常机制的重点不是“能不能 catch”，而是要区分异常类型、明确异常边界，并保证资源正确释放。业务异常通常用自定义异常表达，系统异常要记录上下文信息，避免吞异常。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- Throwable 分 Error 和 Exception；Exception 分受检异常和运行时异常。
- 异常处理目标是恢复、转换、记录或向上抛出。

### 面试官想考什么
- checked/unchecked 异常适用场景。
- finally、try-with-resources、异常链。

### 标准回答
可恢复且调用方必须感知的情况适合受检异常；编程错误或参数非法多用运行时异常。资源关闭优先 try-with-resources，包装异常时保留 cause。

### 深挖追问
- finally 一定执行吗？
- return 和 finally 同时存在如何执行？
- 为什么不要空 catch？

### 实战场景/代码示例
```java
try(InputStream in=Files.newInputStream(path)){
  return in.read();
}catch(IOException e){
  throw new UncheckedIOException(e);
}
```

### 易错点/总结
- 不要吞异常。
- 不要用异常做正常流程控制。

---

<!-- interview-detail-2026-06-24 -->

## 面试版详细讲解补充

### 核心概念
- Java 异常体系以 Throwable 为根，分为 Error、受检异常和运行时异常；异常用于表达异常路径而不是普通分支。
- 复习时不要只记一句结论，要把“定义、底层原因、使用边界、工程取舍”串起来。

### 面试官想考什么
- checked/unchecked 区别、finally 执行顺序、异常链、资源关闭。
- 能否把该知识点和常见线上问题、代码设计、性能/并发/可维护性联系起来。

### 标准回答
Error 通常不捕获；受检异常要求调用方处理外部不确定性；运行时异常多表示参数或状态错误。工程上保留 cause，资源用 try-with-resources。

如果是口述面试，建议先给一句结论，再补充 2~3 个关键细节，最后用项目场景收尾。这样既有结构，也能给面试官继续追问的抓手。

### 深挖追问
- finally 一定执行吗？finally 中 return 会怎样？throw 和 throws 区别？
- 如果让你在项目里落地这个知识点，你会如何设计测试用例验证边界？
- 遇到性能、并发或可维护性问题时，有哪些替代方案？

### 示例/实战场景
```java
try (InputStream in = Files.newInputStream(p)) { return in.readAllBytes(); }
```

实战中建议把该知识点放到具体场景里理解：例如接口参数校验、集合选型、线程池治理、金额计算、JVM 排障或框架扩展点，而不是孤立背概念。

### 易错点/总结
- 不要吞异常；不要只 printStackTrace；finally 中 return 会覆盖真实结果。
- 面试表达要避免绝对化，例如“永远”“一定”“只会”，很多 Java 行为都与版本、实现、参数和上下文有关。
- 最后用一句话收束：先讲清楚它解决什么问题，再讲清楚它的限制和替代方案。

