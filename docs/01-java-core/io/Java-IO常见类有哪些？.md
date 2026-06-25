# Java IO常见类有哪些？

Java IO常见类有哪些？
IO常见类的使用
Java 的 I/O 大概可以分成以下几类:
•  磁盘操作: File
•  字节操作: InputStream 和 OutputStream
•  字符操作: Reader 和 Writer
•  对象操作: Serializable
•  网络操作: Socket

File相关
File类可以用于表示文件和目录的信息，但是它不表示文件的内容。递归地列出一个目录下所有文件:

public static void listAllFiles(File dir) {
   if (dir == null || !dir.exists()) {
       return;
   }
   if (dir.isFile()) {
       System.out.println(dir.getName());
       return;
   }
   for (File file : dir.listFiles()) {
       listAllFiles(file);
   }
}

字节流相关

public static void copyFile(String src, String dist) throws IOException {
   FileInputStream in = new FileInputStream(src);
   FileOutputStream out = new FileOutputStream(dist);
   byte[] buffer = new byte[20 * 1024];

   // read() 最多读取 buffer.length 个字节
   // 返回的是实际读取的个数
   // 返回 -1 的时候表示读到 eof，即文件尾
   while (in.read(buffer, 0, buffer.length) != -1) {
       out.write(buffer);
   }

   in.close();
   out.close();
}

实现逐行输出文本文件的内容

public static void readFileContent(String filePath) throws IOException {

   FileReader fileReader = new FileReader(filePath);
   BufferedReader bufferedReader = new BufferedReader(fileReader);

   String line;
   while ((line = bufferedReader.readLine()) != null) {
       System.out.println(line);
   }

   // 装饰者模式使得 BufferedReader 组合了一个 Reader 对象
   // 在调用 BufferedReader 的 close() 方法时会去调用 Reader 的 close() 方法
   // 因此只要一个 close() 调用即可
   bufferedReader.close();
}

序列化 & Serializable & transient
序列化就是将一个对象转换成字节序列，方便存储和传输。
•  序列化: ObjectOutputStream.writeObject()
•  反序列化: ObjectInputStream.readObject()

不会对静态变量进行序列化，因为序列化只是保存对象的状态，静态变量属于类的状态。Serializable序列化的类需要实现 Serializable 接口，它只是一个标准，没有任何方法需要实现，但是如果不去实现它的话而进行序列化，会抛出异常。

public static void main(String[] args) throws IOException, ClassNotFoundException {
   A a1 = new A(123, "abc");
   String objectFile = "file/a1";
   ObjectOutputStream objectOutputStream = new ObjectOutputStream(new FileOutputStream(objectFile));
   objectOutputStream.writeObject(a1);
   objectOutputStream.close();

   ObjectInputStream objectInputStream = new ObjectInputStream(new FileInputStream(objectFile));
   A a2 = (A) objectInputStream.readObject();
   objectInputStream.close();
   System.out.println(a2);
}

private static class A implements Serializable {
   private int x;
   private String y;

   A(int x, String y) {
       this.x = x;
       this.y = y;
   }

   @Override
   public String toString() {
       return "x = " + x + "  " + "y = " + y;
   }
}

transient
transient 关键字可以使一些属性不会被序列化。ArrayList 中存储数据的数组 elementData 是用 transient 修饰的，因为这个数组是动态扩展的，并不是所有的空间都被使用，因此就不需要所有的内容都被序列化。通过重写序列化和反序列化方法，使得可以只序列化数组中有内容的那部分数据。

private transient Object[] elementData;

Java 中的网络支持
•  InetAddress: 用于表示网络上的硬件资源，即 IP 地址；
•  URL: 统一资源定位符；
•  Sockets: 使用 TCP 协议实现网络通信；
•  Datagram: 使用 UDP 协议实现网络通信。

InetAddress
没有公有的构造函数，只能通过静态方法来创建实例。

InetAddress.getByName(String host);
InetAddress.getByAddress(byte[] address);

URL
可以直接从 URL 中读取字节流数据。

public static void main(String[] args) throws IOException {

   URL url = new URL("http://www.baidu.com");

   /* 字节流 */
   InputStream is = url.openStream();

   /* 字符流 */
   InputStreamReader isr = new InputStreamReader(is, "utf-8");

   /* 提供缓存功能 */
   BufferedReader br = new BufferedReader(isr);

   String line;
   while ((line = br.readLine()) != null) {
       System.out.println(line);
   }

   br.close();
}

Sockets
•  ServerSocket: 服务器端类
•  Socket: 客户端类
•  服务器和客户端通过 InputStream 和 OutputStream 进行输入输出。

Datagram
•  DatagramSocket: 通信类
•  DatagramPacket: 数据包类

---
## 核心概念
Java IO常见类有哪些？ 可以放在“工程实践能力”这条主线里理解。复习时不要只背结论，要先说明它解决的核心问题，再解释关键机制、适用边界和代价。围绕这个知识点，重点关注：定义、原理、边界、取舍、常见问题、排查方法和落地成本。如果面试官继续追问，通常会从“为什么这样设计、在什么场景会失效、线上如何排查”三个方向展开。

## 面试回答与追问
- **标准回答**：先给出 Java IO常见类有哪些？ 的定位，再说明它依赖的核心原理，最后结合业务场景说明如何使用。回答时要把“能解决什么问题”和“会带来什么成本”一起讲清楚。
- **常见追问**：如果数据量、并发量或调用链路继续放大，Java IO常见类有哪些？ 的瓶颈会出现在哪里？如何观测、如何优化、如何回滚？
- **易错点**：不要把概念和具体实现混在一起，也不要只说 API 名称。面试中更重要的是说清楚边界条件、失败场景和取舍依据。

## 实战场景与排查
典型落地场景包括：真实业务开发、线上问题治理、性能优化、协作交付和面试复盘。实际处理线上问题时，可以按“现象确认 → 指标采集 → 假设验证 → 小步修复 → 复盘沉淀”的路径推进。先看日志、监控、链路追踪和核心指标，再判断是容量问题、配置问题、代码路径问题，还是外部依赖抖动。

## 总结
复习 Java IO常见类有哪些？ 时，建议把它和相邻知识点放在一起比较：相同点是什么、区别在哪里、为什么当前场景选择它而不是替代方案。能讲清楚这些内容，才算真正掌握。
