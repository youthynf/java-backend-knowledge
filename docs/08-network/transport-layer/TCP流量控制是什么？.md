# TCP 流量控制是什么

## 核心概念

流量控制（Flow Control）是 TCP 防止"发送方发太快淹没接收方"的机制。本质是接收方反向告诉发送方"我还能收多少"，发送方据此调节发送速率。它和拥塞控制不同——流量控制关注**对端**的处理能力，拥塞控制关注**网络**的承载能力。

## 标准回答

流量控制通过**滑动窗口**实现：

1. 接收方在 ACK 报文的 Window 字段通告"我还能收多少字节"。
2. 发送方窗口不超过这个值。
3. 接收方应用层读取数据后缓冲区腾出空间，下一次 ACK 通告更大的窗口。
4. 缓冲区满时通告 Window=0，发送方暂停；通过窗口探测恢复。

发送窗口 = min(RWND, CWND)，其中 RWND 是这里说的接收方通告窗口。

## 详细机制

### 操作系统缓冲区与窗口

接收窗口本质是操作系统接收缓冲区的剩余空间。应用层 read() 把数据从内核缓冲区取走，腾出空间，下次 ACK 时通告更大的窗口。

```
[内核接收缓冲区]
| 已收未读 | 可接收（窗口） |
          ^               ^
        RCV.NXT     RCV.NXT + RCV.WND
```

### 窗口关闭与死锁

接收方通告 Window=0 时，发送方停发。如果接收方之后腾出空间通告非 0 窗口的 ACK 丢失，双方死锁：发送方等窗口更新，接收方等数据。TCP 用**持续计时器**（Persist Timer）解决：发送方收到 Window=0 后启动定时器，超时后发 1 字节探测包，强制接收方回应新窗口。

```bash
# Linux 中窗口探测次数受 tcp_retries2 控制（默认 15 次）
$ sysctl net.ipv4.tcp_retries2
```

### 糊涂窗口综合症（Silly Window Syndrome）

如果接收方每腾出几个字节就通告小窗口，发送方就发几个字节的小包，造成 40 字节头 + 几字节数据的低效传输。这叫糊涂窗口综合症。

**接收方策略（David Clark 算法）**：
- 通告窗口 < min(MSS, 缓冲区/2) 时，通告 Window=0
- 等窗口 ≥ MSS 或 ≥ 缓冲区一半时再通告真实值

**发送方策略（Nagle 算法）**：
- 已发未确认数据未收到 ACK 时，新数据先囤积
- 直到囤够 MSS 或收到上次 ACK 才发
- 默认开启，可用 `TCP_NODELAY` 关闭

两端都启用才能完全避免糊涂窗口。

### 窗口缩放（Window Scale）

16 位 Window 字段最大 65535 字节（64 KB），在高带宽延迟积（BDP）链路上不够。RFC 7323 定义 Window Scale 选项，握手时协商缩放因子 K，实际窗口 = Window 字段值 × 2^K，K 最大 14，所以最大窗口约 1 GB。

```bash
# 查看 Window Scale 是否启用
$ ss -ti
... wscale:8 ...  # 缩放因子 8，实际窗口最大 65535 × 256 = 16 MB
```

### 抓包示例

```bash
$ tcpdump -i any -n 'tcp port 80'
10:00:01 IP 10.0.0.2.80 > 10.0.0.1.5000: Flags [.], ack 1000, win 512, length 0
# win 512 表示接收方还能收 512 字节（未缩放值）
10:00:01 IP 10.0.0.2.80 > 10.0.0.1.5000: Flags [.], ack 2000, win 0, length 0
# win 0：接收方缓冲区满，发送方暂停
10:00:02 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [.], seq 1000:1001, ack 1, win 65535, length 1
# 1 字节窗口探测
10:00:02 IP 10.0.0.2.80 > 10.0.0.1.5000: Flags [.], ack 1000, win 8192, length 0
# 接收方腾出空间，通告新窗口
```

## 代码示例

Java 调整接收缓冲区影响窗口：

```java
import java.net.*;

Socket socket = new Socket("example.com", 80);
// 增大接收缓冲区 → 通告更大的窗口 → 发送方吞吐提升
socket.setReceiveBufferSize(512 * 1024);  // 512 KB
// 关闭 Nagle 算法（小包低延迟场景，如游戏/SSH）
socket.setTcpNoDelay(true);
```

```bash
# 内核级接收缓冲区配置
$ sysctl net.ipv4.tcp_rmem
net.ipv4.tcp_rmem = 4096 87380 6291456  # min default max
$ sysctl net.ipv4.tcp_wmem
net.ipv4.tcp_wmem = 4096 16384 4194304
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 跨地域大文件传输慢 | 窗口不够大，单流吞吐低 | 调大 tcp_rmem/tcp_wmem，启用 wscale |
| 实时交互卡顿 | Nagle 算法攒包延迟 | 关闭 `TCP_NODELAY` |
| 接收方处理慢导致停顿 | Window 频繁到 0 | 应用层异步化或扩容 |
| 长肥管道（LFN）吞吐低 | BDP 大于窗口 | 启用 Window Scale，调大缓冲区 |

## 深挖追问

**Q1：流量控制和拥塞控制区别？**
- 流量控制：接收方驱动，怕淹没接收方，窗口由对端通告
- 拥塞控制：发送方主动，怕淹没网络，窗口自己估算

**Q2：Nagle 算法和延迟确认冲突吗？**
有冲突。Nagle 等收到 ACK 才发，延迟确认推迟 ACK，可能导致 200ms 延迟。Linux 默认延迟确认 + Nagle 都开，但 HTTP 等场景一般关 Nagle 或上层用 writev 一次写完。

**Q3：窗口关闭后会一直关着吗？**
不会。持续计时器到期后发送方发 1 字节探测包，接收方必须回应当前窗口（即使是 0）。多次探测后接收方仍 0，达到 `tcp_retries2` 次数后断开连接。

**Q4：怎么计算合适的接收缓冲区？**
BDP = 带宽 × RTT。比如 1 Gbps × 100ms = 12.5 MB，缓冲区至少 12.5 MB 才能打满带宽。Linux 自动调优（`tcp_moderate_rcvbuf=1`）会根据 RTT 动态调整。

**Q5：窗口字段是字节数还是包数？**
字节数。Window 字段 16 位表示"还能接收多少字节"。

## 易错点

- **"流量控制 = 拥塞控制"** — 不是。前者是端到端的接收方限制，后者是网络感知的发送方限制。
- **"Window=0 就断开"** — 不，是暂停发送，等窗口探测。
- **"Nagle 算法总是好的"** — 不，对延迟敏感场景（SSH、游戏）要关掉。
- **"接收缓冲区越大越好"** — 不一定，过大会增加内存占用，且小内存设备可能撑不住。
- **"窗口字段是发送窗口"** — 是接收方通告的接收窗口，发送窗口 = min(RWND, CWND)。

## 总结

流量控制是 TCP 通过滑动窗口实现的"端到端反压"机制：接收方通告剩余缓冲区，发送方据此调节。窗口关闭、持续计时器、糊涂窗口综合症、Window Scale 是四个关键边界点。和拥塞控制一起决定发送窗口大小，但两者目标不同——一个保护对端，一个保护网络。

## 参考资料

- [RFC 793 — TCP, Section 3.7 Data Communication](https://datatracker.ietf.org/doc/html/rfc793#section-3.7)
- [RFC 7323 — Window Scale](https://datatracker.ietf.org/doc/html/rfc7323)
- [RFC 896 — Congestion Control in IP/TCP (Nagle)](https://datatracker.ietf.org/doc/html/rfc896)
