# TCP 三次握手 SYN 报文什么情况下会被丢弃

## 核心概念

服务端收到客户端 SYN 后正常情况会回 SYN+ACK 并放入半连接队列。但某些场景下 SYN 会被直接丢弃，客户端表现为 connect 超时。常见原因有两类：**队列满**（半连接队列或全连接队列溢出）和 **NAT 环境下 `tcp_tw_recycle` 误判**（已废弃但老系统仍可能开启）。理解丢 SYN 的触发条件是排查"连接建不上但服务正常"问题的关键。

## 标准回答

SYN 被丢弃的典型场景：

1. **半连接队列满**：服务端收到 SYN 时半连接队列已满，默认丢弃 SYN。
2. **全连接队列满**：第三次握手 ACK 到达时全连接队列满，默认丢弃 ACK。
3. **`tcp_tw_recycle` + NAT**：per-host PAWS 机制在 NAT 下误杀合法 SYN（4.12 起移除）。
4. **防火墙/iptables 规则**：显式 DROP 含 SYN 标志的包。
5. **反向路径过滤（rp_filter）**：源 IP 反向路由不一致时丢包。

## 详细机制

### 场景 1：半连接队列满

收到 SYN 时内核会把它加入半连接队列（SYN Queue），队列长度受 `tcp_max_syn_backlog` 限制：

```bash
# 查看半连接队列上限
$ sysctl net.ipv4.tcp_max_syn_backlog
net.ipv4.tcp_max_syn_backlog = 1024

# 查看当前 SYN_RCVD 状态连接数（即半连接队列占用）
$ ss -tan state syn-recv | wc -l
1024   # 已满
```

队列满时的行为：

| `tcp_syncookies` | 行为 |
|------------------|------|
| 0（关闭） | 丢弃新 SYN |
| 1（默认） | 不存半连接，用 Cookie 算法建连，不丢 SYN |

开启 SYN Cookies 是防 SYN Flood 攻击和队列耗尽的标准方案。

### 场景 2：全连接队列满

第三次握手 ACK 到达时，内核把连接从半连接队列移到全连接队列。全连接队列满时：

```bash
# 查看全连接队列状态（ss -tln 的 Recv-Q 是当前队列长度，Send-Q 是上限）
$ ss -tln
State  Recv-Q Send-Q Local Address:Port
LISTEN 128    511    0.0.0.0:8080
# Recv-Q=128 表示队列已积压 128，上限 511

# 全连接队列上限 = min(somaxconn, listen backlog)
$ sysctl net.core.somaxconn
net.core.somaxconn = 4096
```

全连接队列满时的行为由 `tcp_abort_on_overflow` 控制：

| `tcp_abort_on_overflow` | 行为 |
|-------------------------|------|
| 0（默认） | 丢弃 ACK，等客户端重传或服务端重传 SYN+ACK |
| 1 | 回 RST，客户端立即收到 ECONNREFUSED |

默认丢弃是为了给应用层 accept 留时间。但持续丢弃会导致客户端 connect 超时。

### 场景 3：tcp_tw_recycle + NAT（已废弃）

`tcp_tw_recycle` 在 4.12 起被移除，但老内核仍可能开启。开启后启用 per-host PAWS：

```
启用 tcp_tw_recycle + tcp_timestamps：
  内核对每个对端 IP 维护"最近最大时间戳"
  收到包时检查时间戳是否递增
  - 时间戳小于记录值 → 判定为旧包，丢弃
```

NAT 环境下多台内网机器经过 NAT 后对外是同一 IP，但各自时间戳基于本地 CPU tick，可能不递增：

```
内网机器 A（timestamp=100）→ NAT → Server
内网机器 B（timestamp=50） → NAT → Server

Server 看到对端 IP 相同，期望时间戳递增
B 的时间戳 50 < A 的 100 → B 的 SYN 被丢弃
```

这是 4.12 移除该参数的根本原因。

### 场景 4：防火墙规则

```bash
# iptables 显式 DROP
$ iptables -L -n | grep -i drop
DROP  tcp  --  0.0.0.0/0  0.0.0.0/0  tcp dpt:8080

# nftables 类似
$ nft list ruleset | grep drop
```

防火墙 DROP 而非 REJECT 时客户端会等 connect 超时，不立即收到错误。

### 场景 5：反向路径过滤

Linux `rp_filter` 检查源 IP 的反向路由是否与入接口一致：

```bash
# 查看配置
$ sysctl net.ipv4.conf.all.rp_filter
net.ipv4.conf.all.rp_filter = 1   # 严格模式

# 1（严格）：反向路由必须经过同一接口，否则丢包
# 2（宽松）：只要有反向路由即可
# 0：关闭
```

非对称路由场景下严格模式会误丢 SYN。

### 抓包与监控

