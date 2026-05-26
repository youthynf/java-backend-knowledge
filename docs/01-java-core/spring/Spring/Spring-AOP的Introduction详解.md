# Spring AOP的Introduction详解

Spring AOP的Introduction详解
一、概述
在 Java 中，Introduction是Spring AOP的一部分，通过Introduction Advice实现动态为现有的类添加接口功能。这是一种非常强大的工具，可以让你在不修改类代码的情况下增强其行为，比如是一个代理类同时代理多个对象。

二、代码示例
以下是使用Introduction的简单示例，通过Spring AOP向一个类动态添加新接口的实现。
定义要引入的新接口

public interface Monitorable {
   void setMonitoringActive(boolean active);
}

创建目标类

public class OrderService {
   public void placeOrder(String orderId) {
       System.out.println("Placing order: " + orderId);
       try {
           Thread.sleep(1000); // 模拟耗时操作
       } catch (InterruptedException e) {
           Thread.currentThread().interrupt();
       }
       System.out.println("Order placed: " + orderId);
   }
}

创建Introduction Advice实现
实现IntroductionInterceptor，动态为目标类添加Monitorable接口。

import org.aopalliance.intercept.MethodInterceptor;
import org.aopalliance.intercept.MethodInvocation;
import org.springframework.aop.support.DelegatingIntroductionInterceptor;

public class MonitoringIntroductionAdvice extends DelegatingIntroductionInterceptor implements Monitorable {
   private boolean monitoringActive = false;

   @Override
   public void setMonitoringActive(boolean active) {
       this.monitoringActive = active;
   }

   @Override
   public Object invoke(MethodInvocation invocation) throws Throwable {
       if (monitoringActive) {
           long startTime = System.currentTimeMillis();
           try {
               return super.invoke(invocation);
           } finally {
               long endTime = System.currentTimeMillis();
               System.out.println("Execution time: " + (endTime - startTime) + "ms");
           }
       } else {
           return super.invoke(invocation);
       }
   }
}

配置 AOP 代理
通过 Spring AOP 配置代理对象，使用 ProxyFactory。

import org.springframework.aop.framework.ProxyFactory;

public class Main {
   public static void main(String[] args) {
       // 创建目标对象
       OrderService target = new OrderService();
       // 创建代理工厂
       ProxyFactory proxyFactory = new ProxyFactory(target);
       // 设置需要引入的接口
       proxyFactory.setInterfaces(Monitorable.class); 
       // 添加 Introduction Advice
       proxyFactory.addAdvice(new MonitoringIntroductionAdvice());
       // 获取代理对象
       OrderService proxy = (OrderService) proxyFactory.getProxy();
       Monitorable monitorable = (Monitorable) proxy;
       // 默认监控关闭
       proxy.placeOrder("12345");
       // 开启监控
       monitorable.setMonitoringActive(true);
       proxy.placeOrder("12345");
   }
}

三、关键点
Introduction 是什么
Introduction 是一种 AOP 增强类型，允许为目标类动态引入新的接口实现。
DelegatingIntroductionInterceptor
这是一个 Spring 提供的便捷类，用于简化Introduction Advice的实现。
目标类无需实现接口
动态代理会在运行时为目标类添加新接口，而目标类本身不需要显式实现这些接口。
配置方式灵活
·  编程式：如上例所示，使用ProxyFactory配置代理。
·  声明式：可以通过Spring配置文件或注解配置AOP。

四、优点
·  通过动态代理为现有类添加功能，避免代码入侵。
·  增强功能与业务逻辑解耦，增强了系统的灵活性和可维护性。
·  这种机制在Spring中被广泛使用，例如为Bean动态添加事务支持或安全功能。
