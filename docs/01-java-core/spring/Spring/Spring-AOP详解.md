# Spring AOP详解

Spring AOP详解
一、概述
Spring AOP是Spring框架中的一个重要模块，用于实现面向切面编程。所谓面向切面可以理解为一种“代码切片”技术，就像给程序打补丁或插播广告一样，实现将分散在各个业务逻辑代码中相同的代码通过横向切割的方式抽取到一个独立的模块中，如事务处理、日志管理、权限控制等，便于减少系统的重复代码，降低模块间的耦合度，并有利于未来的可拓展性和可维护性。

二、AOP术语
•  Aspect：切面，描述对一些业务逻辑横向切割之后需要做的处理，可以理解为是通知、引入和切入点的组合。
•  Join point：连接点，可以理解为需要织入横切关注点的位置，例如方法调用、异常处理等。在 Spring AOP 中仅支持方法级别的连接点；
•  Advice：通知，就是我们定义的一个切面中的横切逻辑，包括前置通知、后置通知、环绕通知等；
•  Pointcut：切点，用于匹配多个连接点，可以理解为连接点的集合，Spring支持perl5正则和AspectJ切入点模式匹配连接点；
•  Introduction：引介，让一个切面可以声明被通知的对象实现任何他们没有真正实现的额外的接口。例如可以让一个代理对象代理两个目标类。
•  Weaving：织入，将连接点、切点、通知以及切面，应用到程序中，在切点的引导下，将通知逻辑插入到目标方法上，使得我们的通知逻辑在方法调用时得以执行；
•  AOP proxy：AOP 代理，指在 AOP 实现框架中实现切面协议的对象。在 Spring AOP 中有两种代理分别是 JDK 动态代理和 CGLIB 动态代理；
•  Target object：目标对象，就是被代理的对象。

三、通知类型
•  前置通知（Before advice）：在某连接点之前执行的通知，但这个通知不能阻止连接点之前的执行流程（除非它抛出一个异常）。
•  后置通知（After returning advice）：在某连接点正常完成后执行的通知：例如，一个方法没有抛出任何异常，正常返回。
•  异常通知（After throwing advice）：在方法抛出异常退出时执行的通知。
•  最终通知（After (finally) advice）：当某连接点退出的时候执行的通知（不论是正常返回还是异常退出）。
•  环绕通知（Around Advice）：包围一个连接点的通知，如方法调用。这是最强大的一种通知类型。环绕通知可以在方法调用前后完成自定义的行为。它也会选择是否继续执行连接点或直接返回它自己的返回值或抛出异常来结束执行。

四、Spring AOP和AspectJ联系
Spring AOP与AspectJ是两个在Java面向切面编程（AOP）领域中常用的框架，它们既有联系又有区别。
实现原理
•  Spring AOP：是Spring框架中的一个重要组成部分，用于面向切面编程，基于代理模式实现，使用JDK动态代理或CGLIB代理。当目标对象实现接口时，使用JDK动态代理；若目标对象未实现接口，则使用CGLIB生成子类代理。在运行时通过代理对象拦截方法调用，根据配置的切面通知执行相应的增强逻辑。
•  AspectJ：一个Java实现的AOP框架，它能对Java代码进行AOP编译，让Java代码具有AspectJ的AOP功能。AspectJ是目前实现AOP框架中最成熟，功能最丰富的语言，而AspectJ与Java程序完全兼容，几乎是无缝关联。通过直接操作字节码来实现增强逻辑，不依赖代理对象。它可以在编译时、类加载时或对二进制字节码进行后期修改时，将切面逻辑织入目标类。

织入时机
•  Spring AOP：采用运行时织入，即在应用程序运行过程中，通过代理对象来实现切面植入；
•  AspectJ：支持编译时织入、类加载时织入和二进制织入。编译时织入是在源代码编译成字节码时，将切面逻辑织入目标类；类加载时织入是在类被加载到JVM时，通过特定的类加载器将切面逻辑织入目标类；二进制织入是对已经编译好的字节码进行后期修改，加入切面逻辑。

连接点支持
•  Spring AOP：主要支持方法级别的连接点，且不支持final方法、静态方法以及非Spring管理的对象的增强；
•  AspectJ：支持方法、构造方法、字段、异常等多种连接点，可以增强final方法、静态方法，也能对非Spring管理的对象进行增强；

