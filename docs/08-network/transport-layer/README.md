# 传输层

本目录覆盖 TCP/UDP 协议、连接建立与关闭、可靠传输、流量/拥塞控制、连接异常排查等传输层核心知识点。

## 目录

### 基础对比

- [TCP 和 UDP 有什么区别](TCP和UDP有什么区别？.md) — 两种传输层协议的设计哲学与选型原则
- [TCP 头部格式有哪些](TCP头部格式有哪些？.md) — TCP 头部字段、控制标志、选项详解
- [UDP 首部格式有哪些字段](UDP首部格式有哪些字段？.md) — UDP 8 字节头部的 4 个字段
- [TCP 是面向字节流协议怎么理解](TCP是面向字节流协议怎么理解？.md) — TCP 字节流特性与粘包/拆包的根源
- [TCP 与 UDP 端口绑定有区别吗](TCP与UDP端口绑定有区别吗？.md) — TCP/UDP 端口独立性、SO_REUSEADDR、TIME_WAIT 占用

### 三次握手

- [TCP 三次握手的过程是怎么样的](TCP三次握手的过程是怎么样的？.md) — SYN/SYN+ACK/ACK 流程与状态变化
- [TCP 为什么需要三次握手](TCP为什么需要三次握手？.md) — 全双工同步 ISN 的最小次数
- [TCP 三次握手和 accept 是什么关系](TCP三次握手和accept是什么关系？.md) — 握手由内核完成，accept 取已建立的连接
- [TCP 握手期间服务端工作内容是什么](TCP握手期间服务端工作内容是什么？.md) — 半连接队列、ISN 生成、状态机维护
- [TCP 握手过程数据包丢失会发生什么](TCP握手过程数据包丢失会发生什么？.md) — SYN/SYN+ACK/ACK 各自丢失的重传行为
- [TCP 三次握手 SYN 报文什么情况下会被丢弃](TCP三次握手SYN报文什么情况下会被丢弃？.md) — 队列满、NAT 误判、防火墙规则
- [TCP 每次建立连接的初始序列号为什么要不一样](TCP每次建立连接的初始序列号为什么要不一样？.md) — 防历史报文复活与序号预测攻击
- [没有 listen 能建立 TCP 连接吗](没有listen能建立TCP连接吗？.md) — TCP 自连接与同时打开

### 四次挥手

- [TCP 四次挥手过程是怎么样的](TCP四次挥手过程是怎么样的？.md) — FIN/ACK 流程与 TIME_WAIT 2 MSL
- [TCP 四次挥手的过程特殊场景分析](TCP四次挥手的过程特殊场景分析？.md) — 第二三次合并、各次挥手丢失、close vs shutdown
- [TCP 四次挥手如果服务端的 FIN 报文比数据报文先到会发生什么](TCP四次挥手如果服务端的FIN报文比数据报文先到会发生什么？.md) — FIN 进乱序队列等数据补齐
- [TCP 为什么需要 TIME_WAIT 状态](TCP为什么需要TIME_WAIT状态？.md) — 防旧报文复活 + 保证最后 ACK 到达
- [TIME_WAIT 过多有什么危害](TIME_WAIT过多有什么危害？.md) — 端口耗尽与内存占用，治标与治本
- [TCP 中的 tcp_tw_reuse 为什么默认关闭](TCP中的tcp_tw_reuse为什么默认关闭？.md) — 多数场景不需要 + 鼓励治本

### 状态机与异常

- [TCP 状态机有哪些状态](TCP状态机有哪些状态？.md) — 11 个状态及转移条件
- [服务端出现大量 CLOSE_WAIT 状态原因是什么](服务端出现大量CLOSE_WAIT状态原因是什么？.md) — 应用未 close() 流或连接池泄漏
- [TCP 处于 TIME_WAIT 状态收到 SYN 报文会怎么样](TCP处于TIME_WAIT状态收到SYN报文会怎么样？.md) — 合法 SYN 复用、非法 SYN 回 ACK 触发 RST
- [TCP 连接处于 ESTABLISH 状态收到 SYN 报文会发生什么](TCP连接处于ESTABLISH状态，收到SYN报文会发生什么？.md) — Challenge ACK 与 killcx 原理
- [TCP 连接在拔掉网线后会发生什么](TCP连接在拔掉网线后会发生什么？.md) — 有数据靠重传，无数据靠 keepalive
- [TCP 连接一端断电和进程崩溃有何区别](TCP连接一端断电和进程崩溃有何区别？.md) — 进程崩溃发 FIN，断电靠重传发现

### 可靠传输与流控

- [TCP 如何保证可靠传输](TCP如何保证可靠传输？.md) — 序列号、ACK、重传、流控、拥塞控制六大机制
- [TCP 重传机制是什么](TCP重传机制是什么？.md) — 超时重传、快速重传、SACK、D-SACK 四件套
- [TCP 滑动窗口是什么](TCP滑动窗口是什么？.md) — 流水线发送与 SND.UNA/NXT/WND 三指针
- [TCP 流量控制是什么](TCP流量控制是什么？.md) — 接收方通告窗口与糊涂窗口综合症
- [TCP 拥塞控制机制是什么](TCP拥塞控制机制是什么？.md) — 慢启动、拥塞避免、快重传、快恢复
- [既然 IP 会分片，为什么 TCP 层还需要 MSS](既然IP会分片，为什么TCP层还需要MSS？.md) — IP 分片丢一个全丢，MSS 独立重传
- [TCP 数据一定不会丢失吗](TCP数据一定不会丢失吗？.md) — TCP 可靠性的边界与应用层 ACK

### keepalive 与性能

- [TCP keepalive 是什么](TCP%20keepalive是什么？.md) — 内核检测死亡连接的机制与应用层心跳对比
- [TCP 如何优化性能](TCP如何优化性能？.md) — 握手/挥手/传输三阶段优化参数
- [TCP 延迟确认机制是什么](TCP延迟确认机制是什么？.md) — 减少 ACK 数量与 Nagle 算法的冲突
- [TCP 快速建立连接是什么](TCP快速建立连接是什么？.md) — TCP Fast Open 在 SYN 携带数据
- [TCP 三次握手和 TLS 握手能合并吗](TCP三次握手和TLS握手能合并吗？.md) — 不能直接合并，QUIC 是真正合并方案

### 安全与其他

- [什么是 SYN 攻击？半连接和全连接队列？](什么是SYN攻击？半连接和全连接队列？.md) — SYN Flood 原理与 SYN Cookies 防御
- [TCP 协议有什么缺陷](TCP协议有什么缺陷？.md) — 升级难、握手慢、队头阻塞、连接迁移困难
- [QUIC 协议是什么](QUIC协议是什么？.md) — 基于 UDP 的现代传输协议，HTTP/3 的传输层
