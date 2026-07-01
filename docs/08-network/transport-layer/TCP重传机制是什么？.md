# TCP 重传机制是什么

## 核心概念

重传是 TCP 实现可靠性的核心机制。发送方发出数据后等 ACK，等不到就重发。但"等多久"和"重传哪些"是两个关键问题。TCP 演进出四种重传机制：超时重传、快速重传、SACK、D-SACK，分别解决"何时重传"和"重传什么"的问题。

## 标准回答

| 机制 | 触发 | 重传范围 | 优点 | 缺点 |
|------|------|----------|------|------|
| 超时重传（RTO） | 定时器超时 | 从丢失点开始全部 | 简单可靠 | 等待时间长，效率低 |
| 快速重传 | 3 次重复 ACK | 不确定（重传一个或全部） | 不用等超时 | 不知道重传哪些 |
| SACK | SACK 选项告知缺失段 | 仅缺失段 | 精准重传 | 需双方支持 |
| D-SACK | 收到重复数据时 | 告知发送方"别重传" | 减少不必要重传 | 需双方支持 |

实际生产中四种机制叠加使用：超时重传保底，快速重传提速度，SACK 提精确度，D-SACK 减少浪费。

## 详细机制

### 超时重传（RTO）

发送方发出数据后启动重传定时器，超过 RTO 仍未收到 ACK 就重传。RTO 基于 RTT 动态估算（RFC 6298）：

- SRTT = (1-α) × SRTT + α × RTT_sample（α=1/8）
- RTTVAR = (1-β) × RTTVAR + β × |SRTT - RTT_sample|（β=1/4）
- RTO = SRTT + max(G, 4 × RTTVAR)

RTO 默认下限 200ms，上限 120s。每次重传后 RTO 翻倍（指数退避），避免网络拥塞时反复重传。

```bash
# 查看连接的 RTO 和 RTT
$ ss -ti
... rto:217 rtt:17.5/2.5 ...
```

### 快速重传

超时等待 RTO 太长（典型 200ms+）。TCP 利用"重复 ACK"提前判断丢包：接收方收到乱序包时立即回 ACK（仍是期待的最小序号），连续 3 次相同 ACK 说明中间包丢了。

```
Sender -> seq=1000 (丢)
Sender -> seq=2000  Receiver: ACK 1000 (dup 1)
Sender -> seq=3000  Receiver: ACK 1000 (dup 2)
Sender -> seq=4000  Receiver: ACK 1000 (dup 3) -> 触发快速重传 seq=1000
```

快速重传在收到第 3 个重复 ACK 时立即重传丢失段，不等 RTO。

**问题**：发送方不知道是 seq=1000 丢了，还是 seq=1000-4000 都丢了。要么只重传 1000（如果后面也丢了还要再触发），要么重传 1000-4000（如果没丢就浪费）。SACK 解决这个问题。

### SACK（选择性确认）

接收方在 TCP 选项字段告知"我已经收到了哪些不连续的段"。发送方据此只重传真正缺失的段。

```
Sender 发送: [1000,2000), [2000,3000), [3000,4000), [4000,5000)
Receiver 收到: [1000,2000), [3000,4000)  (丢了 [2000,3000) 和 [4000,5000))
Receiver ACK: ack=2000, SACK=[3000,4000)
Sender 知道 [2000,3000) 没收到，重传
继续收到 SACK=[3000,5000)，知道 [4000,5000) 也没收到
```

SACK 选项最多列 4 个段范围。Linux 默认开启（`net.ipv4.tcp_sack=1`）。

### D-SACK（重复 SACK）

接收方收到重复数据时，用 SACK 字段告知发送方"这段我已经收过了"。发送方据此知道：

- 是发出去的包丢了，还是 ACK 丢了
- 是数据被网络延迟了，还是被网络复制了

例：发送方重传 seq=1000，接收方收到后发现已经收过，回 ACK=2000 + SACK=[1000,2000)（D-SACK）。发送方看到 SACK 范围在 ACK 之前，知道这是重复段，原来的包没丢，是 ACK 丢了。

Linux 默认开启（`net.ipv4.tcp_dsack=1`）。

### 抓包示例

```bash
# 快速重传抓包
$ tcpdump -i any -n 'tcp port 80'
10:00:01 seq 1000:2000  (丢失)
10:00:01 seq 2000:3000 -> ACK 1000 (dup 1)
10:00:01 seq 3000:4000 -> ACK 1000 (dup 2)
10:00:01 seq 4000:5000 -> ACK 1000 (dup 3)
10:00:01 [Fast Retransmit] seq 1000:2000  # 快速重传
10:00:01 ACK 5000  # 全部收到
```

