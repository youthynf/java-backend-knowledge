# DNS 是什么

## 核心概念

DNS（Domain Name System，域名系统）是互联网的"电话簿"，负责把人类易记的域名（如 `www.example.com`）翻译成机器能识别的 IP 地址（如 `93.184.216.34`）。DNS 是分布式、层次化的数据库，由全球数百万台 DNS 服务器组成，没有单点故障。理解 DNS 的工作原理、域名层次结构、解析流程是排查网络问题的基础。

## 标准回答

DNS 的核心要点：

1. **作用**：域名 → IP 地址转换
2. **结构**：层次化域名树（根域 → 顶级域 → 二级域 → 子域）
3. **解析流程**：浏览器缓存 → OS 缓存 → hosts → 本地 DNS → 根 → TLD → 权威 DNS
4. **传输协议**：默认 UDP（端口 53），大响应或区域传送用 TCP
5. **缓存**：多级缓存（浏览器/OS/本地 DNS），TTL 决定缓存有效期

## 详细机制

### 域名层次结构

```
            根域（.）
              │
     ┌────────┼────────┐
     │        │        │
   .com     .org     .cn   ← 顶级域（TLD）
     │        │        │
  example  example  example ← 二级域
     │
   www              ← 三级域（主机名）
```

完整域名：`www.example.com.`（最后那个点通常省略，代表根域）

- **根域**：13 组根 DNS 服务器（A-M），全球任播部署
- **顶级域（TLD）**：.com、.org、.net、.cn、.edu 等
- **二级域**：example.com、google.com 等（注册的域名）
- **主机名**：www、mail、api 等子域

### DNS 解析流程

```
1. 浏览器缓存
   浏览器自己缓存 DNS 记录，TTL 通常 60-120 秒

2. OS 缓存
   浏览器调用 getaddrinfo()，OS 先查本地缓存

3. hosts 文件
   /etc/hosts 或 C:\Windows\System32\drivers\etc\hosts

4. 本地 DNS 服务器（递归解析器）
   通常是 ISP 提供的 DNS，或 8.8.8.8、1.1.1.1 等
   本地 DNS 也有缓存

5. 本地 DNS 迭代查询（如果缓存未命中）
   本地 DNS → 根 DNS：问 www.example.com 的 IP
   根 DNS → 本地 DNS：我不知道，但 .com 的 TLD DNS 在这
   本地 DNS → .com TLD DNS：问 www.example.com
   TLD DNS → 本地 DNS：我不知道，但 example.com 的权威 DNS 在这
   本地 DNS → example.com 权威 DNS：问 www.example.com
   权威 DNS → 本地 DNS：IP 是 93.184.216.34

6. 本地 DNS 返回 IP 给客户端，并缓存
```

### 递归 vs 迭代

- **递归查询**：客户端 → 本地 DNS。客户端只发一次请求，本地 DNS 负责完成全部解析
- **迭代查询**：本地 DNS → 根/TLD/权威。每一步本地 DNS 都要主动询问下一级

### DNS 记录类型

| 类型 | 含义 | 示例 |
|------|------|------|
| A | 域名 → IPv4 | example.com. A 93.184.216.34 |
| AAAA | 域名 → IPv6 | example.com. AAAA 2606:2800:220:1:... |
| CNAME | 别名 | www.example.com. CNAME example.com. |
| MX | 邮件服务器 | example.com. MX 10 mail.example.com. |
| NS | 域名服务器 | example.com. NS ns1.example.com. |
| TXT | 文本记录（SPF、DKIM 等） | example.com. TXT "v=spf1 ..." |
| SRV | 服务记录 | _sip._tcp.example.com. SRV ... |
| SOA | 区域起始 | 含管理员邮箱、序列号等 |

### DNS 报文结构

```
DNS 报文（UDP）：
+---------------------+
| Header（12 字节）    |  ID、Flags、QDCOUNT、ANCOUNT 等
+---------------------+
| Question            |  查询的域名和类型
+---------------------+
| Answer              |  响应记录
+---------------------+
| Authority           |  权威 NS 记录
+---------------------+
| Additional          |  额外记录（如 glue records）
+---------------------+
```

### DNS 缓存与 TTL

每条 DNS 记录有 TTL（Time To Live），决定缓存有效期：

```
example.com. 3600 IN A 93.184.216.34
            ↑ TTL 3600 秒
```

- TTL 长：缓存命中率高，解析快；但 DNS 变更生效慢
- TTL 短：变更快；但缓存命中率低，解析慢

变更 DNS 前通常先把 TTL 调短（如 60 秒），等旧 TTL 过期后变更，再恢复长 TTL。

### DNS 劫持

攻击者篡改 DNS 响应，把域名指向错误 IP：

```
客户端 → 本地 DNS：问 example.com
攻击者（中间人）→ 客户端：example.com 是 1.2.3.4（攻击者 IP）
客户端访问 1.2.3.4，被钓鱼
```

防护：

- DNSSEC（DNS 安全扩展）：DNS 响应带数字签名，客户端验证
- DoH（DNS over HTTPS）：DNS 查询加密传输
- DoT（DNS over TLS）：DNS 查询 TLS 加密

### 抓包与调试

