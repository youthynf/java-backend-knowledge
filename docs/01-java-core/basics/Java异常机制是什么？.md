# Java异常机制是什么？

Java异常机制是什么？
一、概述
Java 异常机制是 Java 语言中用于处理程序运行时错误的重要特性，它提供了一种结构化和统一的方式来管理程序执行过程中可能出现的异常情况。Java 中的异常是指程序在运行过程中出现的错误或意外事件，这些异常会干扰程序的正常执行流程。
二、类关系
Java 异常体系基于继承结构，所有异常类最终继承自java.lang.Throwable类，其下主要分为两个分支：Error和Exception。其中Error用来表示JVM无法处理的错误，如系统级错误或资源耗尽的情况，这类错误通常无法通过程序代码处理，而需要系统层面干预；Exception表示程序可以捕获和处理的异常情况，进一步可以分为受检异常和运行时异常两类：
•  受检异常：直接继承自Exception，编译器会强制要求程序显式处理，如IOException、SQLException等；
•  非受检异常 : 继承自RuntimeException，编译器不强制要求处理，是程序运行时错误，如NullPointerException、ArrayIndexOutOfBoundsException等。

三、异常捕获处理的方法
try-catch：同一个 catch 也可以捕获多种类型异常，用 | 隔开；
try-catch-finally：常规用法；
try-finally：可用在不需要捕获异常的代码，可以保证资源在使用后被关闭；
try-with-resource：实现资源的自动释放，自动释放的资源需要是实现了AutoCloseable接口的类；
四、常见异常类
•  运行时异常：NullPointerException、ArrayIndexOutOfBoundsException、ClassCastException、IllegalArgumentException等。
•  受检查异常：IOException、SQLException、ClassNotFoundException、InterruptedException等。
•  错误：OutOfMemoryError、StackOverflowError、NoClassDefFoundError等。

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

