# Spring历史版本

Spring历史版本
Spring框架自2002年诞生以来，经历了多个版本的迭代，功能不断增强，架构持续优化。以下是Spring主要历史版本的演变历程及其关键特性：
演变过程：
Spring 1.x（2002-2006）
·  Spring1.0（2004年）：首个正式版本，核心特性包括IOC容器基于XML配置的Bean管理、AOP支持方法拦截和声明式事务、JDBC抽象简化数据库操作；
·  Spring1.2（2005年）：引入@Transactional注解，需要结合AspectJ，以及支持更多AOP功能；

Spring 2.x（2006-2009）：在xml配置为主流的基础上，基于Java5对注解和反射初步支持。
·  Spring2.0（2006年）：通过XML命名中间简化配置（如<context:component-scan>）、注解驱动开发（支持@Responsitory、@Service等组件注解）、AspectJ集成支持更强大的切面表达式；
·  Spring2.5（2007年）：支持依赖注入的注解@Autowired、SpringMVC注解、Java5+支持泛型和注解等；

Spring 3.x（2009-2013）：基本确定了Spring Framework的内核，包括注解驱动，事件驱动，更多注解支持等
·  Spring3.0（2009年）：全面支持Java注解，替代大量XML配置，支持动态表达式求值SpEL，SpringMVC新增@ResponseBody支持REST；
·  Spring3.1（2011年）：增加Profile机制环境隔离（如@Profile("dev")）、增加缓存抽象@Cacheable注解；
·  Spring3.2（2012年）：支持异步MVC注解@Async支持、测试改进@WebAppConfiguration；

Spring 4.x（2013-2017）：注解配置方式称为主流方式。
·  Spring4.0（2013年）：支持Java8新特性、支持@Conditional条件化Bean和WebSocket模块等；
·  Spring4.2（2015年）：注解增强如@EventListener、@AliasFor，改进JMS（@JmsListener）；

Spring 5.x（2017-2022）：体现了未来一段时间主流开发框架的趋势：函数式+异步+响应式编程。
·  Spring5.0（2017年）：增加响应式编程WebFlux模块（基于Reactor），支持Kotlin，支持Http2；
·  Spring5.3（2020年）：GraalVM原生镜像支持，支持响应式通信协议RSocket集成；

Spring6.x（2022-至今）
·  Spring6.0（2022年）：使用Java17+作为基线，使用Jakarta EE9+取代javax.*包，支持AOT编译优化原生镜像性能；
·  Spring6.1（2023年）：支持虚拟线程，增强观测性集成Micrometer；

总结：
配置简化：XML → 注解 → 自动化（如 Spring Boot）。
2. 编程模型：命令式 → 响应式（WebFlux）。
3. 云原生支持：Spring Cloud、Kubernetes 集成。
4. 性能优化：AOT、GraalVM 原生镜像。
