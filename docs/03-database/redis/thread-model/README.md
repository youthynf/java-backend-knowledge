# Redis 线程模型

本目录覆盖 Redis 的线程模型、网络模型、IO 多路复用等核心知识点。

## 目录

- [Redis 是单线程吗](Redis是单线程吗？.md) — 命令执行单线程，BIO 后台线程与 6.0+ IO 线程
- [Redis 为什么单线程还快](Redis为什么单线程还快？.md) — 内存、数据结构、IO 多路复用、无锁
- [Redis 单线程模型是怎么样的](Redis单线程模型是怎么样的？.md) — aeEventLoop 事件循环、文件事件处理器
- [Redis 如何运用 IO 多路复用](Redis如何运用IO多路复用的？.md) — select/poll/epoll 对比、ae.c 封装
- [Redis 的网络模型是怎么样的](Redis的网络模型是怎么样的？.md) — 单 Reactor 单线程到单 Reactor 多线程

## 阅读建议

1. 先读 [Redis 是单线程吗](Redis是单线程吗？.md) 厘清"单线程"的准确含义
2. 再读 [为什么单线程还快](Redis为什么单线程还快？.md) 理解性能来源
3. 接着读 [单线程模型](Redis单线程模型是怎么样的？.md) 和 [IO 多路复用](Redis如何运用IO多路复用的？.md) 深入事件循环和 epoll
4. 最后读 [网络模型](Redis的网络模型是怎么样的？.md) 理解 Reactor 模式与版本演进
