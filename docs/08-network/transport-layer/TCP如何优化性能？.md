# TCP 如何优化性能

## 核心概念

TCP 性能优化从三个角度入手：**握手阶段**（减少建连开销）、**挥手阶段**（处理 TIME_WAIT 和 CLOSE_WAIT）、**数据传输阶段**（提升吞吐和降低延迟）。每个角度都有对应的内核参数和应用层策略。

## 标准回答

| 优化方向 | 关键参数/策略 |
|---------|-------------|
| 三次握手 | `tcp_syn_retries`、`tcp_synack_retries`、`tcp_max_syn_backlog`、`somaxconn`、`tcp_fastopen` |
| 四次挥手 | `tcp_tw_reuse`、`tcp_max_tw_buckets`、`tcp_fin_timeout`、`tcp_orphan_retries` |
| 数据传输 | `tcp_wmem`、`tcp_rmem`、`tcp_window_scaling`、`tcp_congestion_control`、`tcp_sack` |
| 应用层 | 长连接、连接池、批量发送、压缩 |

核心思路：减少握手延迟、避免连接状态堆积、扩大窗口和缓冲区、用现代拥塞算法（BBR）。

## 详细机制

### 三次握手优化

**客户端优化**：
```bash
# 减少 SYN 重传次数，加速失败（默认 6）
$ sysctl net.ipv4.tcp_syn_retries=3
```

**服务端优化**：
```bash
# 增大半连接队列（默认 1024）
$ sysctl net.ipv4.tcp_max_syn_backlog=8192

# 增大全连接队列上限（默认 128 或 4096）
$ sysctl net.core.somaxconn=8192

# 减少 SYN+ACK 重传次数（默认 5）
$ sysctl net.ipv4.tcp_synack_retries=2

# 开启 SYN Cookies 防 SYN Flood
$ sysctl net.ipv4.tcp_syncookies=1
```

应用层也要调大 listen backlog：

```java
// Java 调整 listen backlog
new ServerSocket(8080, 8192);
```

**TCP Fast Open**（绕过握手）：

```bash
# 开启 TCP Fast Open（默认 0）
# 1=客户端，2=服务端，3=双向
$ sysctl net.ipv4.tcp_fastopen=3
```

TFO 让后续连接在 SYN 阶段就携带数据，省 1 RTT。首次连接仍需握手获取 Cookie。

### 四次挥手优化

**TIME_WAIT 优化**：

```bash
# 复用 TIME_WAIT 端口（仅客户端 connect 生效）
$ sysctl net.ipv4.tcp_tw_reuse=1

# TIME_WAIT 上限（默认 18000，超限直接清除）
$ sysctl net.ipv4.tcp_max_tw_buckets=5000

# 注意：tcp_tw_recycle 已废弃，4.12 起移除
```

**FIN_WAIT 优化**：

```bash
# FIN_WAIT_2 等待被动方 FIN 的最长时间（默认 60 秒）
$ sysctl net.ipv4.tcp_fin_timeout=15

# 孤儿连接（已 close 但未完全关闭）的 FIN 重传次数（默认 0，表示用 tcp_retries2）
$ sysctl net.ipv4.tcp_orphan_retries=3
```

**CLOSE_WAIT 优化**：
不能靠内核参数解决，必须改代码：用 try-with-resources 保证 socket/InputStream 关闭，连接池借出后必须归还。

### 数据传输优化

**窗口与缓冲区**：

```bash
# 启用窗口缩放（默认开启）
$ sysctl net.ipv4.tcp_window_scaling=1

# 发送缓冲区自动调节范围（min default max，字节）
$ sysctl net.ipv4.tcp_wmem="4096 65536 16777216"

# 接收缓冲区自动调节范围
$ sysctl net.ipv4.tcp_rmem="4096 87380 16777216"

# 开启接收缓冲区自动调节
$ sysctl net.ipv4.tcp_moderate_rcvbuf=1
```

缓冲区大小要匹配 BDP（带宽时延积）：

```
BDP = 带宽 × RTT
例：1 Gbps × 100ms = 12.5 MB
缓冲区至少 12.5 MB 才能打满带宽
```

**拥塞控制算法**：

```bash
# 查看当前算法
$ sysctl net.ipv4.tcp_congestion_control
net.ipv4.tcp_congestion_control = cubic

# 切换到 BBR
$ sysctl net.ipv4.tcp_congestion_control=bbr
$ sysctl net.core.default_qdisc=fq
```

