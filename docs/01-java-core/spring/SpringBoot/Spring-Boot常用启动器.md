# Spring Boot常用启动器

Spring Boot常用启动器
Spring Boot提供了丰富的Starter（启动器）来简化依赖管理和自动配置，开发者只需引入对应的Starter，Spring Boot就会自动配置相关组件。以下是常用的官方和第三方Starter：
核心 Starter
·  spring-boot-starter：核心Starter，包含自动配置、日志、YAML 支持，默认包含；
·  spring-boot-starter-web：构建 Web 应用（Spring MVC + Tomcat），包含spring-web, spring-webmvc, tomcat；
·  spring-boot-starter-test：单元测试（JUnit, Mockito, Spring Test） ，包含junit, mockito, spring-test；
数据访问 Starter
·  spring-boot-starter-data-jpa：JPA（Hibernate + Spring Data JPA），包含hibernate-core, spring-data-jpa；
·  spring-boot-starter-data-redis：Redis 缓存，包含lettuce-core, spring-data-redis；
·  spring-boot-starter-data-mongodb：MongoDB，包含mongodb-driver, spring-data-mongodb；
·  spring-boot-starter-jdbc：JDBC（Spring JDBC + HikariCP），包含spring-jdbc, HikariCP；
·  spring-boot-starter-data-elasticsearch：Elasticsearch，包含elasticsearch, spring-data-elasticsearch；
消息队列 Starter
·  spring-boot-starter-amqp：RabbitMQ，包含spring-rabbit；
·  spring-boot-starter-kafka：Kafka，包含spring-kafka；
·  spring-boot-starter-artemis：ActiveMQ Artemis，包含artemis-jms；
安全 Starter
·  spring-boot-starter-security：Spring Security（认证 + 授权），包含spring-security-core, spring-security-web；
·  spring-boot-starter-oauth2-client：OAuth2 客户端，包含spring-security-oauth2-client；
·  spring-boot-starter-oauth2-resource-server：OAuth2 资源服务器，包含spring-security-oauth2-resource-server；
微服务 Starter
·  spring-boot-starter-actuator：监控和管理（/actuator 端点），包含micrometer-core, spring-boot-actuator；
·  spring-cloud-starter-gateway：Spring Cloud Gateway（API 网关），包含spring-cloud-gateway；
·  spring-cloud-starter-openfeign：Feign 声明式 HTTP 客户端，包含spring-cloud-openfeign；
·  spring-cloud-starter-netflix-eureka-client：Eureka 客户端（服务注册），包含spring-cloud-netflix-eureka-client；
其他常用 Starter
·  spring-boot-starter-mail：邮件发送（JavaMail），包含spring-context-support, jakarta.mail；
·  spring-boot-starter-thymeleaf：Thymeleaf 模板引擎，包含thymeleaf, thymeleaf-spring；
·  spring-boot-starter-freemarker：FreeMarker 模板引擎，包含freemarker；
·  spring-boot-starter-validation：Bean Validation（Hibernate Validator），包含hibernate-validator；
·  spring-boot-starter-cache：缓存抽象（支持 Redis、Caffeine），包含spring-context, spring-cache；
·  spring-boot-starter-quartz：定时任务（Quartz），包含quartz, spring-context-support；
第三方 Starter
·  mybatis-spring-boot-starter：MyBatis 集成，包含mybatis, mybatis-spring；
·  druid-spring-boot-starter：阿里 Druid 数据库连接池，包含druid；
·  swagger-spring-boot-starter：Swagger API 文档，包含springfox-swagger2；
·  lombok：简化 POJO 代码（非官方 Starter，但常用），包含lombok；
