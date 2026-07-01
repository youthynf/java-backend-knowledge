# TCP 三次握手和 TLS 握手能合并吗

## 核心概念

传统 HTTPS 连接先做 TCP 三次握手（传输层），再做 TLS 握手（加密层），两层职责不同不能直接合并。但可以通过优化减少往返次数：TLS 1.3 把握手压到 1-RTT，会话复用支持 0-RTT，TCP Fast Open 让 SYN 携带数据，QUIC 把传输和加密握手集成在 UDP 之上彻底合并。

## 标准回答

**不能直接合并**，因为 TCP 和 TLS 在不同层次，职责不同：
- TCP 在传输层，负责可靠连接、序列号同步
- TLS 在应用层之下，负责身份认证、密钥协商、加密

但可以减少总往返次数：

| 方案 | 首次连接 | 复用连接 |
|------|---------|---------|
| 传统 TCP + TLS 1.2 | 3 RTT（TCP 1.5 + TLS 1.5） | 2 RTT |
| TCP + TLS 1.3 | 2 RTT（TCP 1.5 + TLS 0.5） | 1 RTT |
| TCP Fast Open + TLS 1.3 | 1.5 RTT | 0-RTT |
| QUIC（彻底合并） | 1 RTT | 0-RTT |

## 详细机制

### 传统 HTTPS 的 RTT 成本

```
Client                              Server
  | --- TCP SYN ------------------>     |
  | <== TCP SYN+ACK =================   |  RTT 1（TCP 握手 1.5 RTT）
  | --- TCP ACK + TLS ClientHello -->   |
  | <== TLS ServerHello + Cert =======  |  RTT 2（TLS 1.2 握手）
  | --- TLS Key Exchange + Finished --> |
  | <== TLS Finished ================   |  RTT 3（TLS 1.2 完成）
  | --- HTTP 请求 ------------------->  |
  | <== HTTP 响应 ===================   |  RTT 4（HTTP 数据）
```

TCP + TLS 1.2 首次连接共 3 RTT 才能发 HTTP 请求。

### TLS 1.3 的优化

TLS 1.3 把握手压到 1-RTT：

```
Client                              Server
  | --- TLS ClientHello + KeyShare -->  |
  | <== TLS ServerHello + KeyShare + Encrypted ==
  | --- TLS Finished (encrypted) ---->  |  RTT 1（TLS 1.3 握手）
  | --- HTTP 请求 (encrypted) --------> |
  | <== HTTP 响应 (encrypted) ========  |
```

TLS 1.3 首次握手 1 RTT，且 ServerHello 之后的数据都已加密。配合 TCP 三次握手，首次 HTTPS 连接共 2 RTT。

### TLS 1.3 0-RTT（会话恢复）

如果客户端之前连过该服务器，可以用 0-RTT 模式：

```
Client                              Server
  | --- TLS ClientHello + 早期数据 -->  |  RTT 1（早期数据随 ClientHello 发出）
  | <== TLS ServerHello + 响应 =====    |
```

客户端用缓存的预共享密钥（PSK）加密早期数据，服务端验证后立即处理。0-RTT 数据随第一个包发出。

**0-RTT 风险**：早期数据可能被重放，只适合幂等请求（GET），不适合非幂等（POST 转账）。

### TCP Fast Open

TFO 让 TCP 握手阶段携带数据：

```
后续连接:
  | --- SYN + Cookie + 数据 ---------->  |
  | <== SYN+ACK + 响应 ================  |  RTT 1
```

TFO + TLS 1.3 可以让首次数据在 SYN 阶段就携带。

### QUIC：彻底合并

QUIC 把传输层握手和 TLS 1.3 握手集成：

```
Client                              Server
  | --- QUIC Initial + TLS ClientHello -->
  | <== QUIC Initial + TLS ServerHello + Cert + Finished ==
  | --- QUIC + TLS Finished + HTTP 请求 -->
  | <== HTTP 响应 ===================    |
```

首次连接 1 RTT，复用连接 0-RTT。QUIC 是真正"合并"了 TCP 握手和 TLS 握手的方案。

## 代码示例

服务端开启 TLS 1.3：

