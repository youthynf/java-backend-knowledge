# 类加载机制与双亲委派

> 类加载是 JVM 将 .class 文件加载到内存并转化为运行时数据结构的过程。理解类加载机制是理解框架（如 Spring、Tomcat）的基础。

## 类加载生命周期

```
┌─────────────────────────────────────────────────────────────────┐
│                        类的生命周期                              │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────┤
│  加载     │  链接     │          │  初始化   │  使用    │  卸载   │
│  Loading  │ Linking  │          │Initialize│  Using   │Unloading│
│          ├──────────┤          │          │         │         │
│          │验证→准备→│          │          │         │         │
│          │解析      │          │          │         │         │
└──────────┴──────────┴──────────┴──────────┴─────────┴─────────┘
```

---

## 1. 加载（Loading）

JVM 需要完成三件事：

1. **通过类的全限定名获取二进制字节流**
2. **将字节流所代表的静态存储结构转化为方法区的运行时数据结构**
3. **在堆中生成该类的 java.lang.Class 对象**，作为方法区数据的访问入口

### 字节流来源（不限于文件）

| 来源 | 示例 |
|------|------|
| 文件系统 | 从 .class 文件读取 |
| JAR/WAR 包 | 从压缩包中读取 |
| 网络 | Applet 从远程加载 |
| 动态生成 | 动态代理（CGLIB）、JSP 编译 |
| 数据库 | 从数据库中读取字节码 |

---

## 2. 链接（Linking）

### 2.1 验证（Verification）

确保 Class 文件的字节流符合 JVM 规范，不会危害虚拟机安全。

| 验证项 | 内容 |
|--------|------|
| 文件格式验证 | 魔数 0xCAFEBABE、版本号、常量池 |
| 元数据验证 | 语义分析（是否有父类、是否继承了 final 类） |
| 字节码验证 | 数据流分析（确保程序语义合法） |
| 符号引用验证 | 引用的类/方法/字段是否存在、是否可访问 |

### 2.2 准备（Preparation）

- 为**类变量**（static）分配内存并设置**零值初始值**
- 注意：**不是代码中写的初始值**，而是类型的零值
- `final static` 修饰的常量在准备阶段就会被赋值为实际值

```java
public class PrepareDemo {
    static int a = 10;          // 准备阶段：a = 0；初始化阶段：a = 10
    static final int B = 20;    // 准备阶段：B = 20（final 常量直接赋值）
    static final String C = "hello"; // 准备阶段：C = "hello"（字面量常量）
}
```

| 类型 | 零值 |
|------|------|
| int | 0 |
| long | 0L |
| float | 0.0f |
| double | 0.0d |
| boolean | false |
| char | '\u0000' |
| reference | null |

### 2.3 解析（Resolution）

- 将常量池中的**符号引用**替换为**直接引用**
- 符号引用：字面量形式的类名/方法名/字段名
- 直接引用：直接指向目标的指针、句柄或偏移量

---

## 3. 初始化（Initialization）

- 执行类的 `<clinit>()` 方法（类构造器）
- `<clinit>()` 由编译器自动收集类中所有 **static 变量赋值**和 **static 块**合并产生
- **按源文件顺序执行**，后面的可以覆盖前面的赋值

```java
public class InitOrderDemo {
    static {
        num = 3;  // ✅ 可以赋值（合法的向前引用）
        // System.out.println(num); // ❌ 编译错误：非法向前引用
    }
    static int num = 1; // 最终 num = 1（覆盖了 static 块中的 3）
}
```

### 初始化触发条件（主动引用）

1. `new`、`getstatic`、`putstatic`、`invokestatic` 四条字节码指令
2. 使用 `java.lang.reflect` 包对类进行反射调用
3. 初始化一个类时，父类还未初始化，先触发父类初始化
4. JVM 启动时，用户指定的主类（含 main 方法的类）
5. JDK 7+ 的动态语言支持：MethodHandle 实例解析结果为 REF_getStatic 等句柄

### 不会触发初始化的情况（被动引用）

```java
// 1. 通过子类引用父类的静态字段，不会触发子类初始化
class Parent { static int value = 10; static { System.out.println("Parent init"); } }
class Child extends Parent { static { System.out.println("Child init"); } }
// Child.value → 只输出 "Parent init"

// 2. 通过数组定义引用类，不会触发初始化
// Child[] arr = new Child[10]; → 不会初始化 Child

// 3. 常量在编译期进入常量池，不会触发定义类的初始化
class ConstClass { 
    static final String HELLO = "hello"; 
    static { System.out.println("ConstClass init"); } 
}
// 引用 ConstClass.HELLO → 不会输出 "ConstClass init"
```

---

## 4. 双亲委派模型

### 类加载器层次

```
┌─────────────────────────────────────────────────┐
│            Bootstrap ClassLoader                 │
│   (启动类加载器，加载 rt.jar 等核心类库)          │
│   C++ 实现，Java 中表示为 null                    │
└──────────────────────┬──────────────────────────┘
                       │ extends
┌──────────────────────┴──────────────────────────┐
│          Extension ClassLoader                   │
│   (扩展类加载器，加载 ext 目录下的 jar)           │
│   JDK 9+ 改名 Platform ClassLoader              │
└──────────────────────┬──────────────────────────┘
                       │ extends
┌──────────────────────┴──────────────────────────┐
│           Application ClassLoader                │
│   (应用类加载器，加载 classpath 下的类)           │
│   也叫 System ClassLoader                        │
└──────────────────────┬──────────────────────────┘
                       │ extends
┌──────────────────────┴──────────────────────────┐
│          自定义 ClassLoader                      │
│   (如 Tomcat、Spring、热部署框架)                 │
└─────────────────────────────────────────────────┘
```

