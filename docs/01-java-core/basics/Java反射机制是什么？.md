# Java反射机制是什么？

Java反射机制是什么？
一、概述
反射是 Java 语言的重要特性，它允许在运行时而非编译时，动态获取类的完整结构信息、动态创建对象、动态调用方法和属性、动态处理注解。
二、反射的基本操作
获取Class对象的三种方式

// 1. 通过类名.class
Class<String> stringClass = String.class;

// 2. 通过对象.getClass()
String str = "hello";
Class<?> strClass = str.getClass();

// 3. 通过Class.forName()
Class<?> clazz = Class.forName("java.lang.String");

获取类信息

Class<?> clazz = Class.forName("com.example.User");

// 获取类名
String className = clazz.getName();      // 全限定名
String simpleName = clazz.getSimpleName(); // 简单类名

// 获取修饰符
int modifiers = clazz.getModifiers();
String mod = Modifier.toString(modifiers);

// 获取包信息
Package pkg = clazz.getPackage();

操作字段

// 获取所有public字段（包括父类）
Field[] fields = clazz.getFields();

// 获取所有字段（不包括父类）
Field[] declaredFields = clazz.getDeclaredFields();

// 获取特定字段
Field nameField = clazz.getDeclaredField("name");

// 设置字段可访问（即使是private）
nameField.setAccessible(true);

// 读写字段值
User user = new User();
nameField.set(user, "张三");  // 设置值
Object value = nameField.get(user);  // 获取值

操作方法

// 获取所有public方法（包括父类）
Method[] methods = clazz.getMethods();

// 获取所有方法（不包括父类）
Method[] declaredMethods = clazz.getDeclaredMethods();

// 获取特定方法
Method setNameMethod = clazz.getDeclaredMethod("setName", String.class);

// 调用方法
User user = new User();
setNameMethod.invoke(user, "李四");

// 调用静态方法
Method staticMethod = clazz.getDeclaredMethod("staticMethod");
staticMethod.invoke(null);  // 静态方法传null

5.操作构造器

// 获取所有public构造器
Constructor<?>[] constructors = clazz.getConstructors();

// 获取所有构造器
Constructor<?>[] declaredConstructors = clazz.getDeclaredConstructors();

// 获取特定构造器
Constructor<?> constructor = clazz.getDeclaredConstructor(String.class, int.class);

// 创建实例
constructor.setAccessible(true);  // 如果是private构造器
Object instance = constructor.newInstance("王五", 25);

操作数组

// 创建数组
Object array = Array.newInstance(String.class, 10);

// 设置数组元素
Array.set(array, 0, "第一个元素");
Array.set(array, 1, "第二个元素");

// 获取数组元素
String element = (String) Array.get(array, 0);

泛型信息获取

Method method = MyClass.class.getMethod("getList");
Type returnType = method.getGenericReturnType();

if (returnType instanceof ParameterizedType) {
    ParameterizedType type = (ParameterizedType) returnType;
    Type[] typeArguments = type.getActualTypeArguments();
    for (Type typeArg : typeArguments) {
        System.out.println("泛型参数: " + typeArg);
    }
}

注解处理

// 获取类注解
Annotation[] annotations = clazz.getAnnotations();

// 获取方法注解
Method method = clazz.getDeclaredMethod("someMethod");
Annotation[] methodAnnotations = method.getAnnotations();

// 获取特定注解
MyAnnotation myAnno = method.getAnnotation(MyAnnotation.class);

动态代理

interface Hello {
    void sayHello();
}

class HelloImpl implements Hello {
    public void sayHello() {
        System.out.println("Hello World");
    }
}

// 创建代理
Hello proxy = (Hello) Proxy.newProxyInstance(
    Hello.class.getClassLoader(),
    new Class[]{Hello.class},
    (proxy1, method, args) -> {
        System.out.println("Before method");
        Object result = method.invoke(new HelloImpl(), args);
        System.out.println("After method");
        return result;
    }
);

proxy.sayHello();

三、反射优缺点
优点：
灵活性：运行时动态获取类信息；
扩展性：支持动态类加载和操作类；
框架基础：许多框架的核心实现机制；
缺点：
性能开销：反射操作比直接调用慢；
安全性：可能突破封装性；
代码复杂度：增加调试难度；
内部暴露：可能访问到未公开的 API，带来兼容性问题。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- 反射允许运行期获取类结构、创建对象、访问字段、调用方法。
- 核心类型有 Class、Constructor、Field、Method。

### 面试官想考什么
- 动态性、性能成本和封装破坏风险。
- Spring/ORM/序列化为何依赖反射。

### 标准回答
反射让程序可基于类名、注解或配置执行逻辑，提升框架扩展性；缺点是性能和可读性较差，可能绕过封装，生产中应缓存反射元数据。

### 深挖追问
- Class.forName 和 Xxx.class 区别？
- setAccessible 风险？
- 反射和动态代理关系？

### 实战场景/代码示例
```java
Class<?> c=Class.forName("com.example.User");
Object o=c.getDeclaredConstructor().newInstance();
Method m=c.getDeclaredMethod("setName",String.class);
m.invoke(o,"Tom");
```

### 易错点/总结
- 不要吞反射异常。
- 模块化环境下访问非公开成员可能受限制。

