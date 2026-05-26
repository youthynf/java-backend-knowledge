# Spring Framework入门概要

Spring Framework入门概要
一、概述
Spring是一款Java企业级应用开发框架，它通过控制反转（IOC）和面向切面编程（AOP）等核心思想，极大简化了JavaEE开发。它主要有以下核心特点：
•  控制反转（IOC）：这是Spring的核心概念之一。传统的Java程序中，对象的创建和依赖关系是由代码自身控制。而在Spring IOC容器中，对象的创建和管理由容器负责。例如，一个Service层对象依赖于一个Dao层对象，在传统方式下需要在Service层代码中手动创建Dao对象；但在Spring中，只需要在配置文件或者通过注解告诉容器这种依赖关系，容器就会自动创建并注入Dao对象到Service对象中，这样代码的耦合度就降低了。
•  面向切面编程（AOP）：用于将一些通用的功能（如日志记录、事务管理等）从业务逻辑代码中分离出来。比如，在一个应用程序中有很多方法都需要记录日志，没有AOP时，需要在每个方法中添加日志记录代码；而使用Spring AOP，可以定义一个切面，在这个切面中定义日志记录的逻辑，然后将这个切面应用到需要记录日志的方法上，从而使得业务逻辑代码更加纯粹。
•  轻量级：相比一些传统的Java EE框架，Spring自身的开销比较小，不需要依赖像EJB容器那样庞大复杂的容器来运行应用程序，这使得它可以很方便地整合到各种Java应用中，从小型项目到大型企业级应用都适用。
•  模块性：Spring包含多个模块，像Spring Core、Spring AOP、Spring MVC等。这些模块可以单独使用，也可以根据项目需求组合使用。例如，只需要使用Spring IOC功能的项目，就可以只引入Spring Core模块；如果是做Web开发，还可以引入Spring MVC模块来构建Web应用。

二、Spring核心组件
Spring框架主要组成模块有：核心容器Core Container、数据访问/集成Data Access/Integration、Web相关模块、测试Testing、AOP/Aspects/Instrumentation/Message等。

Spring核心容器Core Container
Spring的核心容器是其他模块建立的基础，由Beans模块、Core核心模块、Context上下文模块、SPEL表达式语言模块组成，没有这些核心容器模块，也不可能有AOP、Web等上层的功能。
•  Beans模块：提供了框架的基础部分，包括控制反转和依赖注入；
•  Core核心模块：封装了Spring框架的底层部分，包括资源访问、类型转换和一些常用工具；
•  Context上下文模块：建立在Beans和Core模块的基础之上，继承Beans模块功能并添加资源绑定、数据验证、国际化、JavaEE支持、容器生命周期、事件传播等。ApplicationContext接口时上下文模块的焦点；
•  SPEL表达式语言模块：Spring框架内置的动态表达式引擎，提供了强大的表达式语言支持，支持访问和修改属性值，方法调用，访问及修改数组、容器和索引器，命名变量，支持算数和逻辑运算，支持从Spring容器获取Bean，也支持列表投影、选择和一般列表聚合等。

SPEL核心特性：
• 动态求值：运行时解析表达式，如：#{user.name}
• 类型转换：自动处理类型转换，如：#{1 + '2'} → 3 (自动转数字)
• 方法调用：支持对象方法调用，如：#{user.getAddress().city}
• 集合操作：支持集合过滤/投影，如：#{users.?[age > 18]}
• 正则匹配：支持正则表达式，如：#{user.email matches '[a-z]+@[a-z]+.com'}
• 安全访问：避免NPE的安全导航，如：#{user?.address?.city}

Data Acess/Integration数据访问/集成
数据访问／集成层包括 JDBC、ORM、OXM、JMS 和 Transactions 模块，具体介绍如下。
•  JDBC模块：提供了一个 JDBC 的样例模板，消除传统冗长的 JDBC 编码和必须的事务控制，而且能享受到 Spring 管理事务的好处。
•  ORM模块：提供与流行的“对象-关系”映射框架无缝集成的 API，包括 JPA、JDO、Hibernate 和 MyBatis 等。而且还可以使用 Spring 事务管理，无需额外控制事务。
•  OXM模块：提供了一个支持 Object /XML 映射的抽象层实现，如 JAXB、Castor、XMLBeans、JiBX 和 XStream。将 Java 对象映射成 XML 数据，或者将XML 数据映射成 Java 对象。
•  JMS模块：指 Java 消息服务，提供一套 “消息生产者、消息消费者”模板用于更加简单地使用 JMS，JMS 用于用于在两个应用程序之间，或分布式系统中发送消息，进行异步通信。
•  Transactions事务模块：支持编程和声明式事务管理。

Web模块
Spring 的 Web 层包括 Web、Servlet、WebSocket 和Webflux组件，具体介绍如下。
•  Web模块：提供了基本的 Web 开发集成特性，例如多文件上传功能、使用的 Servlet 监听器的IOC容器初始化以及Web应用上下文。
•  Servlet模块：提供了一个Spring MVC Web框架实现。Spring MVC框架提供了基于注解的请求资源注入、更简单的数据绑定、数据验证等及一套非常易用的 JSP 标签，完全无缝与Spring其他技术协作。
•  WebSocket模块：提供了简单的接口，用户只要实现响应的接口就可以快速的搭建 WebSocket Server，从而实现双向通讯。
•  Webflux模块：Spring WebFlux是Spring5.x中引入的新的响应式web框架。与Spring MVC不同，它不需要Servlet API，是完全异步且非阻塞的，并且通过Reactor项目实现了Reactive Streams规范。Spring WebFlux用于创建基于事件循环执行模型的完全异步且非阻塞的应用程序。
•  Portlet模块：提供了在Portlet环境中使用 MVC 实现，类似Web-Servlet模块的功能。Spring4.x中还有Portlet 模块，在Spring 5.x中移除。

AOP、Aspects、Instrumentation和Messaging
在Core Container之上是AOP、Aspects等模块，具体介绍如下：
•  AOP模块：提供了面向切面编程实现，提供比如日志记录、权限控制、性能统计等通用功能和业务逻辑分离的技术，并且能动态的把这些功能添加到需要的代码中，这样各司其职，降低业务逻辑和通用功能的耦合。
•  Aspects模块：提供与AspectJ的集成，是一个功能强大且成熟的面向切面编程（AOP）框架。
•  Instrumentation模块：提供了类工具的支持和类加载器的实现，可以在特定的应用服务器中使用。
•  messaging模块：Spring 4.0以后新增了消息（Spring-messaging）模块，该模块提供了对消息传递体系结构和协议的支持。
•  jcl模块： Spring 5.x中新增了日志框架集成的模块。

Test模块
Spring 支持 Junit 和 TestNG 测试框架，而且还额外提供了一些基于 Spring 的测试功能，比如在测试 Web 框架时，模拟 Http 请求的功能。包含Mock Objects, TestContext Framework, Spring MVC Test, WebTestClient。
