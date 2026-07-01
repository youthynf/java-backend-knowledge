# TCP 握手期间服务端工作内容是什么

## 核心概念

三次握手期间服务端做了三类工作：**分配内核资源**（sock 结构、半连接队列项）、**生成 ISN 和 SYN+ACK 报文**、**维护状态机**（LISTEN → SYN_RCVD → ESTABLISHED）。整个过程由内核协议栈完成，不分配文件描述符（fd 在 accept 时才分配），不唤醒应用层。理解这些工作有助于排查握手慢、连接建不上等问题。

## 标准回答

服务端在三次握手各阶段的工作：

| 阶段 | 服务端动作 | 资源占用 |
|------|----------|---------|
| listen() 时 | 创建 listen socket，加入 `listen_hash`，进入 LISTEN | 一个 fd |
| 收到 SYN | 创建 sock 结构加入半连接队列，生成 ISN，发 SYN+ACK，进入 SYN_RCVD | 内核 sock 结构（不占 fd） |
| 收到第三次 ACK | 验证 ACK，连接从半连接队列移到全连接队列，进入 ESTABLISHED | 仍在内核，待 accept |
| accept() 时 | 创建新 socket fd 返回应用层 | 一个新 fd |

## 详细机制

### 阶段 1：listen() —— 准备监听

```c
int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
bind(listen_fd, ...);
listen(listen_fd, backlog);
```

内核工作：

- 创建 listen socket，加入 `listen_hash` 哈希表
- 初始化半连接队列和全连接队列（大小由 `tcp_max_syn_backlog` 和 `min(somaxconn, backlog)` 决定）
- 进入 LISTEN 状态，等待 SYN

应用层持有 listen_fd，可以 select/poll/accept。

### 阶段 2：收到 SYN —— 创建半连接

```
Client → Server: SYN, seq=x
```

内核工作：

1. **查找 listen socket**：根据目的 IP+端口在 `listen_hash` 中查找
2. **分配 sock 结构**：`tcp_v4_syn_recv_sock()` 创建新 sock，状态 `SYN_RCVD`
3. **生成 ISN**：基于时钟和四元组散列，参见 RFC 6528
4. **加入半连接队列**：`syn_queue`，受 `tcp_max_syn_backlog` 限制
5. **构造 SYN+ACK 报文**：seq=server_isn, ack=x+1
6. **启动 SYN+ACK 重传定时器**：受 `tcp_synack_retries` 控制
7. **进入 SYN_RCVD 状态**

注意：**不分配文件描述符**，不唤醒应用层。

### 阶段 3：收到第三次 ACK —— 完成握手

```
Client → Server: ACK, seq=x+1, ack=server_isn+1
```

内核工作：

1. **查找半连接**：根据四元组在半连接队列中查找
2. **验证 ACK**：ack 是否等于 server_isn+1
3. **状态转移**：SYN_RCVD → ESTABLISHED
4. **从半连接队列移除**，加入全连接队列
5. **关闭 SYN+ACK 重传定时器**
6. **唤醒应用层**（如果应用在 accept 阻塞）

仍不分配 fd，fd 在 accept 时才创建。

### 阶段 4：accept() —— 取出连接

```c
int conn_fd = accept(listen_fd, ...);
```

内核工作：

1. **从全连接队列取出 sock**
2. **分配新文件描述符 fd**
3. **创建新 socket 结构返回应用层**

如果队列空，accept 默认阻塞；非阻塞模式返回 EAGAIN。

### 资源占用总结

| 状态 | sock 结构 | fd | 内存 |
|------|----------|----|----|
| LISTEN | listen socket | 1 个 | 几 KB |
| SYN_RCVD | 半连接 sock | 0 | ~2 KB |
| ESTABLISHED（未 accept） | 全连接 sock | 0 | ~4 KB |
| ESTABLISHED（已 accept） | 全连接 sock | 1 个 | ~4 KB + 缓冲区 |

半连接和全连接都不占 fd，这就是为什么 SYN Flood 攻击时服务端 fd 数不涨但内存涨。

### 内核代码路径（Linux）

```
收到 SYN:
  tcp_v4_rcv()
    → tcp_v4_do_rcv()
      → tcp_v4_lookup_listener()  # 查找 listen socket
      → tcp_v4_syn_recv_sock()    # 创建半连接 sock
      → tcp_send_synack()         # 发 SYN+ACK

收到第三次 ACK:
  tcp_v4_rcv()
    → tcp_v4_do_rcv()
      → tcp_check_req()           # 验证 ACK
      → tcp_v4_syn_recv_sock()    # 升级为完整连接
      → tcp_acceptq_queue()       # 加入全连接队列
      → __wake_up()               # 唤醒应用层
```

