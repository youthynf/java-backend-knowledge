# DNS 底层使用 TCP 还是 UDP

## 核心概念

DNS 默认使用 UDP（端口 53），因为查询通常很小且需要快速响应。但 DNS 也用 TCP，场景包括：响应超过 512 字节、区域传送（zone transfer）、DNSSEC 大响应、DoH/DoT 加密传输。理解 DNS 何时用 UDP 何时用 TCP，能解释"DNS 抓包看到 TCP"等异常。

## 标准回答

DNS 传输协议选择：

| 场景 | 协议 | 原因 |
|------|------|------|
| 普通查询（< 512 字节） | UDP | 快、低开销 |
| 大响应（> 512 字节） | TCP | UDP 受 512 字节限制 |
| 区域传送（zone transfer） | TCP | 数据大，需可靠传输 |
| DNSSEC 大响应 | TCP | 签名数据增大响应 |
| DoH（DNS over HTTPS） | TCP（HTTPS） | 加密、防劫持 |
| DoT（DNS over TLS） | TCP（TLS） | 加密、防劫持 |

## 详细机制

### 为什么 DNS 默认用 UDP

UDP 适合 DNS 的原因：

1. **无连接**：不需要三次握手，一次请求一次响应，省 2 RTT
2. **轻量**：UDP 头 8 字节，TCP 头 20+ 字节，节省带宽
3. **快速**：查询通常 < 100 字节，UDP 一个包搞定
4. **简单**：无连接管理、无重传，实现简单

典型 DNS 查询：

```
客户端 → DNS 服务器：UDP 包，查询 www.example.com 的 A 记录
DNS 服务器 → 客户端：UDP 包，IP 是 93.184.216.34
```

一个往返完成，无需建连。

### DNS 报文大小限制

UDP DNS 报文大小限制：

- **RFC 1035**：512 字节（IPv4 默认）
- **EDNS0（RFC 6891）**：扩展到 4096 字节（典型协商）

如果响应超过 UDP 限制：

```
1. DNS 服务器在响应中设置 TC（Truncation）标志
2. 客户端收到 TC=1 的响应，知道被截断
3. 客户端用 TCP 重新查询
4. DNS 服务器用 TCP 完整返回响应
```

### DNS 用 TCP 的场景

#### 场景 1：大响应

一个域名对应多条记录时响应可能超 512 字节：

```
example.com. IN A 1.1.1.1
example.com. IN A 1.1.1.2
example.com. IN A 1.1.1.3
...
example.com. IN A 1.1.1.20   # 20 条 A 记录
```

20 条 A 记录可能超过 512 字节，需要 TCP。

#### 场景 2：区域传送（Zone Transfer）

DNS 主从同步用 AXFR/IXFR 报文，传输整个区域的所有记录，数据量大：

```
主 DNS → 从 DNS：传输 example.com 区域所有记录（可能几 MB）
```

必须用 TCP 保证可靠传输和顺序。

#### 场景 3：DNSSEC

DNSSEC 在响应中加入数字签名（RRSIG 记录），响应体积显著增大：

```
普通响应：example.com. A 1.1.1.1   # ~50 字节
DNSSEC 响应：example.com. A 1.1.1.1
            example.com. RRSIG A ...   # 签名 ~100 字节
            example.com. NSEC ...
            example.com. RRSIG NSEC ...
```

DNSSEC 响应常超 512 字节，需要 TCP 或 EDNS0。

#### 场景 4：DoH/DoT

加密 DNS 查询防劫持和窃听：

- **DoH（DNS over HTTPS）**：DNS 查询封装在 HTTPS 请求中，走 TCP 443
- **DoT（DNS over TLS）**：DNS 查询走 TLS 加密的 TCP 853

```
浏览器 → DoH 服务器（如 https://dns.google/resolve）：HTTPS 请求
DoH 服务器 → 浏览器：HTTPS 响应（DNS 结果）
```

### TCP DNS 的握手开销

```
UDP DNS：
  Client → Server: 查询
  Client ← Server: 响应
  # 1 RTT

TCP DNS（首次）：
  Client → Server: SYN
  Client ← Server: SYN+ACK
  Client → Server: ACK + 查询
  Client ← Server: 响应
  # 至少 2 RTT
```

TCP 慢一倍，但保证可靠性和顺序。现代 DNS 客户端会复用 TCP 连接（DoH/DoT）。

### 抓包对比

```bash
# UDP DNS 查询
$ tcpdump -i any -n 'udp port 53'
10:00:00 IP C.5000 > D.53: 12345+ A? www.example.com. (33)
10:00:00 IP D.53 > C.5000: 12345 1/0/0 A 93.184.216.34 (49)
# UDP，查询 33 字节，响应 49 字节

# TCP DNS（大响应或区域传送）
$ tcpdump -i any -n 'tcp port 53'
10:00:00 IP C.5000 > D.53: Flags [S], seq 1        # TCP 握手
10:00:00 IP D.53 > C.5000: Flags [S.], seq 2, ack 2
10:00:00 IP C.5000 > D.53: Flags [.], ack 2
10:00:00 IP C.5000 > D.53: Flags [P.], seq 2:50    # DNS 查询
10:00:00 IP D.53 > C.5000: Flags [P.], seq 2:1500, ack 50  # 大响应

# 查看截断标志
$ dig www.example.com
;; ->>HEADER<<- opcode: QUERY; status: NOERROR; id: 12345
;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 0
# 没有 tc 标志，说明没截断

$ dig example.com ANY
;; ->>HEADER<<- opcode: QUERY; status: NOERROR; id: 12345
;; flags: qr rd ra tc;    # tc 表示被截断，需要 TCP 重查
```