```bash
# 重传统计
$ nstat -az TcpRetransSegs
TcpRetransSegs  1234    # 重传段数

$ ss -ti  # 看具体连接的重传统计
... retrans:0/5 ...  # 5 次重传
```

## 代码示例

Java 观察重传（间接通过内核计数）：

```java
// Java 没有直接 API 获取重传统计
// 通过解析 /proc/net/snmp 或 ss 命令
Process p = Runtime.getRuntime().exec(new String[]{"ss", "-ti"});
try (BufferedReader r = new BufferedReader(
        new InputStreamReader(p.getInputStream()))) {
    String line;
    while ((line = r.readLine()) != null) {
        if (line.contains("retrans")) {
            System.out.println(line);  // 含 retrans:N/M 表示重传
        }
    }
}
```

调整内核重传参数：

```bash
# 控制 TCP 重传次数（默认 15，达到后放弃连接）
$ sysctl net.ipv4.tcp_retries2=15

# 达到 tcp_retries1 后通知网络层（默认 3）
$ sysctl net.ipv4.tcp_retries1=3

# SYN 重传次数（默认 6）
$ sysctl net.ipv4.tcp_syn_retries=6

# SYN+ACK 重传次数（默认 5）
$ sysctl net.ipv4.tcp_synack_retries=5
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 链路丢包率高 | `nstat` 重传数高 | 切 BBR 拥塞算法，排查链路 |
| 跨地域 RTT 高 | RTO 大，重传慢 | 启用 SACK，调大初始窗口 |
| 长尾延迟突增 | 偶发重传 | 监控 `TcpRetransSegs` |
| 连接卡死 | 重传 15 次后断开 | 检查链路和防火墙 |
| 无线网络误码 | 频繁重传但网络不拥塞 | BBR 不依赖丢包判断，更稳 |

## 深挖追问

**Q1：重传的序号和原包一样吗？**
一样。重传就是重新发同样的字节范围，序号字段不变。接收方根据序号去重。

**Q2：RTO 为什么不固定？**
网络 RTT 随时变化，固定 RTO 要么太大（重传慢）要么太小（误判丢包）。动态估算让 RTO 适应网络。

**Q3：为什么是 3 次重复 ACK 而不是 2 次？**
2 次容易误判：网络乱序也会产生重复 ACK。3 次是经验阈值，平衡误判率和响应速度。RFC 5681 规定。

**Q4：SACK 最多列几个段？**
4 个段（8 个边界值），受 TCP 选项 40 字节限制。如果丢的段多于 4 个，SACK 只能列前 4 个。

**Q5：重传次数达到上限后怎样？**
达到 `tcp_retries2`（默认 15）后内核放弃连接，应用层 read/write 报 `Connection timed out`。15 次重传约 924 秒到 16 分钟（指数退避）。

## 易错点

- **"重传一定是数据丢"** — 也可能是 ACK 丢，发送方等不到 ACK 触发重传，D-SACK 能识别这种情况。
- **"RTO 等于 RTT"** — RTO = SRTT + 4 × RTTVAR，比 RTT 大。
- **"快速重传一定比重传快"** — 触发快，但乱序严重时 3 次重复 ACK 可能误判。
- **"SACK 默认关闭"** — Linux 默认开启（`tcp_sack=1`）。
- **"重传会无限重试"** — 有上限（`tcp_retries2=15`），达到后断开。

## 总结

TCP 重传四件套：超时重传保底，快速重传提速，SACK 精准定位，D-SACK 减少浪费。生产中默认都开。排查重传问题看 `nstat TcpRetransSegs`、`ss -ti`、`tcpdump`，根因通常是链路丢包、网络拥塞或无线误码。BBR 拥塞算法在丢包率高链路上对重传有显著改善。

## 参考资料

- [RFC 6298 — Computing TCP's Retransmission Timer](https://datatracker.ietf.org/doc/html/rfc6298)
- [RFC 5681 — TCP Congestion Control](https://datatracker.ietf.org/doc/html/rfc5681)
- [RFC 2018 — TCP SACK](https://datatracker.ietf.org/doc/html/rfc2018)
- [RFC 2883 — TCP D-SACK](https://datatracker.ietf.org/doc/html/rfc2883)
