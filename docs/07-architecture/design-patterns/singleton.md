# 单例模式 (Singleton)

## 核心概念

确保一个类只有一个实例，并提供一个全局访问点。

### 适用场景

- 配置管理器
- 日志记录器
- 数据库连接池
- 线程池
- 缓存

---

## 实现方式

### 1. 饿汉式（推荐）

```java
public class Singleton {
    // 类加载时就创建实例
    private static final Singleton INSTANCE = new Singleton();
    
    private Singleton() {}
    
    public static Singleton getInstance() {
        return INSTANCE;
    }
}
```

**优点**：实现简单、线程安全（类加载时初始化）  
**缺点**：类加载时就创建，可能造成资源浪费

### 2. 双重检查锁（懒汉式优化）

```java
public class Singleton {
    private static volatile Singleton instance;
    
    private Singleton() {}
    
    public static Singleton getInstance() {
        if (instance == null) {  // 第一次检查
            synchronized (Singleton.class) {
                if (instance == null) {  // 第二次检查
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}
```

**注意**：必须使用 `volatile` 防止指令重排

### 3. 静态内部类（推荐）

```java
public class Singleton {
    private Singleton() {}
    
    // 静态内部类，类加载时不会初始化
    private static class Holder {
        private static final Singleton INSTANCE = new Singleton();
    }
    
    public static Singleton getInstance() {
        return Holder.INSTANCE;
    }
}
```

**优点**：懒加载、线程安全、实现简洁

### 4. 枚举（最佳实践）

```java
public enum Singleton {
    INSTANCE;
    
    public void doSomething() {
        System.out.println("Singleton method");
    }
}
```

**优点**：
- 线程安全
- 防止反射攻击
- 防止序列化破坏单例

---

## 面试高频问题

### Q1: 单例模式如何防止反射攻击？

```java
public class Singleton {
    private static volatile Singleton instance;
    
    private Singleton() {
        // 防止反射创建实例
        if (instance != null) {
            throw new RuntimeException("单例实例已存在，请使用 getInstance() 方法获取");
        }
    }
    
    public static Singleton getInstance() {
        if (instance == null) {
            synchronized (Singleton.class) {
                if (instance == null) {
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}
```

**推荐**：使用枚举实现，天然防止反射攻击

### Q2: 为什么双重检查锁需要 volatile？

```java
instance = new Singleton();
```

这行代码不是原子操作，分为三步：
1. 分配内存空间
2. 初始化对象
3. 将 instance 指向分配的内存地址

**指令重排**可能导致 2 和 3 互换顺序，导致其他线程获取到未初始化的对象。

### Q3: 单例如何防止序列化破坏？

```java
public class Singleton implements Serializable {
    private static final Singleton INSTANCE = new Singleton();
    
    private Singleton() {}
    
    // 防止反序列化创建新实例
    protected Object readResolve() {
        return INSTANCE;
    }
    
    public static Singleton getInstance() {
        return INSTANCE;
    }
}
```

---

## 实战场景

### Spring Bean 单例

```java
@Service
public class UserService {
    // Spring 默认单例，整个应用共享一个实例
    
    // 如果有成员变量，需要注意线程安全问题
    private final Object lock = new Object();
    
    // 推荐：使用无状态设计
    public User findById(Long id) {
        // 无成员变量，线程安全
    }
}
```

### 数据库连接池

```java
public class ConnectionPool {
    private static volatile ConnectionPool instance;
    private final DataSource dataSource;
    
    private ConnectionPool() {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:mysql://localhost:3306/mydb");
        config.setUsername("root");
        config.setPassword("password");
        this.dataSource = new HikariDataSource(config);
    }
    
    public static ConnectionPool getInstance() {
        if (instance == null) {
            synchronized (ConnectionPool.class) {
                if (instance == null) {
                    instance = new ConnectionPool();
                }
            }
        }
        return instance;
    }
    
    public Connection getConnection() throws SQLException {
        return dataSource.getConnection();
    }
}
```

---

## 延伸思考

1. **单例 vs 静态工具类** 什么时候用哪个？
2. **Spring 单例 Bean 的线程安全问题** 如何解决？
3. **分布式环境下如何实现单例？**（分布式锁、数据库）

---

## 参考资料

- [Effective Java - 单例模式](https://www.oreilly.com/library/view/effective-java/9780134686097/)
- [设计模式：可复用面向对象软件的基础](https://www.oreilly.com/library/view/design-patterns-elements/0201633612/)

---

*最后更新: 2026-04-09*
