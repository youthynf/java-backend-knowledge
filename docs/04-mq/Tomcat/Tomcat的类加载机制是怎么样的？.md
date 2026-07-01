# Tomcat 的类加载机制是怎么样的

## 核心概念

Java 默认的类加载机制通过双亲委派模型实现：类加载请求先委派给父加载器，父加载器找不到再由当前加载器加载。这样可以避免核心类被篡改（核心类总是由 Bootstrap 加载），也避免重复加载。

Tomcat 实现的类加载机制和双亲委派模型有区别。**原因是 Tomcat 容器要同时运行多个 Web 程序，每个 Web 程序依赖的类必须相互隔离。** 如果 Tomcat 完全遵循双亲委派，所有 Web 程序的依赖类会变成共享的——两个 Web 程序分别依赖同一库的不同版本（如 Jackson 1.0 和 2.0），类全限定名相同但实现不同，必然有一个 Web 程序加载到错误的版本而崩溃。这在多应用部署场景下是致命的。

## 标准回答

Tomcat 通过多级 ClassLoader 实现容器类、共享类和 Web 应用类的隔离。每个 Web 应用有独立的 WebappClassLoader，**优先加载 `/WEB-INF/classes` 和 `/WEB-INF/lib` 中的类**，再委派给父加载器（部分基础类如 JDK 核心类仍优先父加载）。这样不同 Web 应用可以使用不同版本的同名依赖，互不影响；应用卸载时释放对应类加载器，实现热部署。Tomcat 不是完全抛弃双亲委派，而是在 Web 应用层做了优先级调整。

## Tomcat 类加载器层次

```
Bootstrap ClassLoader（JDK 核心 rt.jar）
    ↑
Extension ClassLoader（ext 目录）
    ↑
Application ClassLoader（CLASSPATH）
    ↑
Common ClassLoader（catalina.properties 的 common.loader）
    ↑
┌───────────────────────────┐
│ Catalina ClassLoader      │  Shared ClassLoader
│ （Tomcat 专用类）          │  （所有 Web 应用共享类）
│                           │      ↑
│                           │  WebappClassLoader（每个 Web 应用一个）
│                           │      ↑
│                           │  JasperLoader（每个 JSP 一个）
└───────────────────────────┘
```

### 各类加载器职责

| 类加载器 | 加载范围 | 可见性 |
|----------|----------|--------|
| Bootstrap | JDK 核心（`rt.jar`、`jsse.jar` 等） | 全部可见 |
| Extension | `jre/lib/ext` 目录 | 全部可见 |
| Application | `CLASSPATH` 环境变量 | 全部可见 |
| Common | Tomcat 和 Web 应用都复用的类（`catalina.properties` 的 `common.loader`） | Tomcat 和所有 Web 应用可见 |
| Catalina | Tomcat 专用类（`server.loader`） | 仅 Tomcat 内部可见，Web 应用不可见 |
| Shared | 所有 Web 应用共享的类（`shared.loader`） | 所有 Web 应用可见，Tomcat 不可见 |
| WebappClassLoader | 单个 Web 应用的类（`/WEB-INF/classes`、`/WEB-INF/lib`） | 仅该 Web 应用可见 |
| JasperLoader | 单个 JSP 文件编译后的类 | 仅该 JSP 可见，热部署用 |

### Catalina 和 Shared 不是父子关系

注意 Catalina ClassLoader 和 Shared ClassLoader 不是父子关系，而是兄弟关系——它们都继承自 Common ClassLoader。这样设计是为了：

- **Catalina** 加载 Tomcat 内部类，对 Web 应用不可见（Web 应用不能直接调用 Tomcat 内部 API）。
- **Shared** 加载所有 Web 应用共享的类，对 Tomcat 内部不可见（Tomcat 不依赖 Web 应用的共享库）。

两者隔离，避免 Tomcat 内部类和 Web 应用类互相污染。

## WebappClassLoader 的委派逻辑

WebappClassLoader 打破了双亲委派，加载顺序：

1. **检查本地缓存**：是否已加载过该类。
2. **检查 JVM 缓存**：JavaSE 类（`javax.*`、`org.w3c.*` 等）委派给父加载器，避免核心类被 Web 应用覆盖。
3. **加载 Web 应用自己的类**：从 `/WEB-INF/classes` 和 `/WEB-INF/lib` 加载（这是打破双亲委派的关键）。
4. **委派给父加载器**：Web 应用找不到时再委派给 Common ClassLoader。

