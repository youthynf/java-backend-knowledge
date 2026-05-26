# Spring中的动态代理实现

Spring中的动态代理实现
一、概述
Java动态代理是指在程序运行时，动态创建代理对象的机制，在不修改原始代码的情况下对对方方法调用进行拦截和增强。
二、分类
Java动态代理主要分为两种类型，分别是基于接口的JDK自带的动态代理实现和基于类的代理使用CGLIB第三方库实现。
基于接口的代理（JDK动态代理）
这种代理要求对象至少实现一个接口，Java动态代理会在运行时动态创建一个实现了相同接口的代理类，然后在运行时动态生成该类的实例。这种代理核心是java.lang.reflect.Proxy类和InvocationHandler接口，每个动态代理类都必须实现InvocationHandler接口，并且实现invoke方法，然后使用Proxy类创建动态代理类实例，目标代理类调用方法时会被转发为有InvocationHandler接口的invoke方法来进行调用。

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;

// 定义一个接口
interface HelloService {
   void sayHello(String name);
}

// 接口的一个实现类
class HelloServiceImpl implements HelloService {
   @Override
   public void sayHello(String name) {
       System.out.println("Hello, " + name);
   }
}

// 自定义InvocationHandler
class DynamicProxyHandler implements InvocationHandler {
   private final Object target;

   public DynamicProxyHandler(Object target) {
       this.target = target;
   }

   @Override
   public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
       System.out.println("Before method: " + method.getName());
       Object result = method.invoke(target, args); // 调用目标对象的方法
       System.out.println("After method: " + method.getName());
       return result;
   }
}

// 测试动态代理
public class DynamicProxyExample {
   public static void main(String[] args) {
       // 创建目标对象
       HelloService target = new HelloServiceImpl();

       // 创建动态代理
       HelloService proxyInstance = (HelloService) Proxy.newProxyInstance(
               target.getClass().getClassLoader(),
               target.getClass().getInterfaces(),
               new DynamicProxyHandler(target)
       );

       // 使用代理对象
       proxyInstance.sayHello("World");
   }
}
代码关键点解析：
Proxy.newProxyInstance
•  创建动态代理对象。
•  需要提供目标类的类加载器、目标对象实现的接口集合，以及一个 InvocationHandler 实例。
InvocationHandler
•  定义方法调用时的行为，通过 invoke 方法拦截对目标方法的调用。
动态代理的作用
•  代理模式的实现，可以在方法调用前后添加自定义逻辑（如日志、权限校验、事务管理等）。
2. 基于类的代理（CGLIB动态代理）
CGLIB是一个第三方代码库，支持运行时动态生成目标类的子类作为代理类。核心是MethodInterceptor接口和Enhancer类，前者定义代理方法的拦截逻辑，而后者则是CGLIB提供的工具类，用来生成代理对象，通过回调的方式进行目标类方法调用的拦截处理。
添加CGLIB依赖：

<dependency>
   <groupId>cglib</groupId>
   <artifactId>cglib</artifactId>
   <version>3.3.0</version>
</dependency>
示例代码：

import net.sf.cglib.proxy.Enhancer;
import net.sf.cglib.proxy.MethodInterceptor;
import net.sf.cglib.proxy.MethodProxy;

import java.lang.reflect.Method;

// 目标类（没有实现接口）
class HelloService {
   public void sayHello(String name) {
       System.out.println("Hello, " + name);
   }
}

// 自定义 MethodInterceptor（方法拦截器）
class HelloServiceInterceptor implements MethodInterceptor {
   @Override
   public Object intercept(Object obj, Method method, Object[] args, MethodProxy proxy) throws Throwable {
       System.out.println("Before method: " + method.getName());
       Object result = proxy.invokeSuper(obj, args); // 调用目标方法
       System.out.println("After method: " + method.getName());
       return result;
   }
}

public class CglibProxyExample {
   public static void main(String[] args) {
       // 使用 Enhancer 创建代理对象
       Enhancer enhancer = new Enhancer();
       enhancer.setSuperclass(HelloService.class); // 设置目标类
       enhancer.setCallback(new HelloServiceInterceptor()); // 设置拦截器

       // 创建代理实例
       HelloService proxy = (HelloService) enhancer.create();

       // 调用方法
       proxy.sayHello("World");
   }
}
代码关键点解析：
Enhancer 类
•  CGLIB 提供的工具类，用于生成代理对象。
•  setSuperclass() 指定要代理的目标类。
•  setCallback() 设置回调，用于拦截方法调用。
MethodInterceptor 接口
•  定义代理方法的拦截逻辑，通过 intercept 方法实现：
•  obj：代理对象。
•  method：被调用的方法。
•  args：方法的参数。
•  proxy：方法代理对象，用于调用原始方法。
与 JDK 动态代理的区别
•  JDK 动态代理要求目标类实现接口。
•  CGLIB 通过继承目标类的方式实现代理，不需要接口，但无法代理 final 方法和类。