性能表现
•  Spring AOP：由于使用代理，存在一定的性能开销，当切面数量较多时，性能可能会受到影响；
•  AspectJ：织入在编译或类加载时完成，运行时没有代理开销，性能相对更优。

使用复杂度
•  Spring AOP：在Spring应用中集成简单，易于使用，适合大多数常见的AOP需求；
•  AspectJ：功能强大，但相对复杂，需要了解更多的织入机制和配置；

适用场景：
•  Spring AOP：适用于大多数基于Spring的应用，常用于事务管理、日志记录、权限检查、缓存管理、性能监控等常见场景。
•  AspectJ：适用于需要深入字节码级别操作、对非Spring管理对象进行增强、跨库的数据访问、复杂的业务逻辑拦截等场景，也常用于底层框架开发。

联系
•  功能互补：Spring AOP可以满足大多数基于Spring应用的常见AOP需求，而AspectJ在功能上更强大，当Spring AOP无法满足需求时，可以结合AspectJ来实现更复杂的AOP功能。
•  可集成使用：在Spring应用中，可以同时使用Spring AOP和AspectJ。例如，可以使用Spring AOP来处理一些简单的AOP需求，同时使用AspectJ来处理一些复杂的需求，如对final方法、静态方法的增强等。

五、Spring AOP与AspectJ基本使用
Spring AOP
1.1 基于XML Schema配置方式
Spring提供了使用“aop”命名空间来定义一个切面：
•  定义目标类：

package tech.pdai.springframework.service;

/**
 * @author pdai
 */
public class AopDemoServiceImpl {

    public void doMethod1() {
        System.out.println("AopDemoServiceImpl.doMethod1()");
    }

    public String doMethod2() {
        System.out.println("AopDemoServiceImpl.doMethod2()");
        return "hello world";
    }

    public String doMethod3() throws Exception {
        System.out.println("AopDemoServiceImpl.doMethod3()");
        throw new Exception("some exception");
    }
}
•  定义切面类：

package tech.pdai.springframework.aspect;

import org.aspectj.lang.ProceedingJoinPoint;

/**
 * @author pdai
 */
public class LogAspect {

    /**
     * 环绕通知.
     *
     * @param pjp pjp
     * @return obj
     * @throws Throwable exception
     */
    public Object doAround(ProceedingJoinPoint pjp) throws Throwable {
        System.out.println("-----------------------");
        System.out.println("环绕通知: 进入方法");
        Object o = pjp.proceed();
        System.out.println("环绕通知: 退出方法");
        return o;
    }

    /**
     * 前置通知.
     */
    public void doBefore() {
        System.out.println("前置通知");
    }

    /**
     * 后置通知.
     *
     * @param result return val
     */
    public void doAfterReturning(String result) {
        System.out.println("后置通知, 返回值: " + result);
    }

    /**
     * 异常通知.
     *
     * @param e exception
     */
    public void doAfterThrowing(Exception e) {
        System.out.println("异常通知, 异常: " + e.getMessage());
    }

    /**
     * 最终通知.
     */
    public void doAfter() {
        System.out.println("最终通知");
    }

}
•  XML配置AOP：

<?xml version="1.0" encoding="UTF-8"?>
<beans xmlns="http://www.springframework.org/schema/beans"
       xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
       xmlns:aop="http://www.springframework.org/schema/aop"
       xmlns:context="http://www.springframework.org/schema/context"
       xsi:schemaLocation="http://www.springframework.org/schema/beans
 http://www.springframework.org/schema/beans/spring-beans.xsd
 http://www.springframework.org/schema/aop
 http://www.springframework.org/schema/aop/spring-aop.xsd
 http://www.springframework.org/schema/context
 http://www.springframework.org/schema/context/spring-context.xsd
