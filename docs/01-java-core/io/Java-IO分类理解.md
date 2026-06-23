# Java IO分类理解

Java IO分类理解
从传输方式上区分
从数据传输方式或者说是运输方式角度看, 可以将IO类分为字节流和字符流. 通俗理解, 字节是给计算机看的, 字符才是给人看的.
字节流
•  InputStream: 
主要有: ByteArrayInputStream, PipedInputStream, FilterInputStream(BufferedInputStream, DataInputStream), FileInputStream.
•  OutputStream: 
主要有ByteArrayOutputStream, PipedOutputStream, FilterOutputStream(BufferedOutputStream, DataOutputStream, PrintStream), FileOutputStream, ObejctOutputStream.
字符流
•  Reader
主要有CharArrayReader, PipedReader, FilterReader, BufferedReader, InputStreamReader(FileReader).
•  Writer
主要有CharArrayWriter, PipedWriter, FilterWriter, BufferedWriter, InputStreamWriter(FileWriter), PrintWriter.
字节流与字符流的区别
•  字节流读取的是单个字节, 字符流读取的是单个字符(不同字符根据编码不同,对应的字节数也不同, 如UTF-8编码中文汉字是3个字节, GBK编码中文汉字是2个字节).
•  字节流用来处理二进制文件, 如图片/MP3/视频等, 字节流用来处理文本文件.

字节流与字符流之间转换

import java.io.*;

public class StreamConversionExample {
    public static void main(String[] args) {
        // 示例文件路径
        String inputFilePath = "input.txt";
        String outputFilePath = "output.txt";

        // 字节流转换为字符流（输入）
        try (InputStream fileInputStream = new FileInputStream(inputFilePath);
             Reader reader = new InputStreamReader(fileInputStream, "UTF-8");
             BufferedReader bufferedReader = new BufferedReader(reader)) {

            // 读取并打印内容
            String line;
            while ((line = bufferedReader.readLine()) != null) {
                System.out.println("读取内容: " + line);
            }

        } catch (IOException e) {
            e.printStackTrace();
        }

        // 字符流转换为字节流（输出）
        try (OutputStream fileOutputStream = new FileOutputStream(outputFilePath);
             Writer writer = new OutputStreamWriter(fileOutputStream, "UTF-8");
             BufferedWriter bufferedWriter = new BufferedWriter(writer)) {

            // 写入内容
            bufferedWriter.write("这是一个字符流转换为字节流的示例。");
            bufferedWriter.newLine();
            bufferedWriter.write("Hello, World!");

        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}

从数据操作上区分
从数据来源或者说是操作对象的角度来区分, 可以分为:
文件(file):
FileInputStream、FileOutputStream、FileReader、FileWriter
数组([])
字节数组(byte[]): ByteArrayInputStream、ByteArrayOutputStream
字符数组(char[]): CharArrayReader、CharArrayWriter
管道操作
PipedInputStream、PipedOutputStream、PipedReader、PipedWriter
基本数据类型
DataInputStream、DataOutputStream
缓冲操作
BufferedInputStream、BufferedOutputStream、BufferedReader、BufferedWriter
打印
PrintStream、PrintWriter
对象序列化反序列化
ObjectInputStream、ObjectOutputStream
转换
InputStreamReader、OutputStreamWriter

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

