# JVM

这一部分重点建立 JVM 运行机制、内存管理、GC 与线上排查的完整链路。复习时不要只背参数，要能解释现象背后的对象生命周期、线程状态、类加载和垃圾回收行为。

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

- [1.2mb-data-10gb-memory](/01-java-core/jvm/1.2mb-data-10gb-memory.md)
- [class-loading](/01-java-core/jvm/class-loading.md)
- [gc-algorithms](/01-java-core/jvm/gc-algorithms.md)
- [gc-collectors](/01-java-core/jvm/gc-collectors.md)
- [gc-tuning](/01-java-core/jvm/gc-tuning.md)
- [jvm-parameters](/01-java-core/jvm/jvm-parameters.md)
- [jvm-troubleshooting](/01-java-core/jvm/jvm-troubleshooting.md)
- [memory-model](/01-java-core/jvm/memory-model.md)
- [one-line-code-save-1g-memory](/01-java-core/jvm/one-line-code-save-1g-memory.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
