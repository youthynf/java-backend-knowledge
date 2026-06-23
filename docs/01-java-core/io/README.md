# io

- [BIO-NIO-AIO是什么？](01-java-core/io/BIO-NIO-AIO是什么？.md)
- [Java-IO常见类有哪些？](01-java-core/io/Java-IO常见类有哪些？.md)
- [Java-IO的装饰者模式理解](01-java-core/io/Java-IO的装饰者模式理解.md)
- [Java-IO分类理解](01-java-core/io/Java-IO分类理解.md)
- [Java-IO如何实现零拷贝？](01-java-core/io/Java-IO如何实现零拷贝？.md)
- [Java-IO之AIO详解](01-java-core/io/Java-IO之AIO详解.md)
- [Java-IO之BIO详解](01-java-core/io/Java-IO之BIO详解.md)
- [Java-IO之I-O多路复用详解](01-java-core/io/Java-IO之I-O多路复用详解.md)
- [Java-IO之Netty框架概要](01-java-core/io/Java-IO之Netty框架概要.md)
- [Java-IO之NIO详解](01-java-core/io/Java-IO之NIO详解.md)
- [Unix-IO模型](01-java-core/io/Unix-IO模型.md)

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- I/O 关注数据在程序、内核、设备或网络之间的传输。
- 面试重点是模型、API 选择、性能和资源管理。

### 面试官想考什么
- 如何选择 BIO/NIO/AIO 或具体流类。
- 如何避免阻塞、泄漏和编码问题。

### 标准回答
io 建议按“模型定义 → Java API → 适用场景 → 性能/资源风险”回答。

### 深挖追问
- 同步和阻塞是否等价？
- 文件 I/O 和网络 I/O 有什么差异？
- 如何定位 I/O 性能瓶颈？

### 实战场景/代码示例
```java
try(InputStream in=Files.newInputStream(path)){
  byte[] buf=in.readNBytes(1024);
}
```

### 易错点/总结
- 资源必须关闭。
- 明确字符集和缓冲策略。

