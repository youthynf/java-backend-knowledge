# 集合框架

这一部分围绕 集合框架 的核心知识展开，目标是把概念、原理、场景和面试表达组织成可复习、可追问、可落地的知识体系。

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

- [多线程下HashMap会有什么问题？](/01-java-core/collections/多线程下HashMap会有什么问题？.md)
- [工具类Collection和Collections有什么区别？](/01-java-core/collections/工具类Collection和Collections有什么区别？.md)
- [如何解决哈希冲突问题？](/01-java-core/collections/如何解决哈希冲突问题？.md)
- [重写HashMap的equals方法不当会发生什么？](/01-java-core/collections/重写HashMap的equals方法不当会发生什么？.md)
- [ArrayList扩容机制是怎么样的？](/01-java-core/collections/ArrayList扩容机制是怎么样的？.md)
- [ArrayList线程安全吗？](/01-java-core/collections/ArrayList线程安全吗？.md)
- [Collection类的类关系是怎么样的？](/01-java-core/collections/Collection类的类关系是怎么样的？.md)
- [CopyOnWriteArrayList底层实现原理是怎么样的？](/01-java-core/collections/CopyOnWriteArrayList底层实现原理是怎么样的？.md)
- [HashMap的大小总是2的n次方原因是什么？](/01-java-core/collections/HashMap的大小总是2的n次方原因是什么？.md)
- [HashMap的底层如何实现？](/01-java-core/collections/HashMap的底层如何实现？.md)
- [HashMap扩容机制是怎么样的？](/01-java-core/collections/HashMap扩容机制是怎么样的？.md)
- [HashMap与Hashtable区别是什么？](/01-java-core/collections/HashMap与Hashtable区别是什么？.md)
- [HashMap执行put方法过程是怎么样的？](/01-java-core/collections/HashMap执行put方法过程是怎么样的？.md)
- [Java遍历集合的方法有哪些？](/01-java-core/collections/Java遍历集合的方法有哪些？.md)
- [Java中有哪些集合是线程安全的？](/01-java-core/collections/Java中有哪些集合是线程安全的？.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
