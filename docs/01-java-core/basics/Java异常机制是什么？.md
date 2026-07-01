# Java 异常机制是什么

## 核心概念

Java 异常机制用于处理程序运行过程中的错误或意外情况。它把"正常业务逻辑"和"错误处理逻辑"分离，让代码可读、可维护，并通过类型系统强制开发者处理可预见的错误。

所有异常和错误的根类是 `java.lang.Throwable`，它有两个直接子类：`Error` 和 `Exception`。

```text
Throwable
├── Error                              // JVM/系统级严重错误，业务不捕获
│   ├── OutOfMemoryError
│   ├── StackOverflowError
│   └── NoClassDefFoundError
└── Exception
    ├── RuntimeException               // 非受检异常（编译器不强制处理）
    │   ├── NullPointerException
    │   ├── IndexOutOfBoundsException
    │   ├── ClassCastException
    │   ├── IllegalArgumentException
    │   └── ArithmeticException
    └── 其他 Exception 子类            // 受检异常（编译器强制处理）
        ├── IOException
        ├── SQLException
        └── ClassNotFoundException
```

## 标准回答

Java 异常机制通过 `Throwable` 体系表达运行时错误，分为 `Error`、`Exception` 两大类。`Exception` 又分为受检异常（必须 `try-catch` 或 `throws`）和非受检异常（`RuntimeException`，编译器不强制）。要点：

1. **`Error` 不捕获**：JVM 级别问题，业务处理不了。
2. **受检异常强制处理**：`IOException`、`SQLException` 等。
3. **非受检异常不强制**：`NullPointerException`、`IllegalArgumentException` 等。
4. **`try-with-resources` 自动关流**：实现 `AutoCloseable` 的资源推荐用。
5. **自定义异常**：业务异常继承 `RuntimeException`，受检异常继承 `Exception`。

## 实现原理

### 1. 异常体系分类依据

划分"受检"和"非受检"的设计哲学是：

- **受检异常**：表示可恢复的外部条件，调用方应该预期并处理。例如网络中断（`IOException`）、文件不存在（`FileNotFoundException`）。编译器强制 `try-catch` 或 `throws`，让错误处理进入 API 契约。
- **非受检异常**：表示编程错误，通常无法在运行时恢复。例如空指针（`NPE`）、数组越界、非法参数。这类异常应该通过修复代码而不是 `try-catch` 解决，所以编译器不强制处理。

`Error` 表示 JVM 内部或资源耗尽级别的故障（OOM、栈溢出），业务层无法恢复，一般不捕获。

### 2. 异常处理语法

#### `try-catch-finally`

```java
FileInputStream in = null;
try {
    in = new FileInputStream("a.txt");
    // 使用 in
} catch (FileNotFoundException e) {
    log.error("文件不存在", e);
    throw new BusinessException("配置文件缺失", e);  // 转换异常
} finally {
    if (in != null) {
        try { in.close(); } catch (IOException ignored) {}
    }
}
```

`finally` 块无论是否抛异常都会执行（除非 JVM 退出或当前线程被中断）。它常用于资源释放，但写起来繁琐。

#### `try-with-resources`（Java 7+）

实现 `AutoCloseable` 的资源可以放在 `try` 头部，无论是否抛异常都会自动调用 `close()`，且支持多个资源。

```java
try (FileInputStream in = new FileInputStream("a.txt");
     BufferedReader reader = new BufferedReader(new InputStreamReader(in))) {
    String line = reader.readLine();
} catch (IOException e) {
    log.error("读取失败", e);
}
```

编译器会自动展开为 `try-catch-finally`，并处理 `close()` 抛出的异常（用 `addSuppressed` 附加到主异常）。**生产中优先使用 try-with-resources**。

#### `throws` 与 `throw`

```java
// throws 声明可能抛出的受检异常
public String readConfig(String path) throws IOException, ConfigException {
    if (path == null) {
        throw new IllegalArgumentException("path 不能为空");  // 非受检，不强制声明
    }
    // ...
}
```

### 3. 异常链与 `getCause`

业务异常应保留底层原因，方便排查：