### 双亲委派流程

```
自定义 ClassLoader 收到加载请求
    │
    ↓ 委派给 Application ClassLoader
Application ClassLoader 收到请求
    │
    ↓ 委派给 Extension ClassLoader
Extension ClassLoader 收到请求
    │
    ↓ 委派给 Bootstrap ClassLoader
Bootstrap ClassLoader 尝试加载
    │
    ├── 成功 → 返回 Class 对象
    └── 失败 → 交给 Extension ClassLoader 尝试
                │
                ├── 成功 → 返回
                └── 失败 → 交给 Application ClassLoader
                            │
                            ├── 成功 → 返回
                            └── 失败 → 交给自定义 ClassLoader
                                        │
                                        ├── 成功 → 返回
                                        └── 失败 → ClassNotFoundException
```

### 双亲委派的好处

1. **保证类的唯一性**：同一个类只会被加载一次（由最顶层的加载器加载）
2. **保证安全性**：防止用户自定义的 `java.lang.Object` 替换核心类

```java
// 即使你自定义一个 java.lang.String，也不会被加载
package java.lang;
public class String {
    // 永远不会被使用，Bootstrap ClassLoader 会先加载 rt.jar 中的 String
}
```

---

## 5. 打破双亲委派

### 5.1 SPI 机制（线程上下文类加载器）

- JDBC 的 Driver 接口在 rt.jar（Bootstrap 加载），但实现类在 classpath（Application 加载）
- Bootstrap 无法向下看到 Application 加载的类
- 解决方案：使用 **Thread Context ClassLoader**

```java
// ServiceLoader 使用线程上下文类加载器加载 SPI 实现类
ServiceLoader<Driver> drivers = ServiceLoader.load(Driver.class);

// JDBC 4.0 自动加载驱动
// DriverManager 在 rt.jar 中，使用 Thread.currentThread().getContextClassLoader() 加载驱动
```

### 5.2 Tomcat 的类加载器

```
Bootstrap ClassLoader
    │
Extension ClassLoader
    │
Application ClassLoader
    │
Common ClassLoader（Tomcat 公共类库）
    │
    ├── Catalina ClassLoader（Tomcat 自身类）
    │
    ├── Shared ClassLoader（所有 WebApp 共享）
    │       │
    │       ├── WebApp1 ClassLoader（/webapps/app1/WEB-INF/）
    │       │       │
    │       │       └── Jsp ClassLoader（热加载 JSP）
    │       │
    │       └── WebApp2 ClassLoader（/webapps/app2/WEB-INF/）
    │
    └── ...
```

- 每个 WebApp 有独立的 ClassLoader，实现**类隔离**
- WebApp ClassLoader **先自己加载，再委派给父加载器**（反过来的双亲委派）
- 保证不同 Web 应用可以使用不同版本的同一个库

### 5.3 OSGi 热部署

- 每个模块（Bundle）有自己的 ClassLoader
- 模块间的依赖形成**网状结构**而非树状
- 可以实现模块的热替换

---

## 6. 自定义 ClassLoader

```java
public class CustomClassLoader extends ClassLoader {
    private String classPath;

    public CustomClassLoader(String classPath) {
        this.classPath = classPath;
    }

    @Override
    protected Class<?> findClass(String name) throws ClassNotFoundException {
        byte[] classData = loadClassData(name);
        if (classData == null) {
            throw new ClassNotFoundException(name);
        }
        return defineClass(name, classData, 0, classData.length);
    }

    private byte[] loadClassData(String name) {
        String path = classPath + "/" + name.replace('.', '/') + ".class";
        try (InputStream is = new FileInputStream(path);
             ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[1024];
            int len;
            while ((len = is.read(buffer)) != -1) {
                baos.write(buffer, 0, len);
            }
            return baos.toByteArray();
        } catch (IOException e) {
            return null;
        }
    }
}

// 使用
CustomClassLoader loader = new CustomClassLoader("/tmp/classes");
Class<?> clazz = loader.loadClass("com.example.MyClass");
Object obj = clazz.newInstance();
```

---

## 面试高频问题

### Q1: 什么是双亲委派？为什么需要？

> 双亲委派是类加载器的工作机制：收到加载请求时先委派给父加载器，父加载器无法加载时才自己加载。好处：1）保证核心类不被篡改（安全性）；2）保证类的唯一性（同一个类只加载一次）。

### Q2: 有哪些打破双亲委派的场景？

> 1）SPI 机制（JDBC/JNDI），使用线程上下文类加载器；2）Tomcat 每个 WebApp 独立类加载器，实现类隔离；3）OSGi 模块化，网状类加载；4）热部署/热加载，重新加载已修改的类。

### Q3: 类加载的过程？

> 加载→链接（验证→准备→解析）→初始化。加载是读取 .class 字节流；链接是校验、分配内存、解析引用；初始化是执行 <clinit>() 方法。

### Q4: 什么时候会触发类初始化？

> 5 种主动引用：new/反射/访问静态字段/调用静态方法/子类初始化时先初始化父类/main 方法所在类。被动引用不会触发：子类引用父类静态字段、数组定义引用类、编译期常量引用。

---

[← 返回 JVM 目录](README.md)

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **类加载机制与双亲委派**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

回答时先明确概念边界，再结合 JVM 或并发体系说明原理，最后落到实际使用、监控和排查方法。对于和 JDK 版本、垃圾收集器实现相关的内容，要说明适用前提。

## 深挖追问

- 这个知识点解决什么问题？不使用它会有什么风险？
- 它和相近概念的区别是什么？
- 生产环境中如何验证它是否生效或是否成为瓶颈？

## 实战场景/代码示例

结合业务压测、日志、监控和 JVM 工具验证结论，不建议只凭经验调整参数或下判断。

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