">

    <context:component-scan base-package="tech.pdai.springframework" />

    <aop:aspectj-autoproxy/>

    <!-- 目标类 -->
    <bean id="demoService" class="tech.pdai.springframework.service.AopDemoServiceImpl">
        <!-- configure properties of bean here as normal -->
    </bean>

    <!-- 切面 -->
    <bean id="logAspect" class="tech.pdai.springframework.aspect.LogAspect">
        <!-- configure properties of aspect here as normal -->
    </bean>

    <aop:config>
        <!-- 配置切面 -->
        <aop:aspect ref="logAspect">
            <!-- 配置切入点 -->
            <aop:pointcut id="pointCutMethod" expression="execution(* tech.pdai.springframework.service.*.*(..))"/>
            <!-- 环绕通知 -->
            <aop:around method="doAround" pointcut-ref="pointCutMethod"/>
            <!-- 前置通知 -->
            <aop:before method="doBefore" pointcut-ref="pointCutMethod"/>
            <!-- 后置通知；returning属性：用于设置后置通知的第二个参数的名称，类型是Object -->
            <aop:after-returning method="doAfterReturning" pointcut-ref="pointCutMethod" returning="result"/>
            <!-- 异常通知：如果没有异常，将不会执行增强；throwing属性：用于设置通知第二个参数的的名称、类型-->
            <aop:after-throwing method="doAfterThrowing" pointcut-ref="pointCutMethod" throwing="e"/>
            <!-- 最终通知 -->
            <aop:after method="doAfter" pointcut-ref="pointCutMethod"/>
        </aop:aspect>
    </aop:config>

    <!-- more bean definitions for data access objects go here -->
</beans>
•  测试类：

/**
  * main interfaces.
  *
  * @param args args
  */
public static void main(String[] args) {
    // create and configure beans
    ApplicationContext context = new ClassPathXmlApplicationContext("aspects.xml");

    // retrieve configured instance
    AopDemoServiceImpl service = context.getBean("demoService", AopDemoServiceImpl.class);

    // use configured instance
    service.doMethod1();
    service.doMethod2();
    try {
        service.doMethod3();
    } catch (Exception e) {
        // e.printStackTrace();
    }
}

1.2 基于AspectJ注解方式
基于XML的声明式配置Spring AOP存在一些不足，需要在Spring配置文件中配置大量的代码信息，为了解决这个问题，Spring借鉴了AspectJ的切面，以提供注解驱动的AOP，本质上它依然还是Spring基于代理的AOP，只是编程模型与AspectJ完全一致，这种风格的好处就是不需要使用XML进行配置。使用@AspectJ注解即可完成切面声明。注意Spring只是使用了AspectJ的注解功能而已，并不是核心功能。Spring AOP的底层技术依然是JDK动态代理和CIGLIB代理。
•  定义接口：

/**
 * Jdk Proxy Service.
 *
 * @author pdai
 */
public interface IJdkProxyService {

    void doMethod1();

    String doMethod2();

    String doMethod3() throws Exception;
}
•  实现类：

/**
 * @author pdai
 */
@Service
public class JdkProxyDemoServiceImpl implements IJdkProxyService {

    @Override
    public void doMethod1() {
        System.out.println("JdkProxyServiceImpl.doMethod1()");
    }

    @Override
    public String doMethod2() {
        System.out.println("JdkProxyServiceImpl.doMethod2()");
        return "hello world";
    }

    @Override
    public String doMethod3() throws Exception {
        System.out.println("JdkProxyServiceImpl.doMethod3()");
        throw new Exception("some exception");
    }
}
•  定义切面：

package tech.pdai.springframework.aspect;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.After;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.AfterThrowing;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.annotation.Pointcut;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.stereotype.Component;

/**
 * @author pdai
 */
@EnableAspectJAutoProxy
@Component
@Aspect
public class LogAspect {

    /**
     * define point cut.
     */
    @Pointcut("execution(* tech.pdai.springframework.service.*.*(..))")
    private void pointCutMethod() {
    }


    /**
     * 环绕通知.
     *
     * @param pjp pjp
     * @return obj
     * @throws Throwable exception
     */
    @Around("pointCutMethod()")
    public Object doAround(ProceedingJoinPoint pjp) throws Throwable {
        System.out.println("-----------------------");
        System.out.println("环绕通知: 进入方法");
        Object o = pjp.proceed();
        System.out.println("环绕通知: 退出方法");
        return o;
    }

    /**
     * 前置通知.
     */
    @Before("pointCutMethod()")
    public void doBefore() {
        System.out.println("前置通知");
    }