### 抓包与监控

```bash
# 半连接队列占用
$ ss -tan state syn-recv | wc -l
12

# 全连接队列占用（ss -tln 的 Recv-Q）
$ ss -tln
State  Recv-Q Send-Q Local Address:Port
LISTEN 5      511    0.0.0.0:8080
# Recv-Q=5 表示全连接队列积压 5 个

# 内核握手相关计数
$ nstat -az | grep -iE "ActiveOpens|PassiveOpens|AttemptFails"
TcpExtActiveOpens      1234   # 主动连接数
TcpExtPassiveOpens     5678   # 被动连接完成数
TcpExtAttemptFails     9      # 握手失败数
TcpExtRetransSegs      5      # 重传段数
```

## 代码示例

观察握手各阶段（服务端延迟 accept）：

```java
import java.net.*;

public class HandshakeServer {
    public static void main(String[] args) throws Exception {
        ServerSocket server = new ServerSocket(8080);
        System.out.println("Listen, fd allocated");

        // 故意延迟 accept
        Thread.sleep(10000);

        // 期间客户端连接，握手在内核完成
        System.out.println("Now accept");
        Socket socket = server.accept();   // 此刻才分配新 fd
        System.out.println("Accepted, new fd: " + socket);
    }
}
```

```bash
# 服务端延迟 accept 期间，另一个终端观察
$ ss -tan state syn-recv | wc -l   # 半连接队列
$ ss -tln                          # 全连接队列 Recv-Q
$ ls /proc/$(pgrep java)/fd | wc -l   # fd 数（accept 前 fd 不涨）
```

## 实战场景

| 场景 | 服务端工作 | 注意点 |
|------|----------|--------|
| 高并发短连接 | 频繁创建/销毁 sock | 调大 `tcp_max_syn_backlog` |
| SYN Flood 攻击 | 半连接队列耗尽 | 开启 SYN Cookies |
| 应用启动慢 | 客户端连得上但请求无响应 | 先 listen 再做其他初始化 |
| accept 速度跟不上 | 全连接队列积压 | 用线程池或 NIO/Netty |
| 跨地域建连慢 | SYN+ACK 重传多 | 调大 `tcp_synack_retries` |

## 深挖追问

**Q1：握手期间服务端分配 fd 吗？**
不分配。fd 在 accept 时才创建。半连接和全连接 sock 都在内核，不占应用层 fd 配额。

**Q2：握手期间服务端分配内存吗？**
分配。每个半连接约 2 KB（sock 结构 + 计时器 + 序号等），全连接约 4 KB（含缓冲区）。

**Q3：服务端怎么知道 SYN 到达？**
内核协议栈通过网卡中断 → 软中断 → `tcp_v4_rcv()` 处理，不需要应用层参与。

**Q4：应用层 select/poll 能感知半连接吗？**
不能。select/poll 监听的是 listen_fd 的可读事件，只有全连接队列非空（有连接待 accept）时才可读。

**Q5：服务端收到 SYN 时会唤醒应用层吗？**
不会。半连接阶段对应用层完全透明，只有握手完成进入全连接队列后才唤醒阻塞在 accept 的应用。

## 易错点

- **"accept 触发握手"** — 错，握手在 accept 之前由内核完成。
- **"半连接占 fd"** — 不占，只占内核 sock 结构。
- **"应用层能感知 SYN 到达"** — 不能，握手对应用层透明。
- **"listen 后立刻能 accept"** — 能，但此时队列空，accept 阻塞。
- **"SYN 队列大小由 somaxconn 决定"** — 不完全，由 `min(tcp_max_syn_backlog, somaxconn, backlog)` 决定。

## 总结

握手期间服务端的工作完全由内核完成：收到 SYN 创建半连接 sock 加入队列并回 SYN+ACK，收到第三次 ACK 升级为全连接 sock 加入 accept 队列。整个过程不分配 fd，对应用层透明，只有握手完成后 accept 才创建新 fd 返回应用层。理解这一点能解释为什么 SYN Flood 攻击时 fd 不涨但内存涨，为什么应用启动慢客户端仍能连上但请求无响应。

## 参考资料

- [RFC 793 — TCP, Section 3.4](https://datatracker.ietf.org/doc/html/rfc793#section-3.4)
- [Linux 内核源码 net/ipv4/tcp_ipv4.c](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/net/ipv4/tcp_ipv4.c)
- [Linux TCP backlog 文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
