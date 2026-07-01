# TCP 四次挥手如果服务端的 FIN 报文比数据报文先到会发生什么

## 核心概念

四次挥手中，被动方可能先发完数据再发 FIN，但网络中数据报文可能因拥塞延迟，导致 FIN 比数据先到达主动方。TCP 必须保证数据不丢，所以不会因收到 FIN 立即进入 TIME_WAIT，而是把乱序的 FIN 缓存到乱序队列，等缺失的数据到达后再处理 FIN。这是 TCP"字节流有序交付"特性的体现。

## 标准回答

主动方在 `FIN_WAIT_2` 状态收到乱序 FIN 时的处理：

1. **不立即进入 TIME_WAIT**：FIN 暂存到乱序队列（out-of-order queue）
2. **回 ACK 但 ack 号是期待的最小序号**：告知对端"我还没收到完整数据"
3. **等待缺失数据到达**：数据按序补齐后，检查乱序队列中是否有 FIN
4. **数据补齐后才处理 FIN**：进入 TIME_WAIT，回最终 ACK

FIN 比数据先到是 TCP 处理乱序的边界场景，依赖序列号保证正确性。

## 详细机制

### 场景还原

```
主动方 (Client)                         被动方 (Server)
ESTABLISHED                             ESTABLISHED
  |                                       |
  | --- FIN seq=1000 -------------------> |  Client 发起关闭
FIN_WAIT_1                               |
  | <== ACK ack=1001 ===================  |  Server 回 ACK
FIN_WAIT_2                               CLOSE_WAIT
  |                                       |
  |                                       |  Server 还有数据要发：
  | <== seq=2000, len=500 =============== |  数据1（seq=2000-2500）
  | <== seq=2500, len=500 =============== |  数据2（seq=2500-3000）
  | <== FIN seq=3000 ===================  |  FIN（seq=3000）
  |                                       LAST_ACK
  |                                       |
  | 数据1 在网络中延迟                     |
  | 收到 FIN seq=3000（乱序）              |
  | 期待 seq=2000，但收到 3000             |
  | → FIN 进乱序队列，回 ACK ack=2000     |
  |                                       |
  | 收到数据2 seq=2500（仍乱序）           |
  | → 进乱序队列，回 ACK ack=2000         |
  |                                       |
  | 收到数据1 seq=2000（按序到达）         |
  | → 数据1 交付应用层                    |
  | → 检查乱序队列：数据2 → 交付          |
  | → 检查乱序队列：FIN seq=3000 → 处理   |
  | → 进入 TIME_WAIT，回 ACK ack=3001    |
  |                                       |
TIME_WAIT                                CLOSED
```

### 为什么 FIN 不能立即处理

TCP 保证字节流按序交付。FIN 是字节流的最后一个标志，如果数据还没到齐就处理 FIN，应用层会丢失数据。

序列号保证 FIN 的位置明确：

```
数据1: seq=2000, len=500  → 字节 2000-2499
数据2: seq=2500, len=500  → 字节 2500-2999
FIN:   seq=3000           → 字节 3000（FIN 占 1 个序号）
```

主动方期待的下一个序号是 2000，收到 seq=3000 的 FIN 不在期待窗口起点，进乱序队列。

### 乱序队列的工作

内核为每个 TCP 连接维护乱序队列（`skb` 链表）：

```
接收缓冲区:
  - 已按序交付应用层: [0, 2000)
  - 期待下一字节: 2000
  - 乱序队列: [(2500, 3000), (3000, FIN)]

收到 seq=2000 的数据:
  - 直接交付应用层，期待序号推进到 2500
  - 检查乱序队列：2500-3000 可以交付，期待序号推进到 3000
  - 检查乱序队列：3000 是 FIN，处理 FIN，进入 TIME_WAIT
```

### ACK 行为

收到乱序包时回的 ACK 是**累计确认**，仍然是期待的最小序号：

```
收到 FIN seq=3000（期待 2000）
回 ACK ack=2000  （不是 ack=3001）

收到数据2 seq=2500（仍期待 2000）
回 ACK ack=2000  （仍是 2000）

收到数据1 seq=2000（按序）
回 ACK ack=3001  （包含 FIN 占的序号）
```

被动方收到 `ack=3001` 后知道所有数据 + FIN 都已收到，进入 CLOSED。

### 被动方重传 FIN

如果主动方的最终 ACK（ack=3001）丢失，被动方会重传 FIN。主动方在 TIME_WAIT 期间收到重传 FIN，会重新回 ACK。

### 抓包示例

