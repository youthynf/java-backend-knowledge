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

