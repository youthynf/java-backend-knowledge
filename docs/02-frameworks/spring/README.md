# Spring

本目录覆盖 Spring 框架核心机制：IoC 容器、Bean 生命周期、循环依赖、AOP 代理、声明式事务。面试高频且与日常开发强相关，重点是从注解使用落到源码链路与失效边界。

## 目录

- [Spring IoC 是什么](/02-frameworks/spring/SpringIoC是什么？.md) — 容器、BeanDefinition、生命周期、注入方式选择
- [Spring 如何解决循环依赖](/02-frameworks/spring/Spring如何解决循环依赖？.md) — 三级缓存与代理生成时机，构造器/prototype 为什么解不了
- [Spring AOP 是什么](/02-frameworks/spring/SpringAOP是什么？.md) — 切面、通知、切点、JDK 与 CGLIB 代理、自调用失效
- [Spring 事务原理是什么](/02-frameworks/spring/Spring事务原理是什么？.md) — 传播行为、隔离级别、回滚规则与失效场景
