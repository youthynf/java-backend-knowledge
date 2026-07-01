# TCP 握手过程数据包丢失会发生什么

## 核心概念

三次握手中任何一个包丢失，TCP 都会重传。重传次数和间隔由内核参数控制，达到上限后放弃连接。理解每种包丢失时的重传行为，是排查"连接建不上"问题的关键。

## 标准回答

| 握手包丢失 | 谁重传 | 重传控制参数 | 默认次数 |
|-----------|--------|------------|---------|
| 第 1 次 SYN | 客户端重传 SYN | `tcp_syn_retries` | 6 |
| 第 2 次 SYN+ACK | 客户端重传 SYN；服务端重传 SYN+ACK | `tcp_syn_retries`；`tcp_synack_retries` | 6；5 |
| 第 3 次 ACK | 服务端重传 SYN+ACK | `tcp_synack_retries` | 5 |

每次重传间隔指数退避（1s、2s、4s、8s...），达到上限后放弃。ACK 不会被重传，丢失后由对方重传对应的数据/SYN+ACK 触发新的 ACK。

## 详细机制

### 第 1 次握手 SYN 丢失

客户端发 SYN 后等 SYN+ACK，超时未收到则重传 SYN。Linux 默认 `tcp_syn_retries=6`，每次间隔指数退避：

```
T=0s:    发 SYN
T=1s:    重传 1
T=3s:    重传 2
T=7s:    重传 3
T=15s:   重传 4
T=31s:   重传 5
T=63s:   重传 6
T=127s:  放弃，连接失败
```

总耗时约 127 秒。客户端从 `SYN_SENT` 回到 `CLOSED`，应用层 connect() 返回 `ETIMEDOUT`。

### 第 2 次握手 SYN+ACK 丢失

第二次握手既是对客户端 SYN 的确认，又是服务端自己的 SYN。丢失后双方都会重传：

- **客户端**：没收到 ACK，认为自己的 SYN 丢了，重传 SYN（受 `tcp_syn_retries` 控制）
- **服务端**：没收到第三次 ACK，认为自己的 SYN+ACK 丢了，重传 SYN+ACK（受 `tcp_synack_retries` 控制，默认 5 次）

服务端重传间隔指数退避，5 次后从 `SYN_RCVD` 回到 `CLOSED`，半连接被清理。

### 第 3 次握手 ACK 丢失

客户端已进入 `ESTABLISHED`，但服务端还在 `SYN_RCVD`。ACK 丢失后：

- 客户端不会重传 ACK（ACK 不重传）
- 服务端超时重传 SYN+ACK（受 `tcp_synack_retries` 控制）
- 服务端重传期间收到客户端的数据包，数据包自带 ACK 标志，会同时完成第三次握手，服务端进入 `ESTABLISHED`

如果客户端不发数据，服务端重传 SYN+ACK 达上限后放弃，连接关闭。客户端再发数据时会收到 RST。

### ACK 为什么不重传

TCP 的 ACK 是"附赠品"——任何数据包都自带 ACK 标志。如果 ACK 丢了，对方重传对应的 SYN/SYN+ACK/数据时，本端会再次回 ACK。所以单独的 ACK 包不需要重传机制。

### 内核参数

```bash
# 客户端 SYN 重传次数（默认 6）
$ sysctl net.ipv4.tcp_syn_retries

# 服务端 SYN+ACK 重传次数（默认 5）
$ sysctl net.ipv4.tcp_synack_retries

# 数据段重传次数（默认 15）
$ sysctl net.ipv4.tcp_retries2
```

### 抓包示例

```bash
$ tcpdump -i any -n 'tcp port 80 and host 10.0.0.2'
# SYN 丢失场景
10:00:00 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [S], seq 1000  # 第 1 次
10:00:01 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [S], seq 1000  # 重传 1
10:00:03 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [S], seq 1000  # 重传 2
10:00:07 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [S], seq 1000  # 重传 3
# 序列号不变，间隔指数退避
```

## 代码示例

Java 客户端设置 connect 超时避免长时间等待：

```java
import java.net.*;

Socket socket = new Socket();
// 5 秒连接超时，不让 connect 等 127 秒
socket.connect(new InetSocketAddress("example.com", 80), 5000);
// 超时抛 SocketTimeoutException
```

调整内核参数加速失败：

```bash
# 减小 SYN 重传次数，加速失败（适合短连接客户端）
$ sysctl net.ipv4.tcp_syn_retries=3
# 总耗时从 127 秒缩短到 15 秒
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 服务端宕机 | 客户端 connect 卡 127 秒 | 设 connect 超时；减小 `tcp_syn_retries` |
| 防火墙丢 SYN | 客户端重传 SYN 多次 | 检查防火墙规则 |
| 网络抖动 | 偶发重传后成功 | 监控重传统计 |
| 半连接队列满 | 服务端不回 SYN+ACK | 调大 `tcp_max_syn_backlog` |
| SYN Flood 攻击 | 服务端 SYN_RCVD 暴涨 | 开启 SYN Cookies |

## 深挖追问

**Q1：为什么 SYN 重传间隔是指数退避？**
网络拥塞时退避能减轻负担；如果间隔固定，重传风暴会加剧拥塞。

**Q2：第三次握手 ACK 丢失，服务端能发数据吗？**
不能。服务端还在 `SYN_RCVD`，必须收到 ACK 进入 `ESTABLISHED` 才能发数据。

**Q3：`tcp_syn_retries=0` 会怎样？**
发一次 SYN 不重传，超时立即失败。某些场景下用于快速失败检测。

**Q4：客户端重传 SYN 时序列号会变吗？**
不会。重传的是同一个 SYN，序列号保持不变。这是和 QUIC 的区别——QUIC 每次重传用新的 Packet Number。

**Q5：connect 超时和 `tcp_syn_retries` 的关系？**
connect 超时是应用层设置，会限制总等待时间；`tcp_syn_retries` 是内核参数，决定最多重传几次。应用层超时通常更短，先触发。

## 易错点

- **"ACK 会重传"** — 不会，ACK 丢失由对方重传对应包触发新 ACK。
- **"重传 SYN 序列号会变"** — 不变，是同一个包的重传。
- **"重传间隔固定"** — 指数退避，越来越长。
- **"第三次握手丢了连接失败"** — 客户端已 ESTABLISHED，发数据时能补完握手；只有不发数据且服务端重传达上限才失败。
- **"connect 超时是 RTO"** — 不是，是应用层设置的固定超时。

## 总结

三次握手每个包丢失都有对应重传机制：SYN 丢失客户端重传，SYN+ACK 丢失双方都重传，ACK 丢失服务端重传 SYN+ACK。重传次数由 `tcp_syn_retries` 和 `tcp_synack_retries` 控制，默认 6 次和 5 次，指数退避。生产中调小这两个参数能加速失败检测，应用层应设 connect 超时避免长时间卡死。

## 参考资料

- [RFC 793 — TCP, Section 3.4](https://datatracker.ietf.org/doc/html/rfc793#section-3.4)
- [Linux tcp_syn_retries 文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
