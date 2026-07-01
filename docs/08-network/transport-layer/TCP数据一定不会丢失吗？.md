# TCP 数据一定不会丢失吗

## 核心概念

TCP 保证的是**传输层可靠性**——从发送方内核发送缓冲区到接收方内核接收缓冲区的可靠传输。但数据从应用层到对端应用层的完整链路中，TCP 只覆盖中间一段，两端应用层和内核之外的环节都可能丢数据。所以"TCP 不丢数据"是有边界的。

## 标准回答

TCP 不丢数据的边界：

```
发送方应用层 → 发送方内核缓冲区 → 网络 → 接收方内核缓冲区 → 接收方应用层
                ↑                              ↑
                └──── TCP 保证的可靠区间 ──────┘
```

TCP 保证：发送方 write 到内核缓冲区的数据，能可靠到达接收方内核缓冲区。但以下场景数据仍可能"丢"：

1. **接收方应用层崩溃**：数据进接收缓冲区后，应用还没 read 就崩了，发送方已收到 ACK 以为发送成功
2. **RST 关闭连接**：未确认的数据直接丢
3. **重传达上限**：网络长时间不通，TCP 放弃，未确认数据丢
4. **keepalive 失败**：连接被判定死亡，缓冲区数据丢

## 详细机制

### 数据完整发送链路

```
应用层 write()
  ↓
内核发送缓冲区（send buffer）
  ↓
TCP 协议栈（按 MSS 切段、加头、拥塞控制）
  ↓
qdisc（流量控制队列）
  ↓
网卡 Ring Buffer
  ↓
物理网络（路由器、交换机）
  ↓
接收方网卡 Ring Buffer
  ↓
内核接收缓冲区（recv buffer）
  ↓
应用层 read()
```

每个环节都可能丢包：

| 环节 | 丢包原因 |
|------|---------|
| 发送缓冲区 | 满了 + 非阻塞 write 返回 EAGAIN（不算丢，应用层处理） |
| qdisc | 队列满，丢包 |
| 网卡 Ring Buffer | 满，丢包 |
| 网络 | 链路丢包（TCP 重传补） |
| 接收缓冲区 | 满了，TCP 通过 Window=0 暂停发送（不丢） |
| 应用层 | 还没 read 进程崩溃，数据丢 |

### TCP 能补的丢包

网络中丢包，TCP 通过超时重传、快速重传、SACK 补上。这是 TCP 可靠性的核心。

### TCP 补不了的丢包

**场景 1：接收方应用层崩溃**

```
发送方 write "Hello" → 内核缓冲区
TCP 传输 → 接收方内核缓冲区
接收方回 ACK
发送方收到 ACK，清理发送缓冲区
  ↓
接收方应用层还没 read，进程崩溃
  ↓
"Hello" 永久丢失
发送方以为发送成功
```

TCP 已经完成"可靠传输"（数据到达接收方内核），但接收方应用没消费就死了，数据丢了。

**场景 2：RST 关闭**

```
发送方发 "Hello"
接收方进程崩溃，OS 发 RST
  ↓
发送方收到 RST，连接关闭
发送缓冲区未确认的数据直接丢
```

**场景 3：重传达上限**

```
发送方发 "Hello"
网络长时间不通
  ↓
重传 15 次（tcp_retries2）
  ↓
内核通知应用层 ETIMEDOUT
未确认数据丢
```

### 生产中的"丢数据"案例

**案例 1：消息队列 producer 以为发送成功**

Producer 用 TCP 发消息到 MQ，MQ 收到数据回 ACK，但 MQ 还没处理就崩了。Producer 以为消息已送达，实际丢失。

解决：MQ 需要应用层 ACK（消息处理完成才回 ACK），而不是依赖 TCP ACK。

**案例 2：日志客户端丢失日志**

日志客户端用 TCP 发日志到日志服务器，本地机器突然断电。发送缓冲区未发出的数据丢失。

解决：本地持久化 + 重发机制。

**案例 3：数据库写入丢失**

应用通过 TCP 连数据库写数据，数据库收到数据回 OK，但数据库还没落盘就崩了。

解决：数据库 WAL + 同步刷盘。

## 代码示例

演示 TCP 不能保证应用层不丢数据：