```bash
# 抓 SYN 包，确认是否到达服务端
$ tcpdump -i any -n 'tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-ack == 0 and host 10.0.0.2'
10:00:01 IP 10.0.0.1.5000 > 10.0.0.2.8080: Flags [S], seq 1000
10:00:02 IP 10.0.0.1.5000 > 10.0.0.2.8080: Flags [S], seq 1000  # 重传
10:00:04 IP 10.0.0.1.5000 > 10.0.0.2.8080: Flags [S], seq 1000  # 重传
# 服务端没回 SYN+ACK，说明 SYN 被丢弃

# 内核丢包统计
$ nstat -az | grep -iE "ListenDrop|ListenOverflow"
TcpExtListenOverflows  123   # 全连接队列溢出次数
TcpExtListenDrops      456   # 半连接队列溢出次数
TcpExtTCPReqQFullDrop  789   # SYN 丢包次数
```

## 代码示例

Java 服务端调大 backlog：

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
 .option(ChannelOption.SO_BACKLOG, 8192);
```

内核参数调整：

```bash
# 调大半连接队列
$ sysctl net.ipv4.tcp_max_syn_backlog=8192

# 调大全连接队列
$ sysctl net.core.somaxconn=8192

# 开启 SYN Cookies（防 SYN Flood）
$ sysctl net.ipv4.tcp_syncookies=1

# 全连接队列满时回 RST（让客户端快速失败）
$ sysctl net.ipv4.tcp_abort_on_overflow=1
```

## 实战场景

| 场景 | 现象 | 排查 |
|------|------|------|
| 高并发短连接 | 客户端 connect 超时 | 看 `nstat TcpExtListenOverflows` |
| SYN Flood 攻击 | SYN_RCVD 暴涨 | 开启 SYN Cookies |
| 应用 accept 慢 | 全连接队列积压 | 加大应用线程池，看 `ss -tln` Recv-Q |
| NAT 环境连接失败 | 部分客户端连不上 | 关闭 `tcp_tw_recycle`（已废弃） |
| 非对称路由 | SYN 丢包 | `rp_filter=2` |

## 深挖追问

**Q1：SYN Cookies 为什么能防 SYN Flood？**
SYN Cookies 不保存半连接状态，用 Cookie 算法把状态编码进 ISN。客户端 ACK 时验证 Cookie，合法直接进全连接队列。攻击者伪造源 IP 收不到 SYN+ACK，无法完成第三次握手。

**Q2：全连接队列满时为什么默认丢弃而不是 RST？**
给应用层 accept 留时间。短暂积压是正常的（突发流量），RST 会让客户端立即失败，影响用户体验。只有持续积压才需要 `tcp_abort_on_overflow=1`。

**Q3：`somaxconn` 和 `backlog` 的关系？**
全连接队列大小 = `min(somaxconn, backlog)`。`somaxconn` 是内核全局上限，`backlog` 是 listen 时应用指定的值。两者都要调大。

**Q4：`tcp_tw_recycle` 在 4.12 后还有问题吗？**
4.12 起内核彻底移除该参数，写 `/proc/sys/net/ipv4/tcp_tw_recycle` 不会报错但不生效。生产环境不会再因它丢 SYN。

**Q5：客户端怎么知道是 SYN 被丢弃？**
抓包看服务端是否回了 SYN+ACK。如果客户端发了 SYN 但服务端没回，且服务端进程正常，大概率是 SYN 被丢弃。

## 易错点

- **"客户端 connect 超时就是服务端没启动"** — 不一定，可能是 SYN 被丢弃。
- **"`tcp_syncookies=1` 总是启用 SYN Cookies"** — 不，默认值 1 表示"队列满才启用"，值 2 才是总是启用。
- **"调大 `tcp_max_syn_backlog` 就够了"** — 不够，半连接队列大小受 `min(max_syn_backlog, somaxconn, backlog)` 限制，要同时调大。
- **"`tcp_tw_recycle` 还能开"** — 4.12 起移除，老内核上 NAT 环境会丢 SYN。
- **"全连接队列满会立刻报错"** — 默认丢弃 ACK，客户端要等 connect 超时。

## 总结

SYN 被丢弃主要因队列满和 NAT 误判。生产中要同时调大 `somaxconn`、`tcp_max_syn_backlog`、应用 listen backlog 三个参数，开启 `tcp_syncookies=1`。`tcp_tw_recycle` 已废弃，不要再开。排查看 `nstat TcpExtListenOverflows/Drops` 和 `ss -tln` 的 Recv-Q。

## 参考资料

- [RFC 4987 — TCP SYN Flooding Attack and Common Mitigations](https://datatracker.ietf.org/doc/html/rfc4987)
- [Linux TCP backlog 文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
- [Linux 4.12 移除 tcp_tw_recycle](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=4396e46187ca)
