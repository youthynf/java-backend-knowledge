# 传输层协议

本目录覆盖 TCP/UDP、连接状态、可靠传输、拥塞控制和常见网络异常排查。

## 复习建议

- 先用导航建立知识地图，再逐篇补齐自己的项目案例。
- 每篇文章复习时都按“核心概念 → 面试官想考什么 → 标准回答 → 深挖追问 → 示例/实战场景 → 易错点/总结”检查。
- 遇到协议、架构或排障题时，主动补充异常分支、监控指标和工程取舍。

## 文章导航

### 基础文章

- [QUIC协议是什么？](/08-network/transport-layer/QUIC协议是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP keepalive是什么？](/08-network/transport-layer/TCP keepalive是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP三次握手SYN报文什么情况下会被丢弃？](/08-network/transport-layer/TCP三次握手SYN报文什么情况下会被丢弃？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP 三次握手和 TLS 握手能合并吗？](/08-network/transport-layer/TCP三次握手和TLS握手能合并吗？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP三次握手和accept是什么关系？](/08-network/transport-layer/TCP三次握手和accept是什么关系？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP三次握手的过程是怎么样的？](/08-network/transport-layer/TCP三次握手的过程是怎么样的？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP与UDP端口绑定有区别吗？](/08-network/transport-layer/TCP与UDP端口绑定有区别吗？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP中的tcp_tw_reuse为什么默认关闭？](/08-network/transport-layer/TCP中的tcp_tw_reuse为什么默认关闭？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP为什么需要TIME_WAIT状态？](/08-network/transport-layer/TCP为什么需要TIME_WAIT状态？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP为什么需要三次握手？](/08-network/transport-layer/TCP为什么需要三次握手？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP协议有什么缺陷？](/08-network/transport-layer/TCP协议有什么缺陷？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP和UDP有什么区别？](/08-network/transport-layer/TCP和UDP有什么区别？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP四次挥手如果服务端的FIN报文比数据报文先到会发生什么？](/08-network/transport-layer/TCP四次挥手如果服务端的FIN报文比数据报文先到会发生什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP四次挥手的过程特殊场景分析？](/08-network/transport-layer/TCP四次挥手的过程特殊场景分析？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP四次挥手过程是怎么样的？](/08-network/transport-layer/TCP四次挥手过程是怎么样的？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP处于TIME_WAIT状态收到SYN报文会怎么样？](/08-network/transport-layer/TCP处于TIME_WAIT状态收到SYN报文会怎么样？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP头部格式有哪些？](/08-network/transport-layer/TCP头部格式有哪些？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP如何优化性能？](/08-network/transport-layer/TCP如何优化性能？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP如何保证可靠传输？](/08-network/transport-layer/TCP如何保证可靠传输？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP延迟确认机制是什么？](/08-network/transport-layer/TCP延迟确认机制是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP快速建立连接是什么？](/08-network/transport-layer/TCP快速建立连接是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP拥塞控制机制是什么？](/08-network/transport-layer/TCP拥塞控制机制是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP握手期间服务端工作内容是什么？](/08-network/transport-layer/TCP握手期间服务端工作内容是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP握手过程数据包丢失会发生什么？](/08-network/transport-layer/TCP握手过程数据包丢失会发生什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP数据一定不会丢失吗？](/08-network/transport-layer/TCP数据一定不会丢失吗？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP是面向字节流协议怎么理解？](/08-network/transport-layer/TCP是面向字节流协议怎么理解？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP每次建立连接的初始序列号为什么要不一样？](/08-network/transport-layer/TCP每次建立连接的初始序列号为什么要不一样？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP流量控制是什么？](/08-network/transport-layer/TCP流量控制是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP滑动窗口是什么？](/08-network/transport-layer/TCP滑动窗口是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP粘包问题如何解决？](/08-network/transport-layer/TCP粘包问题如何解决？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP连接一端断电和进程崩溃有何区别？](/08-network/transport-layer/TCP连接一端断电和进程崩溃有何区别？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP连接在拔掉网线后会发生什么？](/08-network/transport-layer/TCP连接在拔掉网线后会发生什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP连接处于ESTABLISH状态，收到SYN报文会发生什么？](/08-network/transport-layer/TCP连接处于ESTABLISH状态，收到SYN报文会发生什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TCP重传机制是什么？](/08-network/transport-layer/TCP重传机制是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [TIME_WAIT过多有什么危害？](/08-network/transport-layer/TIME_WAIT过多有什么危害？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [UDP首部格式有哪些字段？](/08-network/transport-layer/UDP首部格式有哪些字段？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [什么是SYN攻击？半连接和全连接队列？](/08-network/transport-layer/什么是SYN攻击？半连接和全连接队列？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [如何提升TCP性能？](/08-network/transport-layer/如何提升TCP性能？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [既然IP会分片，为什么TCP层还需要MSS？](/08-network/transport-layer/既然IP会分片，为什么TCP层还需要MSS？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [服务端出现大量CLOSE_WAIT状态原因是什么？](/08-network/transport-layer/服务端出现大量CLOSE_WAIT状态原因是什么？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。
- [没有listen能建立TCP连接吗？](/08-network/transport-layer/没有listen能建立TCP连接吗？.md)：传输层网络面试复习，重点关注核心机制、典型追问、实战场景和易错点。

## 面试复习检查清单

- 能否用 30 秒给出一句话定义？
- 能否口述核心流程、关键状态或算法不变量？
- 能否说出至少 3 个追问点和 2 个易错点？
- 能否结合项目或线上排障讲一个真实场景？
- 能否说明方案边界、风险、优化方向和验证指标？