    /**
     * 后置通知.
     *
     * @param result return val
     */
    @AfterReturning(pointcut = "pointCutMethod()", returning = "result")
    public void doAfterReturning(String result) {
        System.out.println("后置通知, 返回值: " + result);
    }

    /**
     * 异常通知.
     *
     * @param e exception
     */
    @AfterThrowing(pointcut = "pointCutMethod()", throwing = "e")
    public void doAfterThrowing(Exception e) {
        System.out.println("异常通知, 异常: " + e.getMessage());
    }

    /**
     * 最终通知.
     */
    @After("pointCutMethod()")
    public void doAfter() {
        System.out.println("最终通知");
    }

}

1.3 切入点的申明规则

// 任意公共方法的执行：
execution（public * *（..））

// 任何一个名字以“set”开始的方法的执行：
execution（* set*（..））

// AccountService接口定义的任意方法的执行：
execution（* com.xyz.service.AccountService.*（..））

// 在service包中定义的任意方法的执行：
execution（* com.xyz.service.*.*（..））

// 在service包或其子包中定义的任意方法的执行：
execution（* com.xyz.service..*.*（..））

// 在service包中的任意连接点（在Spring AOP中只是方法执行）：
within（com.xyz.service.*）

// 在service包或其子包中的任意连接点（在Spring AOP中只是方法执行）：
within（com.xyz.service..*）

// 实现了AccountService接口的代理对象的任意连接点 （在Spring AOP中只是方法执行）：
this（com.xyz.service.AccountService）// 'this'在绑定表单中更加常用

// 实现AccountService接口的目标对象的任意连接点 （在Spring AOP中只是方法执行）：
target（com.xyz.service.AccountService） // 'target'在绑定表单中更加常用

// 任何一个只接受一个参数，并且运行时所传入的参数是Serializable 接口的连接点（在Spring AOP中只是方法执行）
args（java.io.Serializable） // 'args'在绑定表单中更加常用; 请注意在例子中给出的切��点不同于 execution(* *(java.io.Serializable))： args版本只有在动态运行时候传入参数是Serializable时才匹配，而execution版本在方法签名中声明只有一个 Serializable类型的参数时候匹配。

// 目标对象中有一个 @Transactional 注解的任意连接点 （在Spring AOP中只是方法执行）
@target（org.springframework.transaction.annotation.Transactional）// '@target'在绑定表单中更加常用

// 任何一个目标对象声明的类型有一个 @Transactional 注解的连接点 （在Spring AOP中只是方法执行）：
@within（org.springframework.transaction.annotation.Transactional） // '@within'在绑定表单中更加常用

// 任何一个执行的方法有一个 @Transactional 注解的连接点 （在Spring AOP中只是方法执行）
@annotation（org.springframework.transaction.annotation.Transactional） // '@annotation'在绑定表单中更加常用

// 任何一个只接受一个参数，并且运行时所传入的参数类型具有@Classified 注解的连接点（在Spring AOP中只是方法执行）
@args（com.xyz.security.Classified） // '@args'在绑定表单中更加常用

// 任何一个在名为'tradeService'的Spring bean之上的连接点 （在Spring AOP中只是方法执行）
bean（tradeService）

// 任何一个在名字匹配通配符表达式'*Service'的Spring bean之上的连接点 （在Spring AOP中只是方法执行）
bean（*Service）

1.4 多种增强通知的顺序
1.4.1 执行顺序：
如果有多个通知想要在同一连接点运行，Spring AOP遵循跟AspectJ一样的优先规则来确定通知执行的顺序。 在“进入”连接点的情况下，最高优先级的通知会先执行（所以给定的两个前置通知中，优先级高的那个会先执行）。 在“退出”连接点的情况下，最高优先级的通知会最后执行。（所以给定的两个后置通知中， 优先级高的那个会第二个执行）。
1.4.2 优先级确定：
•  不同切面的两个通知需要在相同的连接点上执行：除非通过在切面类中实现org.springframework.core.Ordered接口或使用Order注解外，执行的顺序无法确定。Ordered.getValue()方法返回值或者注解值越小，表明优先级越高。
•  相同切面的两个通知需要在相同的连接点上执行：执行顺序未知，如果需要指定顺序，则建议拆分不同切面，如上处理。

