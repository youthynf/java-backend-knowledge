# TCP 连接处于 ESTABLISHED 状态收到 SYN 报文会发生什么

## 核心概念

已建立的 TCP 连接（ESTABLISHED）收到 SYN 报文是异常场景，通常是客户端重启后用相同端口重连、攻击者伪造 SYN 探测、或 killcx 等工具主动断连。服务端的处理取决于 SYN 是否匹配现有连接：匹配现有连接会回 Challenge ACK 让对端发 RST；不匹配会当作新连接建连。理解这个场景有助于排查"连接莫名被重置"和安全工具的工作原理。

## 核心概念

ESTABLISHED 状态收到 SYN 的两种情况：

| 情况 | 判断依据 | 处理 |
|------|---------|------|
| SYN 匹配现有连接（同四元组） | 五元组完全相同 | 回 Challenge ACK，对端发现 ack 不匹配后回 RST，连接断开 |
| SYN 不匹配现有连接（端口不同） | 五元组不同 | 当作新连接，正常三次握手建新连接 |

## 详细机制

### 情况 1：SYN 匹配现有连接

客户端崩溃后重启，用相同源端口连同一服务端：

```
原连接：
  Client(192.168.1.5:5000) ↔ Server(10.0.0.2:80), seq 期望 2000

客户端重启，丢失所有连接状态
客户端用相同端口 5000 重连：
  Client(192.168.1.5:5000) → Server(10.0.0.2:80): SYN, seq=100
```

服务端处理：

1. 收到 SYN，查找现有连接
2. 找到匹配的 ESTABLISHED 连接（同四元组）
3. **不重置连接**，回 Challenge ACK：

```
Server → Client: ACK, seq=2000, ack=期望值
```

Challenge ACK 携带正确的当前序号，告诉对端"我还在，连接没断"。

4. 客户端收到 ACK，发现 ack 不是自己 SYN+ACK 期待的（应该是 seq+1），而是个奇怪的值
5. 客户端判定连接异常，回 RST
6. 服务端收到 RST，释放原连接

这是 TCP 的"防御性"处理：收到 SYN 不直接重置连接，而是回 ACK 让对端确认意图。

### 情况 2：SYN 不匹配现有连接

客户端用不同端口发起连接：

```
原连接：
  Client(192.168.1.5:5000) ↔ Server(10.0.0.2:80)

新连接（不同源端口）：
  Client(192.168.1.5:5001) → Server(10.0.0.2:80): SYN, seq=x
```

服务端处理：

1. 收到 SYN，查找现有连接
2. 五元组不同，没找到匹配
3. 查找 listen socket（端口 80）
4. 找到 listen socket，按正常流程处理新连接
5. 原连接不受影响，继续 ESTABLISHED

### 老连接的后续处理

如果老连接有数据要发，客户端已不存在（重启后丢失状态）：

```
Server → Client: 数据包
Client（已重启）：找不到对应连接，回 RST
Server: 收到 RST，连接断开
```

如果老连接一直没数据传输：

- 未开 keepalive：连接永远卡在 ESTABLISHED，直到服务端进程退出
- 开了 keepalive：探测失败后判定死亡，连接断开

### Challenge ACK 的安全性

Challenge ACK 机制防止攻击者通过发 SYN 重置任意连接。如果直接重置，攻击者只要知道四元组就能干掉连接。回 ACK 让对端验证序号，攻击者不知道序号无法构造合法 RST。

```bash
# 控制 Challenge ACK 速率，防攻击
$ sysctl net.ipv4.tcp_challenge_ack_limit
net.ipv4.tcp_challenge_ack_limit = 1000   # 每秒最多发 1000 个 Challenge ACK
```

### killcx 工具的原理

killcx 是断开 TCP 连接的工具，原理利用 Challenge ACK：

```
1. killcx 向服务端发 SYN（同四元组）
2. 服务端回 Challenge ACK，携带正确 seq 和 ack
3. killcx 从 ACK 中获取正确的序号
4. killcx 构造 RST 报文（用正确的 seq）发给服务端
5. 服务端收到合法 RST，断开连接
```

类似工具还有 tcpkill，但 tcpkill 是被动监听流量获取序号，killcx 是主动触发。

### 抓包示例