### DNS 协议演进

| 协议 | 端口 | 加密 | 用途 |
|------|------|------|------|
| DNS over UDP | 53 | 否 | 默认查询 |
| DNS over TCP | 53 | 否 | 大响应、区域传送 |
| DoT (DNS over TLS) | 853 | TLS | 加密查询 |
| DoH (DNS over HTTPS) | 443 | TLS | 加密 + 走 HTTPS |
| DNSCrypt | 443 | 自定义 | 加密（少用） |

## 代码示例

Java 用 UDP 查询 DNS（默认）：

```java
import java.net.*;

// Java 默认用 UDP
InetAddress addr = InetAddress.getByName("www.example.com");
// 如果响应太大，Java 内部会自动切到 TCP
```

dnsjava 库指定协议：

```java
import org.xbill.DNS.*;

// 强制 TCP
SimpleResolver resolver = new SimpleResolver("8.8.8.8");
resolver.setTCP(true);   // 用 TCP

Lookup lookup = new Lookup("www.example.com", Type.A);
lookup.setResolver(resolver);
Record[] records = lookup.run();
```

DoH 查询（Java 11+）：

```java
import java.net.http.*;
import java.net.URI;

// 用 Google DoH 服务
HttpClient client = HttpClient.newHttpClient();
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("https://dns.google/resolve?name=www.example.com&type=A"))
    .header("Accept", "application/dns-json")
    .GET()
    .build();

HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
System.out.println(resp.body());
// {"Status":0,"Answer":[{"name":"www.example.com.","type":1,"TTL":3600,"data":"93.184.216.34"}]}
```

服务端配置 DNS（BIND）：

```
// /etc/named.conf
options {
    listen-on port 53 { any; };
    // UDP 和 TCP 都监听
    // 默认两者都启用
};

zone "example.com" {
    type master;
    file "example.com.zone";
    allow-transfer { 10.0.0.2; };   // 允许从服务器 TCP 区域传送
};
```

## 实战场景

| 场景 | 协议 | 注意点 |
|------|------|--------|
| 普通 DNS 查询 | UDP | 默认 |
| DNSSEC 响应 | TCP 或 EDNS0 | 响应大 |
| 主从同步 | TCP | 区域传送 |
| 隐私保护 | DoH/DoT | 加密 |
| 企业内网 | DNS | 可能被劫持，考虑 DoT |
| 移动端 | DoH | 走 443，防火墙友好 |

## 深挖追问

**Q1：为什么 DNS 不直接全用 TCP？**
TCP 握手开销大，普通查询用 UDP 一来一回更快。TCP 用于大响应和需要可靠传输的场景。

**Q2：EDNS0 是什么？**
Extension DNS Mechanisms，扩展 UDP DNS 报文大小到 4096 字节，减少切到 TCP 的次数。RFC 6891。

**Q3：DoH 和 DoT 哪个更好？**
DoH 走 HTTPS 443 端口，防火墙友好，浏览器常用。DoT 走 853 端口，可能被防火墙挡，但更适合系统级 DNS。

**Q4：DNS 用 TCP 会更慢吗？**
首次查询慢（握手 1 RTT），但复用连接后接近 UDP。DoH/DoT 通常复用 TCP 连接。

**Q5：DNS 查询能并行吗？**
能。客户端可同时向多个 DNS 服务器查询，用先返回的响应。但通常不这么做，避免浪费。

## 易错点

- **"DNS 只用 UDP"** — 不，大响应、区域传送、DoH/DoT 用 TCP。
- **"UDP DNS 一定快"** — 大响应被截断后切 TCP 反而慢。
- **"DNS 默认 53 端口只走 UDP"** — 不，TCP 53 也用。
- **"DoH 走 53 端口"** — 不，走 443。
- **"DNS 查询加密后无法被监控"** — 服务端仍可被监控，只是链路加密。

## 总结

DNS 默认用 UDP（53 端口），快、轻、低开销。大响应（> 512 字节）、区域传送、DNSSEC 用 TCP。加密 DNS 用 DoH（443）或 DoT（853）。EDNS0 扩展 UDP 报文大小减少 TCP 切换。理解 DNS 协议选择能解释抓包异常和选择合适的 DNS 方案。

## 参考资料

- [RFC 1035 — DNS, Section 4.2 Transport](https://datatracker.ietf.org/doc/html/rfc1035#section-4.2)
- [RFC 6891 — EDNS0](https://datatracker.ietf.org/doc/html/rfc6891)
- [RFC 8484 — DNS Queries over HTTPS (DoH)](https://datatracker.ietf.org/doc/html/rfc8484)
- [RFC 7858 — DNS over TLS (DoT)](https://datatracker.ietf.org/doc/html/rfc7858)
