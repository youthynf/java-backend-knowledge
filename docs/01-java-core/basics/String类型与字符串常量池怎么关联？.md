# String类型与字符串常量池怎么关联？

String类型与字符串常量池怎么关联？
一、String不可变的实现原理
String被声明为final，因此它不可被继承；
String内部使用char数组存储数据，该数组被声明为final。这意味着value数组初始化之后就不能再引用其它数组。并且String内部没有改变value数组的方法，因此可以保证String不可变。

二、字符串常量池
通过使用str.intern()保证相同内容的字符串变量引用的是同一内存对象。其原理是通过xxx.intern()首先把引用的对象放到字符串常量池中，然后返回这个对象引用，如果字符串已经存在常量池中，直接返回该对象引用。

三、创建String的方式
String str = new String("aaa")：每次都会创建新的对象，如果"aaa"字面量不在字符串常量池中，则需要先创建字符串常量放入常量池，后在堆中创建字符串对象。因此该语句可能涉及2个对象的创建；
String str2 = str.intern()：将字符串放入字符串常量池中，并返回这个对象引用；
String str3 = “aaa”：使用双引号的形式创建字符串实例，会自动地将新建的对象放入字符串常量池中；

四、HotSpot中字符串常量池保存位置
方法区是JVM规范定义的逻辑区域，用于存放：
•  类信息（Class Matadata）：类名、父类、接口、访问修饰符、字段描述、方法描述等；
•  运行时常量池（Runtime Constant Pool）：类文件中的常量池表（符号引用、字面量等）；
•  静态变量（Static Variables）：static修饰的类变量；
•  JIT编译后的代码（Just-In-Time Complied Code）：热点代码的本地机器码缓存；
•  方法字节码（Method Code）：类方法的字节码指令。

JDK 1.6及之前：
在 JDK 1.2 到 1.6 版本，方法区是通过永久代（Permanent Generation，简称 PermGen）来实现的。永久代是堆内存的一部分，其大小需要在启动 JVM 时通过参数（如-XX:MaxPermSize）预先设定，若超出此设定值，就会抛出OutOfMemoryError: PermGen space异常。
JDK 1.7：
从 JDK 1.7 开始，永久代的部分内容被迁移到了堆中，但永久代依旧存在。其中，符号引用（Symbol References）被移到了 Native Heap，字符串常量池（String Intern Pool）和类的静态变量被移到了 Java 堆。
JDK 1.8及之后：
从 JDK 1.8 开始，永久代被彻底移除，取而代之的是元空间（Metaspace）。元空间使用本地内存（Native Memory），默认情况下，其大小仅受限于系统的可用内存，但可以通过参数（如-XX:MetaspaceSize和-XX:MaxMetaspaceSize）来限制。

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- String 不可变，字面量通常进入字符串常量池。
- intern 返回常量池中等值字符串引用；编译期常量拼接可折叠。

### 面试官想考什么
- new String、字面量、intern 的引用关系。
- 不可变性和常量池复用的意义。

### 标准回答
回答时先区分内容相等和引用相同，再区分编译期常量与运行期对象。String 不可变，适合做 Map key；大量动态拼接应使用 StringBuilder。

### 深挖追问
- StringBuilder/StringBuffer 区别？
- 为什么 String 可以缓存 hash？
- 循环拼接字符串有什么问题？

### 实战场景/代码示例
```java
String a="he"+"llo";
String b="hello";
System.out.println(a==b); // 通常 true
```

### 易错点/总结
- == 比引用，equals 比内容。
- intern 细节与 JDK 版本有关，避免绝对化。

