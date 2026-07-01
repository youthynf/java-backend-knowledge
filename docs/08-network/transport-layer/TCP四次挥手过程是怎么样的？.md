# TCP 四次挥手过程是怎么样的

## 核心概念

TCP 是全双工的，关闭连接需要**两个方向分别关闭**，每一方各发一次 FIN、各回一次 ACK，共四个报文。这就是"四次挥手"。和三次握手相比多了两个包，是因为关闭方向不能合并：被动方收到 FIN 后可能还有数据要发，必须先回 ACK 让对方等，自己数据发完再发 FIN。

## 标准回答

```
Active Closer                              Passive Closer
ESTABLISHED                                ESTABLISHED
  |                                            |
  | --- FIN, seq=u, ack=v ----------------->   |  (1)
FIN_WAIT_1                                CLOSE_WAIT
  |                                            |
  | <== ACK, ack=u+1 ======================    |  (2)
FIN_WAIT_2                                     |
  |                                            |
  |          (passive side may still send)     |
  |                                            |
  | <== FIN, seq=w, ack=u+1 ================== |  (3)
TIME_WAIT                                  LAST_ACK
  |                                            |
  | --- ACK, ack=w+1 ---------------------->   |  (4)
(2 MSL)                                    CLOSED
  |
CLOSED
```

1. 主动方发 FIN，进入 `FIN_WAIT_1`。
2. 被动方回 ACK，进入 `CLOSE_WAIT`；主动方进入 `FIN_WAIT_2`。
3. 被动方应用层 close() 后发 FIN，进入 `LAST_ACK`。
4. 主动方回 ACK，进入 `TIME_WAIT`，等 2 MSL 后 `CLOSED`；被动方收到 ACK 后直接 `CLOSED`。

## 详细机制

### 为什么要四次而不是三次

TCP 全双工，关闭一个方向不影响另一个方向。被动方收到 FIN 时，可能还有数据没发完，所以**先回 ACK 让对方安心等**，等自己数据发完再发 FIN。中间的"先 ACK 后 FIN"被拆成了两个报文，所以是四次。

如果被动方没有待发数据，可以合并成一个 FIN+ACK 包，变成三次挥手。

### FIN 占一个序号

和 SYN 一样，FIN 占一个序号。所以第一次 FIN 后，对方的 ACK 中 ack = FIN 的 seq + 1。

### 半关闭状态（FIN_WAIT_2）

主动方发完 FIN 收到 ACK 后进入 `FIN_WAIT_2`，此时**主动方不再发数据但仍可接收**。这种"一端关闭发送、另一端还能发"的状态叫半关闭（half-close）。HTTP 1.0 关闭前服务端要把响应发完，就是这个流程。

被动方此时处于 `CLOSE_WAIT`，应用层 read() 返回 0 表示读到 EOF，应用层处理完后再 close() 触发自己的 FIN。

### TIME_WAIT 在主动方

四次挥手中只有主动方进入 TIME_WAIT，持续 2 MSL。这段时间保留连接信息，防止旧报文复活，并保证最后 ACK 能补发。

### 抓包示例

```bash
$ tcpdump -i any -n 'tcp port 80 and (tcp[tcpflags] & tcp-fin != 0 or tcp[tcpflags] & tcp-ack != 0)'
10:00:10.000000 IP 10.0.0.1.54321 > 10.0.0.2.80: Flags [F.], seq 1500, ack 2000, win 512, length 0
10:00:10.000234 IP 10.0.0.2.80 > 10.0.0.1.54321: Flags [.], ack 1501, win 512, length 0
10:00:10.500000 IP 10.0.0.2.80 > 10.0.0.1.54321: Flags [F.], seq 2000, ack 1501, win 512, length 0
10:00:10.500123 IP 10.0.0.1.54321 > 10.0.0.2.80: Flags [.], ack 2001, win 512, length 0
```

`[F.]` 表示 FIN+ACK。中间 500ms 间隔对应被动方应用层处理 close() 的延迟。

## 代码示例

观察 Java 服务端的 CLOSE_WAIT 堆积：

```java
// 客户端主动关闭，服务端忘了 close() —— 会产生 CLOSE_WAIT
ServerSocket server = new ServerSocket(8080);
while (true) {
    Socket socket = server.accept();
    InputStream in = socket.getInputStream();
    in.read(); // 读完不关，连接会卡在 CLOSE_WAIT
}
```

排查命令：

```bash
# 统计各状态连接数
$ ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c
   1234 ESTAB
     42 TIME-WAIT
     17 CLOSE-WAIT   # 异常，应用层没关闭

# 找出 CLOSE_WAIT 对应的进程
$ ss -tanp state close-wait | head
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 服务端大量 CLOSE_WAIT | 应用层没 close() | 检查代码是否关闭 InputStream/Response 流，连接池释放逻辑 |
| 客户端大量 TIME_WAIT | 短连接 + 主动关闭方堆积 | 启用 keep-alive，开 `tcp_tw_reuse` |
| 跨网关闭慢 | LAST_ACK 状态卡住 | 被动方丢包，调整 `tcp_fin_timeout` |
| 旧连接复用导致数据错乱 | TIME_WAIT 未结束就重用五元组 | 等满 2 MSL 或启用 `tcp_timestamps` |

## 深挖追问

**Q1：被动方收到 FIN 后还能发数据吗？**
可以，这叫"半关闭"。被动方进入 `CLOSE_WAIT` 后仍可发数据，主动方进入 `FIN_WAIT_2` 后仍可收数据，直到被动方也发 FIN。

**Q2：FIN_WAIT_2 会一直等吗？**
默认会等，由 `tcp_fin_timeout` 控制（Linux 默认 60 秒）。如果被动方一直不发 FIN，主动方超时后会强制关闭。

**Q3：为什么是 2 MSL 而不是 1 MSL？**
1 MSL 保证主动方发的 ACK 能到达对端，另 1 MSL 保证如果对端没收到 ACK 重传的 FIN 还能到达本端。两个方向各 1 MSL，共 2 MSL。

**Q4：被动方 close() 后立即发 FIN 吗？**
不一定。如果还有未发送数据，先发数据；SO_LINGER 设置为非零且未发送数据已发完时，FIN 会和最后一个数据包合并。

**Q5：连接能直接 RST 关闭吗？**
可以。发 RST 包直接终止连接，不经过四次挥手，也不进 TIME_WAIT。但 RST 会让接收方收到 "Connection reset by peer" 错误，不是优雅关闭。SO_LINGER 设置超时为 0 时会触发 RST 关闭。

## 易错点

- **"四次挥手就是四次发包"** — 实际可能合并成三次（被动方无待发数据时）。
- **"TIME_WAIT 在被动方"** — 反了，TIME_WAIT 在主动关闭方。
- **"CLOSE_WAIT 是 bug"** — 不一定，短暂存在是正常的；持续堆积才是 bug。
- **"FIN 不能携带数据"** — FIN 可以与数据同发，但 FIN 本身只占 1 个序号。

## 总结

四次挥手的根因是 TCP 全双工，两个方向分别关闭。TIME_WAIT 是主动方的"安全等待期"，防止旧报文复活和保证对端收到最后 ACK。理解了 TIME_WAIT 和 CLOSE_WAIT 各自在哪一端，连接异常排查就有了起点。

## 参考资料

- [RFC 793 — TCP, Section 3.5 Closing a Connection](https://datatracker.ietf.org/doc/html/rfc793#section-3.5)
- [RFC 1337 — TIME-WAIT Hazards](https://datatracker.ietf.org/doc/html/rfc1337)