```java
// 简化的 WebappClassLoader.loadClass 逻辑
protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
    Class<?> clazz = null;
    // 1. 本地缓存
    clazz = findLoadedClass(name);
    if (clazz != null) return clazz;
    // 2. JavaSE 类委派给父加载器（防止核心类被覆盖）
    try {
        clazz = j2seClassLoader.loadClass(name);
        if (clazz != null) return clazz;
    } catch (ClassNotFoundException e) {
        // 忽略，继续向下
    }
    // 3. Web 应用自己的类（打破双亲委派）
    try {
        clazz = findClass(name);  // 从 WEB-INF/classes 和 WEB-INF/lib 加载
        if (clazz != null) return clazz;
    } catch (ClassNotFoundException e) {
        // 忽略，继续向下
    }
    // 4. 委派给父加载器
    clazz = super.loadClass(name, resolve);
    return clazz;
}
```

`<Loader delegate="true"/>` 可以让 WebappClassLoader 恢复双亲委派（先委派父加载器再加载 Web 应用类），但默认是 `false`。

## 为什么打破双亲委派

### 应用隔离

两个 Web 应用分别依赖 Jackson 1.0 和 2.0，类全限定名都是 `com.fasterxml.jackson.databind.ObjectMapper`。如果用双亲委派，先委派给 Common ClassLoader，谁先加载谁就占用，另一个应用只能用错误版本。WebappClassLoader 优先加载自身 WEB-INF 下的类，让每个应用独立加载自己的 Jackson 版本。

### 热部署

JSP 修改后重新编译，每个 JSP 对应一个 JasperLoader。JSP 文件变化时丢弃旧的 JasperLoader，创建新的 JasperLoader 加载新编译的类，实现热部署。Web 应用重新部署时丢弃旧的 WebappClassLoader，创建新的加载新版本类。

### 与 OSGi 类似

这种"每个模块独立类加载器"的思路和 OSGi 的 Bundle 类加载器类似，都是通过打破双亲委派实现模块隔离。区别是 Tomcat 是树形层次，OSGi 是网状结构（Bundle 间可声明依赖）。

## 代码示例

### 自定义类加载器隔离示例

```java
public class IsolationDemo {

    public static void main(String[] args) throws Exception {
        // 模拟两个 Web 应用各自的类加载器
        ClassLoader webApp1 = new URLClassLoader(
                new URL[]{new File("webapp1/WEB-INF/classes").toURI().toURL()},
                ClassLoader.getSystemClassLoader());
        ClassLoader webApp2 = new URLClassLoader(
                new URL[]{new File("webapp2/WEB-INF/classes").toURI().toURL()},
                ClassLoader.getSystemClassLoader());

        // 加载同名类，得到不同的 Class 对象
        Class<?> clazz1 = webApp1.loadClass("com.example.UserService");
        Class<?> clazz2 = webApp2.loadClass("com.example.UserService");

        System.out.println(clazz1 == clazz2);  // false，类隔离
        System.out.println(clazz1.getClassLoader());  // webApp1
        System.out.println(clazz2.getClassLoader());  // webApp2
    }
}
```

### 查看类加载器层次