BBR 适合高丢包率或跨地域链路，CUBIC 适合低延迟内网。

**SACK 和 Timestamps**：

```bash
# 选择确认（默认开启）
$ sysctl net.ipv4.tcp_sack=1

# 时间戳（默认开启，PAWS 和 RTT 测量必需）
$ sysctl net.ipv4.tcp_timestamps=1
```

### 应用层优化

```java
// 1. 长连接 + 连接池
try (CloseableHttpClient client = HttpClients.custom()
        .setMaxConnTotal(100)
        .setMaxConnPerRoute(20)
        .setDefaultRequestConfig(RequestConfig.custom()
            .setConnectTimeout(5000)
            .setSocketTimeout(10000)
            .build())
        .build()) {
    // 复用连接，避免频繁握手
}

// 2. 批量发送
try (Socket socket = new Socket("...", 80);
     BufferedOutputStream out = new BufferedOutputStream(socket.getOutputStream())) {
    // 缓冲输出，减少小包
    out.write(data);
}

// 3. 关闭 Nagle 算法（仅低延迟场景）
socket.setTcpNoDelay(true);
```

### 抓包与监控

```bash
# 查看连接状态分布
$ ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c

# 查看队列积压
$ ss -tln
# Recv-Q > 0 表示全连接队列积压

# 重传统计
$ nstat -az TcpRetransSegs TcpExtTCPLostRetransmit

# 各连接详细信息（含 cwnd、rto、rtt）
$ ss -ti
```

## 实战场景

| 场景 | 优化策略 |
|------|---------|
| 短连接压测 | 长连接 + tcp_tw_reuse + 调大 port_range |
| 跨地域大文件 | BBR + 调大缓冲区 + Window Scale |
| 高并发服务端 | 调大 somaxconn + backlog + 全连接队列 |
| 实时音视频 | UDP + 应用层 FEC/重传 |
| 内网低延迟 | CUBIC + 关闭 Nagle |
| 弱网移动端 | BBR + 应用层心跳 + 重连 |

## 深挖追问

**Q1：调大缓冲区一定提升吞吐吗？**
不一定。缓冲区超过 BDP 不会进一步提升吞吐，反而浪费内存和增加延迟。要匹配 BDP。

**Q2：BBR 一定比 CUBIC 好吗？**
不一定。BBR 在高丢包率链路优势明显，但在低延迟内网可能不如 CUBIC。BBR 对缓冲区膨胀也敏感。

**Q3：开 `tcp_tw_reuse` 有风险吗？**
风险很小，依赖 timestamps 防止旧报文复活。只在客户端 connect 时生效，服务端 accept 不受影响。

**Q4：TFO 在生产中常用吗？**
不常用。需要客户端和服务端都支持，且首包数据有重放风险。HTTP/3 + QUIC 是更好的替代。

**Q5：内核参数调整后立即生效吗？**
`sysctl -w` 立即生效但重启丢失；写入 `/etc/sysctl.conf` 后 `sysctl -p` 持久化。已建立的连接不受新参数影响。

## 易错点

- **"调大所有参数就好"** — 要根据场景，盲目调大可能浪费内存或引入不稳定。
- **"BBR 总是优于 CUBIC"** — 不一定，看场景。
- **"`tcp_tw_recycle` 还能用"** — 4.12 起移除，不要再开。
- **"调内核参数能解决 CLOSE_WAIT"** — 不能，必须改代码。
- **"缓冲区越大越好"** — 要匹配 BDP，过大浪费内存且增延迟。

## 总结

TCP 性能优化分三个角度：握手阶段调队列和重传次数，挥手阶段处理 TIME_WAIT，数据传输阶段调缓冲区和拥塞算法。生产推荐：长连接 + 连接池 + BBR + 合理缓冲区 + 开启 SACK/timestamps。`tcp_tw_recycle` 已废弃，CLOSE_WAIT 必须改代码。监控看 `ss -tan`、`ss -ti`、`nstat`。

## 参考资料

- [Linux TCP 参数文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
- [BBR 论文](https://research.google/pubs/pub45646/)
- [RFC 7323 — Window Scale](https://datatracker.ietf.org/doc/html/rfc7323)
