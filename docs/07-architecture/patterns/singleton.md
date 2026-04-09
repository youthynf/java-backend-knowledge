# 单例模式

> 保证一个类只有一个实例，并提供一个全局访问点

## 核心概念

### 为什么需要单例？

- **资源控制**：避免资源浪费（数据库连接池、线程池）
- **全局状态**：配置管理器、日志对象
- **协同工作**：唯一 ID 生成器、缓存管理器

### 实现要点

1. **私有构造器**：防止外部 new 创建
2. **静态实例**：持有唯一实例
3. **静态获取方法**：提供全局访问点
4. **线程安全**：多线程环境下保证唯一性

---

## 实现方式

### 1. 饿汉式（推荐）

类加载时就初始化，线程安全。

```java
public class Singleton {
    // 类加载时就初始化
    private static final Singleton INSTANCE = new Singleton();
    
    private Singleton() {
        // 防止反射破坏
        if (INSTANCE != null) {
            throw new IllegalStateException("单例已存在");
        }
    }
    
    public static Singleton getInstance() {
        return INSTANCE;
    }
}
```

**优点：**
- 实现简单
- 线程安全（JVM 保证）
- 没有锁开销

**缺点：**
- 类加载就初始化，可能造成资源浪费
- 无法延迟加载

**适用场景：**
- 单例对象占用资源小
- 确定一定会使用

---

### 2. 双重检查锁（DCL）

延迟加载 + 线程安全。

```java
public class Singleton {
    // volatile 防止指令重排序
    private static volatile Singleton instance;
    
    private Singleton() {}
    
    public static Singleton getInstance() {
        if (instance == null) {                    // 第一次检查（无锁）
            synchronized (Singleton.class) {
                if (instance == null) {            // 第二次检查（加锁）
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}
```

**为什么需要 volatile？**

`instance = new Singleton()` 不是原子操作，分三步：
1. 分配内存空间
2. 初始化对象
3. 引用指向内存

指令重排序可能导致 1→3→2，其他线程拿到未初始化的对象。

**volatile 的作用：**
- 禁止指令重排序
- 保证可见性

---

### 3. 静态内部类（推荐）

延迟加载 + 线程安全 + 无锁。

```java
public class Singleton {
    private Singleton() {}
    
    // 内部类延迟加载
    private static class Holder {
        private static final Singleton INSTANCE = new Singleton();
    }
    
    public static Singleton getInstance() {
        return Holder.INSTANCE;
    }
}
```

**原理：**
- JVM 保证类加载线程安全
- 内部类只有在调用 `getInstance()` 时才加载
- 结合了饿汉式的线程安全和懒汉式的延迟加载

**优点：**
- 延迟加载
- 线程安全
- 无锁性能高
- 实现简洁

---

### 4. 枚举（最佳实践）

Effective Java 作者推荐的方式。

```java
public enum Singleton {
    INSTANCE;
    
    public void doSomething() {
        System.out.println("单例方法");
    }
}

// 使用
Singleton.INSTANCE.doSomething();
```

**优点：**
- 线程安全（枚举类天然单例）
- 防止反射破坏单例
- 防止反序列化破坏单例
- 代码最简洁

**为什么枚举能防止反射？**

枚举类的构造器是特殊的，反射调用会抛异常。

---

## 破坏单例的方式

### 1. 反射破坏

```java
Constructor<Singleton> constructor = Singleton.class.getDeclaredConstructor();
constructor.setAccessible(true);
Singleton instance1 = constructor.newInstance();
Singleton instance2 = constructor.newInstance();
// instance1 != instance2，单例被破坏
```

**解决方案：**

```java
private Singleton() {
    if (INSTANCE != null) {
        throw new IllegalStateException("单例已存在，禁止反射创建");
    }
}
```

**枚举天然防止反射：**

```java
Constructor<Singleton> constructor = Singleton.class.getDeclaredConstructor();
// 抛出 NoSuchMethodException，枚举没有普通构造器
```

---

### 2. 反序列化破坏

