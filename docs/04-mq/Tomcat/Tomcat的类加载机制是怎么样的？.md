# Tomcat的类加载机制是怎么样的？

Tomcat的类加载机制是怎么样的？
为什么Tomcat的类加载器也不是双亲委派模型
我们知道，Java默认的类加载机制是通过双亲委派模型来实现的，而Tomcat实现的方式又和双亲委派模型有所区别。原因在于一个Tomcat容器允许同时运行多个Web程序，每个Web程序依赖的类又必须是相互隔离的。因此，如果Tomcat使用双亲委派模式来加载类的话，将导致Web程序依赖的类变为共享的。
举个例子，假如我们有两个Web程序，一个依赖A库的1.0版本，另一个依赖A库的2.0版本，他们都使用了类xxx.xx.Clazz，其实现的逻辑因类库版本的不同而结构完全不同。那么这两个Web程序的其中一个必然因为加载的Clazz不是所使用的Clazz而出现问题！而这对于开发来说是非常致命的！
Tomcat类加载器
Bootstrap ClassLoader：启动类加载器
Extension ClassLoader：扩展类加载器
Application ClassLoader：应用程序类加载器
Common ClassLoader：Common类加载器
4.1 CataLina ClassLoader：CataLina类加载器
4.2 Shared ClassLoader：Shared类加载器→WebApp ClassLoader → JasperLoader

除了Jdk自带的类加载器，我们尤其关心Tomcat自身持有的类加载器。仔细一点我们很容易发现：Catalina类加载器和Shared类加载器，他们并不是父子关系，而是兄弟关系。为啥这样设计，我们得分析一下每个类加载器的用途：
Common类加载器：负责加载Tomcat和Web应用都复用的类
Catalina类加载器：负责加载Tomcat专用的类，而这些被加载的类在Web应用中将不可见；
Shared类加载器：负责加载Tomcat下所有的Web应用程序都复用的类，而这些被加载的类在Tomcat中将不可见；
WebApp类加载器：负责加载具体的某个Web应用程序所使用到的类，而这些被加载的类在Tomcat和其他的Web应用程序都将不可见；
Jsp类加载器：每个jsp页面一个类加载器，不同的jsp页面有不同的类加载器，方便实现jsp页面的热插拔；

同样的，我们可以看到通过ContextClassLoader（上下文类加载器）的setContextClassLoader来传入自己实现的类加载器。

<!-- 面试复习补充 -->

## 面试复习补充

### 核心概念

Tomcat 通过多级 ClassLoader 隔离容器类、共享类和 Web 应用类，避免不同 Web 应用之间依赖冲突。

### 面试官想考什么

面试官想考双亲委派、Tomcat 的 WebappClassLoader、应用隔离、热部署和 Jar 冲突排查。

### 标准回答

Tomcat 大体有 Bootstrap、System/Common、Webapp 等类加载器。每个 Web 应用有自己的 WebappClassLoader，优先加载 `/WEB-INF/classes` 和 `/WEB-INF/lib` 中的类，再处理委派关系，从而实现应用隔离。

### 深挖追问

- 如果消息处理成功但确认失败会怎样？
- 如何设计幂等键和补偿任务？
- 该方案在高并发或故障恢复时有什么边界？

### 实战场景/示例

两个 WAR 依赖不同版本的 Jackson，独立 WebappClassLoader 可以降低互相影响；公共 lib 放错位置则可能导致冲突扩大。

### 易错点/总结

MQ 不是银弹。不要只说“加 MQ 解耦”，还要说明可靠投递、重复消费、顺序性、延迟、监控和补偿。

