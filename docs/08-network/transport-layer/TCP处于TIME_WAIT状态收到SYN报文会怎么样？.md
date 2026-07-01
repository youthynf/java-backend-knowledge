# TCP 处于 TIME_WAIT 状态收到 SYN 报文会怎么样

## 核心概念

TIME_WAIT 状态下主动方仍保留连接五元组信息 2 MSL，期间如果收到 SYN 报文，处理方式取决于 SYN 是否"合法"。合法 SYN（序列号大于原连接最后序号）会复用该连接跳过 TIME_WAIT；非法 SYN（序列号小）会回 ACK 触发对端发 RST。这是 TCP 设计的边界场景，配合 `tcp_tw_reuse` 实现端口快速复用。

## 标准回答

TIME_WAIT 收到 SYN 的两种处理：

| SYN 合法性 | 判断依据 | 处理 |
|-----------|---------|------|
| 合法 | seq > 原连接最后序号 + 时间戳更新 | 复用连接，跳过 TIME_WAIT 进入 SYN_RECV |
| 非法 | seq ≤ 原连接最后序号 或 时间戳过期 | 回 ACK（第四次挥手的 ACK），对端发 RST |

合法 SYN 让连接"复活"重用五元组，非法 SYN 通过回 ACK 触发对端 RST 终止。

## 详细机制

### 合法 SYN 的判断

判断 SYN 是否合法的两个维度：

1. **序列号**：SYN 的 seq 必须大于原连接最后序号（即原连接最后 ACK 的序号）
2. **时间戳**（如果开启了 `tcp_timestamps`）：SYN 的时间戳必须比原连接最后报文的时间戳大

```
原连接最后状态：
  最后 ACK seq=2000，timestamp=1000

收到新 SYN：
  SYN seq=5000，timestamp=2000  → 合法（seq 大、时间戳新）
  SYN seq=1500，timestamp=500   → 非法（seq 小、时间戳旧）
```

### 合法 SYN 的处理

```
TIME_WAIT 状态
  ↓
收到合法 SYN（seq 大、时间戳新）
  ↓
判定为新建连接（不是历史报文复活）
  ↓
复用该五元组，跳过 2 MSL 等待
  ↓
进入 SYN_RECV 状态
  ↓
正常三次握手流程（回 SYN+ACK）
```

这是 `tcp_tw_reuse` 的内核实现机制：客户端主动复用 TIME_WAIT 端口时，新的 SYN 序列号和时间戳都满足合法性，服务端直接复用连接。

### 非法 SYN 的处理

```
TIME_WAIT 状态
  ↓
收到非法 SYN（seq 小 或 时间戳旧）
  ↓
判定为历史报文或攻击
  ↓
回 ACK（ack = 原连接最后序号，即第四次挥手的 ACK）
  ↓
对端收到 ACK，发现 ack 不是自己期待的（不是 SYN+ACK）
  ↓
对端回 RST
  ↓
本端收到 RST 后处理：
  - tcp_rfc1337=0（默认）：提前结束 TIME_WAIT，释放连接
  - tcp_rfc1337=1：丢弃 RST，保持 TIME_WAIT
```

### tcp_rfc1337 参数

RFC 1337 建议 TIME_WAIT 期间忽略 RST，防止旧报文被误判为 RST 导致连接异常终止：

```bash
$ sysctl net.ipv4.tcp_rfc1337
net.ipv4.tcp_rfc1337 = 0   # 默认 0，收到 RST 提前结束 TIME_WAIT

# 设为 1：忽略 RST，完整等待 2 MSL
$ sysctl net.ipv4.tcp_rfc1337=1
```

设为 1 更安全但占用资源更久。一般保持默认 0。

### 抓包示例

合法 SYN 复用 TIME_WAIT：

```bash
$ tcpdump -i any -n 'tcp port 80'
# 原连接关闭
10:00:00 IP A.5000 > B.80: Flags [F.], seq 2000
10:00:00 IP B.80 > A.5000: Flags [.], ack 2001
10:00:00 IP B.80 > A.5000: Flags [F.], seq 3000
10:00:00 IP A.5000 > B.80: Flags [.], ack 3001   # A 进入 TIME_WAIT

# 1 秒后新连接复用端口 5000
10:00:01 IP A.5000 > B.80: Flags [S], seq 5000, win 65535
# seq=5000 > 2000，合法
10:00:01 IP B.80 > A.5000: Flags [S.], seq 6000, ack 5001
10:00:01 IP A.5000 > B.80: Flags [.], ack 6001
# 新连接建立，TIME_WAIT 被复用
```

非法 SYN 触发 RST：

