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
## 核心概念
Java IO分类理解 可以放在“工程实践能力”这条主线里理解。复习时不要只背结论，要先说明它解决的核心问题，再解释关键机制、适用边界和代价。围绕这个知识点，重点关注：定义、原理、边界、取舍、常见问题、排查方法和落地成本。如果面试官继续追问，通常会从“为什么这样设计、在什么场景会失效、线上如何排查”三个方向展开。

## 面试回答与追问
- **标准回答**：先给出 Java IO分类理解 的定位，再说明它依赖的核心原理，最后结合业务场景说明如何使用。回答时要把“能解决什么问题”和“会带来什么成本”一起讲清楚。
- **常见追问**：如果数据量、并发量或调用链路继续放大，Java IO分类理解 的瓶颈会出现在哪里？如何观测、如何优化、如何回滚？
- **易错点**：不要把概念和具体实现混在一起，也不要只说 API 名称。面试中更重要的是说清楚边界条件、失败场景和取舍依据。

## 实战场景与排查
典型落地场景包括：真实业务开发、线上问题治理、性能优化、协作交付和面试复盘。实际处理线上问题时，可以按“现象确认 → 指标采集 → 假设验证 → 小步修复 → 复盘沉淀”的路径推进。先看日志、监控、链路追踪和核心指标，再判断是容量问题、配置问题、代码路径问题，还是外部依赖抖动。

## 总结
复习 Java IO分类理解 时，建议把它和相邻知识点放在一起比较：相同点是什么、区别在哪里、为什么当前场景选择它而不是替代方案。能讲清楚这些内容，才算真正掌握。
