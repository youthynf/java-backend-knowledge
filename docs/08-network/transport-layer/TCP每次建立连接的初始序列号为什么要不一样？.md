# TCP 每次建立连接的初始序列号为什么要不一样

## 核心概念

TCP 每次建立连接时双方各自生成一个随机初始序列号（ISN，Initial Sequence Number）。随机的核心目的有两个：**防止历史报文被新连接错误接收**（主要原因），**防止序号预测攻击**。如果 ISN 固定或可预测，网络中延迟到达的旧报文可能落入新连接的接收窗口，造成数据错乱。

## 标准回答

ISN 必须随机的两个原因：

1. **防止历史报文复活**：连接 A 关闭后，网络中可能还有延迟的报文。如果新连接 B 用同样的 ISN，旧报文的序号可能恰好落在 B 的接收窗口内，被错误接收。随机 ISN 让旧报文序号大概率不在新连接窗口内。

2. **防止序号预测攻击**：攻击者如果预测到 ISN，可以伪造源 IP 发包（盲注攻击），绕过认证。随机 ISN 让预测不可行。

但 ISN 随机**不能完全避免**历史报文复活，因为序列号是 32 位会回绕。所以现代 TCP 还引入了时间戳（PAWS 机制）兜底。

## 详细机制

### ISN 生成算法

RFC 793 描述的经典算法：

```
ISN = M + F(local_ip, local_port, remote_ip, remote_port)
```

- `M`：一个时钟计数器，每 4 微秒加 1，约 4.55 小时循环一次（32 位回绕）
- `F`：基于四元组的散列函数，输出伪随机数

Linux 实现更复杂，使用 MD5 或 SipHash 散列四元组 + 随机密钥，且每个连接独立。攻击者无法通过观察一个连接的 ISN 推算另一个连接的。

### 为什么不能完全避免历史报文

序列号 32 位，约 4 GB 数据后回绕到 0。如果两个连接的 ISN 差距小，旧连接的报文序号可能在新连接的窗口内。所以光靠 ISN 随机不够，需要 PAWS。

### PAWS（Protect Against Wrapped Sequence numbers）

PAWS 用时间戳防止旧报文复活：

```
每个 TCP 包带时间戳选项（TSval）：
  - 发送时记录当前时间戳
  - 接收方维护"最近收到的最大时间戳"

收到包时：
  if (包的 TSval < 最近最大时间戳):
      判定为旧包，丢弃
  else:
      正常接收，更新最大时间戳
```

时间戳是单调递增的，旧报文的时间戳一定比新连接的小，会被丢弃。

```bash
# Linux 默认开启时间戳
$ sysctl net.ipv4.tcp_timestamps
net.ipv4.tcp_timestamps = 1
```

### TIME_WAIT 之外为什么还要 ISN 随机

TIME_WAIT 持续 2 MSL 确保旧报文消失，但前提是连接通过正常四次挥手关闭。如果连接异常断开（RST、进程崩溃、主机宕机），不会进 TIME_WAIT，旧报文可能仍在网络中。这时 ISN 随机 + PAWS 是兜底保护。

### 序号预测攻击

1990 年代 Kevin Mitnick 攻击就是利用 ISN 可预测性：

```
1. 攻击者向受害者发 SYN（伪造受信任主机 IP）
2. 攻击者预测受害者将回的 ISN
3. 攻击者盲发 ACK（猜对了 ISN+1）
4. 连接建立，绕过 IP 信任认证
```

RFC 6528 要求 ISN 必须不可预测，现代 OS 都用强散列算法。

## 代码示例

观察 ISN 随机性：

```bash
# 抓多次握手的 SYN，看 ISN 是否变化
$ for i in 1 2 3 4 5; do
    tcpdump -i any -n -c 1 'tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-ack == 0 and dst host example.com' 2>/dev/null &
    curl -s http://example.com > /dev/null
    wait
done
# 输出不同 ISN：
# seq 1234567890
# seq 9876543210
# seq 5678901234
# ...
```

Java 应用层无需关心 ISN，由内核处理：

```java
// 应用层只管读写，ISN 由内核生成
Socket socket = new Socket("example.com", 80);
// 内核握手时自动生成随机 ISN，对应用层透明
```

## 实战场景

| 场景 | 影响 |
|------|------|
| 长连接大文件传输 | 序号回绕，PAWS 必须开启 |
| 高频短连接 | ISN 随机性要求高，防预测 |
| 容器/虚拟机迁移 | 时间戳可能跳跃，PAWS 误判 |
| 老旧设备 | 不支持时间戳，依赖 ISN 随机 |
| 安全审计 | 检测 ISN 可预测性 |

## 深挖追问

**Q1：ISN 为什么不固定为 0？**
固定 ISN 会让旧报文极易落入新连接窗口，造成数据错乱。随机 ISN 让旧报文大概率不在窗口内。

**Q2：序列号回绕多久一次？**
32 位序列号，约 4 GB 数据后回绕。千兆链路 32 秒就能传 4 GB，所以高带宽场景频繁回绕，必须用 PAWS。

**Q3：时间戳也会回绕吗？**
会。32 位时间戳，单位毫秒约 49.7 天回绕一次。PAWS 算法容忍短期回绕（用最近最大值比较），但极端情况仍可能误判。

**Q4：禁用时间戳会怎样？**
失去 PAWS 保护，只能靠 ISN 随机性。高带宽链路可能因序号回绕导致数据错乱。生产环境不要禁用。

**Q5：ISN 能用 64 位吗？**
理论上可以，但需要修改 TCP 协议，不向后兼容。现实用 32 位 + PAWS 是更现实的方案。

## 易错点

- **"ISN 随机能完全避免历史报文"** — 不能，32 位回绕问题需要 PAWS 兜底。
- **"ISN 必须从 0 开始"** — 错，必须随机。
- **"时间戳只是为了测 RTT"** — 也用于 PAWS 防止旧报文。
- **"TIME_WAIT 能清理所有旧报文"** — 只能清理正常挥手关闭的，异常断开的不行。
- **"ISN 可预测无关紧要"** — 关系到安全，可被利用进行盲注攻击。

## 总结

ISN 随机是为了防止历史报文复活和序号预测攻击。但 32 位序列号会回绕，光靠 ISN 随机不够，需要 PAWS（时间戳）兜底。生产环境必须开启 `tcp_timestamps=1`，否则高带宽链路下序号回绕会导致数据错乱。TIME_WAIT 处理正常关闭的连接，ISN 随机 + PAWS 处理异常断开的连接。

## 参考资料

- [RFC 793 — TCP, ISN Generation](https://datatracker.ietf.org/doc/html/rfc793#section-3.4)
- [RFC 6528 — Defending against Sequence Number Attacks](https://datatracker.ietf.org/doc/html/rfc6528)
- [RFC 7323 — PAWS](https://datatracker.ietf.org/doc/html/rfc7323)
