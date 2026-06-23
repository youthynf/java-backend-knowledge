# 单例模式

## 核心概念

单例模式保证一个类在 JVM 进程内只有一个实例，并提供全局访问点。常见实现包括饿汉式、懒汉式、双重检查锁、静态内部类和枚举。

## 面试官想考什么

- 是否知道线程安全实现方式；
- 是否理解双重检查锁为什么需要 `volatile`；
- 是否知道反射、序列化可能破坏单例；
- 是否能区分 Spring 单例 Bean 和设计模式单例。

## 标准回答

> 单例模式适合无状态或共享资源类，例如配置、工具类、连接管理器等。实现时要考虑线程安全，推荐静态内部类或枚举方式。双重检查锁中实例字段需要 `volatile`，防止指令重排导致其他线程看到未初始化完成的对象。Spring 默认单例 Bean 是容器级单例，不一定等同于整个 JVM 级单例。

## 示例

```java
public class Singleton {
    private Singleton() {}

    private static class Holder {
        private static final Singleton INSTANCE = new Singleton();
    }

    public static Singleton getInstance() {
        return Holder.INSTANCE;
    }
}
```

## 深挖追问

### 单例一定安全吗？

不一定。如果单例对象内部持有可变状态，并被多个线程同时修改，就仍然会有并发安全问题。单例只保证实例数量，不保证方法线程安全。

## 易错点/总结

- 懒汉式不加锁会有并发问题；
- 双重检查锁没有 `volatile` 可能出问题；
- 单例持有全局状态会增加测试和维护成本；
- Spring 单例 Bean 默认是容器内单例。