```java
public class ClassLoaderHierarchy {

    public static void main(String[] args) {
        ClassLoader cl = String.class.getClassLoader();
        System.out.println("String: " + cl);  // null（Bootstrap 加载）

        cl = Tomcat.class.getClassLoader();
        System.out.println("Tomcat: " + cl);  // CatalinaClassLoader

        cl = MyClass.class.getClassLoader();
        System.out.println("WebApp class: " + cl);  // WebappClassLoader

        // 遍历父加载器链
        cl = MyClass.class.getClassLoader();
        while (cl != null) {
            System.out.println(cl);
            cl = cl.getParent();
        }
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 多 WAR 部署 | 每个 WAR 独立 WebappClassLoader | 不同版本依赖互不影响 |
| 公共库共享 | 放 Common/lib 让所有应用共享 | 谨慎，可能影响所有应用 |
| 热部署 | 重新部署时丢弃旧类加载器 | 注意内存泄漏 |
| Jar 冲突排查 | 查看实际加载路径 | 用 `-verbose:class` 或 arthas |
| JSP 热加载 | JasperLoader 重新编译 JSP | 生产关闭 development 模式 |

## 深挖追问

### 为什么要应用隔离？

多个 WAR 部署在同一 Tomcat 时，依赖版本可能不同。例如应用 A 用 Jackson 2.12，应用 B 用 Jackson 2.15。如果共享类加载器，先加载的版本会被所有应用使用，另一个应用可能因 API 不兼容而崩溃。每个 Web 应用独立 WebappClassLoader 让各应用加载自己的依赖版本，互不影响。

### 类冲突如何排查？

现象：`NoSuchMethodError`、`ClassNotFoundException`、`NoClassDefFoundError`，通常是不同版本的 Jar 冲突。排查方法：

- **Maven 依赖树**：`mvn dependency:tree | grep <artifactId>` 看版本。
- **实际加载路径**：JVM 启动加 `-verbose:class` 打印类加载来源。
- **Arthas**：`sc -d <ClassName>` 查看类加载器和 Jar 路径。
- **ClassLoader 层级**：在代码里打印 `clazz.getClassLoader()` 链。

### 热部署为什么容易内存泄漏？

老应用类加载器被外部引用无法 GC，导致类元数据无法卸载。常见泄漏源：

- **ThreadLocal**：线程池中的线程持有 ThreadLocal，ThreadLocal 持有 WebappClassLoader。
- **线程池未关闭**：应用卸载时线程池没 shutdown，线程持有 Runnable（来自 Web 应用）。
- **JDBC Driver 注册**：`DriverManager.registerDriver` 静态注册，未反注册。
- **静态字段引用**：第三方库静态字段持有 Web 应用类。

Tomcat 通过 `WebappClassLoaderBase` 的 `clearReferences` 方法主动清理这些引用，但仍可能漏网。

### Tomcat 完全抛弃双亲委派吗？

不是。Tomcat 在 Web 应用层做了优先级调整（先加载 WEB-INF 再委派父加载器），但 JDK 核心类（`java.*`、`javax.*`）仍优先委派给父加载器，防止核心类被覆盖。这是"应用隔离 + 核心类安全"的平衡。

### Common、Catalina、Shared 三个加载器怎么配置？

在 `catalina.properties` 中配置：

```properties
common.loader=${catalina.base}/lib,${catalina.base}/lib/*.jar,${catalina.home}/lib,${catalina.home}/lib/*.jar
server.loader=
shared.loader=
```

- `common.loader`：默认配置，加载 Tomcat 和 Web 应用都需要的库。
- `server.loader`：默认为空，配置后启用 Catalina ClassLoader（Tomcat 专用）。
- `shared.loader`：默认为空，配置后启用 Shared ClassLoader（所有 Web 应用共享）。

## 易错点

- **把业务 Jar 放到 Tomcat lib 目录**：变成所有应用共享，可能引发版本冲突。每个应用自己的依赖应该放 WEB-INF/lib。
- **完全抛弃双亲委派**：Tomcat 仍保留对 JDK 核心类的双亲委派，只是 Web 应用层调整优先级。
- **热部署不清理引用**：ThreadLocal、线程池、JDBC Driver 等未清理导致内存泄漏，多次热部署后 OOM。
- **shared.loader 配置不当**：把应用自己的依赖放 shared.loader 让所有应用共享，破坏隔离。
- **用 delegate=true 不理解后果**：恢复双亲委派后，公共库版本冲突会重新出现，应用隔离失效。

## 总结

Tomcat 类加载机制通过多级 ClassLoader 实现容器类、共享类和 Web 应用类的隔离。层次是 Bootstrap → Extension → Application → Common →（Catalina / Shared → WebappClassLoader → JasperLoader）。Catalina 和 Shared 是兄弟关系，都继承 Common，分别隔离 Tomcat 内部类和 Web 应用共享类。WebappClassLoader 打破双亲委派，优先加载 WEB-INF/classes 和 WEB-INF/lib，让每个 Web 应用独立加载自己的依赖版本，实现应用隔离和热部署。但 JDK 核心类仍优先委派父加载器，防止核心类被覆盖。热部署内存泄漏常与 ThreadLocal、线程池、JDBC Driver 未清理有关。Tomcat 不是完全抛弃双亲委派，而是在 Web 应用层做优先级调整。

## 参考资料

- [Tomcat Class Loader HOW-TO](https://tomcat.apache.org/tomcat-10.1-doc/class-loader-howto.html)
- [Tomcat WebappClassLoader Source](https://github.com/apache/tomcat/blob/main/java/org/apache/catalina/loader/WebappClassLoaderBase.java)
- [Java ClassLoader Documentation](https://docs.oracle.com/javase/8/docs/api/java/lang/ClassLoader.html)
