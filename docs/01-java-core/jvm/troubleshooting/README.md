# JVM 故障排查

本目录覆盖 JVM 常用调参、问题排查工具、线程 Dump 分析、CPU 飙高排查等知识点。理解这些是处理线上 OOM、CPU 高、GC 频繁、死锁等问题的基础。

## 目录

- [JVM 常用调参有哪些](JVM常用调参有哪些？.md) — 堆/栈/元空间/GC/日志参数，JDK 8/9+ 差异
- [Java 问题排查工具有哪些](Java问题排查工具有哪些？.md) — jps/jstat/jmap/jstack/jcmd/Arthas/MAT
- [Java 线程 Dump 如何分析](Java线程Dump如何分析？.md) — 线程状态、调用栈、死锁检测、多次采样
- [线上 CPU 90% 怎么排查](线上CPU90%怎么排查？.md) — top -Hp + jstack + Arthas 排查链路

---

[← 返回 JVM 目录](/01-java-core/jvm/)
