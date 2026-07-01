# Java IO 常见类有哪些

## 核心概念

`java.io` 包按操作对象划分可分成五大类：**文件操作（File）、字节流（InputStream/OutputStream）、字符流（Reader/Writer）、对象序列化（ObjectInputStream/ObjectOutputStream）、网络操作（Socket/ServerSocket/DatagramSocket）**。再加 JDK 1.4 引入的 NIO（`java.nio` 包下的 FileChannel、ByteBuffer 等），就是 Java I/O 的全景。

记住两条主线即可：所有"流"都是字节或字符方向上的管道，节点流对接数据源、处理流叠加功能；网络和文件是两个最常用的数据源。这一节的目标是给出一张常用类清单和它们各自的最小用法。

## 标准回答

一句话结论：Java IO 常用类分四块——`File` 表示文件元信息，`InputStream`/`OutputStream` 处理字节，`Reader`/`Writer` 处理字符，`Socket`/`ServerSocket` 处理网络；处理流（`BufferedXxx`、`DataXxx`、`PrintXxx`、`ObjectXxx`）通过装饰者模式叠加在节点流之上。

要点展开：

1. **File**：表示文件/目录路径，能 `create/delete/listFiles`，但不能读写内容。JDK 7+ 推荐 `Path` + `Files`。
2. **字节流**：`FileInputStream`、`ByteArrayOutputStream`、`BufferedInputStream`、`DataInputStream`、`ObjectInputStream`。
3. **字符流**：`InputStreamReader`（字节↔字符桥接）、`BufferedReader`（提供 `readLine`）、`PrintWriter`。
4. **序列化**：`ObjectOutputStream.writeObject` / `ObjectInputStream.readObject`，类要 `implements Serializable`，`transient` 字段不参与序列化。
5. **网络**：`ServerSocket.accept()` 阻塞等连接，`Socket` 提供 `getInputStream/getOutputStream`；UDP 用 `DatagramSocket` + `DatagramPacket`。
6. **NIO 补充**：`FileChannel`、`ByteBuffer`、`Files.copy()` 是 JDK 7+ 的更好替代。

## 常用类清单

### 文件相关

| 类 | 用途 | 备注 |
| --- | --- | --- |
| `File` | 文件/目录路径表示 | 只表示元信息，不能读写内容 |
| `Path` / `Paths` | JDK 7+ 路径抽象 | 推荐替代 `File` |
| `Files` | JDK 7+ 文件操作工具 | `copy/move/delete/readAllBytes` |

### 字节流（输入）

| 类 | 类型 | 用途 |
| --- | --- | --- |
| `InputStream`（抽象基类） | — | 所有字节输入流的父类 |
| `FileInputStream` | 节点流 | 从文件读字节 |
| `ByteArrayInputStream` | 节点流 | 从 byte[] 读 |
| `PipedInputStream` | 节点流 | 管道输入（跨线程） |
| `FilterInputStream` | 处理流基类 | 装饰者基类 |
| `BufferedInputStream` | 处理流 | 加 8KB 缓冲 |
| `DataInputStream` | 处理流 | 读基本类型 |
| `PushbackInputStream` | 处理流 | 支持回推 |
| `ObjectInputStream` | 处理流 | 反序列化对象 |

### 字节流（输出）

`OutputStream` 同构，常见：`FileOutputStream`、`ByteArrayOutputStream`、`BufferedOutputStream`、`DataOutputStream`、`PrintStream`（`System.out` 就是）、`ObjectOutputStream`。

### 字符流

| 类 | 类型 | 用途 |
| --- | --- | --- |
| `Reader` / `Writer`（抽象基类） | — | 所有字符流父类 |
| `InputStreamReader` / `OutputStreamWriter` | 桥接 | 字节↔字符转换，必须指定字符集 |
| `FileReader` / `FileWriter` | 便捷类 | JDK 11+ 才能指定字符集，老版本不推荐 |
| `BufferedReader` / `BufferedWriter` | 处理流 | 提供 `readLine` / `newLine` |
| `PrintWriter` | 处理流 | `print/println`，可指定 autoFlush |
| `CharArrayReader` / `StringReader` | 节点流 | 从 char[]/String 读 |

### 网络相关

| 类 | 用途 |
| --- | --- |
| `InetAddress` | 表示 IP 地址，`getByName/getByAddress` |
| `URL` | 统一资源定位符，可 `openStream` 读字节 |
| `ServerSocket` | TCP 服务端，`accept()` 阻塞等连接 |
| `Socket` | TCP 客户端/服务端连接，提供 IO 流 |
| `DatagramSocket` / `DatagramPacket` | UDP 收发 |

