# 架构设计

这一部分关注系统设计、分布式一致性、高可用、高并发和工程取舍。面试中更看重方案边界、权衡理由和故障预案。

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

- [设计模式](/07-architecture/design-patterns/README.md)
- [设计原则与模式](/07-architecture/patterns/README.md)
- [系统设计与线上排障](/07-architecture/system-design/README.md)
- [工厂模式](/07-architecture/design-patterns/factory.md)
- [单例模式](/07-architecture/design-patterns/singleton.md)
- [代理模式](/07-architecture/patterns/proxy.md)
- [单例模式](/07-architecture/patterns/singleton.md)
- [策略模式](/07-architecture/patterns/strategy.md)
- [模板方法模式](/07-architecture/patterns/template-method.md)
- [CPU 100% 问题怎么排查？](/07-architecture/system-design/CPU100%问题怎么排查？.md)
- [秒杀系统设计](/07-architecture/system-design/seckill.md)
- [如何保证接口幂等？](/07-architecture/system-design/如何保证接口幂等.md)
- [如何排查并解决 Redis 的 CPU 占用高问题？](/07-architecture/system-design/如何排查并解决Redis的CPU占用高问题？.md)
- [如何设计秒杀场景处理高并发以及超卖现象？](/07-architecture/system-design/如何设计秒杀场景处理高并发以及超卖现象？.md)
- [如果让你优化一个项目，你会怎么做？](/07-architecture/system-design/如果让你优化一个项目，你会怎么做？.md)
- [导致 CPU 飙升到 100% 有什么原因？](/07-architecture/system-design/导致CPU飙升到100%有什么原因？.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