```java
import java.net.*;
import java.io.*;

public class TcpLossDemo {
    public static void main(String[] args) throws Exception {
        // 服务端：收到数据但不 read，直接 exit
        new Thread(() -> {
            try (ServerSocket server = new ServerSocket(8080);
                 Socket socket = server.accept()) {
                InputStream in = socket.getInputStream();
                System.out.println("Server accepted, but not reading");
                Thread.sleep(1000);
                System.exit(0);  // 接收方进程退出，OS 发 FIN
            } catch (Exception e) {}
        }).start();

        Thread.sleep(500);

        // 客户端：发数据后立即关闭
        try (Socket socket = new Socket("127.0.0.1", 8080);
             OutputStream out = socket.getOutputStream()) {
            out.write("Important data".getBytes());
            out.flush();
            System.out.println("Client sent data");
            // TCP ACK 已收到，以为发送成功
            // 但服务端没 read 就 exit，数据丢了
        }
    }
}
```

应用层可靠传输方案：

```java
// 应用层 ACK：接收方处理完数据后回业务 ACK
public class AppLevelAck {
    // 发送方
    void sendReliable(Socket socket, byte[] data) throws IOException {
        OutputStream out = socket.getOutputStream();
        InputStream in = socket.getInputStream();

        // 带消息 ID
        byte[] msg = wrapWithId(data, nextId());
        out.write(msg);
        out.flush();

        // 等待应用层 ACK
        byte[] ack = new byte[4];
        int n = in.read(ack);
        if (n != 4 || !isValidAck(ack, msg)) {
            throw new IOException("Application-level ACK timeout");
        }
    }

    // 接收方：处理完业务才回 ACK
    void handleAndAck(Socket socket, byte[] data) throws IOException {
        processBusiness(data);  // 业务处理
        socket.getOutputStream().write(ACK);
    }
}
```

## 实战场景

| 场景 | 风险 | 处理 |
|------|------|------|
| 消息队列 | 接收方崩溃丢消息 | 应用层 ACK + 持久化 |
| 日志采集 | 客户端断电丢日志 | 本地持久化 + 重发 |
| 数据库写入 | 服务端崩溃丢数据 | WAL + 同步刷盘 |
| 支付回调 | 接收方没处理就崩 | 业务幂等 + 重试 |
| 分布式事务 | 协调者崩溃 | Saga / TCC 等补偿机制 |

## 深挖追问

**Q1：TCP ACK 表示什么？**
表示数据**到达接收方内核缓冲区**，不表示应用层已处理。这是 TCP 可靠性的边界。

**Q2：怎么实现应用层可靠传输？**
- 应用层 ACK：接收方处理完业务才回 ACK
- 持久化：发送前先落盘，收到 ACK 才删除
- 重试：超时未收到 ACK 重发
- 幂等：防止重发导致重复处理

**Q3：write 返回成功表示数据发出去了吗？**
不。write 只是把数据拷贝到内核发送缓冲区，何时发由协议栈决定。要确认对端收到，需要应用层 ACK。

**Q4：close() 时缓冲区数据会发出去吗？**
默认会。close 后内核继续尝试发送缓冲区数据（受 SO_LINGER 影响）。如果连接异常断开，数据丢。

**Q5：RST 关闭和 FIN 关闭对数据的影响？**
FIN 关闭：优雅关闭，缓冲区数据先发完再关。
RST 关闭：强制关闭，缓冲区未发数据直接丢。

## 易错点

- **"TCP 不丢数据"** — 不绝对，传输层之外可能丢。
- **"write 返回成功 = 对端收到"** — 不，只表示进了内核缓冲区。
- **"收到 TCP ACK = 业务处理完成"** — 不，只表示到达对端内核。
- **"close 后数据一定发出"** — 不一定，连接异常会丢。
- **"TCP 可靠就不需要应用层 ACK"** — 需要，业务可靠性高于传输可靠性。

## 总结

TCP 保证的是传输层可靠性（发送方内核到接收方内核），不保证应用层可靠性。接收方应用崩溃、RST 关闭、重传达上限等场景都会丢数据。生产中需要应用层 ACK、持久化、重试、幂等等机制保证业务可靠性。理解"TCP ACK 只表示到达对端内核"是设计可靠应用层协议的起点。

## 参考资料

- [RFC 793 — TCP Reliability](https://datatracker.ietf.org/doc/html/rfc793#section-2.6)
- [TCP 可靠性的边界](https://www.rfc-editor.org/rfc/rfc793#section-2)