```java
public User loadUser(String id) throws UserNotFoundException {
    try {
        return userDao.findById(id);
    } catch (SQLException e) {
        throw new UserNotFoundException("用户查询失败: " + id, e);  // 保留 cause
    }
}

// 排查时
try { ... } catch (UserNotFoundException e) {
    log.error("加载用户失败", e);          // 打印完整堆栈，包含 cause
    Throwable root = e.getCause();        // 获取底层异常
}
```

异常链通过 `Throwable cause` 字段实现，构造时传入或调用 `initCause()`。

### 4. 异常的性能开销

异常对象创建时会调用 `fillInStackTrace()`，收集当前线程的整个调用栈，开销大（微秒级）。所以：

- **不要用异常做控制流**：例如 `try { Integer.parseInt(...) } catch` 替代 `Character.isDigit` 检查。
- **预期错误用返回值**：`Optional<T>`、`Result<T>` 模式。
- **热点路径预检**：循环里先检查再操作，避免抛异常。

JIT 会优化部分异常（如 `NullPointerException` 在 JIT 优化后会去掉栈填充），但不应依赖此优化。

### 5. 异常处理最佳实践

```java
// 1. 不要 catch 大范围异常（Exception/Throwable），掩盖 bug
try { ... } catch (Exception e) { /* 错误 */ }

// 2. 不要吞异常
try { ... } catch (IOException e) { /* 错误：什么都没做 */ }

// 3. 不要 catch 不打算处理的异常
try {
    Thread.sleep(1000);
} catch (InterruptedException e) {
    // 错误：吞掉了中断信号
}

// 4. 正确处理中断
try {
    Thread.sleep(1000);
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();  // 重新设置中断标志
    return;
}

// 5. 转换异常时保留 cause
catch (SQLException e) {
    throw new ServiceException("查询失败", e);  // 保留 cause
}
```

## 代码示例

### 自定义业务异常

```java
public class BusinessException extends RuntimeException {
    private final int code;

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    public BusinessException(int code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public int getCode() { return code; }
}

// 使用
public User findById(String id) {
    User user = userDao.findById(id);
    if (user == null) {
        throw new BusinessException(40404, "用户不存在: " + id);
    }
    return user;
}
```

继承 `RuntimeException` 是因为业务异常一般不强制调用方 `try-catch`，由统一异常处理器拦截。

### 统一异常处理（Spring）

```java
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ErrorResponse handleBusiness(BusinessException e) {
        log.warn("业务异常: code={}, msg={}", e.getCode(), e.getMessage());
        return new ErrorResponse(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ErrorResponse handleOther(Exception e) {
        log.error("系统异常", e);
        return new ErrorResponse(50000, "系统繁忙");
    }
}

record ErrorResponse(int code, String message) {}
```

### try-with-resources 自定义资源

```java
public class ManagedResource implements AutoCloseable {
    public ManagedResource() {
        System.out.println("open");
    }

    public void use() {
        System.out.println("use");
    }

    @Override
    public void close() {
        System.out.println("close");
    }

    public static void main(String[] args) {
        try (ManagedResource r = new ManagedResource()) {
            r.use();
        }  // 自动调用 r.close()
    }
}
```

## 实战场景

| 场景 | 处理方式 | 注意点 |
|------|----------|--------|
| 文件/网络 IO | `try-with-resources` 自动关流 | 资源必须实现 `AutoCloseable` |
| 数据库异常 | 捕获 `SQLException`，转换为业务异常 | 保留 cause，便于排查 |
| 参数校验 | 抛 `IllegalArgumentException` 或用 `Validator` | 校验框架更合适 |
| 业务规则违反 | 抛自定义 `BusinessException` | 由统一异常处理器拦截返回前端 |
| 中断响应 | 重新 `interrupt()` 或抛出 | 不要吞 `InterruptedException` |
| 重试逻辑 | 捕获瞬态异常重试 | 用 Spring Retry 等框架更稳健 |
| 防御性兜底 | 在 Controller 层用 `@ExceptionHandler` | 避免 500 错误暴露栈信息 |

## 深挖追问

### 1. 受检异常和非受检异常怎么选

- **可恢复、调用方应感知的错误**：用受检异常。例如 IO 失败、配置缺失。
- **编程错误、调用方无法恢复**：用非受检异常。例如 NPE、参数非法。

