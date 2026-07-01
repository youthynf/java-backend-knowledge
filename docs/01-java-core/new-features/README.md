# Java 新特性

本目录覆盖 Java 各版本新特性的演进与核心特性详解，重点放在 JDK 8 这个现代 Java 的奠基版本。

## 目录

### 版本概览

- [Java 各版本新特性有哪些关键变化](Java各版本新特性有哪些关键变化？.md) — JDK 8~21 关键特性、LTS 版本演进与升级路径
- [JDK 8 引入了哪些核心新特性](JDK8引入了哪些核心新特性？.md) — Lambda/Stream/Optional/java.time/CompletableFuture/Metaspace 全景

### JDK 8 核心特性详解

- [JDK 8 函数式编程如何使用](JDK8函数式编程如何使用？.md) — Lambda、方法引用、函数式接口与生产实践
- [JDK 8 的 Optional 类如何使用](JDK8的Optional类如何使用？.md) — 空值容器、链式 API 与不适用场景

## 复习路径

1. **先看全景**：从"Java 各版本新特性"了解 JDK 8~21 的演进脉络，明确 LTS 版本（8/11/17/21）的关键变化。
2. **深入 JDK 8**：JDK 8 是现代 Java 的奠基版本，Lambda、Stream、Optional、java.time 是日常最常用。
3. **抓生产实践**：每个特性都有适用边界——不要滥用并行流、Optional 不做字段、`LocalDateTime` 不含时区。
4. **结合升级**：理解新特性后，能从"为什么这样设计"角度回答 JDK 升级问题，而非背诵版本列表。
