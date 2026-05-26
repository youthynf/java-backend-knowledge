# Spring Boot配置加载优先级

Spring Boot配置加载优先级
一、概述
Spring Boot 提供了多种配置来源，这些配置源按照特定的优先级顺序加载。理解这些优先级对于正确覆盖配置和调试配置冲突非常重要。
二、配置源优先级顺序（从高到低）
命令行参数（最高优先级）：通过--指定参数

java -jar app.jar --server.port=9090 --spring.datasource.url=jdbc:mysql://prod-db

Java系统参数：-D参数

java -Dserver.port=8081 -jar app.jar

操作系统环境变量

# Linux/Mac
export SERVER_PORT=8082

# Windows
set SERVER_PORT=8082

配置文件优先级：外部优先，Profile后置
·  外部优先：外部配置 ＞ jar包内部；
·  config优先：config目录 ＞ 同级根目录；
·  Profile优先：Profile ＞ 同级非Profile；
·  配置原则：合并差异项，相同项取高优先级；

@PropertySource注解

@Configuration
@PropertySource("classpath:custom.properties")
public class CustomConfig {
    // 自定义配置
}

默认属性

SpringApplication app = new SpringApplication(App.class);
app.setDefaultProperties(Collections.singletonMap("default.prop", "value"));

三、最佳实践
三层配置结构

prod-server/
├── app.jar                     # 不变的程序
├── config/
│   ├── application.yml         # 环境公共配置
│   └── application-prod.yml    # 生产特殊配置
└── secrets/
    └── db-credentials.env      # 敏感数据

启动脚本锁定路径

#!/bin/bash
APP_HOME=$(dirname "$(readlink -f "$0")")
cd $APP_HOME
java -jar app.jar --spring.config.location=file:./config/

K8s配置方案

apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  application.yml: |
    server:
      port: 8080
    spring:
      datasource:
        url: jdbc:mysql://prod-db
---
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: app
    volumeMounts:
    - name: config-volume
      mountPath: /app/config/
  volumes:
  - name: config-volume
    configMap:
      name: app-config

四、总结
优先级配置总结如下：

1        命令行参数        java -jar app.jar --server.port=9090
2        Java系统属性        java -Dserver.port=9090 -jar app.jar
3        操作系统环境变量        export SERVER_PORT=9090
4        file:./config/application-{profile}.yml        /app/config/application-prod.yml
5        file:./config/application-{profile}.properties        /app/config/application-prod.properties
6        file:./application-{profile}.yml        /app/application-prod.yml
7        file:./application-{profile}.properties        /app/application-prod.properties
8        classpath:/config/application-{profile}.yml        jar包内/config/application-prod.yml
9        classpath:/config/application-{profile}.properties        jar包内/config/application-prod.properties
10        classpath:/application-{profile}.yml        jar包内/application-prod.yml
11        classpath:/application-{profile}.properties        jar包内/application-prod.properties
12        file:./config/application.yml        /app/config/application.yml
13        file:./config/application.properties        /app/config/application.properties
14        file:./application.yml        /app/application.yml
15        file:./application.properties        /app/application.properties
16        classpath:/config/application.yml        jar包内/config/application.yml
17        classpath:/config/application.properties        jar包内/config/application.properties
18        classpath:/application.yml        jar包内/application.yml
19        classpath:/application.properties        jar包内/application.properties
20        @PropertySource        @PropertySource("classpath:custom.properties")
21        默认属性        SpringApplication.setDefaultProperties
