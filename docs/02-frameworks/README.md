# 框架篇

本目录用于复习 Java 后端常见框架，当前重点是 Spring。面试时不要只背 API，要能说清楚“框架解决了什么问题、核心机制如何工作、在生产环境如何排查问题”。

## 导航

| 模块 | 文章 | 复习重点 |
| --- | --- | --- |
| Spring | [Spring 总览](/02-frameworks/spring/README.md) | IOC、AOP、事务、Bean 生命周期、循环依赖、Spring Boot 扩展点 |
| Spring | [Spring IOC 与 AOP 核心原理](/02-frameworks/spring/ioc-aop.md) | 容器启动、依赖注入、三级缓存、动态代理、事务失效 |

## 面试复习路线

1. 先掌握 Spring IOC：BeanDefinition、BeanFactory/ApplicationContext、Bean 生命周期、依赖注入。
2. 再理解 AOP：代理模式、JDK 动态代理/CGLIB、切点与通知、事务基于 AOP 的实现。
3. 最后结合生产问题：循环依赖、事务失效、Bean 初始化顺序、配置覆盖、启动慢、代理对象不生效。

## 面试官想考什么

- 你是否理解 Spring 不是“魔法”，而是通过容器管理对象和依赖。
- 你能否把源码流程讲成清晰链路，而不是背类名。
- 你是否遇到过事务、自调用、循环依赖、Bean 后置处理器等真实问题。

## 标准回答模板

回答 Spring 类问题建议按“四段式”：**问题背景 → 核心机制 → 关键源码/组件 → 实战注意点**。例如回答 IOC：先说控制反转和依赖注入，再说 BeanDefinition、BeanFactory、生命周期，最后补充循环依赖和扩展点。

## 易错点

- 把 IOC 简单说成“new 对象交给 Spring”，但说不出 Bean 生命周期。
- 只知道 `@Transactional`，说不出为什么自调用、private 方法、异常被吞会失效。
- 把 AOP 和拦截器、过滤器混为一谈。
