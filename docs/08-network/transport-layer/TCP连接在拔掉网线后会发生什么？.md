# TCP 连接在拔掉网线后会发生什么

## 核心概念

拔网线后 TCP 连接的命运取决于**有没有数据传输**和**是否开启 keepalive**。TCP 是逻辑连接，物理层断了 TCP 状态机不会立即感知。要么靠数据传输触发超时重传发现，要么靠 keepalive 探测发现，否则连接会一直保持 `ESTABLISHED`。

## 标准回答

分两种情况：

**有数据传输时**：发送方收不到 ACK，触发超时重传。重传达上限（`tcp_retries2`，默认 15 次）后内核通知应用层连接死亡。期间网线重新插上，连接自动恢复。

**无数据传输时**：
- 未开启 keepalive：双方连接一直保持 `ESTABLISHED`，永远不知道对方掉线。
- 开启 keepalive：空闲一段时间后发探测包，多次无响应判定死亡。

## 详细机制

### 情况 1：有数据传输

```
Client ↔ Server，Client 拔网线
Server 发数据给 Client
  ↓
Client 收不到（网线断了）
  ↓
Server 收不到 ACK，触发超时重传
  ↓
重传 1（RTO 后）
重传 2（2×RTO 后，指数退避）
...
重传 15（tcp_retries2 上限）
  ↓
内核通知应用层 ETIMEDOUT，连接断开
```

总耗时约 924 秒到 16 分钟（取决于 RTO 和重传次数）。

**如果中间网线插回去**：
- 重传期间 Client 重新收到包，正常回 ACK
- Server 收到 ACK，连接恢复，继续传输
- 应用层无感知

### 情况 2：无数据传输

TCP 是逻辑连接，物理层断了状态机不感知。如果双方都没数据发，连接会一直 `ESTABLISHED`。

**未开 keepalive**：
```
Client 拔网线，Client 进程没发数据
Server 进程也没发数据
  ↓
双方 TCP 状态都是 ESTABLISHED
  ↓
永远不知道对方掉线（直到一方发数据触发超时）
```

**开启 keepalive**：
```
连接空闲 7200 秒（tcp_keepalive_time，默认）
  ↓
Server 发 keepalive 探测包
  ↓
Client 收不到（网线断）
  ↓
Server 等 75 秒再发，连续 9 次无响应
  ↓
判定连接死亡，通知应用层
```

最坏耗时：7200 + 75×9 = 7875 秒（约 2 小时 11 分）。生产中通常调短，或用应用层心跳。

### 情况 3：Client 进程崩溃 vs 主机宕机

| 情况 | 行为 | TCP 反应 |
|------|------|---------|
| 进程崩溃 | OS 回收资源时发 FIN | Server 正常关闭连接 |
| 主机宕机/拔电源 | 无法发 FIN | 连接卡住，需 keepalive 或超时重传发现 |
| 拔网线 | 物理层断 | 同上，看有无数据/keepalive |
| 主机宕机后重启 | 重启后丢失所有连接状态 | 收到原连接的包会回 RST |

进程崩溃时操作系统会发 FIN，对端正常进入四次挥手流程，**不需要 keepalive**。keepalive 主要针对主机宕机/网线断这种 FIN 发不出来的场景。

## 代码示例

模拟拔网线场景（应用层心跳方案）：

```java
import java.net.*;
import java.io.*;

public class HeartbeatClient {
    public static void main(String[] args) throws Exception {
        Socket socket = new Socket("server.example.com", 8080);
        socket.setKeepAlive(true);  // 启用 TCP keepalive

        // 同时用应用层心跳，更快感知断连
        Thread heartbeat = new Thread(() -> {
            try {
                OutputStream out = socket.getOutputStream();
                while (true) {
                    out.write("PING\n".getBytes());
                    out.flush();
                    Thread.sleep(30000);  // 每 30 秒发一次
                }
            } catch (Exception e) {
                System.out.println("Heartbeat failed: " + e.getMessage());
            }
        });
        heartbeat.setDaemon(true);
        heartbeat.start();

        // 业务读写
        BufferedReader in = new BufferedReader(
            new InputStreamReader(socket.getInputStream()));
        String line;
        while ((line = in.readLine()) != null) {
            System.out.println("Recv: " + line);
        }
    }
}
```

调整内核 keepalive 参数：

```bash
# 调短到 60 秒空闲开始探测，10 秒间隔，3 次失败判定死亡
$ sysctl net.ipv4.tcp_keepalive_time=60
$ sysctl net.ipv4.tcp_keepalive_intvl=10
$ sysctl net.ipv4.tcp_keepalive_probes=3
# 最坏 60 + 10×3 = 90 秒发现死亡连接
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 移动端网络切换 | 连接卡死 | 用 QUIC（支持连接迁移）或应用层心跳 + 重连 |
| 服务端 keepalive 关闭 | 死亡连接堆积 | 调短 keepalive 或加应用层心跳 |
| 客户端进程崩溃 | 服务端收到 FIN 正常关闭 | 不需要 keepalive |
| 客户端主机宕机 | 服务端连接卡住 | 必须 keepalive 或应用层心跳 |
| 长连接服务 | 连接泄漏 | 应用层心跳 + 空闲超时主动断开 |

## 深挖追问

**Q1：拔网线和断电有什么区别？**
拔网线：物理层断，TCP 状态不变。重新插上数据能恢复。
断电：主机直接死，无法发 FIN，TCP 状态在另一端卡住。重启后收到原连接包会回 RST。

**Q2：为什么不直接断开 TCP？**
TCP 设计上不知道物理层状态，物理层断了 TCP 看不到。这是设计取舍——TCP 只关心逻辑连接的可靠性，物理层状态由下层处理。

**Q3：keepalive 默认参数够用吗？**
不够。默认 2 小时才开始探测，生产中通常调短到 60 秒以内，或用应用层心跳（30-60 秒间隔）。

**Q4：应用层心跳和 TCP keepalive 选哪个？**
推荐应用层心跳。原因：
- TCP keepalive 默认参数太长，调短影响所有连接
- 应用层心跳能检测应用健康（如死锁）
- 应用层心跳可携带业务信息

**Q5：网线插回去后数据会丢吗？**
重传期间未确认的数据不会丢，TCP 会重传补上。但重传上限达到后连接断开，未确认的数据就丢了。

## 易错点

- **"拔网线 TCP 立即断开"** — 不，TCP 不知道物理层状态，要靠重传或 keepalive 发现。
- **"进程崩溃需要 keepalive"** — 不需要，进程崩溃时 OS 发 FIN。
- **"keepalive 默认参数够用"** — 2 小时太久，生产必须调短。
- **"网线插回去连接就断"** — 不，重传期间插回，连接自动恢复。
- **"主机宕机和拔网线一样"** — 不一样，主机宕机后重启会回 RST，拔网线不会。

## 总结

拔网线后 TCP 的命运取决于有无数据传输和 keepalive 设置。有数据靠重传发现（约 16 分钟），无数据靠 keepalive（默认 2 小时）或一直保持。生产中长连接服务必须配置应用层心跳或调短 keepalive，否则死亡连接会占用资源。移动端网络频繁切换的场景，QUIC 的连接迁移是更好的方案。

## 参考资料

- [RFC 1122 — TCP Keep-Alives](https://datatracker.ietf.org/doc/html/rfc1122#section-4.2.3.6)
- [RFC 7838 — QUIC Loss Detection and Congestion Control](https://datatracker.ietf.org/doc/html/rfc9002)
