# Tomcat入门概要

Tomcat入门概要
一、概述
Tomcat是Apache软件基金会的开源Java Servlet容器，通过其分层架构实现了高性能的Web服务能力。
二、核心组件
Tomcat采用分层容器模型，按照从顶层到底层包括以下组件。
Server
Tomcat的顶级容器，代表整个Servlet容器实例，负责管理生命周期（启动/停止/重新加载），一个Server可包含多个Service组件。
Service
逻辑分组单元，关联一组Connectors和一个Engine，Service的实现类StandardService。

public class StandardService implements Service {
    private Connector[] connectors = new Connector[0];
    private Engine engine;
    private Server server;
    // 负责连接Connector和Engine
}

Connector
核心网络连接器：负责处理客户端通信，支持多种协议（HTTP/1.1、HTTP/2、AJP）；
关键能力：协议解析（HTTP/HTTPS/AJP）、线程池管理、连接控制（最大连接数、超时设置）；

Engine
请求处理的顶层容器，管理所有虚拟主机(Host)。主要配置文件片段：

<Engine name="Catalina" defaultHost="localhost">
  <Cluster className="org.apache.catalina.ha.tcp.SimpleTcpCluster"/>
  <Realm className="org.apache.catalina.realm.LockOutRealm">
    <Realm className="org.apache.catalina.realm.UserDatabaseRealm"/>
  </Realm>
</Engine>

Host
虚拟主机实现（如：localhost、domain.com），关键特性包括：多域名支持（基于Server Name Indication）、自动部署（热部署）、关联多个Context；
Context
对应单个Web应用（WAR包部署单元）
管理组件：
Servlet容器：加载servlet类
过滤器链：处理请求/响应管道
会话管理：session创建/销毁
资源映射：静态资源访问规则

三、关键扩展组件
Global Naming Resources
全局JNDI资源命名服务，提供共享资源（如数据库连接池）。
配置示例：

<GlobalNamingResources>
 <Resource name="jdbc/MyDB" 
           type="javax.sql.DataSource"
           maxTotal="100"
           username="admin"
           password="secret"/>
</GlobalNamingResources>

2. Executor
线程池实现（Java 5+ Thread Pool），优化线程创建开销，提高并发性能
配置参数：

maxThreads=200       # 最大工作线程
minSpareThreads=25    # 最小空闲线程
maxConnections=10000  # 最大连接数

3. Cluster
分布式集群实现，支持水平扩展（Session复制、负载均衡），支持节点故障自动转移。

4. Realm
安全认证控制（用户、角色、权限），认证方式支持：JDBCRealm（数据库）、JNDIRealm（LDAP）、MemoryRealm（内存）、JAASRealm（Java认证服务）

四、完整的web.xml配置示例