```bash
# 原连接最后 ACK seq=2000
10:00:00 IP A.5000 > B.80: Flags [.], ack 2001   # A 进入 TIME_WAIT

# 攻击者发 seq=1000 的 SYN（非法）
10:00:01 IP X.5000 > B.80: Flags [S], seq 1000
# B 回 ACK ack=2001（第四次挥手的 ACK）
10:00:01 IP B.80 > X.5000: Flags [.], ack 2001
# X 发现 ack 不是 SYN+ACK，回 RST
10:00:01 IP X.5000 > B.80: Flags [R.], seq 2001
# B 收到 RST，如果 tcp_rfc1337=0 则提前结束 TIME_WAIT
```

## 代码示例

观察 TIME_WAIT 复用（开启 `tcp_tw_reuse`）：

```bash
# 客户端开启 tcp_tw_reuse
$ sysctl net.ipv4.tcp_tw_reuse=1
$ sysctl net.ipv4.tcp_timestamps=1   # 前提条件

# 快速发起多次连接
$ for i in $(seq 1 10); do
    curl -s http://example.com/ -o /dev/null
done

# 抓包看端口复用
$ tcpdump -i any -n 'tcp port 80 and host example.com'
# 会看到同一源端口被复用，跳过 TIME_WAIT
```

Java 应用层无需特殊处理：

```java
// 客户端正常连接，内核自动处理 TIME_WAIT 复用
Socket socket = new Socket("example.com", 80);
// 如果开启了 tcp_tw_reuse 且之前有 TIME_WAIT，可能复用端口
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 客户端压测 | 端口耗尽 | 开启 `tcp_tw_reuse`，复用 TIME_WAIT |
| 旧报文复活 | 数据错乱 | TIME_WAIT + PAWS 防御 |
| 攻击者伪造 SYN | 试图劫持连接 | 序列号/时间戳校验，非法 SYN 被拒 |
| 连接异常终止 | TIME_WAIT 期间收到 RST | 设 `tcp_rfc1337=1` 忽略 RST |
| 服务重启 bind 失败 | TIME_WAIT 占用端口 | `SO_REUSEADDR` |

## 深挖追问

**Q1：合法 SYN 复用 TIME_WAIT 安全吗？**
安全。合法性校验依赖序列号递增和时间戳更新，旧报文不可能满足。这是 `tcp_tw_reuse` 的核心机制。

**Q2：为什么非法 SYN 要回 ACK 而不是 RST？**
回 ACK 让对端知道"我还在 TIME_WAIT"，对端发现 ack 不匹配会主动回 RST 终止。这是协议规定的优雅处理。

**Q3：`tcp_rfc1337=1` 有副作用吗？**
TIME_WAIT 占用时间更长（必须等满 2 MSL），资源占用稍高。但更安全，防止 RST 攻击。

**Q4：如果时间戳没开启怎么办？**
只靠序列号判断合法性。序列号 32 位会回绕，高带宽场景下可能误判。所以 `tcp_tw_reuse` 强烈依赖 `tcp_timestamps`。

**Q5：TIME_WAIT 期间收到数据包怎么处理？**
和非法 SYN 类似，回 ACK（第四次挥手的 ACK），告知对端"连接已关闭"。对端发现 ack 不匹配，回 RST。

## 易错点

- **"TIME_WAIT 期间收到 SYN 一定复用"** — 不，要满足合法性（seq 大、时间戳新）。
- **"非法 SYN 直接丢"** — 不，回 ACK 触发对端 RST。
- **"`tcp_rfc1337=1` 总是好的"** — 增加资源占用，按需开启。
- **"序列号能完全防止旧报文"** — 不能，32 位会回绕，需要 PAWS 兜底。
- **"TIME_WAIT 期间连接不能用"** — 不，合法 SYN 可以复用。

## 总结

TIME_WAIT 收到 SYN 时根据合法性处理：合法 SYN（seq 大、时间戳新）复用连接跳过等待，这是 `tcp_tw_reuse` 的实现机制；非法 SYN 回 ACK 触发对端 RST，由 `tcp_rfc1337` 决定是否提前结束 TIME_WAIT。生产中开启 `tcp_tw_reuse` + `tcp_timestamps` 能让客户端快速复用端口，避免端口耗尽。

## 参考资料

- [RFC 793 — TCP, Section 3.5](https://datatracker.ietf.org/doc/html/rfc793#section-3.5)
- [RFC 1337 — TIME-WAIT State Hazards](https://datatracker.ietf.org/doc/html/rfc1337)
- [RFC 7323 — PAWS](https://datatracker.ietf.org/doc/html/rfc7323)
