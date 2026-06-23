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

