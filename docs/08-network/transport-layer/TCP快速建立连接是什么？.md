# TCP 快速建立连接是什么

## 核心概念

TCP Fast Open（TFO，RFC 7413）是减少 TCP 握手延迟的机制，允许客户端在 SYN 阶段就携带应用数据，省 1 RTT。首次连接仍需握手获取 Cookie，后续连接可以 0-RTT 发数据。Google 实测 TFO 平均节省 10% 的 HTTP 请求延迟。

## 标准回答

正常 TCP + HTTP 请求需要 2-3 RTT：

```
RTT 1: TCP 三次握手（1.5 RTT，因为第三次握手可带数据）
RTT 2: HTTP 请求 + 响应
```

TFO 流程：

```
首次连接（获取 Cookie）:
  Client → Server: SYN + Cookie 请求
  Client ← Server: SYN+ACK + Cookie
  Client → Server: ACK + HTTP 请求
  Client ← Server: HTTP 响应
  # 仍是 2 RTT，但获得了 Cookie

后续连接（带 Cookie，0-RTT 数据）:
  Client → Server: SYN + Cookie + HTTP 请求  ← 数据在握手阶段就发了
  Client ← Server: SYN+ACK + HTTP 响应
  Client → Server: ACK
  # 仅 1 RTT 完成请求响应
```

## 详细机制

### Cookie 机制

TFO 的核心是 Cookie：服务端在首次握手时生成一个加密 Cookie 发给客户端，客户端后续连接带上 Cookie，服务端验证后立即处理 SYN 中的数据。

```
首次连接:
1. Client → Server: SYN + Fast Open Cookie 请求
2. Server 生成 Cookie = HMAC(密钥, Client IP)
3. Server → Client: SYN+ACK + Cookie
4. Client 缓存 Cookie

后续连接:
1. Client → Server: SYN + Cookie + 数据
2. Server 验证 Cookie
   - 合法 → 处理数据，回 SYN+ACK + 响应
   - 非法 → 退回普通握手
3. Client → Server: ACK
```

### Cookie 安全性

Cookie 用服务端密钥加密 Client IP 生成，攻击者无法伪造。但 Cookie 本身不加密数据，数据安全性由上层（如 TLS）保证。

### 0-RTT 数据的重放风险

TFO 的 SYN 数据可能被攻击者重放：

```
1. 攻击者捕获 Client → Server 的 SYN+数据
2. 攻击者重放这个包
3. Server 重复处理（如果操作非幂等，造成副作用）
```

所以 TFO 的 SYN 数据只适合幂等请求（GET），不适合非幂等请求（POST 转账）。

### Linux 内核参数

```bash
# TFO 开关（位掩码）
# 0: 关闭
# 1: 客户端开启
# 2: 服务端开启
# 3: 双向开启
$ sysctl net.ipv4.tcp_fastopen=3

# 查看 TFO 统计
$ nstat -az | grep -i fastopen
TcpExtTCPFastOpenActive     123   # 客户端发起的 TFO
TcpExtTCPFastOpenPassive    456   # 服务端接收的 TFO
TcpExtTCPFastOpenListenOverflow  0  # TFO 队列溢出
```

### 抓包示例

```bash
# TFO 抓包特征：SYN 携带数据 + TCP Fast Open 选项
$ tcpdump -i any -n -v 'tcp port 80'
10:00:01 IP 10.0.0.1.5000 > 10.0.0.2.80: Flags [S], seq 1000, options [tfo,...], length 100
# SYN 包 length 100 表示携带了 100 字节数据
10:00:01 IP 10.0.0.2.80 > 10.0.0.1.5000: Flags [S.], seq 2000, ack 1101, options [tfo cookie], length 0
# 首次连接服务端回 Cookie
```

## 代码示例

服务端开启 TFO（Linux）：

