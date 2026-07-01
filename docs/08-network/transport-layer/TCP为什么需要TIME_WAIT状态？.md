# TCP 为什么需要 TIME_WAIT 状态

## 核心概念

TIME_WAIT 是 TCP 主动关闭方在四次挥手最后阶段进入的状态，持续 2 MSL（Linux 默认 60 秒）。它存在的唯一目的是**善后**：保证最后一个 ACK 能可靠到达对端，并防止旧连接的报文在新连接中被错误接收。

## 标准回答

TIME_WAIT 解决两个问题：

1. **防止旧报文复活**：连接关闭后，网络中可能还有延迟到达的报文。TIME_WAIT 保留五元组信息 2 MSL，确保任何迷途报文在此期间到达都会被丢弃而不是被新连接接收。
2. **保证被动方可靠收到最后的 ACK**：如果主动方发的最后 ACK 丢了，被动方会重传 FIN；TIME_WAIT 期间主动方还能重发 ACK。

少了 TIME_WAIT，这两个问题会导致数据错乱和连接复位。

## 详细机制

### 2 MSL 的来历

MSL 是 Maximum Segment Lifetime，RFC 793 建议 2 分钟，Linux 默认 30 秒，所以 TIME_WAIT 持续 60 秒。这 2 MSL 分别对应：

- **MSL 1**：主动方发的 ACK 到达被动方的最长时间
- **MSL 2**：如果被动方没收到 ACK，重传 FIN 到达主动方的最长时间

两者加起来覆盖了"最后一个 ACK 可能丢失并触发 FIN 重传"的完整链路。

### 防止旧报文复活的场景

```
时间线：
T0: 连接 A (src_port=5000, dst_port=80) 关闭
T1: 同一客户端立即用 src_port=5000 再连同一服务端 → 新连接 B
T2: 旧连接 A 的延迟报文到达，seq 恰好落在新连接 B 的接收窗口内 → 数据错乱！
```

如果有 TIME_WAIT，T1 时端口 5000 还在被占用，客户端必须等 60 秒后才能复用，旧报文早就 TTL 过期被丢弃了。

注意：序列号是 32 位，会回绕。光靠序列号无法区分新旧连接的数据，所以必须靠时间窗口隔离。

### 实现：连接表项保留

Linux 中 TIME_WAIT 状态的 sock 结构仍占用哈希表项，但**不占用文件描述符**，也不占用 send/recv buffer。这就是为什么 TIME_WAIT 高时内存涨但 fd 不涨。

```bash
# 查看 TIME_WAIT 占用
$ ss -tan state time-wait | wc -l
12345

# 内核计数器
$ cat /proc/net/netstat | grep -i tw
```

### 抓包示例

```bash
$ tcpdump -i any -n 'tcp port 80 and host 10.0.0.2'
10:00:00 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [F.], seq 1500, ack 2000
10:00:00 IP 10.0.0.2.80 > 10.0.0.1.5000: Flags [.], ack 1501
10:00:00 IP 10.0.0.2.80 > 10.0.0.1.5000: Flags [F.], seq 2000, ack 1501
10:00:00 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [.], ack 2001
# —— 主动方进入 TIME_WAIT，等 60 秒 ——
10:01:00 [连接项被释放]
```

## 代码示例

触发 TIME_WAIT 的最简单方式：

```java
import java.net.*;

public class TimeWaitDemo {
    public static void main(String[] args) throws Exception {
        // 客户端主动关闭 —— 会进入 TIME_WAIT
        for (int i = 0; i < 1000; i++) {
            Socket socket = new Socket("example.com", 80);
            socket.close(); // 主动关闭方
        }
        // 此时本机会有大量 TIME_WAIT
        // 用 ss -tan state time-wait | wc -l 验证
    }
}
```

控制 TIME_WAIT 行为的内核参数：

```bash
# 允许将 TIME_WAIT 状态的连接重新用于新的 TCP 连接
$ sysctl net.ipv4.tcp_tw_reuse=1

# 是否开启 TIME_WAIT 快速回收（已废弃，强烈不建议开启）
$ sysctl net.ipv4.tcp_tw_recycle=0  # 4.12 内核后已移除
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 短连接服务压测 | 客户端 TIME_WAIT 暴涨到几万 | 改长连接、连接池 |
| 服务端主动关闭 | 服务端 TIME_WAIT 多 | 改为客户端主动关闭，或开 `tcp_tw_reuse` |
| NAT 环境下连接复用失败 | 部分 SYN 没响应 | 旧版内核开过 `tcp_tw_recycle`，4.12 后已移除 |
| 端口耗尽 | `Cannot assign requested address` | 增大 `ip_local_port_range`，开启 `tcp_tw_reuse` |

## 深挖追问

**Q1：TIME_WAIT 在主动方还是被动方？**
主动关闭方。被动方收到主动方的 FIN 后回 ACK 进入 `CLOSE_WAIT`，应用层 close() 后发自己的 FIN 进入 `LAST_ACK`，收到 ACK 后直接 `CLOSED`，不经过 TIME_WAIT。

**Q2：为什么 `tcp_tw_recycle` 被移除了？**
它在 NAT 环境下会出问题：内核用 timestamp 判断报文是否来自同一连接，但 NAT 后多台机器 timestamp 不一致，导致部分连接被错误丢弃。Linux 4.12 起彻底移除该选项。

**Q3：TIME_WAIT 占多少内存？**
每个 TIME_WAIT 项约 1.5-3 KB（取决于内核版本）。10 万条 TIME_WAIT 约 30 MB，不算大；但哈希表查找性能会下降。

**Q4：服务端能避免 TIME_WAIT 吗？**
可以让客户端主动关闭（HTTP 1.1 默认 keep-alive，关闭由客户端发起）。但有些场景服务端必须主动关闭（如关闭空闲连接），这时可启用 `tcp_tw_reuse` 让新连接复用 TIME_WAIT 端口。

**Q5：为什么不是 4 MSL？**
一个丢包率 1% 的网络，连续两次丢包概率只有万分之一，2 MSL 已经足够。再加长只是浪费资源。

## 易错点

- **"TIME_WAIT 在被动方"** — 反了，在主动关闭方。
- **"调短 TIME_WAIT 时间就好了"** — Linux 中 TIME_WAIT 时长不可调（固定 60 秒），可调的是 `tcp_tw_reuse` 和 `tcp_tw_recycle`（已废弃）。
- **"TIME_WAIT 占用 fd"** — 不占，TIME_WAIT 不持有 fd，只占内核连接表项。
- **"开启 `tcp_tw_reuse` 就没风险"** — 它依赖 `tcp_timestamps`，且只在主动方起作用；老内核兼容性问题需评估。

## 总结

TIME_WAIT 是 TCP 设计中"宁可浪费资源也要保证正确性"的体现。它防止旧报文复活、保证最后 ACK 可达。生产中 TIME_WAIT 过多通常是短连接+主动关闭导致，治本是改长连接，治标是开 `tcp_tw_reuse`。`tcp_tw_recycle` 已废弃，不要再开。

## 参考资料

- [RFC 793 — TCP, Section 3.5 Closing a Connection](https://datatracker.ietf.org/doc/html/rfc793#section-3.5)
- [RFC 1337 — TIME-WAIT State Hazards](https://datatracker.ietf.org/doc/html/rfc1337)
- [Linux kernel: tcp_tw_recycle removal](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=4396e46187ca)
