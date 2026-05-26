# SpringBoot自定义启动器

SpringBoot自定义启动器
一、概述
Spring Boot自定义启动器（Starter）是一种简化依赖管理和自动配置的机制。创建一个自定义启动器通常涉及两个模块：autoconfigure模块和starter模块。其中，autoconfigure模块包含自动配置类和条件化配置，而starter模块只是一个pom文件，用于传递依赖。
二、自定义启动器原理详解
Spring Boot自动配置核心机制
Spring Boot的自定义启动器（Starter）建立在以下核心机制上：
1.1 自动配置原理：
·  Spring Boot启动时扫描所有JAR包中的META-INF/spring.factories文件
·  加载org.springframework.boot.autoconfigure.EnableAutoConfiguration键下的所有自动配置类
·  按条件实例化这些配置类
1.2 条件注解：
·  @ConditionalOnClass：类路径存在指定类时生效
·  @ConditionalOnMissingBean：容器中不存在指定Bean时生效
·  @ConditionalOnProperty：配置文件中存在指定属性时生效
·  @ConditionalOnWebApplication：在Web应用中生效
1.3 配置属性绑定：
·  @ConfigurationProperties注解实现属性与POJO的绑定
·  application.properties/yml中通过前缀配置属性值
自定义启动器工作流程
当在项目中引入自定义启动器后：
·  Spring Boot启动时扫描到META-INF/spring.factories中配置的自动配置类
·  自动配置类上的条件注解决定是否加载该配置
·  如果条件满足，创建配置的Bean并注册到Spring容器中
·  @EnableConfigurationProperties将配置文件中的属性绑定到属性类
·  属性类值传递给Bean的构造器或setter方法完成配置
自定义启动器最佳实践
3.1 模块分离：
·  starter模块：只包含依赖定义
·  autoconfigure模块：包含自动配置代码
3.2 配置约定：
·  配置前缀使用小写字母（如greeter）
·  布尔属性使用enabled控制开关
·  提供合理的默认值
3.3 条件化配置：
·  使用各种条件注解确保只有在合适环境下才配置
·  可通过自定义条件注解实现更复杂的条件
3.4 提供配置元数据：
·  使用additional-spring-configuration-metadata.json提供配置提示
·  支持IDE自动补全和文档提示

三、完整示例
自定义启动器项目结构

greeter-spring-boot-starter
├── greeter-spring-boot-autoconfigure  // 自动配置模块
│   ├── src
│   │   ├── main
│   │   │   ├── java
│   │   │   │   └── com
│   │   │   │       └── example
│   │   │   │           ├── autoconfigure
│   │   │   │           │   ├── GreeterAutoConfiguration.java
│   │   │   │           │   └── condition
│   │   │   │           │       └── OnGreeterCondition.java
│   │   │   │           ├── properties
│   │   │   │           │   └── GreeterProperties.java
│   │   │   │           └── service
│   │   │   │               └── GreetingService.java
│   │   │   └── resources
│   │   │       └── META-INF
│   │   │           ├── additional-spring-configuration-metadata.json
│   │   │           └── spring.factories
│   │   └── test
│   └── pom.xml
├── greeter-spring-boot-starter      // 启动器模块
│   └── pom.xml
└── pom.xml                          // 父POM

核心代码实现
2.1 父项目
· POM（pom.xml）

