# 什么是 SYN 攻击？半连接和全连接队列

## 核心概念

SYN 攻击是 TCP 协议设计缺陷衍生的 DoS 攻击：攻击者伪造源 IP 发大量 SYN 包，服务端回复 SYN+ACK 后等不到第三次 ACK，半连接队列被占满，正常用户无法建连。理解攻击要先理解 TCP 三次握手期间内核维护的两个队列：**半连接队列（SYN Queue）**和**全连接队列（Accept Queue）**。

## 标准回答

三次握手期间内核维护两个队列：

```
Client                    Server
  |                         |
  | --- SYN --------------> |  SYN 进 SYN Queue，回 SYN+ACK
  |                         |  SYN Queue: [半连接1, 半连接2, ...]
  | <== SYN+ACK ============ |
  |                         |
  | --- ACK --------------> |  收到 ACK，从 SYN Queue 取出，
  |                         |  放入 Accept Queue
  |                         |  Accept Queue: [完整连接1, ...]
  |                         |
                      accept() 取出
```

- **半连接队列（SYN Queue）**：收到 SYN 但还没收到第三次 ACK 的连接，状态 `SYN_RCVD`
- **全连接队列（Accept Queue）**：三次握手完成、等待应用 accept() 的连接，状态 `ESTABLISHED`

两个队列都有上限，满了之后新连接被丢弃或回 RST。

SYN 攻击就是打满半连接队列，让正常用户建不了连。防御主要靠 SYN Cookies。

## 详细机制

### 队列大小控制

**全连接队列大小** = `min(somaxconn, backlog)`：
- `somaxconn`：内核参数，默认 128（新版本默认 4096）
- `backlog`：`listen()` 系统调用参数，应用层指定

```bash
$ sysctl net.core.somaxconn
net.core.somaxconn = 4096
```

**半连接队列大小** = `min(max_syn_backlog, somaxconn, backlog)` 的复杂运算（不同内核版本略有差异）：
- `tcp_max_syn_backlog`：内核参数，默认 1024

### 队列满时的行为

| 队列 | 满时行为 | 控制参数 |
|------|---------|---------|
| 全连接队列 | 默认丢弃 ACK；`tcp_abort_on_overflow=1` 时回 RST | `tcp_abort_on_overflow` |
| 半连接队列 | 丢弃 SYN | - |

### SYN 攻击原理

```
攻击者伪造源 IP 发大量 SYN:
  攻击者 → Server: SYN (源 IP = 伪造)
  Server → 伪造 IP: SYN+ACK (永远不会收到 ACK)
  Server: 半连接占满，正常 SYN 被丢弃
```

特征：服务端 `SYN_RCVD` 状态连接数暴涨，正常用户连接超时。

### 防御方案

**方案 1：开启 SYN Cookies（最有效）**

```bash
$ sysctl net.ipv4.tcp_syncookies=1
```

开启后，半连接队列满时不丢弃 SYN，而是用一个 Cookie 算法构造初始序列号：

```
Server 收到 SYN（半连接队列已满）
  ↓
计算 cookie = hash(源IP, 源端口, 时间, 密钥)
  ↓
回 SYN+ACK，seq = cookie
  ↓
不保存半连接状态（不占队列）
  ↓
收到客户端 ACK，验证 ack-1 是否是合法 cookie
  ↓
合法 → 直接入全连接队列
```

SYN Cookies 让服务端**不需要维护半连接状态**，从根本上解决队列耗尽问题。

**方案 2：增大半连接队列**

```bash
$ sysctl net.ipv4.tcp_max_syn_backlog=8192
$ sysctl net.core.somaxconn=8192
```

需要同时调大三个参数：`tcp_max_syn_backlog`、`somaxconn`、应用 listen 的 backlog。

**方案 3：减少 SYN+ACK 重传次数**

```bash
$ sysctl net.ipv4.tcp_synack_retries=2  # 默认 5，调小加速清理
```

`SYN_RCVD` 状态的连接会重传 SYN+ACK，重传次数达到上限后清理。调小能更快释放半连接。

**方案 4：调大网卡 backlog**

```bash
$ sysctl net.core.netdev_max_backlog=10000
```

网卡收到包的速度快于内核处理速度时，包缓存在 netdev backlog。调大避免丢包。

### 抓包与监控

