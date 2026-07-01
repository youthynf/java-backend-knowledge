# Java IO

本目录覆盖 Java I/O 体系的核心知识：从 Unix I/O 模型到 Java BIO/NIO/AIO 三种实现，再到零拷贝、I/O 多路复用、Netty 框架的工程实践。

## 目录

### 基础与分类

- [Unix IO 模型有哪几种](Unix-IO模型有哪几种？.md) — 五种 Unix I/O 模型，同步/异步的本质区别
- [BIO、NIO、AIO 有什么区别](BIO、NIO、AIO有什么区别？.md) — Java 三种 I/O 模型对比与选型
- [Java IO 体系如何分类](Java-IO体系如何分类？.md) — 字节流/字符流、节点流/处理流的分类维度
- [Java IO 常见类有哪些](Java-IO常见类有哪些？.md) — 文件、字节流、字符流、序列化、网络的常用类
- [Java IO 的装饰者模式如何体现](Java-IO的装饰者模式如何体现？.md) — FilterInputStream 系列的装饰者设计

### 三种 I/O 模型详解

- [Java BIO 是如何工作的](Java-BIO是如何工作的？.md) — 同步阻塞 I/O 的机制、线程池优化与适用边界
- [Java NIO 是如何工作的](Java-NIO是如何工作的？.md) — Channel/Buffer/Selector 三大组件与事件循环
- [Java AIO 是如何工作的](Java-AIO是如何工作的？.md) — CompletionHandler 异步回调模型与平台差异

### 进阶主题

- [I/O 多路复用 select、poll、epoll 有什么区别](I-O多路复用select、poll、epoll有什么区别？.md) — 三种多路复用实现演进与 LT/ET 模式
- [Java 如何实现零拷贝](Java如何实现零拷贝？.md) — mmap、sendfile、FileChannel.transferTo 与 Netty 零拷贝
- [Netty 框架的核心设计是什么](Netty框架的核心设计是什么？.md) — Reactor 模型、Pipeline 责任链、ByteBuf 内存管理

## 复习路径

1. **先打地基**：从 Unix I/O 模型入手，理解"阻塞/非阻塞"与"同步/异步"的正交关系。
2. **看 Java 实现**：对照 BIO/NIO/AIO 三种 Java 封装，看清各自的适用场景。
3. **抓工程关键**：零拷贝和 I/O 多路复用是高并发服务的两大支柱。
4. **落到框架**：Netty 是 Java 网络服务的工程化封装，掌握后即可理解 Dubbo、gRPC、Spring WebFlux 的底层。
