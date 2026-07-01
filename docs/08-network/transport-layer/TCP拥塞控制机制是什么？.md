# TCP 拥塞控制机制是什么

## 核心概念

拥塞控制是 TCP 防止"过多数据涌入网络导致路由器队列溢出"的机制。和流量控制不同——流量控制关心对端撑不撑得住，拥塞控制关心网络撑不撑得住。没有拥塞控制，所有连接一起重传，会导致网络进入拥塞崩溃（congestion collapse），1986 年互联网曾因此吞吐量下降到正常值的 1/1000。

## 标准回答

TCP 拥塞控制四个经典算法：

1. **慢启动**（Slow Start）：CWND 从 1 MSS 开始，每收到一个 ACK 翻倍，指数增长，快速探测网络容量。
2. **拥塞避免**（Congestion Avoidance）：CWND 达到 ssthresh 后改为线性增长（每 RTT 加 1 MSS），谨慎试探。
3. **快重传**（Fast Retransmit）：连续收到 3 次重复 ACK 立即重传丢失段，不等超时。
4. **快恢复**（Fast Recovery）：快重传后不回到慢启动，而是 CWND 减半继续线性增长。

超时重传触发时回到慢启动；快重传触发时只减半。

## 详细机制

### CWND 和 ssthresh

- **CWND**（Congestion Window）：发送方维护的拥塞窗口，单位 MSS
- **ssthresh**（Slow Start Threshold）：慢启动门限，默认 65535 字节
- 实际发送窗口 = min(CWND, RWND)

### 慢启动

连接刚建立时 CWND = 初始值（Linux 默认 10 MSS，RFC 6928 IW10）。每收到一个 ACK，CWND += 1 MSS。一个 RTT 内收到 CWND 个 ACK，所以下一轮 CWND 翻倍——指数增长。

```
RTT 0: CWND=1, 发 1 包
RTT 1: 收到 1 ACK, CWND=2, 发 2 包
RTT 2: 收到 2 ACK, CWND=4, 发 4 包
RTT 3: 收到 4 ACK, CWND=8, 发 8 包
...
```

CWND ≥ ssthresh 时切换到拥塞避免。

### 拥塞避免

CWND 每收到一个 ACK 增加 1/CWND MSS（约等于每 RTT 增加 1 MSS），线性增长。增长慢，试探网络的极限容量。

### 拥塞发生：两种触发

**超时重传触发**（严重拥塞）：
- ssthresh = CWND / 2
- CWND = 初始值（1 MSS 或 IW10）
- 进入慢启动

**快重传触发**（轻度拥塞）：
- ssthresh = CWND / 2
- CWND = ssthresh（不减到 1）
- 进入快恢复

### 快重传

接收方收到乱序包立即回重复 ACK（仍是最小期待序号）。发送方连续收到 3 次相同 ACK 时，认为中间包丢了，立即重传丢失段，不等 RTO 超时。

```
Sender -> seq=1000 (丢)
Sender -> seq=2000  Receiver: ACK 1000 (dup 1)
Sender -> seq=3000  Receiver: ACK 1000 (dup 2)
Sender -> seq=4000  Receiver: ACK 1000 (dup 3) -> 快重传 seq=1000
```

### 快恢复

进入快恢复时 CWND = ssthresh + 3（3 表示已收到 3 个重复 ACK，即 3 个包已离开网络）。每再收到一个重复 ACK，CWND += 1（让数据继续流动）。收到新数据 ACK 时，CWND = ssthresh，进入拥塞避免。

### 算法演进：CUBIC 和 BBR

经典算法（Reno/NewReno）基于丢包判断拥塞。现代 Linux 默认 CUBIC，基于丢包但用三次函数增长 CWND。BBR（Google 2016）基于带宽和 RTT 测量，不依赖丢包，在高丢包率链路上明显优于 CUBIC。

```bash
# 查看当前拥塞算法
$ sysctl net.ipv4.tcp_congestion_control
net.ipv4.tcp_congestion_control = cubic

# 切换到 BBR
$ sysctl net.ipv4.tcp_congestion_control=bbr
```

