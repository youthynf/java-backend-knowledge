# Spring事件驱动模块实现

Spring事件驱动模块实现
一、概述
Spring事件驱动模型是Spring框架中的一个重要特性，它基于基于发布-订阅模式，使用了观察者模式，允许应用程序中的不同组件之间进行松耦合的通信。

二、模型核心组成：
·  事件（Event）：通过继承ApplicationEvent类，自定义事件类，封装事件相关的数据和方法，用于事件发生时进行事件数据填充和事件被监听时数据读取；
·  事件发布者（Publisher）：负责发布事件，当特定的事件发生时，事件发布者会创建事件对象并将其发布出去。Spring内置提供了ApplicationEventPublisher接口，通过publishEvent(event)方法来发布事件；
·  事件监听器（Listener）：通过实现ApplicationListener接口或使用方法注解@EventListener方式，监听感兴趣的事件。当事件发布后，Spring会检测所有注册的监听器，并将事件发送给对该事件感兴趣的监听器。

三、示例代码：用户注册事件
创建事件类

import org.springframework.context.ApplicationEvent;

public class UserRegisteredEvent extends ApplicationEvent {
   private final String username;

   public UserRegisteredEvent(Object source, String username) {
       super(source);
       this.username = username;
   }

   public String getUsername() {
       return username;
   }
}

创建事件监听器
·  实现ApplicationListener接口方式：

import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

@Component
public class UserRegisteredListener implements ApplicationListener<UserRegisteredEvent> {

   @Override
   public void onApplicationEvent(UserRegisteredEvent event) {
       System.out.println("User registered: " + event.getUsername());
       // 执行具体的业务逻辑，例如发送欢迎邮件
   }
}

·  使用@EventListener注解方式：

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class WelcomeEmailListener {

   @EventListener
   public void handleUserRegisteredEvent(UserRegisteredEvent event) {
       System.out.println("Sending welcome email to: " + event.getUsername());
   }
}

发布事件

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

@Service
public class UserService {
   @Autowired
   private ApplicationEventPublisher eventPublisher;

   public void registerUser(String username) {
       // 模拟用户注册逻辑
       System.out.println("Registering user: " + username);

       // 发布事件
       UserRegisteredEvent event = new UserRegisteredEvent(this, username);
       eventPublisher.publishEvent(event);
   }
}

置和运行应用

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class EventDemoApplication implements CommandLineRunner {

   @Autowired
   private UserService userService;

   public static void main(String[] args) {
       SpringApplication.run(EventDemoApplication.class, args);
   }

   @Override
   public void run(String... args) throws Exception {
       userService.registerUser("john_doe");
   }
}