实际项目中，越来越多团队倾向全用非受检异常（Spring 全家桶的 API 就是如此）。原因：受检异常强制 `try-catch` 或 `throws`，导致方法签名污染，且大量调用方实际只是"再抛一次"。

### 2. `finally` 一定会执行吗

绝大多数情况会。三种例外：

- `try`/`catch` 块中调用了 `System.exit()`，JVM 直接退出。
- 守护线程被强制终止。
- `try` 块中陷入死循环或被死锁。

`finally` 中如果也抛异常或 `return`，会**覆盖** `try` 块的异常或返回值，这是非常隐蔽的 bug。所以 `finally` 块只做资源释放，不要写业务返回。

### 3. `try-with-resources` 和 `try-finally` 的区别

`try-with-resources` 编译后等价于 `try-finally` + 显式 `close()` 调用，但有两点改进：

- 自动处理 `close()` 抛出的异常，用 `addSuppressed` 附加到主异常，不丢失。
- 代码简洁，没有样板代码。

`try-finally` 手写时，如果 `close()` 抛异常会覆盖 `try` 块的原异常，造成排查困难。

### 4. `Error` 能被 catch 吗

语法上可以 `catch (Error)` 或 `catch (Throwable)`，但**不推荐**。`Error` 是 JVM 级别故障，业务代码无法恢复。捕获 `OutOfMemoryError` 后继续运行，很可能立即又 OOM。少数场景（如启动期类加载失败需要降级）可以捕获特定 `Error`，但要谨慎。

### 5. `OutOfMemoryError` 和 `StackOverflowError` 的区别

- **`OutOfMemoryError`**：堆、元空间、直接内存等内存区域不够。常见原因：内存泄漏、大对象、堆设置过小。
- **`StackOverflowError`**：线程栈空间不够。常见原因：递归过深、栈设置过小（`-Xss`）。

### 6. 异常的 `fillInStackTrace` 能优化吗

可以。自定义异常时重写 `fillInStackTrace()` 返回 `this`，跳过栈收集，性能大幅提升。代价是丢失栈信息，只能用于"已知位置"的异常（如断言型异常）。

```java
public class FastException extends RuntimeException {
    @Override
    public synchronized Throwable fillInStackTrace() {
        return this;  // 跳过栈收集，性能提升 10~100 倍
    }
}
```

Netty 等高性能框架内部用这种方式优化异常路径。

## 易错点

- `catch (Exception e)` 范围过大，掩盖 `NullPointerException`、`ClassCastException` 等编程错误。
- 吞异常（`catch` 块为空或只有 `e.printStackTrace()`），导致问题排查困难。
- `finally` 块里有 `return`，覆盖 `try` 块返回值。
- 捕获 `InterruptedException` 后不重新设置中断标志，丢失中断信号。
- 转换异常时不传 `cause`，丢失底层堆栈信息。
- 用异常做控制流，性能差且代码可读性差。
- 在循环里抛异常，每次都创建栈信息，性能严重下降。
- 自定义异常不继承合适的父类（业务异常误继承 `Exception` 导致强制 `try-catch`）。
- `try-with-resources` 中资源顺序写反（依赖流的包装流应放后面），关闭顺序错误。

## 总结

Java 异常机制通过 `Throwable` 体系表达错误，受检异常强制处理、非受检异常不强制。生产实践核心几条：用 `try-with-resources` 自动关流、不吞异常、不 `catch Exception` 大范围、转换异常保留 `cause`、不滥用异常做控制流。业务异常推荐继承 `RuntimeException`，由 `@RestControllerAdvice` 统一拦截。理解异常的成本（栈收集开销）和正确处理中断、`finally` 行为，是写出健壮 Java 代码的基础。

## 参考资料

- [Throwable API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Throwable.html)
- [JLS §11 Exceptions](https://docs.oracle.com/javase/specs/jls/se17/html/jls-11.html)
- [Effective Java - Item 69-77: Exceptions](https://www.oreilly.com/library/view/effective-java/9780134686097/)
- [Java 7 try-with-resources](https://docs.oracle.com/javase/tutorial/essential/exceptions/tryResourceClose.html)

---