### 抓包示例

```bash
$ tcpdump -i any -n 'tcp port 80' | head -30
# 慢启动阶段：发包数指数增长
10:00:01.000 seq 1:1460
10:00:01.010 seq 1460:2920
10:00:01.010 seq 2920:4380
...
10:00:01.050 seq 50000:51460   # 一个 RTT 内发了数十个包
```

## 代码示例

服务端启用 BBR：

```bash
# 临时启用
$ sysctl -w net.ipv4.tcp_congestion_control=bbr
$ sysctl -w net.core.default_qdisc=fq

# 永久生效
$ cat >> /etc/sysctl.conf <<EOF
net.ipv4.tcp_congestion_control=bbr
net.core.default_qdisc=fq
EOF
$ sysctl -p
```

Java 应用层无需关心拥塞算法，但可以观察：

```java
// 通过 /proc/net/tcp 或 ss -ti 观察连接的 CWND
// Java 没有直接 API，需要走系统调用或解析 /proc
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 跨地域传输慢 | RTT 高，CWND 增长慢 | 用 BBR 替代 CUBIC |
| 高丢包率链路 | Reno/CUBIC 频繁减半 | BBR 不依赖丢包判断 |
| 内网低延迟 | 算法差异不明显 | 默认 CUBIC 够用 |
| 短连接多 | 慢启动频繁 | TCP Fast Open 跳过握手 |
| 大文件传输 | 单流吞吐受限 | 调大初始 CWND，或用多连接 |

## 深挖追问

**Q1：慢启动慢在哪？**
不慢，反而增长最快（指数）。叫"慢启动"是相对于"一开始就发满窗口"而言——TCP 起步保守，逐步探测。

**Q2：初始 CWND 是多少？**
RFC 6928 建议 IW10（10 MSS，约 14.6 KB）。Linux 3.0+ 默认 10。早期 RFC 3390 是 4 MSS，再早期 RFC 2581 是 1 MSS。

**Q3：BBR 为什么比 CUBIC 好？**
CUBIC 把丢包当拥塞信号，但丢包可能是无线链路误码、缓冲区浅溢出，并非真拥塞。BBR 测量实际带宽和最小 RTT，估算 BDP 后设置 CWND，避免误判。

**Q4：快恢复为什么 CWND = ssthresh + 3？**
收到 3 个重复 ACK 说明 3 个包已经离开网络被对端收到，网络里少了 3 个包，可以再发 3 个。+3 让数据继续流动，避免空窗。

**Q5：ssthresh 怎么变化？**
- 慢启动到拥塞避免的切换：CWND ≥ ssthresh
- 超时触发：ssthresh = CWND / 2
- 快重传触发：ssthresh = CWND / 2

## 易错点

- **"慢启动 = 慢慢启动"** — 反了，慢启动是指数增长，最快。
- **"快重传一定比重传好"** — 快重传依赖 3 次重复 ACK，乱序严重场景会误判。
- **"超时和快重传都让 CWND 减半"** — 不，超时让 CWND 回到初始值，快重传才减半。
- **"拥塞控制让 TCP 慢"** — 短期是变慢，但避免网络崩溃后所有连接都受益。
- **"BBR 一定优于 CUBIC"** — 在低丢包链路上 BBR 优势不大，且 BBR 对缓冲区膨胀敏感。

## 总结

拥塞控制是 TCP 防止网络崩溃的机制，四个经典算法（慢启动/拥塞避免/快重传/快恢复）配合 ssthresh 和 CWND 调节发送速率。Reno 把丢包当拥塞，CUBIC 优化增长曲线，BBR 改用带宽-RTT 模型。生产中跨地域或高丢包链路切 BBR 通常能显著提升吞吐。

## 参考资料

- [RFC 5681 — TCP Congestion Control](https://datatracker.ietf.org/doc/html/rfc5681)
- [RFC 6928 — Increasing TCP's Initial Window](https://datatracker.ietf.org/doc/html/rfc6928)
- [BBR: Congestion-Based Congestion Control](https://research.google/pubs/pub45646/)
