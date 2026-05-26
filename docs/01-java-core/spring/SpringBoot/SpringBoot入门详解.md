# SpringBoot入门详解

SpringBoot入门详解
一、概述
Spring Boot是一个用于简化Spring应用初始搭建和开发过程的开源框架。它基于Spring框架，通过提供一系列“约定优于配置”的默认设置和开箱即用的功能，极大地减少了开发者的配置负担，让开发者能够快速创建独立运行、生产级别的基于Spring的应用程序。
二、Spring Boot的核心特性与优势
自动配置（Auto-configuration）
通过@EnableAutoConfiguration注解（通常包含在@SpringBootApplication中）触发自动装配。Spring Boot在启动时会扫描META-INF/spring.factories文件（在项目依赖的starter中），加载其中定义的AutoConfiguration类，这些类依赖@Conditional注解（如@ConfditionalOnClass，@ConditionalOnMissingBean，@ConditionalOnProperty）来决定是否生效和如何配置Bean。开发者无需手动编写大量的XML或Java配置。
一站式依赖管理
Spring Boot提供了一些列预定义的项目以来描述符（Spring-boot-starter-*），每个starter都包含了一组开发特定功能所需的、且经过版本兼容测试的依赖库。开发者只需要声明一个starter，即可引入所有相关的依赖，无需手动查找和指定多个依赖及其版本，避免了依赖冲突问题。

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId> <!-- 包含 Web 开发所需的一切 -->
</dependency>

内嵌 Servlet 容器 (Embedded Servlet Container)
Spring Boot应用默认打包为可执行的JAR文件，其中内嵌了Tomcat、Jetty或Undertow等Servlet容器。开发者无需将应用部署到外部Web服务器（如独立的Tomcat）。直接运行java -jar your-app.jar即可启动一个完整的Web应用，简化了部署和运维。
生产就绪特性 (Production-Ready Features)
·  Actuator：提供了一系列监控和管理端点（Endpoints），用于检查应用状态（健康、信息、指标、环境变量、日志级别、线程dump等）、动态配置调整（如日志级别）、优雅关闭等，是运维和监控的利器。
·  外部化配置：强大的配置管理能力，支持多种来源（application.properties/application.yml、环境变量、命令行参数、配置服务器等），并能根据不同的Profile（如dev, test, prod）加载不同的配置。
·  健康检查：内置/actuator/health端点，方便监控系统检查应用是否存活和健康。
·  指标收集：集成Micrometer，方便对接各种监控系统（Prometheus, Graphite, InfluxDB等）。
·  命令行界面 (CLI)：(可选) 提供Spring Boot CLI，可以使用Groovy 脚本快速开发Spring应用原型。
·  简化构建配置：通过Maven或Gradle插件 (spring-boot-maven-plugin / spring-boot-gradle-plugin)，简化了构建可执行JAR/WAR的配置过程。

三、Spring Boot 的工作原理 (启动流程简述)
启动入口：执行main方法，调用SpringApplication.run(Application.class, args)。

2. 创建SpringApplication实例：
·  推断应用类型（Servlet, Reactive）。
·  加载 META-INF/spring.factories 中的 ApplicationContextInitializer 和 ApplicationListener。
·  推断主配置类（通常是标注了 @SpringBootApplication 的类）。

3. 运行 SpringApplication：
3.1 准备环境 (Environment): 加载配置文件 (application.*)、环境变量、命令行参数等，创建并配置 Environment 对象。
3.2 创建应用上下文 (ApplicationContext): 根据应用类型创建相应的 ApplicationContext（如 AnnotationConfigServletWebServerApplicationContext）。
3.3 准备上下文 (Context Preparation):
·  设置环境。
·  执行 ApplicationContextInitializer。
·  发布 ApplicationContextInitializedEvent。
·  加载 Bean 定义 (主配置类 -> @ComponentScan -> 扫描注册 Bean)。
·  发布 ApplicationPreparedEvent。
3.4 刷新上下文 (Context Refresh): 这是 Spring 容器的核心步骤 (AbstractApplicationContext.refresh())。
·  准备 BeanFactory。
·  执行 BeanFactoryPostProcessor (例如处理 @ConfigurationProperties, @PropertySource 等)。
·  注册 BeanPostProcessor。
·  初始化国际化资源。
·  初始化事件广播器。
·  实例化非懒加载的单例 Bean。
·  完成上下文刷新，发布 ContextRefreshedEvent。
3.5 调用 ApplicationRunner / CommandLineRunner: 如果定义了这些接口的实现，会在上下文刷新完成后调用。
3.6 启动内嵌 Web 容器 (如果适用): 在 Web 应用上下文中，会查找并启动内嵌的 Servlet 容器（如 Tomcat）。
3.7 发布 ApplicationStartedEvent / ApplicationReadyEvent: 表示应用已完全启动并准备好接收请求。

4. 应用运行：处理请求（Web 应用）或执行任务（非 Web 应用）。

四、开发实战要点
典型项目结构

src/
    main/
        java/
            com/example/yourapp/
                Application.java          # 主启动类 (含 @SpringBootApplication)
                controller/               # Controller 层
                service/                  # Service 层
                repository/               # Repository/DAO 层
                model/                    # 数据模型/实体类
                config/                   # 自定义配置类
        resources/
            static/                      # 静态资源 (HTML, CSS, JS, images)
            templates/                   # 模板文件 (Thymeleaf, Freemarker)
            application.properties        # 主配置文件 (或 application.yml)
            application-dev.properties     # Profile 特定配置文件
    test/
        java/
            com/example/yourapp/         # 测试类

配置文件相关
·  格式：application.properties或application.yml，推荐后者，结构层次更加清晰；
·  顺序：命令行参数→Java系统属性（-D）→操作系统环境变量→application-{profile}.yml→application.yml（jar包内）→application.yml（jar包外）；
·  profile使用：使用spring.profiles.active=dev激活特定的profile，加载对应的application.properties/yml配置；

打包与运行
·  Maven：mvn clean package → 生成target/xxx.jar → java -jar target/xxx.jar运行；
·  Gradle：gradle clean build → 生成build/libs/xxx.jar → java -jar build/libs/xxx.jar运行；

五、总结
Spring Boot通过其自动配置、起步依赖、内嵌容器等核心特性，极大地简化了Spring应用的开发、配置和部署流程，使开发者能够专注于业务逻辑。它提供了生产就绪的特性（如Actuator）和强大的外部化配置能力，并拥有一个庞大且活跃的生态系统。掌握Spring Boot是现代Java后端开发的必备技能。