<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
                             http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <groupId>com.example</groupId>
    <artifactId>greeter-spring-boot-starter-parent</artifactId>
    <version>1.0.0</version>
    <packaging>pom</packaging>
    
    <modules>
        <module>greeter-spring-boot-autoconfigure</module>
        <module>greeter-spring-boot-starter</module>
    </modules>
    
    <properties>
        <java.version>17</java.version>
        <spring-boot.version>3.1.0</spring-boot.version>
        <maven.compiler.source>${java.version}</maven.compiler.source>
        <maven.compiler.target>${java.version}</maven.compiler.target>
    </properties>
    
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-dependencies</artifactId>
                <version>${spring-boot.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
</project>

2.2 自动配置项目
·  自动配置模块 (greeter-spring-boot-autoconfigure/pom.xml)

<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
                             http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <parent>
        <artifactId>greeter-spring-boot-starter-parent</artifactId>
        <groupId>com.example</groupId>
        <version>1.0.0</version>
    </parent>
    <modelVersion>4.0.0</modelVersion>
    <artifactId>greeter-spring-boot-autoconfigure</artifactId>
    
    <dependencies>
        <!-- Spring Boot自动配置支持 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-autoconfigure</artifactId>
        </dependency>
        <!-- 配置属性处理 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-configuration-processor</artifactId>
            <optional>true</optional>
        </dependency>
        <!-- 测试依赖 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>

·  服务接口和实现 (GreetingService.java)

package com.example.service;

public interface GreetingService {
    String greet(String name);
}

public class SimpleGreetingService implements GreetingService {
    private final String greetingTemplate;

    public SimpleGreetingService(String greetingTemplate) {
        this.greetingTemplate = greetingTemplate;
    }

    @Override
    public String greet(String name) {
        return String.format(greetingTemplate, name);
    }
}

·  配置属性类 (GreeterProperties.java)

package com.example.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "greeter")
public class GreeterProperties {
    /**
     * 默认问候语模板，支持使用%s作为名称占位符
     */
    private String template = "Hello, %s!";
    
    /**
     * 是否启用问候服务
     */
    private boolean enabled = true;
    
    // Getters and Setters
    public String getTemplate() {
        return template;
    }
    
    public void setTemplate(String template) {
        this.template = template;
    }
    
    public boolean isEnabled() {
        return enabled;
    }
    
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }
}

·  自定义条件注解 (OnGreeterCondition.java)

package com.example.autoconfigure.condition;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

public class OnGreeterCondition implements Condition {
    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        // 检查是否启用了greeter服务
        Boolean enabled = context.getEnvironment().getProperty("greeter.enabled", Boolean.class, true);
        return enabled;
    }
}

·  自动配置类 (GreeterAutoConfiguration.java)

package com.example.autoconfigure;

import com.example.autoconfigure.condition.OnGreeterCondition;
import com.example.properties.GreeterProperties;
import com.example.service.GreetingService;
import com.example.service.SimpleGreetingService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnClass(GreetingService.class)  // 类路径下存在GreetingService才生效
@EnableConfigurationProperties(GreeterProperties.class)  // 使配置属性生效
public class GreeterAutoConfiguration {
    
    @Bean
    @Conditional(OnGreeterCondition.class)  // 自定义条件
    @ConditionalOnMissingBean  // 没有该类型bean时创建
    public GreetingService greetingService(GreeterProperties properties) {
        return new SimpleGreetingService(properties.getTemplate());
    }
}

·  自动配置注册 (spring.factories)

# META-INF/spring.factories
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
com.example.autoconfigure.GreeterAutoConfiguration

·  配置元数据 (additional-spring-configuration-metadata.json)

{
 "properties": [
   {
     "name": "greeter.template",
     "type": "java.lang.String",
     "description": "问候语模板，其中%s会被替换为名称。",
     "defaultValue": "Hello, %s!"
   },
   {
     "name": "greeter.enabled",
     "type": "java.lang.Boolean",
     "description": "是否启用问候服务。",
     "defaultValue": true
   }
 ]
}

2.3 启动器模块 (greeter-spring-boot-starter/pom.xml)

<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
                            http://maven.apache.org/xsd/maven-4.0.0.xsd">
   <parent>
       <artifactId>greeter-spring-boot-starter-parent</artifactId>
       <groupId>com.example</groupId>
       <version>1.0.0</version>
   </parent>
   <modelVersion>4.0.0</modelVersion>
   <artifactId>greeter-spring-boot-starter</artifactId>
   
   <dependencies>
       <!-- 引入自动配置模块 -->
       <dependency>
           <groupId>com.example</groupId>
           <artifactId>greeter-spring-boot-autoconfigure</artifactId>
           <version>${project.version}</version>
       </dependency>
   </dependencies>
</project>

四、总结
通过这个完整的自定义启动器示例，我们可以理解Spring Boot自动配置的核心原理：
1. 条件配置：通过条件注解控制Bean的创建
2. 属性绑定：使用@ConfigurationProperties实现外部化配置
3. 自动发现：通过spring.factories实现自动配置类注册
4. 模块分离：starter仅包含依赖，autoconfigure包含配置逻辑
自定义启动器能够将复杂的配置封装起来，为其他开发者提供"开箱即用"的体验，是Spring Boot生态扩展的重要方式。