### NIO 关键类（`java.nio`）

| 类 | 用途 |
| --- | --- |
| `ByteBuffer` | 字节缓冲区，堆内或堆外 |
| `FileChannel` | 文件通道，支持 `transferTo` 零拷贝 |
| `SocketChannel` / `ServerSocketChannel` | TCP 通道，可非阻塞 |
| `Selector` | 多路复用器，监听多个 Channel 事件 |
| `Files` | 工具类，`copy/move/readAllBytes/write` |

## 代码示例

### 1. 递归列出目录下所有文件

```java
// File 表示文件元信息，不能读内容
public static void listAllFiles(File dir) {
    if (dir == null || !dir.exists()) return;
    if (dir.isFile()) {
        System.out.println(dir.getName());
        return;
    }
    File[] children = dir.listFiles();
    if (children == null) return;
    for (File child : children) {
        listAllFiles(child);
    }
}
```

### 2. 字节流复制文件

```java
public static void copyFile(String src, String dist) throws IOException {
    try (InputStream in = new BufferedInputStream(new FileInputStream(src));
         OutputStream out = new BufferedOutputStream(new FileOutputStream(dist))) {
        byte[] buf = new byte[8192];
        int n;
        // read 返回实际读取的字节数；-1 表示 EOF
        while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
        }
    }
}
```

### 3. 逐行读文本

```java
// 推荐写法：显式指定字符集
try (BufferedReader reader = new BufferedReader(
        new InputStreamReader(new FileInputStream("a.txt"), StandardCharsets.UTF_8))) {
    String line;
    while ((line = reader.readLine()) != null) {
        System.out.println(line);
    }
}
```

### 4. 对象序列化与 transient

```java
public class User implements Serializable {
    private static final long serialVersionUID = 1L;
    private String name;
    private transient String password;   // 不参与序列化
    // static 字段也不参与序列化（属于类，不属于对象状态）

    public User(String name, String password) {
        this.name = name;
        this.password = password;
    }

    @Override
    public String toString() {
        return "User{name='" + name + "', password='" + password + "'}";
    }
}

// 序列化
try (ObjectOutputStream out = new ObjectOutputStream(
        new FileOutputStream("user.dat"))) {
    out.writeObject(new User("Alice", "secret"));
}

// 反序列化
try (ObjectInputStream in = new ObjectInputStream(
        new FileInputStream("user.dat"))) {
    User user = (User) in.readObject();
    System.out.println(user);
    // 输出：User{name='Alice', password='null'}  ← transient 字段为 null
}
```

### 5. JDK 7+ NIO 一行复制

```java
// Files 工具类一行搞定，内部用 FileChannel.copy
Files.copy(Paths.get("src.txt"), Paths.get("dist.txt"),
        StandardCopyOption.REPLACE_EXISTING);
```

### 6. 从 URL 读字节流

```java
try (InputStream in = new URL("https://example.com").openStream();
     BufferedReader reader = new BufferedReader(
             new InputStreamReader(in, StandardCharsets.UTF_8))) {
    String line;
    while ((line = reader.readLine()) != null) {
        System.out.println(line);
    }
}
```

### 7. TCP Socket 通信（BIO）

```java
// 服务端
try (ServerSocket server = new ServerSocket(8080)) {
    while (true) {
        Socket client = server.accept();           // 阻塞等连接
        try (BufferedReader in = new BufferedReader(
                new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
             PrintWriter out = new PrintWriter(
                new OutputStreamWriter(client.getOutputStream(), StandardCharsets.UTF_8), true)) {
            String msg = in.readLine();
            out.println("echo: " + msg);
        }
    }
}

// 客户端
try (Socket socket = new Socket("127.0.0.1", 8080);
     PrintWriter out = new PrintWriter(
             new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8), true);
     BufferedReader in = new BufferedReader(
             new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8))) {
    out.println("hello");
    System.out.println(in.readLine());
}
```

## 实战场景

