# 基础知识

这一部分围绕 MySQL 查询执行、索引、事务、锁和日志体系展开。复习时要把 SQL 现象、执行计划、存储结构和并发控制串起来。

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

- [数据库三大范式是什么？](/03-database/mysql/basics/数据库三大范式是什么？.md)
- [一条select语句执行期间发生了什么？](/03-database/mysql/basics/一条select语句执行期间发生了什么？.md)
- [一条update语句执行期间发生了什么？](/03-database/mysql/basics/一条update语句执行期间发生了什么？.md)
- [CHAR和VARCHAR区别是什么？](/03-database/mysql/basics/CHAR和VARCHAR区别是什么？.md)
- [Distinct与Group-By性能比较？](/03-database/mysql/basics/Distinct与Group-By性能比较？.md)
- [EXISTS与IN性能比较？](/03-database/mysql/basics/EXISTS与IN性能比较？.md)
- [MySQL连表查询语法有哪些？](/03-database/mysql/basics/MySQL连表查询语法有哪些？.md)
- [MySQL时间类型选择？](/03-database/mysql/basics/MySQL时间类型选择？.md)
- [MySQL数据类型介绍？](/03-database/mysql/basics/MySQL数据类型介绍？.md)
- [MySQL一行记录时怎么存储的？](/03-database/mysql/basics/MySQL一行记录时怎么存储的？.md)
- [NOSQL与SQL有什么区别？](/03-database/mysql/basics/NOSQL与SQL有什么区别？.md)
- [Text数据类型可以无限大吗？](/03-database/mysql/basics/Text数据类型可以无限大吗？.md)

## 面试表达模板

回答这类问题时，建议按下面顺序组织：

1. 先给结论：一句话说明它是什么、解决什么问题。
2. 再讲原理：说明核心组件、关键流程和数据结构。
3. 补充场景：结合项目或线上问题说明什么时候用、怎么用。
4. 说明边界：讲清楚缺点、风险、替代方案和排查手段。
