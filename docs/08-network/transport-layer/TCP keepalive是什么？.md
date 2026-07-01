# TCP keepalive 是什么

## 核心概念

TCP keepalive 是内核提供的连接保活机制，用于检测**对端主机是否还活着**。如果对端主机宕机（不是进程崩溃）、网线断开或路由不可达，TCP 连接会卡在 `ESTABLISHED` 占用资源。keepalive 周期性发探测包，多次无响应就判定连接死亡，通知应用层。

注意：keepalive 不是"维持连接"用的，TCP 连接即使没有任何数据也能一直保持。keepalive 是**检测死亡连接**用的。

## 标准回答

TCP keepalive 三要素（Linux 默认值）：

| 参数 | 默认值 | 含义 |
|------|--------|------|
| `tcp_keepalive_time` | 7200 秒 | 连接空闲多久后开始探测 |
| `tcp_keepalive_intvl` | 75 秒 | 每次探测间隔 |
| `tcp_keepalive_probes` | 9 次 | 探测失败几次判定死亡 |

最坏情况下发现死亡连接需要 `7200 + 75 × 9 = 7875 秒`（约 2 小时 11 分）。生产中通常调短，或直接用应用层心跳。

keepalive 默认关闭，需要 socket 显式设置 `SO_KEEPALIVE` 才生效。

## 详细机制

### 探测过程

```
连接空闲 7200 秒
  ↓
发送探测包（空数据，序号是上次 ACK-1）
  ↓
对端响应:
  - 正常 ACK → 连接存活，重置计时器，再等 7200 秒
  - RST → 对端重启过，连接已无效，立即通知应用
  - 无响应 → 等 75 秒再发，连续 9 次无响应判定死亡
  ↓
死亡 → 内核通知应用层（read/write 返回 ETIMEDOUT）
```

### 三种对端状态的处理

| 对端状态 | 探测结果 | 处理 |
|---------|---------|------|
| 正常工作 | 收到 ACK | 重置计时器 |
| 主机宕机后重启 | 收到 RST | 立即通知应用连接重置 |
| 主机宕机/网络断 | 无响应 | 重试 9 次后通知连接死亡 |
| 进程崩溃 | 收到 FIN | 不需要 keepalive，FIN 触发正常关闭 |

注意：进程崩溃时操作系统会发 FIN，TCP 正常关闭流程就处理了，不需要 keepalive。keepalive 主要针对**主机宕机或网络中断**这种 FIN 发不出来的场景。

### TCP keepalive vs HTTP Keep-Alive vs 应用层心跳

| 机制 | 实现层 | 用途 |
|------|--------|------|
| TCP keepalive | 内核 | 检测对端主机是否活着 |
| HTTP Keep-Alive | 应用层 | 复用 TCP 连接发多个 HTTP 请求 |
| 应用层心跳 | 应用层 | 检测对端应用是否响应业务 |

三者名字相近但完全不同。生产中推荐**应用层心跳**，因为：
- TCP keepalive 默认 2 小时太长，调短影响所有连接
- TCP keepalive 只能判断主机是否活着，不能判断应用是否健康（应用死锁时主机还活着）
- 应用层心跳可携带业务信息，更灵活

## 代码示例

Java 启用 TCP keepalive：

```java
import java.net.*;

Socket socket = new Socket("example.com", 80);
// 启用 TCP keepalive
socket.setKeepAlive(true);
```

JDK 11+ 支持自定义三个参数：

```java
// JDK 11+ 通过 SocketOption 设置
import java.net.SocketOption;
import jdk.net.ExtendedSocketOptions;

socket.setOption(ExtendedSocketOptions.TCP_KEEPIDLE, 60);   // 60 秒空闲后探测
socket.setOption(ExtendedSocketOptions.TCP_KEEPINTERVAL, 10); // 10 秒间隔
socket.setOption(ExtendedSocketOptions.TCP_KEEPCOUNT, 3);     // 3 次失败判定死亡
// 最坏 60 + 10×3 = 90 秒发现死亡连接
```