```c
int fd = socket(AF_INET, SOCK_STREAM, 0);
int on = 1;
// 服务端开启 TFO，accept 时即可处理带数据的 SYN
setsockopt(fd, IPPROTO_TCP, TCP_FASTOPEN, &on, sizeof(on));
// 队列长度（排队等待处理的 TFO 请求）
int qlen = 100;
setsockopt(fd, IPPROTO_TCP, TCP_FASTOPEN, &qlen, sizeof(qlen));
listen(fd, qlen);
```

客户端使用 TFO：

```c
int fd = socket(AF_INET, SOCK_STREAM, 0);
// 客户端开启 TFO
int on = 1;
setsockopt(fd, IPPROTO_TCP, TCP_FASTOPEN_CONNECT, &on, sizeof(on));
// 后续 connect + send 会自动用 TFO
connect(fd, ...);
send(fd, "GET / HTTP/1.1\r\n\r\n", ...);  // 数据随 SYN 发出
```

Java 暂无直接 API，需通过 JNI 或 native 调用：

```java
// Java 标准库不直接支持 TFO
// 通过内核参数开启后，部分 native 客户端库（如 curl）可使用
// 实际生产中更多用 HTTP/2 长连接替代 TFO
```

## 实战场景

| 场景 | 适用性 | 注意点 |
|------|--------|--------|
| HTTP 短连接 | 适合 | 节省 1 RTT |
| 移动端 App | 适合 | RTT 高，省时明显 |
| HTTPS | 配合 TLS 1.3 | TFO + TLS 1.3 0-RTT |
| API 网关 | 评估 | 需客户端和服务端都支持 |
| 内网调用 | 不需要 | RTT 低，收益小 |
| 非幂等请求 | 不适合 SYN 数据 | 重放风险 |

## 深挖追问

**Q1：TFO 为什么不普及？**
- 需要客户端和服务端都支持
- 部分中间设备（防火墙、NAT）丢弃带数据的 SYN
- 重放风险限制使用场景
- HTTP/2 长连接已大幅减少建连开销

**Q2：TFO 和 TLS 1.3 0-RTT 什么关系？**
TFO 是传输层优化（SYN 携带数据），TLS 1.3 0-RTT 是加密层优化（用预共享密钥加密早期数据）。两者可叠加，但 TLS 1.3 0-RTT 已经覆盖了 TFO 大部分场景。

**Q3：TFO 失败会怎样？**
服务端不识别 TFO 选项时退回普通握手，客户端数据被丢弃，需重发。所以 TFO 是"尝试性"优化，不保证成功。

**Q4：TFO 的 Cookie 多久过期？**
服务端密钥定期轮换（默认几小时），轮换后旧 Cookie 失效，客户端重新走完整握手获取新 Cookie。

**Q5：TFO 一定省 1 RTT 吗？**
首次连接不省（要获取 Cookie），后续连接省 1 RTT。Cookie 失效后又要重新获取。

## 易错点

- **"TFO 第一次就省 RTT"** — 不，首次要获取 Cookie，仍是 2 RTT。
- **"TFO 数据可以非幂等"** — 不行，有重放风险。
- **"TFO 替代 TLS"** — 不，TFO 不加密，安全性靠上层 TLS。
- **"开启 TFO 一定生效"** — 不，需要双方支持，且中间设备不丢弃带数据 SYN。
- **"TFO 比长连接好"** — 不，长连接避免握手更彻底，TFO 适合无法长连接的场景。

## 总结

TFO 让 TCP 后续连接在 SYN 阶段携带数据，省 1 RTT。首次连接需获取 Cookie，仍 2 RTT。生产中使用不多，因为需要双方支持、有重放风险、中间设备可能丢弃带数据 SYN。HTTP/2 长连接和 QUIC 是更主流的方案。TFO 适合无法长连接的短连接场景，且仅适合幂等请求。

## 参考资料

- [RFC 7413 — TCP Fast Open](https://datatracker.ietf.org/doc/html/rfc7413)
- [Linux TCP_FASTOPEN 文档](https://man7.org/linux/man-pages/man7/tcp.7.html)
