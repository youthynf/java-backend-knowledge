# transport-layer

- [服务端出现大量CLOSE_WAIT状态原因是什么？](08-network/transport-layer/服务端出现大量CLOSE_WAIT状态原因是什么？.md)
- [既然IP会分片，为什么TCP层还需要MSS？](08-network/transport-layer/既然IP会分片，为什么TCP层还需要MSS？.md)
- [没有listen能建立TCP连接吗？](08-network/transport-layer/没有listen能建立TCP连接吗？.md)
- [如何提升TCP性能？](08-network/transport-layer/如何提升TCP性能？.md)
- [什么是SYN攻击？半连接和全连接队列？](08-network/transport-layer/什么是SYN攻击？半连接和全连接队列？.md)
- [QUIC协议是什么？](08-network/transport-layer/QUIC协议是什么？.md)
- [TCP处于TIME_WAIT状态收到SYN报文会怎么样？](08-network/transport-layer/TCP处于TIME_WAIT状态收到SYN报文会怎么样？.md)
- [TCP和UDP有什么区别？](08-network/transport-layer/TCP和UDP有什么区别？.md)
- [TCP滑动窗口是什么？](08-network/transport-layer/TCP滑动窗口是什么？.md)
- [TCP快速建立连接是什么？](08-network/transport-layer/TCP快速建立连接是什么？.md)
- [TCP连接处于ESTABLISH状态，收到SYN报文会发生什么？](08-network/transport-layer/TCP连接处于ESTABLISH状态，收到SYN报文会发生什么？.md)
- [TCP连接一端断电和进程崩溃有何区别？](08-network/transport-layer/TCP连接一端断电和进程崩溃有何区别？.md)
- [TCP连接在拔掉网线后会发生什么？](08-network/transport-layer/TCP连接在拔掉网线后会发生什么？.md)
- [TCP流量控制是什么？](08-network/transport-layer/TCP流量控制是什么？.md)
- [TCP每次建立连接的初始序列号为什么要不一样？](08-network/transport-layer/TCP每次建立连接的初始序列号为什么要不一样？.md)
- [TCP粘包问题如何解决？](08-network/transport-layer/TCP粘包问题如何解决？.md)
- [TCP如何保证可靠传输？](08-network/transport-layer/TCP如何保证可靠传输？.md)
- [TCP如何优化性能？](08-network/transport-layer/TCP如何优化性能？.md)
- [TCP三次握手的过程是怎么样的？](08-network/transport-layer/TCP三次握手的过程是怎么样的？.md)
- [TCP三次握手和accept是什么关系？](08-network/transport-layer/TCP三次握手和accept是什么关系？.md)
- [TCP三次握手和TLS握手能合并吗？](08-network/transport-layer/TCP三次握手和TLS握手能合并吗？.md)
- [TCP三次握手SYN报文什么情况下会被丢弃？](08-network/transport-layer/TCP三次握手SYN报文什么情况下会被丢弃？.md)
- [TCP是面向字节流协议怎么理解？](08-network/transport-layer/TCP是面向字节流协议怎么理解？.md)
- [TCP数据一定不会丢失吗？](08-network/transport-layer/TCP数据一定不会丢失吗？.md)
- [TCP四次挥手的过程特殊场景分析？](08-network/transport-layer/TCP四次挥手的过程特殊场景分析？.md)
- [TCP四次挥手过程是怎么样的？](08-network/transport-layer/TCP四次挥手过程是怎么样的？.md)
- [TCP四次挥手如果服务端的FIN报文比数据报文先到会发生什么？](08-network/transport-layer/TCP四次挥手如果服务端的FIN报文比数据报文先到会发生什么？.md)
- [TCP头部格式有哪些？](08-network/transport-layer/TCP头部格式有哪些？.md)
- [TCP为什么需要三次握手？](08-network/transport-layer/TCP为什么需要三次握手？.md)
- [TCP为什么需要TIME_WAIT状态？](08-network/transport-layer/TCP为什么需要TIME_WAIT状态？.md)
- [TCP握手过程数据包丢失会发生什么？](08-network/transport-layer/TCP握手过程数据包丢失会发生什么？.md)
- [TCP握手期间服务端工作内容是什么？](08-network/transport-layer/TCP握手期间服务端工作内容是什么？.md)
- [TCP协议有什么缺陷？](08-network/transport-layer/TCP协议有什么缺陷？.md)
- [TCP延迟确认机制是什么？](08-network/transport-layer/TCP延迟确认机制是什么？.md)
- [TCP拥塞控制机制是什么？](08-network/transport-layer/TCP拥塞控制机制是什么？.md)
- [TCP与UDP端口绑定有区别吗？](08-network/transport-layer/TCP与UDP端口绑定有区别吗？.md)
- [TCP中的tcp_tw_reuse为什么默认关闭？](08-network/transport-layer/TCP中的tcp_tw_reuse为什么默认关闭？.md)
- [TCP重传机制是什么？](08-network/transport-layer/TCP重传机制是什么？.md)
- [TCP](08-network/transport-layer/TCP)
- [keepalive是什么？](08-network/transport-layer/keepalive是什么？.md)
- [TIME_WAIT过多有什么危害？](08-network/transport-layer/TIME_WAIT过多有什么危害？.md)
- [UDP首部格式有哪些字段？](08-network/transport-layer/UDP首部格式有哪些字段？.md)

<!-- 面试复习补充 -->

## 面试复习补充

### 核心概念

本页是 `transport-layer` 相关知识的目录入口。复习时要把目录中的零散问题串成一条后端链路：请求如何进入系统、如何被转发/处理、如何保证可靠性、性能和安全。

### 面试官想考什么

面试官通常不是考你能否背出目录，而是看你能否建立知识地图：哪些概念属于基础机制，哪些属于工程落地，线上出现问题时如何定位到具体层次或组件。

### 标准回答

可以先给出总览，再按高频问题展开：核心概念是什么、解决什么痛点、在 Java 后端中出现在哪里、关键参数或边界条件是什么、如果线上异常应该看哪些指标。

### 深挖追问

- 这个目录中哪些知识点最容易和实际线上故障关联？
- 相邻组件或协议的职责边界是什么？
- 如果只允许你重点复习三类问题，你会选哪些？

### 实战场景/示例

例如排查一次接口超时，可能同时涉及 DNS、TCP 连接、TLS 握手、HTTP 连接池、网关转发、Tomcat 线程池、MQ 异步链路和下游存储。目录复习要服务于这种端到端分析。

### 易错点/总结

不要只背名词。面试回答要能落到“现象、原因、排查、解决、预防”五步。

