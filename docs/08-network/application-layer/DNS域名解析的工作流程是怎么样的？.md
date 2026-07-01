# DNS 域名解析的工作流程是怎么样的

## 核心概念

DNS 解析是把域名翻译成 IP 地址的完整流程，涉及多级缓存和层次化查询。客户端发起查询后，依次经过浏览器缓存、OS 缓存、hosts 文件、本地 DNS 服务器，未命中则本地 DNS 迭代查询根域、顶级域、权威 DNS。整个过程对用户透明，但每一步都可能成为性能瓶颈或故障点。理解完整流程是排查"接口偶发超时""DNS 劫持""故障切换不生效"等问题的关键。

## 标准回答

DNS 解析完整流程：

```
1. 浏览器缓存 → 2. OS 缓存 → 3. hosts 文件 → 4. 本地 DNS 缓存
   → 5. 本地 DNS 迭代查询：根 → TLD → 权威 → 6. 返回 IP 给客户端
```

各步骤说明：

| 步骤 | 位置 | TTL |
|------|------|-----|
| 浏览器缓存 | 浏览器内存 | 60-120 秒（Chrome） |
| OS 缓存 | 操作系统 | 因系统而异 |
| hosts 文件 | /etc/hosts | 静态 |
| 本地 DNS 缓存 | 本地 DNS 服务器 | 记录的 TTL |
| 根/TLD/权威 | 全球 DNS 服务器 | 记录的 TTL |

## 详细机制

### 步骤 1：浏览器缓存

浏览器有自己的 DNS 缓存，TTL 通常 60-120 秒。Chrome 在 `chrome://net-internals/#dns` 可查看。

```
用户访问 www.example.com
  ↓
浏览器查自己缓存
  ↓ 命中 → 直接用
  ↓ 未命中 → 进入步骤 2
```

### 步骤 2：OS 缓存

浏览器调用 `getaddrinfo()` 系统 API，OS 先查自己的缓存：

- **Linux**：systemd-resolved 或 nscd
- **Windows**：DNS Client 服务
- **macOS**：mDNSResponder

```bash
# Linux 查看 DNS 缓存统计
$ systemd-resolve --statistics
DNSSEC supported: no
Transactions
Current Transactions: 0
Total Transactions: 1234
Cache
  Current Cache Size: 56
  Cache Hits: 1100
  Cache Misses: 134
```

### 步骤 3：hosts 文件

OS 查 `/etc/hosts`（Linux/macOS）或 `C:\Windows\System32\drivers\etc\hosts`（Windows）：

```
# /etc/hosts
127.0.0.1 localhost
93.184.216.34 www.example.com   # 静态映射，优先级最高
```

hosts 文件优先于 DNS 查询，常用于本地开发测试。

### 步骤 4：本地 DNS 服务器

OS 配置的 DNS 服务器（如 8.8.8.8、114.114.114.114、ISP 的 DNS）：

```bash
# 查看 OS 配置的 DNS
$ cat /etc/resolv.conf
nameserver 8.8.8.8
nameserver 8.8.4.4

# Windows
$ ipconfig /all | grep "DNS Servers"
```

本地 DNS 服务器也有缓存，命中直接返回。

### 步骤 5：本地 DNS 迭代查询

本地 DNS 缓存未命中时，开始迭代查询：

```
本地 DNS → 根 DNS（.）
  问：www.example.com 的 IP？
  根 DNS 答：我不知道，但 .com 顶级域的 NS 在这（返回 .com TLD 地址）

本地 DNS → .com TLD DNS
  问：www.example.com 的 IP？
  TLD DNS 答：我不知道，但 example.com 的权威 DNS 在这（返回权威 NS 地址）

本地 DNS → example.com 权威 DNS
  问：www.example.com 的 IP？
  权威 DNS 答：93.184.216.34
```

### 步骤 6：返回并缓存

本地 DNS 把 IP 返回给客户端，并缓存记录（按 TTL）：

```
本地 DNS → 客户端：93.184.216.34（TTL 3600 秒）
本地 DNS 缓存该记录 3600 秒
客户端 OS 缓存（按 system 配置）
浏览器缓存
```

后续请求直接用缓存，不重复查询。

### 完整流程图

```
用户输入 www.example.com
        ↓
[浏览器缓存] ── 命中 → 用缓存 IP
        ↓ 未命中
[OS 缓存] ── 命中 → 用缓存 IP
        ↓ 未命中
[hosts 文件] ── 命中 → 用映射 IP
        ↓ 未命中
[本地 DNS 缓存] ── 命中 → 用缓存 IP
        ↓ 未命中
[本地 DNS 迭代查询]
   ├→ 根 DNS → 返回 .com TLD 地址
   ├→ .com TLD → 返回 example.com 权威 NS
   └→ example.com 权威 → 返回 IP
        ↓
本地 DNS 缓存 + 返回客户端
        ↓
OS 缓存 + 浏览器缓存 + 返回应用
        ↓
应用用 IP 建立 TCP 连接
```

### 各级耗时

```
浏览器缓存命中：< 1ms
OS 缓存命中：< 5ms
本地 DNS 缓存命中：1-10ms
本地 DNS 迭代查询：50-200ms（跨地域）
完整解析（无任何缓存）：100-500ms
```