```bash
# 查看 SYN_RCVD 状态连接数（半连接队列）
$ ss -tan state syn-recv | wc -l

# 查看全连接队列大小（Send-Q 是队列上限，Recv-Q 是当前队列长度）
$ ss -tln
State  Recv-Q Send-Q Local Address:Port
LISTEN 0      511    0.0.0.0:8080
# Recv-Q > 0 表示全连接队列有积压

# 内核 SYN 攻击计数
$ nstat -az TcpExtTCPReqQFullDoCookies TcpExtTCPReqQFullDrop
TcpExtTCPReqQFullDoCookies  12345   # 触发 SYN Cookie 次数
TcpExtTCPReqQFullDrop       0       # 队列满丢包次数（理想为 0）
```

### 抓包示例

```bash
# SYN 攻击特征：大量 SYN，源 IP 分散，没有后续 ACK
$ tcpdump -i any -n 'tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-ack == 0'
10:00:01 IP 1.2.3.4.12345 > 10.0.0.1.80: Flags [S], seq 123
10:00:01 IP 5.6.7.8.23456 > 10.0.0.1.80: Flags [S], seq 456
10:00:01 IP 9.10.11.12.34567 > 10.0.0.1.80: Flags [S], seq 789
... (源 IP 持续变化，没有 ACK 回包)
```

## 代码示例

Java 服务端调整 backlog：

```java
import java.net.*;

// backlog = 8192，影响全连接队列大小
ServerSocket server = new ServerSocket(8080, 8192);
```

Netty 调整：

```java
ServerBootstrap b = new ServerBootstrap();
b.group(boss, worker)
 .channel(NioServerSocketChannel.class)
 .option(ChannelOption.SO_BACKLOG, 8192)  // 全连接队列大小
 .childOption(ChannelOption.TCP_NODELAY, true);
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 突发流量下连接失败 | 全连接队列满，ACK 被丢 | 调大 backlog 和 somaxconn |
| DDoS 攻击 | SYN_RCVD 暴涨 | 开启 SYN Cookies |
| 短连接压测失败 | 队列积压 | 调大 backlog，应用层加速 accept |
| 客户端报 connection refused | 全连接队列满回 RST | `tcp_abort_on_overflow=1` 时会回 RST |
| 高并发服务上线 | 担心队列不够 | 评估峰值 QPS，调大三个参数 |

## 深挖追问

**Q1：SYN Cookies 有副作用吗？**
失去了一些 TCP 选项能力（MSS、Window Scale、SACK 等无法在 Cookie 模式下协商）。所以默认是 1（队列满才启用），不是 2（总是启用）。

**Q2：半连接队列满了会怎样？**
默认丢弃新 SYN，客户端重试。开启 SYN Cookies 后改为 Cookie 模式建连，不丢包。

**Q3：全连接队列满了会怎样？**
默认丢弃客户端第三次握手的 ACK（客户端会重传 ACK）；`tcp_abort_on_overflow=1` 时回 RST，客户端立即收到 connection refused。

**Q4：accept() 速度跟不上怎么办？**
应用层用线程池处理 accept 后的连接；或用 Netty/Vert.x 等异步框架。也可以增加 accept 线程数。

**Q5：somaxconn 默认 128 够吗？**
高并发不够。Linux 4.19+ 默认 4096，老版本默认 128。生产建议调到 8192 以上。

## 易错点

- **"半连接队列满了就会断开"** — 不，是丢弃新 SYN，已有半连接继续等 ACK。
- **"backlog 只控制半连接队列"** — 错，backlog 控制全连接队列。
- **"SYN Cookies 总是开启好"** — 不，会丢失 TCP 选项，默认按需开启（值=1）。
- **"全连接队列满了客户端会立即知道"** — 默认不会，ACK 被丢，客户端要等超时。
- **"调大 tcp_max_syn_backlog 就够了"** — 不够，半连接队列大小受 min(max_syn_backlog, somaxconn, backlog) 限制，要同时调大。

## 总结

SYN 攻击利用 TCP 半连接队列耗尽资源，防御核心是 SYN Cookies。生产中要同时调大 `somaxconn`、`tcp_max_syn_backlog`、应用 listen 的 backlog 三个参数，并开启 `tcp_syncookies=1`。监控看 `ss -tan state syn-recv` 和 `nstat TcpExtTCPReqQFullDoCookies`。全连接队列积压看 `ss -tln` 的 Recv-Q。

## 参考资料

- [RFC 4987 — TCP SYN Flooding Attack and Common Mitigations](https://datatracker.ietf.org/doc/html/rfc4987)
- [SYN Cookies — Bernstein](https://cr.yp.to/syncookies.html)
- [Linux TCP backlog 文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