```java
// 序列化
ObjectOutputStream oos = new ObjectOutputStream(new FileOutputStream("singleton.obj"));
oos.writeObject(Singleton.getInstance());

// 反序列化
ObjectInputStream ois = new ObjectInputStream(new FileInputStream("singleton.obj"));
Singleton instance1 = (Singleton) ois.readObject();
Singleton instance2 = Singleton.getInstance();
// instance1 != instance2，单例被破坏
```

**解决方案：**

```java
public class Singleton implements Serializable {
    // 返回已存在的实例
    protected Object readResolve() {
        return getInstance();
    }
}
```

**枚举天然防止反序列化：**

枚举的反序列化特殊处理，JVM 保证返回同一个实例。

---

### 3. 克隆破坏

```java
public class Singleton implements Cloneable {
    @Override
    protected Object clone() throws CloneNotSupportedException {
        return super.clone();  // 创建新实例，破坏单例
    }
}
```

**解决方案：**

```java
@Override
protected Object clone() throws CloneNotSupportedException {
    return getInstance();  // 返回单例实例
}

// 或者不实现 Cloneable 接口
```

---

## 面试高频问题

### Q1: 单例模式的应用场景？

| 场景 | 说明 |
|------|------|
| 数据库连接池 | 资源复用，避免频繁创建连接 |
| 配置管理器 | 全局配置，统一管理 |
| 日志对象 | 统一日志记录，避免冲突 |
| 线程池 | 资源复用，提高性能 |
| Spring Bean | 默认单例，减少创建开销 |
| 缓存管理器 | 统一缓存访问入口 |

---

### Q2: 饿汉式 vs 懒汉式？

| 维度 | 饿汉式 | 懒汉式 |
|------|--------|--------|
| 初始化时机 | 类加载时 | 首次使用时 |
| 线程安全 | 天然安全 | 需要同步处理 |
| 性能 | 无锁开销 | 可能有锁开销 |
| 资源利用 | 可能浪费 | 按需加载 |

---

### Q3: Spring Bean 为什么默认单例？

1. **性能优化**：减少对象创建开销
2. **内存节省**：减少对象数量
3. **线程安全**：无状态 Bean 天然线程安全
4. **一致性**：全局共享同一状态

**注意：** 有状态 Bean 不应设为单例！

```java
// ❌ 有状态 Bean 不应为单例
@Component
@Scope("singleton")  // 默认
public class UserContext {
    private String userId;  // 线程不安全！
}

// ✅ 使用原型作用域
@Component
@Scope("prototype")
public class UserContext {
    private String userId;
}

// ✅ 或使用 ThreadLocal
@Component
public class UserContext {
    private static final ThreadLocal<String> userId = new ThreadLocal<>();
}
```

---

### Q4: 如何选择单例实现方式？

| 实现方式 | 适用场景 |
|---------|---------|
| 饿汉式 | 单例对象小、确定会使用 |
| 双重检查锁 | 延迟加载、高并发 |
| 静态内部类 | 延迟加载、推荐使用 |
| 枚举 | 最佳实践、防止破坏 |

**推荐优先级：枚举 > 静态内部类 > 饿汉式 > 双重检查锁**

---

## 代码示例

### 完整的单例实现（防止各种破坏）

```java
public final class Singleton implements Serializable {
    // volatile 防止指令重排序
    private static volatile Singleton instance;
    
    private Singleton() {
        // 防止反射破坏
        if (instance != null) {
            throw new IllegalStateException("单例已存在");
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
    
    // 防止反序列化破坏
    private Object readResolve() {
        return getInstance();
    }
    
    // 防止克隆破坏
    @Override
    protected Object clone() throws CloneNotSupportedException {
        throw new CloneNotSupportedException("单例禁止克隆");
    }
}
```

---

## 参考资料

- [单例模式 - Refactoring Guru](https://refactoring.guru/design-patterns/singleton)
- [Effective Java - Joshua Bloch](https://book.douban.com/subject/30412517/)
- [深入理解单例模式 - 美团技术团队](https://tech.meituan.com/2018/11/15/java-singleton.html)

---

*最后更新: 2026-04-09*