| 场景 | 推荐类 | 注意点 |
| --- | --- | --- |
| 文件复制 | `Files.copy` 或 `BufferedInputStream` | 大文件用 `FileChannel.transferTo` |
| 读 CSV/JSON | `BufferedReader(InputStreamReader(..., UTF_8))` | 必须 UTF-8，不要用 FileReader |
| 临时内存缓冲 | `ByteArrayOutputStream` | `toString(UTF_8)` 一次性转字符串 |
| 二进制协议 | `DataInputStream` / `DataOutputStream` | 注意字节序，Java 默认大端 |
| 对象持久化 | `ObjectOutputStream` | 类必须 `Serializable`，注意 `serialVersionUID` |
| TCP 服务 | `ServerSocket` / `Socket`（BIO） | 高并发用 NIO/Netty |
| UDP 收发 | `DatagramSocket` + `DatagramPacket` | 不保证可靠，需自己处理丢包 |
| 跨进程通信 | `PipedInputStream` + `PipedOutputStream` | 必须在不同线程，否则死锁 |

## 深挖追问

### `File` 和 `Path` 有什么区别？

`File` 是 JDK 1.0 的类，API 设计有缺陷：`delete` 失败只返回 boolean 不抛异常，没有符号链接支持，跨平台路径处理弱。`Path` 是 JDK 7 引入 NIO.2 时的替代，配合 `Files` 工具类提供完整异常信息、符号链接支持、文件属性访问。新代码优先用 `Path`/`Files`。

### `transient` 和 `static` 都不参与序列化，机制一样吗？

不一样。`static` 是类变量，不属于对象状态，所以序列化（保存对象状态）天然不会处理它。`transient` 是显式标记某个实例字段"不要序列化"，反序列化时该字段会被设为类型默认值（`null`/0/false）。`ArrayList` 的 `elementData` 就是 `transient`，因为数组有冗余空间，序列化只存实际元素，通过自定义 `writeObject/readObject` 实现。

### `read()` 返回 int 而不是 byte，为什么？

byte 是有符号的（-128~127），无法表达"读到末尾"这一语义。`read()` 返回 int（0~255 表示一个字节，-1 表示 EOF），既覆盖所有字节值又能用 -1 表示结束。

### `PrintStream` 的 `println` 为什么是同步的？

`PrintStream` 内部 `println` 用 `synchronized` 保证多线程输出不交叉。代价是高并发下性能差，所以日志库（SLF4J/Log4j）都自己实现异步写入。`System.out.println` 在生产代码里要避免。

### `Serializable` 是空接口，为什么实现它就能序列化？

它是标记接口（marker interface），本身没有方法。`ObjectOutputStream.writeObject` 在写入前会用 `instanceof Serializable` 检查，未实现则抛 `NotSerializableException`。这种设计是历史遗留，现代代码更推荐用 JSON/Protobuf 等显式序列化方案。

### `Files.copy` 内部是怎么实现的？

JDK 9+ 的 `Files.copy` 在 Linux 上底层调用 `sendfile` 系统调用（通过 `FileChannel.transferTo`），实现零拷贝。所以 `Files.copy` 比 `BufferedInputStream` + `BufferedOutputStream` 手写循环更快。

## 易错点

- **用 `FileInputStream` 直接读中文文本**：会丢字符，必须配合 `InputStreamReader` 指定字符集。
- **`FileReader`/`FileWriter` 不指定字符集**：JDK 11 前无法指定，跨平台必乱码。
- **`read()` 返回值赋给 byte**：-1 会变成 255，循环无法退出。必须用 int 接收。
- **忘记 `ObjectInputStream` 的类版本兼容**：反序列化时类结构变了会抛 `InvalidClassException`，应该显式声明 `serialVersionUID`。
- **`transient` 误以为只是"不写"**：反序列化时字段会变成默认值（0/null），不是原值。
- **`PrintWriter` 不开 autoFlush**：构造函数第二个参数 `false` 时不会自动 flush，需要手动 `flush` 或 close。
- **网络流不设超时**：`Socket.setSoTimeout` 不设会导致连接挂死。
- **`Files.readAllBytes` 读超大文件**：会一次性把整个文件读进内存，大文件应该用 `Files.lines` 流式读。

## 总结

Java IO 常用类围绕"文件、字节流、字符流、序列化、网络"五块展开。字节流处理二进制，字符流处理文本，桥接必须指定字符集。处理流通过装饰者模式叠加缓冲、类型读写、序列化等能力。JDK 7+ 的 `Files`/`Path` 是文件操作的首选，`Files.copy` 内部用零拷贝。生产代码要注意字符集、超时、序列化版本号和 try-with-resources 资源管理。

## 参考资料

- [Oracle: java.io Package Summary](https://docs.oracle.com/javase/8/docs/api/java/io/package-summary.html)
- [Oracle: java.nio.file.Files](https://docs.oracle.com/javase/8/docs/api/java/nio/file/Files.html)
- [Java IO Tutorial (Jenkov)](https://jenkov.com/tutorials/java-io/index.html)

---