AspectJ实现
2.1 AspectJ基本实现示例
•  引入maven依赖：

<dependencies>
    <!-- AspectJ 核心依赖 -->
    <dependency>
        <groupId>org.aspectj</groupId>
        <artifactId>aspectjrt</artifactId>
        <version>1.9.7</version>
    </dependency>
    <!-- AspectJ 编译器（用于编译时织入） -->
    <dependency>
        <groupId>org.aspectj</groupId>
        <artifactId>aspectjtools</artifactId>
        <version>1.9.7</version>
    </dependency>
</dependencies>
•  定义切面：

public aspect LoggingAspect {
    // 定义切点（Pointcut）：拦截所有Service类的方法
    pointcut serviceMethods(): execution(* com.example.service.*.*(..));

    // 前置通知（Before Advice）
    before(): serviceMethods() {
        System.out.println("[AspectJ] Before method: " + thisJoinPoint.getSignature().getName());
    }

    // 后置通知（After Advice）
    after(): serviceMethods() {
        System.out.println("[AspectJ] After method: " + thisJoinPoint.getSignature().getName());
    }

    // 环绕通知（Around Advice）
    Object around(): serviceMethods() {
        System.out.println("[AspectJ] Around (before): " + thisJoinPoint.getSignature().getName());
        Object result = proceed(); // 执行原方法
        System.out.println("[AspectJ] Around (after): " + thisJoinPoint.getSignature().getName());
        return result;
    }
}
•  目标类：

package com.example.service;

public class UserService {
    public void createUser(String name) {
        System.out.println("User created: " + name);
    }

    public void deleteUser(int id) {
        System.out.println("User deleted: " + id);
    }
}
•  主程序：

public class Main {
    public static void main(String[] args) {
        UserService userService = new UserService();
        userService.createUser("Alice");
        userService.deleteUser(1);
    }
}
•  编译并运行：
方式1：使用AspectJ编译器（ajc）

# 编译（使用 AspectJ 编译器）
ajc -cp aspectjrt.jar -outjar app.jar LoggingAspect.aj UserService.java Main.java

# 运行
java -cp app.jar;aspectjrt.jar Main
方式2：使用Maven插件（编译时织入）

<build>
    <plugins>
        <plugin>
            <groupId>org.codehaus.mojo</groupId>
            <artifactId>aspectj-maven-plugin</artifactId>
            <version>1.14.0</version>
            <executions>
                <execution>
                    <goals>
                        <goal>compile</goal>
                    </goals>
                </execution>
            </executions>
            <configuration>
                <complianceLevel>11</complianceLevel>
                <source>11</source>
                <target>11</target>
            </configuration>
        </plugin>
    </plugins>
</build>

运行：
mvn compile
mvn exec:java -Dexec.mainClass="Main"

2.2 AspectJ加载时织入（LTW）
适用于运行时动态织入，无需重新编译代码。
•  Maven依赖：

<dependency>
    <groupId>org.aspectj</groupId>
    <artifactId>aspectjweaver</artifactId>
    <version>1.9.7</version>
</dependency>
•  配置META-INF/aop.xml

<!DOCTYPE aspectj PUBLIC "-//AspectJ//DTD//EN" "http://www.eclipse.org/aspectj/dtd/aspectj.dtd">
<aspectj>
    <weaver>
        <!-- 指定要织入的包 -->
        <include within="com.example.service.*"/>
    </weaver>
    <aspects>
        <!-- 指定切面类 -->
        <aspect name="com.example.aspect.LoggingAspect"/>
    </aspects>
</aspectj>
•  启动JVM时启用AspectJ织入：

java -javaagent:aspectjweaver.jar -cp .;aspectjrt.jar Main

2.3 AspectJ支持的链接点
•  方法执行：execution(* com.example.service.*.*(..))
•  方法调用：call(* com.example.service.*.*(..))
•  构造器执行：execution(com.example.service.UserService.new(..))
•  字段访问：get(* com.example.service.UserService.name)
•  异常处理：handler(java.io.IOException)
•  静态初始化：staticinitialization(com.example.service.UserService)
