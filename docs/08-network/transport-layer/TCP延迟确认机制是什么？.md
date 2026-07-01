# TCP 延迟确认机制是什么

## 核心概念

延迟确认（Delayed ACK）是 TCP 减少 ACK 报文数量的优化机制。接收方收到数据后不立即回 ACK，而是等一小段时间（典型 40-200ms），期间如果有数据要发就搭车（piggyback），或等下一个数据段到达合并 ACK。优点是减少小包、降低 CPU 开销；缺点是可能增加 RTT，和 Nagle 算法配合时引发性能问题。

## 标准回答

延迟确认的工作方式：

1. 接收方收到数据，不立即回 ACK
2. 启动延迟 ACK 定时器（典型 40ms，最大 200ms）
3. 期间有数据要发 → ACK 搭车发出（piggyback）
4. 期间收到第二个数据段 → 立即回 ACK（确认两段）
5. 定时器到期 → 单独发 ACK

延迟确认不能超过 2 个数据段（即最多累积 2 段才必须 ACK）。

## 详细机制

### 为什么需要延迟确认

每个数据段都回 ACK 会产生大量小包：1000 段数据 = 1000 个 ACK 包，每个 ACK 40 字节头部，浪费带宽。延迟确认让多个 ACK 合并，或搭数据包便车。

### 触发立即 ACK 的条件

- 收到两个未确认的数据段（必须立即 ACK，不能延迟两个以上）
- 收到乱序数据段（立即 ACK，触发对端重传）
- 有数据要发给对端（ACK 搭车发出）
- 延迟定时器到期

### 延迟确认 vs 立即确认

| 场景 | 确认方式 |
|------|---------|
| 收到 1 段，无数据要发 | 延迟确认（等 40ms 或下一段） |
| 收到 2 段连续数据 | 立即确认（第 2 段触发） |
| 收到乱序段 | 立即确认（重复 ACK） |
| 有数据要回 | 立即确认（搭车） |
| 收到 FIN/RST | 立即确认 |

### 延迟确认和 Nagle 的冲突

Nagle 算法：发送方有未确认数据时，新数据攒着不发，等 ACK 到达或攒够 MSS 才发。

冲突场景：

```
1. 客户端发小请求（如 1 字节），Nagle 攒着等 ACK
2. 服务端收到，延迟确认 40ms
3. 客户端等不到 ACK，Nagle 不发后续数据
4. 40ms 后服务端回 ACK，客户端才发下一段
5. 每次小交互都多 40ms 延迟
```

这种"延迟确认 + Nagle"组合在 HTTP 请求-响应模型中常见，导致 200ms+ 延迟。

### Linux 参数

```bash
# 默认开启延迟确认
$ sysctl net.ipv4.tcp_delack_min
net.ipv4.tcp_delack_min = 40  # 最小延迟 40ms

# 关闭延迟确认（不推荐全局关，按 socket 关）
# 应用层用 TCP_QUICKACK 临时禁用
```

### TCP_QUICKACK 选项

```c
int on = 1;
setsockopt(fd, IPPROTO_TCP, TCP_QUICKACK, &on, sizeof(on));
// 临时关闭延迟确认，下次收到数据立即 ACK
// 注意：选项不是持久的，每次 ACK 后会重置回延迟确认
```

### 抓包示例

```bash
# 延迟确认抓包
$ tcpdump -i any -n 'tcp port 80'
10:00:00.000 seq 1000:2000  # 客户端发数据
10:00:00.040 ack 2000       # 40ms 后服务端才 ACK（延迟确认）
# 正常情况应该是几毫秒内 ACK

# 立即确认场景
10:00:01.000 seq 2000:3000  # 第一段
10:00:01.001 seq 3000:4000  # 第二段
10:00:01.001 ack 4000       # 第二段触发立即 ACK
```

## 代码示例

Java 应用层关闭延迟确认（仅 Linux）：

```java
import java.net.*;
import jdk.net.ExtendedSocketOptions;

Socket socket = new Socket("example.com", 80);
// JDK 11+ 支持 TCP_QUICKACK
socket.setOption(ExtendedSocketOptions.TCP_QUICKACK, true);
// 注意：每次 ACK 后内核可能重置回延迟确认，需重复设置
```

实际生产中更推荐关闭 Nagle 而非调整延迟确认：

```java
// 关闭 Nagle 算法，避免和延迟确认冲突
socket.setTcpNoDelay(true);
```

## 实战场景

| 场景 | 影响 | 处理 |
|------|------|------|
| HTTP 请求-响应 | Nagle + 延迟确认导致 40ms 延迟 | 关闭 Nagle 或用 HTTP/2 |
| SSH 交互 | 每个按键延迟 40ms | 关闭 Nagle（SSH 默认关） |
| 大文件传输 | 影响小，ACK 搭车或合并 | 默认配置即可 |
| 实时游戏 | 40ms 延迟不可接受 | UDP 或关 Nagle + QUICKACK |
| 数据库连接 | 短查询延迟敏感 | 关闭 Nagle |

## 深挖追问

**Q1：延迟确认为什么不能延迟超过 2 段？**
RFC 1122 规定，最多延迟一个段的 ACK。如果延迟太多，发送方会误判丢包触发重传。

**Q2：延迟确认一定能减少 ACK 数量吗？**
不一定。如果数据段间隔短（< 40ms），第二段到达立即触发 ACK，没合并效果。只有数据段稀疏时才有合并效果。

**Q3：怎么判断延迟确认影响了性能？**
抓包看 ACK 时间：如果数据段和对应 ACK 间隔恒定 40ms，且整体延迟高，可能是延迟确认 + Nagle 冲突。

**Q4：关闭延迟确认会怎样？**
每个数据段都立即回 ACK，ACK 数量翻倍，CPU 和带宽开销增加。但延迟降低。一般不全局关，按 socket 调整。

**Q5：BBR 拥塞算法和延迟确认冲突吗？**
不冲突。BBR 测量 RTT 时会用 ACK 到达时间，延迟确认会让 RTT 测量略偏大，但 BBR 容忍这种偏差。

## 易错点

- **"延迟确认总是好的"** — 不，和 Nagle 冲突时增加延迟。
- **"延迟确认能合并任意多个 ACK"** — 最多 2 段，超过立即 ACK。
- **"关 Nagle 就解决问题"** — 大部分场景是，但有些情况需要同时关延迟确认。
- **"TCP_QUICKACK 是持久的"** — 不，每次 ACK 后会重置回延迟确认。
- **"延迟确认和 Nagle 是同一机制"** — 不是，前者接收方行为，后者发送方行为。

## 总结

延迟确认是接收方减少 ACK 数量的优化，等 40ms 或等第二段数据再回 ACK。和 Nagle 算法配合时可能引发 40ms+ 延迟，是 HTTP 短交互的常见性能问题。生产中通常用 `TCP_NODELAY` 关 Nagle 解决，必要时用 `TCP_QUICKACK` 关延迟确认。大文件传输场景延迟确认影响小，默认配置即可。

## 参考资料

- [RFC 1122 — Delayed ACK](https://datatracker.ietf.org/doc/html/rfc1122#section-4.2.3.2)
- [RFC 2581 — TCP Congestion Control](https://datatracker.ietf.org/doc/html/rfc2581)
- [Linux TCP_QUICKACK 文档](https://man7.org/linux/man-pages/man7/tcp.7.html)