### DNS 故障的影响

- **解析失败**：连接还没建立就报错"Unknown host"
- **解析慢**：接口偶发超时，但服务端正常
- **解析错误**（劫持）：访问到错误 IP，被钓鱼
- **缓存未刷新**：故障切换后仍访问旧 IP

### dig +trace 看完整路径

```bash
$ dig +trace www.example.com

;; NS 根服务器列表
. 518400 IN NS a.root-servers.net.
. 518400 IN NS b.root-servers.net.
...

;; .com TLD NS
com. 172800 IN NS a.gtld-servers.net.
...

;; example.com 权威 NS
example.com. 172800 IN NS a.iana-servers.net.
example.com. 172800 IN NS b.iana-servers.net.

;; 最终 A 记录
www.example.com. 3600 IN A 93.184.216.34
```

## 代码示例

Java 触发 DNS 解析：

```java
import java.net.*;

// 简单查询
InetAddress addr = InetAddress.getByName("www.example.com");
System.out.println(addr.getHostAddress());

// 多个 IP（DNS 负载均衡）
InetAddress[] addrs = InetAddress.getAllByName("www.example.com");
for (InetAddress a : addrs) {
    System.out.println(a.getHostAddress());
}
```

Java 控制 DNS 缓存：

```java
// JVM 启动参数
// -Dnetworkaddress.cache.ttl=60       缓存 60 秒
// -Dnetworkaddress.cache.negative.ttl=10  失败缓存 10 秒

// 运行时设置（需在 SecurityManager 启用前）
System.setProperty("networkaddress.cache.ttl", "60");
```

Java 自定义 DNS 解析器（如 DNS over HTTPS）：

```java
import java.net.*;
import java.net.spi.*;

public class DoHResolver extends InetAddressResolver {
    @Override
    public Stream<InetAddress> lookupByName(String host, LookupPolicy policy) {
        // 通过 HTTPS 查询 DNS
        String url = "https://dns.google/resolve?name=" + host;
        // 解析 JSON 响应，返回 InetAddress
        // ...
    }
}
```

Spring Boot 配置连接池 DNS 缓存：

```yaml
# HttpClient 连接池配置
http:
  client:
    max-total: 100
    max-per-route: 20
    # 连接池保持连接，避免每次请求都解析 DNS
    # 但要注意 IP 变化时连接池内的旧 IP 连接如何处理
```

## 实战场景

| 场景 | 现象 | 排查 |
|------|------|------|
| 接口偶发超时 | DNS 解析慢 | `dig` 测解析时间 |
| 故障切换不生效 | 仍访问旧 IP | 检查 JVM/OS/浏览器 DNS 缓存 |
| 部分用户访问异常 | 本地 DNS 故障或劫持 | 用其他 DNS 测试（8.8.8.8） |
| CDN 解析不准 | 跨地区访问慢 | 用 GeoDNS 智能解析 |
| 容器内 DNS 异常 | 解析失败 | 检查容器 `/etc/resolv.conf` |

## 深挖追问

**Q1：hosts 文件优先级真的最高吗？**
浏览器缓存可能优先于 hosts 文件（取决于浏览器实现）。但 OS 层面 hosts 优先于 DNS 查询。

**Q2：本地 DNS 服务器怎么选？**
通常用 ISP 提供的（自动配置），或公共 DNS（8.8.8.8、1.1.1.1、114.114.114.114）。公共 DNS 通常更可靠但可能慢。

**Q3：DNS 查询会泄露隐私吗？**
会。普通 DNS 查询明文传输，ISP 或中间人能看到你访问的域名。用 DoH/DoT 加密。

**Q4：解析失败会怎样？**
应用收到 `UnknownHostException`。客户端通常会重试或显示错误页。生产中要有降级方案（如备用域名、IP 直连）。

**Q5：DNS 解析能并行加速吗？**
能。Happy Eyeballs（RFC 8305）让客户端同时解析 IPv4 和 IPv6，用先返回的。部分浏览器支持预解析（dns-prefetch）。

## 易错点

- **"DNS 解析只发生一次"** — 不，多级缓存，TTL 控制刷新。
- **"hosts 优先级最低"** — 反了，OS 层面 hosts 优先于 DNS。
- **"本地 DNS 一定用 ISP 的"** — 不，可手动配置 8.8.8.8 等。
- **"DNS 失败立即报错"** — 不，会有重试和超时。
- **"改 DNS 立即生效"** — 不，各级缓存 TTL 影响生效时间。

## 总结

DNS 解析流程经过多级缓存（浏览器/OS/hosts/本地 DNS）和层次化查询（根/TLD/权威）。完整解析 100-500ms，缓存命中 < 5ms。生产中要关注 JVM DNS 缓存（影响故障切换）、解析耗时监控、DNS 劫持防护（DoH/DoT）。变更 DNS 前要调短 TTL，确保切换快速生效。

## 参考资料

- [RFC 1034 — Domain Names - Concepts and Facilities](https://datatracker.ietf.org/doc/html/rfc1034)
- [RFC 1035 — Domain Names - Implementation and Specification](https://datatracker.ietf.org/doc/html/rfc1035)
- [How DNS Works](https://howdns.works/)
