# Java SPI 机制是什么？

## 核心概念

SPI（Service Provider Interface）是 Java 提供的一种服务发现机制。它允许接口定义方只声明标准接口，具体实现由第三方提供，并在运行时通过配置动态加载。

SPI 的核心价值是：**解耦接口和实现，支持插件化扩展**。

## SPI 的基本组成

### 1. 服务接口

定义需要被扩展的能力，通常由框架或标准库提供。

```java
public interface PaymentService {
    void pay();
}
```

### 2. 服务提供者

第三方实现服务接口。

```java
public class AliPayService implements PaymentService {
    @Override
    public void pay() {
        System.out.println("AliPay pay");
    }
}
```

### 3. 配置文件

在 `META-INF/services/` 目录下创建配置文件，文件名是接口的全限定名，文件内容是实现类的全限定名。

```text
META-INF/services/com.example.PaymentService
```

文件内容示例：

```text
com.example.AliPayService
com.example.WeChatPayService
```

### 4. ServiceLoader 加载实现

Java 通过 `ServiceLoader` 读取配置文件并加载实现类。

```java
ServiceLoader<PaymentService> services = ServiceLoader.load(PaymentService.class);
for (PaymentService service : services) {
    service.pay();
}
```

## 常见应用场景

- JDBC 驱动加载。
- 日志框架扩展。
- Dubbo 扩展点机制。
- 插件化架构。

## 注意事项

- JDK SPI 默认会加载所有实现类，可能带来启动开销。
- 原生 SPI 不支持按名称获取具体实现。
- 配置目录必须是 `META-INF/services/`。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- SPI 是面向接口的服务发现机制。
- 标准 SPI 通过 META-INF/services/接口全限定名 声明实现类。

### 面试官想考什么
- 插件化扩展思想。
- SPI 与 API、工厂模式区别。

### 标准回答
框架定义接口，第三方提供实现，调用方通过 ServiceLoader 等机制加载实现，从而在不修改框架代码的情况下扩展能力。

### 深挖追问
- ServiceLoader 是否懒加载？
- 多个实现如何选择？
- 标准 SPI 缺点？

### 实战场景/代码示例
```java
ServiceLoader<MyPlugin> loader=ServiceLoader.load(MyPlugin.class);
for(MyPlugin p:loader) p.start();
```

### 易错点/总结
- 标准 SPI 缺少依赖注入和条件选择。
- 实现类通常需要可访问无参构造。

---

<!-- interview-detail-2026-06-24 -->

## 面试版详细讲解补充

### 核心概念
- SPI 是面向接口的服务发现机制：调用方定义接口，提供方在 META-INF/services 中声明实现，ServiceLoader 负责加载。
- 复习时不要只记一句结论，要把“定义、底层原因、使用边界、工程取舍”串起来。

### 面试官想考什么
- SPI 与 API 区别、ServiceLoader 加载流程、JDBC/日志/Dubbo 等扩展思想。
- 能否把该知识点和常见线上问题、代码设计、性能/并发/可维护性联系起来。

### 标准回答
SPI 的价值是解耦和插件化；它通过 classpath 扫描配置文件并反射创建实现，原生能力简单，不负责依赖注入、优先级和条件装配。

如果是口述面试，建议先给一句结论，再补充 2~3 个关键细节，最后用项目场景收尾。这样既有结构，也能给面试官继续追问的抓手。

### 深挖追问
- 多个实现如何选择？ServiceLoader 是否懒加载？为什么 JDBC Driver 能自动注册？
- 如果让你在项目里落地这个知识点，你会如何设计测试用例验证边界？
- 遇到性能、并发或可维护性问题时，有哪些替代方案？

### 示例/实战场景
```java
ServiceLoader.load(PayService.class).forEach(PayService::init);
```

实战中建议把该知识点放到具体场景里理解：例如接口参数校验、集合选型、线程池治理、金额计算、JVM 排障或框架扩展点，而不是孤立背概念。

### 易错点/总结
- 配置文件名必须是接口全限定名；实现类要有可访问无参构造。
- 面试表达要避免绝对化，例如“永远”“一定”“只会”，很多 Java 行为都与版本、实现、参数和上下文有关。
- 最后用一句话收束：先讲清楚它解决什么问题，再讲清楚它的限制和替代方案。

