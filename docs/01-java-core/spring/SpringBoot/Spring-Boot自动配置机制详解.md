# Spring Boot自动配置机制详解

Spring Boot自动配置机制详解
一、概述
SpringBoot自动装配原理是基于Spring的条件化配置和@EnableAutoConfiguration注解实现的，这种机制允许开发者在项目中引入相关的依赖，SpringBoot根据这些依赖自动配置应用程序的上下文和功能。SpringBoot定义了一套规范：SpringBoot在启动时会扫描外部引入的JAR包中的META-INF/spring.factories文件，将文件中配置的类型信息加载到Spring容器，并执行类中定义的各种操作。对于外部的JAR来说，只需要按照SpringBoot定义的标准，将自己的功能装置进SpringBoot。通俗理解，自动装配就是通过注解或一些简单配置就可以在SpringBoot的帮助下开启和配置各种功能，比如数据库访问，web开发。

二、自动化配置的核心机制
1.条件注解@Conditional：
Spring Boot 的自动配置基于条件注解（@Conditional）实现。具体实现包括：
·  @ConditionalOnClass：某个类在类路径中存在时配置生效。
·  @ConditionalOnMissingClass：某个类在类路径中不存在时配置生效。
·  @ConditionalOnBean：某个 Bean 存在时配置生效。
·  @ConditionalOnMissingBean：某个 Bean 不存在时配置生效。
·  @ConditionalOnProperty：某个属性被配置时生效。
·  @ConditionalOnResource：某个资源文件存在时生效。
·  @ConditionalOnWebApplication：当前是 Web 应用时生效。
·  @ConditionalOnNotWebApplication：当前不是 Web 应用时生效。

2.@EnableAutoConfiguration：
·  自动化配置通过@EnableAutoConfiguration注解启用。
·  该注解会引入 spring.factories 文件中指定的所有自动配置类。

3.spring.factories
在 Spring Boot 的每个自动配置模块中，META-INF/spring.factories文件列出了所有自动配置类：

org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration,\
org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration,\
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration

三、常见的自动配置模块
1.WebMvcAutoConfiguration：配置 DispatcherServlet，自动注册ViewResolver、提供默认的静态资源路径；
2.EmbeddedServletContainerAutoConfiguration：配置嵌入式服务器（如Tomcat、Jetty、Undertow）、支持application.properties配置端口和其他服务器参数；
3.DataSourceAutoConfiguration：自动配置DataSource数据源，支持HiKariCp、Tomcat JDBC等连接池，支持application.properties配置数据源信息；
4.SecurityAutoConfiguration：自动配置Spring Security，默认所有URl需要认证，提供默认用户名和随机密码（日志中输出）;
5.LoggingAutoConfiguration：自动配置日志框架（如Logback、Log4j2），支持通过application.properties配置日志级别；
6.CacheAutoConfiguration：自动配置缓存（如EhCache、Redis、Caffeine），提供注解支持（@EnableCaching、@Cacheable等）；