```bash
$ tcpdump -i any -n 'tcp port 8080 and host 10.0.0.2'
10:00:00 IP 10.0.0.1.5000 > 10.0.0.2.8080: Flags [F.], seq 1000, ack 1
10:00:00 IP 10.0.0.2.8080 > 10.0.0.1.5000: Flags [.], ack 1001
# 主动方发 FIN，被动方回 ACK

10:00:01 IP 10.0.0.2.8080 > 10.0.0.1.5000: Flags [P.], seq 2500:3000, ack 1001
# 被动方发数据2（seq=2500-3000）
10:00:01 IP 10.0.0.1.5000 > 10.0.0.2.8080: Flags [.], ack 2000
# 主动方回 ACK ack=2000（期待 2000，2500 是乱序）

10:00:02 IP 10.0.0.2.8080 > 10.0.0.1.5000: Flags [F.], seq 3000, ack 1001
# 被动方发 FIN seq=3000
10:00:02 IP 10.0.0.1.5000 > 10.0.0.2.8080: Flags [.], ack 2000
# 主动方回 ACK ack=2000（FIN 乱序，进队列）

10:00:03 IP 10.0.0.2.8080 > 10.0.0.1.5000: Flags [P.], seq 2000:2500, ack 1001
# 被动方发数据1（seq=2000-2500，延迟到达）
10:00:03 IP 10.0.0.1.5000 > 10.0.0.2.8080: Flags [.], ack 3001
# 主动方收到数据1，触发乱序队列合并，处理 FIN，回 ACK ack=3001
```

## 代码示例

模拟 FIN 比数据先到（用 tc 制造延迟）：

```bash
# 服务端：发完数据立即 close，但数据包被延迟
# 在服务端用 tc 给数据包加 100ms 延迟，FIN 不延迟
$ tc qdisc add dev eth0 root netem delay 100ms
$ python3 -c "
import socket
s = socket.socket()
s.bind(('0.0.0.0', 8080))
s.listen(1)
c, _ = s.accept()
c.sendall(b'Hello')   # 数据会延迟 100ms
c.close()              # FIN 不延迟，先到
"

# 客户端抓包
$ tcpdump -i lo -n 'tcp port 8080'
# 会看到 FIN 比数据先到，但客户端最终能正确收到数据
```

Java 客户端无需特殊处理，内核自动处理乱序：

```java
import java.net.*;
import java.io.*;

public class FinBeforeDataClient {
    public static void main(String[] args) throws Exception {
        Socket socket = new Socket("server.example.com", 8080);
        InputStream in = socket.getInputStream();

        // read() 会阻塞直到所有数据到达
        // 即使 FIN 比数据先到，内核也会缓存 FIN 等数据
        byte[] buf = new byte[1024];
        int n = in.read(buf);
        System.out.println("Got " + n + " bytes: " + new String(buf, 0, n));
        // read 返回 -1 表示对端关闭（数据已全部收到）
    }
}
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 跨地域连接关闭慢 | 数据延迟到达，TIME_WAIT 启动晚 | 正常现象，无需处理 |
| 应用层 read 拿到完整数据后返回 -1 | 内核已合并乱序队列 | 正常流程 |
| 抓包看到 FIN 在数据前 | 排查是否丢数据 | 不丢，序列号保证 |
| LAST_ACK 状态卡住 | 主动方 ACK 丢失 | 被动方重传 FIN |

## 深挖追问

**Q1：FIN 一定比数据先到吗？**
不一定，正常情况数据先到 FIN 后到。FIN 比数据先到是网络乱序的边界场景，TCP 必须正确处理。

**Q2：如果数据永远丢失了怎么办？**
主动方等不到完整数据，被动方重传数据。重传达上限（`tcp_retries2`）后双方都断开连接，数据丢失。

**Q3：乱序队列有大小限制吗？**
有，受接收缓冲区大小限制。乱序数据占缓冲区空间，缓冲区满后接收方通告 Window=0，发送方停发。

**Q4：FIN 进入乱序队列时回的 ACK 是重复 ACK 吗？**
是。期待序号未变，回的 ACK 仍是期待的最小序号，和之前回的 ACK 相同，算重复 ACK。但不会触发快速重传（因为是 FIN 占位而非数据丢失）。

**Q5：SACK 在这里有作用吗？**
有。SACK 选项告知发送方"我已经收到 2500-3000 但缺 2000-2500"，发送方只重传缺失段，效率更高。

## 易错点

- **"收到 FIN 就立即进入 TIME_WAIT"** — 不，要等数据按序到齐。
- **"FIN 比数据先到会丢数据"** — 不会，序列号保证 FIN 缓存等数据。
- **"乱序 FIN 回的 ACK 是 ack=FIN.seq+1"** — 不是，回的是期待的最小序号。
- **"FIN 不占序号"** — 占，FIN 占 1 个序号，所以 ack=FIN.seq+1。

## 总结

FIN 比数据先到是 TCP 乱序处理的边界场景。主动方不立即处理 FIN，而是缓存到乱序队列，等数据按序到达后再处理。这是 TCP 字节流有序交付的体现，依赖序列号和累计确认保证正确性。应用层无需关心，内核自动处理。

## 参考资料

- [RFC 793 — TCP, Section 3.4 Close Control Blocks](https://datatracker.ietf.org/doc/html/rfc793#section-3.4)
- [RFC 2018 — TCP SACK](https://datatracker.ietf.org/doc/html/rfc2018)
