# Spring

Spring 是 Java 后端面试最高频框架模块。核心不是注解本身，而是容器、代理、事务和扩展点。

## 导航

| 文章 | 摘要 | 高频问题 |
| --- | --- | --- |
| [Spring IOC 与 AOP 核心原理](/02-frameworks/spring/ioc-aop.md) | 系统复习 IOC、AOP、事务、循环依赖和 Bean 生命周期 | IOC 是什么？Bean 生命周期？三级缓存？AOP 如何实现？事务为什么失效？ |

## 复习重点

- **IOC**：BeanDefinition、实例化、属性填充、初始化、销毁、作用域。
- **AOP**：JDK 动态代理与 CGLIB、通知链、切点匹配、代理对象暴露。
- **事务**：传播行为、隔离级别、回滚规则、事务同步、失效场景。
- **扩展点**：BeanPostProcessor、BeanFactoryPostProcessor、FactoryBean、ApplicationListener。

## 面试官想考什么

面试官通常通过 Spring 判断候选人是否有框架底层意识：能不能从一个注解追到容器处理流程，能不能解释线上“配置了却不生效”的问题。

## 建议回答方式

先用业务语言说明价值，再用机制解释实现，最后补充踩坑。例如：`@Autowired` 不是简单赋值，而是容器在 Bean 属性填充阶段通过依赖解析找到候选 Bean，再完成注入。
