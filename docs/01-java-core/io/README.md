# IO

这一部分围绕 IO 的核心知识展开，目标是把概念、原理、场景和面试表达组织成可复习、可追问、可落地的知识体系。

## 面试复习重点

- 核心概念是什么，解决了什么问题，和相邻知识点如何区分。
- 面试官常从实现原理、适用场景、异常边界和性能影响继续追问。
- 生产落地时要结合监控、日志、压测和故障预案验证方案。

## 建议掌握程度

- **能讲清概念**：先用自己的话解释定义、背景和解决的问题。
- **能画出链路**：把核心流程、关键组件和状态变化串起来。
- **能回答追问**：准备优缺点、适用场景、常见坑和替代方案。
- **能落地排查**：结合日志、指标、工具和案例说明如何定位问题。

## 文章导航

- [BIO-NIO-AIO是什么？](/01-java-core/io/BIO-NIO-AIO是什么？.md)
- [Java-IO常见类有哪些？](/01-java-core/io/Java-IO常见类有哪些？.md)
- [Java-IO的装饰者模式理解](/01-java-core/io/Java-IO的装饰者模式理解.md)
- [Java-IO分类理解](/01-java-core/io/Java-IO分类理解.md)
- [Java-IO如何实现零拷贝？](/01-java-core/io/Java-IO如何实现零拷贝？.md)
- [Java-IO之AIO详解](/01-java-core/io/Java-IO之AIO详解.md)
- [Java-IO之BIO详解](/01-java-core/io/Java-IO之BIO详解.md)
- [Java-IO之I-O多路复用详解](/01-java-core/io/Java-IO之I-O多路复用详解.md)
- [Java-IO之Netty框架概要](/01-java-core/io/Java-IO之Netty框架概要.md)
- [Java-IO之NIO详解](/01-java-core/io/Java-IO之NIO详解.md)
- [Unix-IO模型](/01-java-core/io/Unix-IO模型.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