应用层心跳示例：

```java
// Netty IdleStateHandler 实现应用层心跳
pipeline.addLast(new IdleStateHandler(60, 30, 0));
pipeline.addLast(new ChannelInboundHandlerAdapter() {
    @Override
    public void userEventTriggered(ChannelHandlerContext ctx, Object evt) {
        if (evt instanceof IdleStateEvent) {
            IdleStateEvent e = (IdleStateEvent) evt;
            if (e.state() == IdleState.WRITER_IDLE) {
                ctx.writeAndFlush(new HeartbeatPacket());  // 发心跳
            } else if (e.state() == IdleState.READER_IDLE) {
                ctx.close();  // 60 秒没收到对端数据，关闭连接
            }
        }
    }
});
```

## 实战场景

| 场景 | 配置 | 注意点 |
|------|------|--------|
| 长连接服务端 | 调短 keepalive 或用应用层心跳 | 默认 2 小时太久，连接泄漏风险 |
| 移动端长连接 | 应用层心跳 60-300 秒 | 网络切换频繁，TCP keepalive 不够灵活 |
| IoT 设备 | 应用层心跳 + TCP keepalive 双保险 | 设备可能休眠，需要业务感知 |
| 内网服务间调用 | 一般不需要 keepalive | 内网链路稳定，连接问题靠重连机制 |
| 防火墙超时 | keepalive 间隔 < 防火墙超时 | 防火墙通常 30-60 分钟清空闲连接 |

## 深挖追问

**Q1：keepalive 默认为什么不开启？**
默认开启会浪费带宽（即使应用没数据也定期发包），且 2 小时太长不够灵活。让应用层按需开启更合理。

**Q2：keepalive 探测包长什么样？**
一个空 ACK 包，序号字段是上次对端 ACK - 1（让对端认为是旧包，回显当前 ACK）。这样既不传输数据又能确认对端活着。

**Q3：keepalive 能检测进程死锁吗？**
不能。进程死锁时主机还活着，操作系统还能响应 keepalive 探测。要检测应用层健康只能用应用层心跳。

**Q4：NAT 设备对 keepalive 的影响？**
NAT 设备会清理空闲连接表项（典型 5-30 分钟），如果 keepalive 间隔大于 NAT 超时，连接会被 NAT 清掉。需要 keepalive 间隔小于 NAT 超时。

**Q5：HTTP Keep-Alive 和 TCP keepalive 一起用冲突吗？**
不冲突，是两个层级的概念。HTTP Keep-Alive 是应用层复用 TCP 连接，TCP keepalive 是内核检测连接活性。可以同时开。

## 易错点

- **"keepalive 维持连接"** — 错，TCP 连接不需要维持，keepalive 是检测死亡。
- **"keepalive 默认开启"** — 默认关闭，需 `SO_KEEPALIVE` 显式开启。
- **"keepalive 能检测进程崩溃"** — 不需要，进程崩溃会发 FIN 走正常关闭。
- **"keepalive 默认参数够用"** — 2 小时太久，生产必须调短或用应用层心跳。
- **"keepalive 等于 HTTP Keep-Alive"** — 完全不同的概念，前者是内核保活，后者是应用层连接复用。

## 总结

TCP keepalive 是内核检测死亡连接的机制，默认 2 小时才开始探测，生产中通常调短或用应用层心跳替代。和 HTTP Keep-Alive 是完全不同的概念。生产推荐应用层心跳，因为更灵活、能检测应用健康、可携带业务信息。

## 参考资料

- [RFC 1122 — Requirements for Internet Hosts, TCP Keep-Alives](https://datatracker.ietf.org/doc/html/rfc1122#section-4.2.3.6)
- [RFC 5482 — TCP User Timeout Option](https://datatracker.ietf.org/doc/html/rfc5482)
- [Linux TCP keepalive 文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