```bash
# dig 查询 DNS
$ dig www.example.com
;; ANSWER SECTION:
www.example.com. 3600 IN A 93.184.216.34

# nslookup
$ nslookup www.example.com

# 抓 DNS 包
$ tcpdump -i any -n 'udp port 53 or tcp port 53'
10:00:00 IP C.5000 > D.53: 12345+ A? www.example.com. (33)
10:00:00 IP D.53 > C.5000: 12345 1/0/0 A 93.184.216.34 (49)

# 查看本地 DNS 缓存
$ systemd-resolve --statistics    # systemd 系统
$ nslookup -type=any example.com 8.8.8.8

# 查看解析路径
$ dig +trace www.example.com
;; root servers
;; .com NS
;; example.com NS
;; www.example.com A
```

## 代码示例

Java DNS 查询：

```java
import java.net.*;

// Java 内置 DNS 查询
InetAddress[] addrs = InetAddress.getAllByName("www.example.com");
for (InetAddress addr : addrs) {
    System.out.println(addr.getHostAddress());
}

// 反向查询（IP → 域名）
InetAddress addr = InetAddress.getByName("93.184.216.34");
System.out.println(addr.getCanonicalHostName());
```

JVM DNS 缓存配置：

```bash
# JVM 缓存 DNS 结果的时间（秒），-1 永久缓存，0 不缓存
-Dnetworkaddress.cache.ttl=60

# 失败缓存时间（秒）
-Dnetworkaddress.cache.negative.ttl=10
```

```java
// Java 应用层 DNS 缓存
import java.net.*;

// 安全管理器控制 DNS 缓存（已弃用，用系统属性）
System.setProperty("networkaddress.cache.ttl", "60");
System.setProperty("networkaddress.cache.negative.ttl", "10");
```

dnsjava 库查询不同记录类型：

```java
import org.xbill.DNS.*;

// 查询 MX 记录
Record[] records = new Lookup("example.com", Type.MX).run();
for (Record r : records) {
    MXRecord mx = (MXRecord) r;
    System.out.println(mx.getTarget() + " priority=" + mx.getPriority());
}

// 查询 TXT 记录
records = new Lookup("example.com", Type.TXT).run();
```

## 实战场景

| 场景 | 注意点 | 处理 |
|------|--------|------|
| 服务调用偶发超时 | DNS 解析慢或失败 | 监控 DNS 解析时间 |
| 故障切换后旧 IP 仍访问 | JVM DNS 缓存未刷新 | 调短 `networkaddress.cache.ttl` |
| DNS 劫持 | 解析到错误 IP | 用 DoH/DoT、DNSSEC |
| CDN 智能解析 | 不同地区返回不同 IP | 配合 GeoDNS |
| 多机房部署 | DNS 负载均衡 | 用 NS 或 A 记录轮询 |
| 域名变更 | 旧 IP 缓存未失效 | 提前调短 TTL |

## 深挖追问

**Q1：为什么根 DNS 只有 13 组？**
历史原因：早期 DNS 响应要在一个 UDP 包（512 字节）内装下，13 组根 DNS 的记录刚好够。实际上每组根 DNS 通过任播（Anycast）部署到全球数百个节点，不是 13 台机器。

**Q2：DNS 用 UDP 还是 TCP？**
默认 UDP（端口 53）。响应超过 512 字节、区域传送（zone transfer）用 TCP。DNSSEC 引入后大响应增多，TCP 使用比例上升。DoH/DoT 也用 TCP。

**Q3：JVM 的 DNS 缓存影响大吗？**
大。JVM 默认缓存 30 秒（JDK 8+），失败缓存 10 秒。生产中故障切换时旧 IP 仍可能被缓存导致请求失败。建议调短 TTL。

**Q4：DNS 解析慢怎么排查？**
用 `dig +trace` 看每一步耗时；用 `dig @8.8.8.8 example.com` 测试不同 DNS 服务器；检查本地 DNS 缓存。

**Q5：DNS 能做负载均衡吗？**
能。一个域名对应多个 A 记录，DNS 服务器轮询返回。但 DNS 不感知服务器健康状态，需配合健康检查（如 GSLB）。

## 易错点

- **"DNS 一定走 UDP"** — 不，大响应或区域传送用 TCP。
- **"DNS 解析只发生一次"** — 不，多级缓存，TTL 控制刷新。
- **"hosts 文件优先级最低"** — 反了，hosts 优先于 DNS 查询。
- **"DNS 是中心化的"** — 不，是分布式层次化数据库。
- **"改 DNS 立即生效"** — 不，受 TTL 影响，可能要等旧缓存过期。

## 总结

DNS 是互联网的"电话簿"，把域名翻译成 IP 地址。域名是层次化树结构（根 → TLD → 二级域），解析流程经过浏览器/OS/hosts/本地 DNS 缓存，未命中则迭代查询根/TLD/权威 DNS。默认走 UDP，大响应用 TCP。TTL 决定缓存有效期，变更前要调短 TTL。生产中要关注 JVM DNS 缓存、DNS 劫持防护、解析耗时监控。

## 参考资料

- [RFC 1035 — Domain Names - Implementation and Specification](https://datatracker.ietf.org/doc/html/rfc1035)
- [RFC 7858 — Specification for DNS over TLS](https://datatracker.ietf.org/doc/html/rfc7858)
- [RFC 8484 — DNS Queries over HTTPS](https://datatracker.ietf.org/doc/html/rfc8484)
- [dig 命令文档](https://man7.org/linux/man-pages/man1/dig.1.html)