```bash
$ tcpdump -i any -n 'tcp port 80 and host 10.0.0.2'
# 原连接 ESTABLISHED
10:00:00 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [P.], seq 1000:1500, ack 2000

# 客户端重启，发 SYN 重连
10:00:10 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [S], seq 5000

# 服务端回 Challenge ACK（不是 SYN+ACK）
10:00:10 IP 10.0.0.2.80 > 10.0.0.1.5000: Flags [.], seq 2000, ack 1500
# ack=1500 是原连接的期待序号，不是 SYN 的回应

# 客户端发现 ack 不对，回 RST
10:00:10 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [R.], seq 5001

# 服务端收到 RST，连接断开
```

## 代码示例

模拟客户端重启后重连：

```java
import java.net.*;

public class ReconnectAfterRestart {
    public static void main(String[] args) throws Exception {
        // 第一次连接
        Socket s1 = new Socket("server.example.com", 80);
        System.out.println("First connection established");

        // 模拟客户端重启：关闭 socket 但不通知服务端
        // 实际重启场景下进程退出，OS 也不会发 FIN（如果进程被 kill -9 且没机会清理）

        // 第二次连接用相同端口（Java 不容易控制源端口，这里用 nc 模拟）
        // 服务端会回 Challenge ACK，客户端要发 RST 才能建新连接
    }
}
```

用 nc 模拟 killcx：

```bash
# 服务端
$ nc -lk 8080

# 客户端连接
$ nc 127.0.0.1 8080 &
CLIENT_PID=$!

# 模拟 killcx：用相同四元组发 SYN
# 需要 root 权限和原始套接字
$ python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_TCP)
# 构造 SYN 包，src=127.0.0.1:5000, dst=127.0.0.1:8080
# ... 构造 TCP 头部
s.sendto(packet, ('127.0.0.1', 0))
"

# 抓包看 Challenge ACK
$ tcpdump -i lo -n 'tcp port 8080'
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 客户端崩溃后重启 | 服务端连接被 RST | 自动重连机制 |
| 容器重启 | 长连接断开 | 客户端检测后重连 |
| killcx 主动断连 | 工具获取序号后发 RST | 应急运维手段 |
| 攻击者发 SYN 探测 | 服务端回 Challenge ACK | `tcp_challenge_ack_limit` 限速 |
| 老连接卡 ESTABLISHED | 客户端早已不在 | 开启 keepalive 兜底 |

## 深挖追问

**Q1：服务端为什么不直接 RST 老连接？**
防御性设计。如果直接 RST，攻击者只要知道四元组就能干掉任意连接。回 ACK 让对端用正确序号验证，攻击者不知道序号无法构造合法 RST。

**Q2：Challenge ACK 会泄露信息吗？**
会泄露当前序号，但攻击者需要先猜出四元组（源端口最难猜）。`tcp_challenge_ack_limit` 限制速率进一步降低风险。

**Q3：客户端用 kill -9 退出会发 FIN 吗？**
会。OS 回收进程资源时自动发 FIN，对端正常进入四次挥手。kill -9 不影响 socket 清理。

**Q4：连接卡在 ESTABLISHED 怎么主动断开？**
用 killcx、tcpkill 等工具，或重启服务端进程让 OS 回收所有 socket。生产中更常用 keepalive 兜底。

**Q5：`tcp_challenge_ack_limit` 调小有什么影响？**
降低 Challenge ACK 速率，更难被攻击者利用，但正常重连可能因 ACK 丢失而失败。默认 1000 是平衡值。

## 易错点

- **"ESTABLISHED 收到 SYN 会直接断开"** — 不会，先回 Challenge ACK 验证。
- **"客户端 kill -9 不会发 FIN"** — 会，OS 兜底发 FIN。
- **"Challenge ACK 是新连接的 SYN+ACK"** — 不是，是老连接的 ACK。
- **"killcx 用 RST 直接断连"** — 不完全，先用 SYN 触发 ACK 获取序号，再发 RST。
- **"攻击者能轻易伪造 RST"** — 不能，需要正确序号，序号靠 Challenge ACK 获取且限速。

## 总结

ESTABLISHED 状态收到 SYN 时服务端回 Challenge ACK 携带当前序号，让对端确认意图。客户端重启后用相同端口重连会发现 ack 不匹配，回 RST 终止老连接。killcx 等工具利用这个机制主动获取序号后构造 RST 断连。Challenge ACK 的设计是防御性的，防止攻击者轻易重置连接。

## 参考资料

- [RFC 793 — TCP, Section 3.4](https://datatracker.ietf.org/doc/html/rfc793#section-3.4)
- [RFC 5961 — Improving TCP's Robustness to Blind In-Window Attacks](https://datatracker.ietf.org/doc/html/rfc5961)
- [Linux tcp_challenge_ack_limit 文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
