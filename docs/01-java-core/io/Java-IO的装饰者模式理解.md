# Java IO的装饰者模式理解

Java IO的装饰者模式理解
IO装饰者模式

以InputStream为例:
•  InputStream是抽象组件;
•  FileInputStream是InputStream的子类, 属于具体组件, 提供了字节流的输入操作;
•  FileInputStream属于抽象装饰者, 装饰者用于装饰组件, 为组件提供额外的功能. 例如BufferedInputStream为FileInputStream提供缓存功能.

实例化一个具有缓存功能的字节流对象时, 只需要在FileInputStream对象上再套一层BufferedInputStream对象即可:

FileInputStream fileInputStream = new FileInputStream(filePath);
BufferedInputStream bufferedInputStream = new BufferedInputStream(fileInputStream);

DataInputStream装饰者提供了对更多数据类型进行输入的操作, 比如int, double等基本类型.

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- Java I/O 按方向分输入/输出，按单位分字节流/字符流，按功能分节点流/处理流。
- 装饰者模式让 Buffered、Data、Object 等流组合增强能力。

### 面试官想考什么
- 字节流和字符流如何选择。
- 为什么关闭最外层包装流即可。

### 标准回答
处理二进制用 InputStream/OutputStream，处理文本用 Reader/Writer 并明确字符集。缓冲流减少系统调用，转换流负责字节到字符的编码转换。

### 深挖追问
- InputStreamReader 作用？
- BufferedInputStream 为什么快？
- 序列化流有什么风险？

### 实战场景/代码示例
```java
try(BufferedReader br=Files.newBufferedReader(path, StandardCharsets.UTF_8)){
  String line=br.readLine();
}
```

### 易错点/总结
- 文本 I/O 必须明确字符集。
- 流使用后要关闭，优先 try-with-resources。

