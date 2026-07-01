# 没有 listen 能建立 TCP 连接吗

## 核心概念

`listen()` 是服务端监听端口的系统调用，正常情况下没 listen 客户端 connect 会收到 RST。但有两种特殊情况不需要 listen 也能建立连接：**TCP 自连接**（客户端连自己）和**TCP 同时打开**（双方同时发 SYN）。这两种场景利用了内核的全局 socket 哈希表，不依赖 listen 队列。

## 标准回答

- **正常情况**：服务端没 listen，客户端 connect 会收到 RST，连接失败。
- **TCP 自连接**：客户端连自己（源 IP/端口 = 目的 IP/端口），可以建立连接。
- **TCP 同时打开**：双方同时向对方发 SYN，可以建立连接（少见）。

后两种场景的原理：内核有全局 socket 哈希表（ehash），即使没有 listen 也能匹配到 connect 时创建的 socket。

## 详细机制

### 正常情况：没 listen 会回 RST

```
Client → Server: SYN
Server 内核: 查找目的端口对应的 socket
  - 找到 listen socket → 正常三次握手
  - 没找到 → 回 RST
Client: 收到 RST，connect 返回 ECONNREFUSED
```

### TCP 自连接

客户端 connect 自己（源 IP/端口 = 目的 IP/端口）：

```
Client bind 127.0.0.1:5000
Client connect 127.0.0.1:5000
  ↓
内核创建 socket A，发 SYN
  ↓
SYN 经过回环地址回到本机
  ↓
内核查找目的端口 5000 的 socket
  - 没有 listen socket
  - 但有 socket A（刚 connect 创建的）
  ↓
内核"惊喜地"发现两端是同一个 socket
  ↓
SYN 同时被当作服务端的 SYN 处理
  ↓
自连接建立，socket A 同时是客户端和服务端
```

自连接是真实存在的连接，可以读写，但实际是和自己通信。

### TCP 同时打开

双方同时向对方发 SYN：

```
A → B: SYN seq=x
B → A: SYN seq=y  (几乎同时)
  ↓
A 收到 B 的 SYN，回 SYN+ACK seq=x ack=y+1
B 收到 A 的 SYN，回 SYN+ACK seq=y ack=x+1
  ↓
A 收到 SYN+ACK，回 ACK
B 收到 SYN+ACK，回 ACK
  ↓
连接建立（双方都从 SYN_SENT 直接进 ESTABLISHED）
```

同时打开需要双方几乎同时 connect，时间窗口很小。实际很少发生，但协议支持。

### 全局 socket 哈希表

Linux 内核维护几个 socket 哈希表：

| 哈希表 | 用途 |
|--------|------|
| `listen_hash` | listen 状态的 socket |
| `ehash`（established hash） | 已建立连接的 socket |
| `bhash`（bind hash） | 已绑定端口的 socket |

正常握手依赖 `listen_hash` 找到服务端 socket。自连接和同时打开时，SYN 包能匹配到 `ehash` 中刚创建的 socket（connect 时已加入），所以能完成握手。

### 抓包示例

```bash
# 自连接抓包
$ tcpdump -i lo -n 'tcp port 5000'
10:00:01 IP 127.0.0.1.5000 > 127.0.0.1.5000: Flags [S], seq 1000
10:00:01 IP 127.0.0.1.5000 > 127.0.0.1.5000: Flags [S.], seq 2000, ack 1001
10:00:01 IP 127.0.0.1.5000 > 127.0.0.1.5000: Flags [.], ack 2001
# 源和目的完全相同，三次握手
```

## 代码示例

模拟 TCP 自连接：

```java
import java.net.*;
import java.io.*;

public class SelfConnectDemo {
    public static void main(String[] args) throws Exception {
        // 绑定本地端口
        Socket socket = new Socket();
        socket.bind(new InetSocketAddress("127.0.0.1", 5000));
        // 连接自己
        try {
            socket.connect(new InetSocketAddress("127.0.0.1", 5000), 1000);
            System.out.println("Self-connected: " + socket.isConnected());
            // 输出 true（自连接成功）
        } catch (Exception e) {
            System.out.println("Failed: " + e.getMessage());
        }
    }
}
```

自连接的危害：

```java
// 反例：客户端 connect 时随机选本地端口
// 如果随机端口恰好等于目的端口 → 自连接
Socket socket = new Socket();
socket.connect(new InetSocketAddress("127.0.0.1", 50000));
// 极小概率：内核选 50000 作为源端口 → 自连接
// 后续读写会收到自己发的数据
```

防止自连接：

```java
// 检查连接是否真的连到对端
Socket socket = new Socket("127.0.0.1", 5000);
if (socket.getLocalPort() == socket.getPort()
    && socket.getLocalAddress().equals(socket.getInetAddress())) {
    socket.close();
    throw new IOException("Self-connection detected");
}
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 自连接偶发 | 客户端连自己 | 检查源/目的端口是否冲突 |
| 健康检查端口冲突 | 自连接导致检查异常 | 排查端口分配 |
| 同时打开（罕见） | 双方都 connect 成功 | 协议允许，正常处理 |
| 客户端报 ECONNREFUSED | 服务端没 listen | 检查服务端是否启动 |
| 客户端报 timeout | 防火墙丢 SYN | 检查防火墙规则 |

## 深挖追问

**Q1：自连接是 bug 吗？**
是协议的边界行为，不是 bug 但通常是应用层 bug 的征兆。生产中应避免，因为读写会收到自己发的数据，逻辑混乱。

**Q2：自连接发生概率多大？**
很低。需要源端口恰好等于目的端口，且都在同一台机器。Linux 内核会尝试避免，但不完全防止。

**Q3：同时打开常见吗？**
极罕见。需要双方几乎同时 connect，且端口预先约定。某些 P2P 协议可能利用同时打开穿越 NAT。

**Q4：自连接能正常关闭吗？**
能。四次挥手同样适用，但因为是同一个 socket，关闭逻辑会有点诡异。

**Q5：内核能禁止自连接吗？**
可以加补丁检查源和目的四元组相同就拒绝，但 Linux 主线没有这个检查。应用层要自己防护。

## 易错点

- **"没 listen 一定建不了连接"** — 不，自连接和同时打开可以。
- **"自连接是 TCP bug"** — 是协议允许的边界行为。
- **"自连接无害"** — 有害，会读写自己的数据。
- **"同时打开需要 listen"** — 不需要，双方都从 SYN_SENT 直接到 ESTABLISHED。
- **"connect 返回成功一定连到对端了"** — 不一定，可能是自连接。

## 总结

没 listen 通常建不了连接（回 RST），但 TCP 自连接和同时打开两种场景例外。自连接是客户端连自己，利用了内核全局 socket 哈希表。生产中自连接通常是 bug，应用层要检查源/目的四元组相同就拒绝。同时打开是协议支持的边界场景，实际罕见。

## 参考资料

- [RFC 793 — TCP, Simultaneous Open](https://datatracker.ietf.org/doc/html/rfc793#section-3.4)
- [TCP self-connect 问题分析](https://lkml.org/lkml/2008/4/26/305)