```nginx
# Nginx 配置 TLS 1.3
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers TLS13-AES-256-GCM-SHA384:TLS13-CHACHA20-POLY1305-SHA256:...;
ssl_early_data on;  # 开启 0-RTT
```

Java 服务端启用 TLS 1.3：

```java
import javax.net.ssl.*;

SSLContext ctx = SSLContext.getInstance("TLSv1.3");
ctx.init(null, null, null);
SSLServerSocketFactory ssf = ctx.getServerSocketFactory();
// JDK 11+ 支持 TLS 1.3
```

测试 HTTPS 握手耗时：

```bash
# 用 curl 测试
$ curl -w "TCP: %{time_connect}s\nTLS: %{time_appconnect}s\nTotal: %{time_total}s\n" \
    -o /dev/null -s https://example.com
TCP: 0.025s    # TCP 握手
TLS: 0.078s    # TLS 握手
Total: 0.120s  # 总耗时

# 用 openssl 查看 TLS 版本和握手细节
$ openssl s_client -connect example.com:443 -tls1_3
```

## 实战场景

| 场景 | 优化方向 |
|------|---------|
| Web API | 启用 TLS 1.3 + HTTP/2 长连接 |
| 移动端 App | QUIC（HTTP/3）+ 0-RTT |
| 内网服务 | 用 HTTP（无 TLS），TLS 由 mTLS 网关统一处理 |
| CDN 静态资源 | TLS 1.3 + Session Ticket + 边缘节点 |
| 高安全要求 | 关闭 0-RTT（防重放） |

## 深挖追问

**Q1：为什么 TCP 和 TLS 不能直接合并？**
层次不同。TCP 在内核实现，TLS 在用户态。要合并需要修改内核或换传输层（如 QUIC 在用户态重写）。

**Q2：0-RTT 一定不安全吗？**
不是"不安全"，是有重放风险。TLS 1.3 的 0-RTT 数据是加密的，但攻击者可以重放加密包让服务端重复处理。所以只适合幂等请求。

**Q3：TLS 1.3 比 TLS 1.2 快多少？**
首次握手 1 RTT vs 2 RTT，复用连接 0-RTT vs 0-RTT（TLS 1.2 也支持会话恢复）。安全方面 TLS 1.3 移除了不安全的算法。

**Q4：TFO + TLS 1.3 能 0-RTT 首次连接吗？**
不能。首次连接没有 Cookie 和 PSK，必须先建立信任。0-RTT 只能用于复用场景。

**Q5：QUIC 完全替代 TCP+TLS 吗？**
目标是。QUIC 在 UDP 之上重新实现可靠传输 + TLS 1.3，省去 TCP 和 TLS 的握手合并问题。但部署受 UDP 兼容性限制。

## 易错点

- **"TLS 1.3 取消了 TCP 握手"** — 没有，只是减少 TLS 自身往返。
- **"0-RTT 总是好的"** — 有重放风险，不适合非幂等请求。
- **"TFO 等于 0-RTT"** — 不等，TFO 是 TCP 层优化，0-RTT 是 TLS 层。
- **"QUIC 还是要 TLS 握手"** — 是，但 QUIC 把 TLS 握手和传输握手合并了，1 RTT 完成。
- **"HTTPS 慢是因为 TLS"** — 部分是，但更多是握手 RTT 累积。

## 总结

TCP 三次握手和 TLS 握手职责不同，传统 HTTPS 不能直接合并，总成本 3 RTT。TLS 1.3 把 TLS 握手压到 1 RTT，会话复用支持 0-RTT。TFO 让 TCP SYN 携带数据省 1 RTT。QUIC 是真正合并的方案，把传输和加密握手集成在 UDP 上，首次 1 RTT，复用 0-RTT。生产推荐 TLS 1.3 + HTTP/2 长连接，移动端考虑 HTTP/3。

## 参考资料

- [RFC 8446 — TLS 1.3](https://datatracker.ietf.org/doc/html/rfc8446)
- [RFC 7413 — TCP Fast Open](https://datatracker.ietf.org/doc/html/rfc7413)
- [RFC 9000 — QUIC](https://datatracker.ietf.org/doc/html/rfc9000)