<?xml version="1.0" encoding="UTF-8"?>
<web-app xmlns="http://xmlns.jcp.org/xml/ns/javaee"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/javaee 
                             http://xmlns.jcp.org/xml/ns/javaee/web-app_4_0.xsd"
         version="4.0">

    <!-- ======================== 基本配置 ======================== -->
    <display-name>MyWebApplication</display-name>
    <description>Example web application configuration</description>
    
    <!-- 上下文参数 -->
    <context-param>
        <param-name>appVersion</param-name>
        <param-value>1.0.0</param-value>
    </context-param>
    
    <!-- ======================== 监听器配置 ======================== -->
    <listener>
        <listener-class>com.example.AppContextListener</listener-class>
    </listener>
    
    <listener>
        <listener-class>org.springframework.web.context.ContextLoaderListener</listener-class>
    </listener>

    <!-- ======================== Filter配置 ======================== -->
    <filter>
        <filter-name>LoggingFilter</filter-name>
        <filter-class>com.example.LoggingFilter</filter-class>
        <init-param>
            <param-name>logLevel</param-name>
            <param-value>DEBUG</param-value>
        </init-param>
    </filter>
    
    <filter>
        <filter-name>AuthFilter</filter-name>
        <filter-class>com.example.AuthenticationFilter</filter-class>
    </filter>
    
    <filter-mapping>
        <filter-name>LoggingFilter</filter-name>
        <url-pattern>/*</url-pattern>
    </filter-mapping>
    
    <filter-mapping>
        <filter-name>AuthFilter</filter-name>
        <url-pattern>/secure/*</url-pattern>
    </filter-mapping>

    <!-- ======================== Servlet配置 ======================== -->
    <servlet>
        <servlet-name>HomeServlet</servlet-name>
        <servlet-class>com.example.HomeServlet</servlet-class>
        <init-param>
            <param-name>welcomeMessage</param-name>
            <param-value>Welcome to our site!</param-value>
        </init-param>
        <load-on-startup>1</load-on-startup>
    </servlet>
    
    <servlet>
        <servlet-name>ApiServlet</servlet-name>
        <servlet-class>com.example.ApiServlet</servlet-class>
        <async-supported>true</async-supported>
    </servlet>
    
    <servlet>
        <servlet-name>JspServlet</servlet-name>
        <servlet-class>org.apache.jasper.servlet.JspServlet</servlet-class>
        <init-param>
            <param-name>development</param-name>
            <param-value>false</param-value>
        </init-param>
        <load-on-startup>3</load-on-startup>
    </servlet>
    
    <servlet-mapping>
        <servlet-name>HomeServlet</servlet-name>
        <url-pattern>/home</url-pattern>
        <url-pattern>/index</url-pattern>
    </servlet-mapping>
    
    <servlet-mapping>
        <servlet-name>ApiServlet</servlet-name>
        <url-pattern>/api/*</url-pattern>
    </servlet-mapping>
    
    <servlet-mapping>
        <servlet-name>JspServlet</servlet-name>
        <url-pattern>*.jsp</url-pattern>
    </servlet-mapping>

    <!-- ======================== Session配置 ======================== -->
    <session-config>
        <session-timeout>30</session-timeout> <!-- 30分钟 -->
        <cookie-config>
            <http-only>true</http-only>
            <secure>true</secure>
        </cookie-config>
        <tracking-mode>COOKIE</tracking-mode>
    </session-config>

    <!-- ======================== 错误页面配置 ======================== -->
    <error-page>
        <error-code>404</error-code>
        <location>/error/notFound.jsp</location>
    </error-page>
    
    <error-page>
        <error-code>500</error-code>
        <location>/error/serverError.jsp</location>
    </error-page>
    
    <error-page>
        <exception-type>java.lang.Exception</exception-type>
        <location>/error/generalError.jsp</location>
    </error-page>

    <!-- ======================== 安全配置 ======================== -->
    <security-constraint>
        <web-resource-collection>
            <web-resource-name>Secure Area</web-resource-name>
            <url-pattern>/secure/*</url-pattern>
            <http-method>GET</http-method>
            <http-method>POST</http-method>
        </web-resource-collection>
        <auth-constraint>
            <role-name>admin</role-name>
            <role-name>manager</role-name>
        </auth-constraint>
        <user-data-constraint>
            <transport-guarantee>CONFIDENTIAL</transport-guarantee>
        </user-data-constraint>
    </security-constraint>
    
    <login-config>
        <auth-method>FORM</auth-method>
        <form-login-config>
            <form-login-page>/login.jsp</form-login-page>
            <form-error-page>/loginError.jsp</form-error-page>
        </form-login-config>
        <realm-name>jdbcRealm</realm-name>
    </login-config>
    
    <security-role>
        <role-name>admin</role-name>
    </security-role>
    <security-role>
        <role-name>manager</role-name>
    </security-role>

    <!-- ======================== JNDI资源引用 ======================== -->
    <resource-ref>
        <res-ref-name>jdbc/MyDB</res-ref-name>
        <res-type>javax.sql.DataSource</res-type>
        <res-auth>Container</res-auth>
    </resource-ref>
    
    <env-entry>
        <env-entry-name>maxResults</env-entry-name>
        <env-entry-type>java.lang.Integer</env-entry-type>
        <env-entry-value>100</env-entry-value>
    </env-entry>
    
    <!-- ======================== MIME类型映射 ======================== -->
    <mime-mapping>
        <extension>pdf</extension>
        <mime-type>application/pdf</mime-type>
    </mime-mapping>
    <mime-mapping>
        <extension>json</extension>
        <mime-type>application/json</mime-type>
    </mime-mapping>
</web-app>

五、Tomcat高级配置建议
全局JNDI资源配置（server.xml）

<GlobalNamingResources>
    <!-- JDBC数据源 -->
    <Resource name="jdbc/MyDB" 
              auth="Container"
              type="javax.sql.DataSource"
              maxTotal="100"
              maxIdle="30"
              maxWaitMillis="10000"
              username="dbuser"
              password="dbpass"
              driverClassName="com.mysql.cj.jdbc.Driver"
              url="jdbc:mysql://localhost:3306/mydb"/>
              
    <!-- JMS连接工厂 -->
    <Resource name="jms/ConnectionFactory" 
              auth="Container"
              type="javax.jms.ConnectionFactory"
              factory="org.apache.activemq.jndi.JNDIReferenceFactory"/>
</GlobalNamingResources>

Realm安全配置（context.xml）

<Realm className="org.apache.catalina.realm.LockOutRealm">
    <Realm className="org.apache.catalina.realm.JDBCRealm"
           driverName="com.mysql.cj.jdbc.Driver"
           connectionURL="jdbc:mysql://localhost:3306/authdb"
           connectionName="authuser"
           connectionPassword="authpass"
           userTable="users"
           userNameCol="username"
           userCredCol="password"
           userRoleTable="user_roles"
           roleNameCol="rolename"/>
</Realm>

## 面试总结
### 核心概念

Tomcat 是 Servlet 容器和轻量级 Web 服务器，负责接收 HTTP 请求、解析协议、管理 Servlet 生命周期并把请求分发到应用。

### 面试官想考什么

面试官常问组件结构、请求处理流程、线程池、连接器、类加载机制、Spring Boot 内嵌 Tomcat 调优。

### 标准回答

Tomcat 关键组件包括 Server、Service、Connector、Engine、Host、Context、Wrapper。请求经 Connector 接入和解析，再进入容器管道，最终由 Servlet/Spring MVC 处理。性能问题常看线程池、连接数、超时和应用处理耗时。

### 深挖追问

- 如果消息处理成功但确认失败会怎样？
- 如何设计幂等键和补偿任务？
- 该方案在高并发或故障恢复时有什么边界？

### 实战场景/示例

Spring Boot 接口 RT 飙升时，不仅看业务代码，也要看 Tomcat 工作线程是否被慢 IO 占满。

### 易错点/总结

MQ 不是银弹。不要只说“加 MQ 解耦”，还要说明可靠投递、重复消费、顺序性、延迟、监控和补偿。

## 补充要点
### 核心概念

Tomcat 是 Servlet 容器和 Web 服务器，负责接收 HTTP 请求、解析协议、分发到 Servlet/JSP，并管理 Web 应用生命周期。核心组件包括 Server、Service、Connector、Engine、Host、Context、Wrapper。

### 面试官想考什么

- 是否理解 Connector 与 Container 的分工。
- 是否知道 Servlet 生命周期和请求处理链路。
- 是否能讲线程池、连接数、超时、类加载和调优。

### 标准回答

Tomcat 通过 Connector 监听端口并处理网络协议，请求进入后交给 Container，按 Engine → Host → Context → Wrapper 找到对应 Servlet，执行 Filter 链和 Servlet 方法。Servlet 生命周期包括 init、service、destroy。生产调优关注 maxThreads、acceptCount、connectionTimeout、keepAliveTimeout、JVM 参数、日志和应用自身慢接口。

### 深挖追问

- **Tomcat 和 Spring MVC 的关系？** Tomcat 提供 Servlet 容器，Spring MVC 的 DispatcherServlet 运行在容器里负责 MVC 分发。
- **线程数越大越好吗？** 不是，过大会增加上下文切换和内存消耗，瓶颈可能在数据库或下游。
- **BIO/NIO/APR 区别？** NIO 非阻塞更适合高并发连接，是常见默认选择。

### 示例/实战场景

线上接口 RT 升高时，先看 Tomcat 线程池是否打满、连接队列是否积压，再结合应用日志、数据库慢查询、GC 和下游接口定位。若线程池打满但 CPU 不高，常见是下游阻塞或连接池不足。

### 易错点/总结

- Tomcat 线程池满不一定是 Tomcat 问题，通常是业务处理慢。
- 连接数、线程数、数据库连接池要一起规划。
- Spring Boot 内嵌 Tomcat 仍然遵循这些容器机制。
