# DDoS 攻击是什么？

## 核心概念

DDoS（Distributed Denial of Service，分布式拒绝服务）是攻击者控制大量节点（僵尸网络）同时向目标发起海量请求或异常流量，耗尽目标的带宽、连接、CPU、内存等资源，导致正常用户无法访问。和 DoS 的区别在于“分布式”——单一 IP 的请求量很容易被屏蔽，但流量来自成千上万个 IP 时，单靠黑名单挡不住。

DDoS 的本质是“资源不对等”：攻击者用很小的成本（租用僵尸网络几美元/小时）放大出几十 Gbps 甚至 Tbps 的流量，而防御方要顶住需要等量带宽和算力，成本高得多。所以 DDoS 是典型的“非对称攻击”，防御不能只靠服务器硬扛，要靠网络层清洗、CDN 分散、限流降级等多层组合。

按攻击目标分三层：**网络层/传输层**（带宽耗尽、连接耗尽，如 SYN Flood、UDP Flood）、**应用层**（消耗 CPU/内存/数据库，如 HTTP Flood、CC 攻击）、**反射放大**（用 DNS/NTP/Memcached 等第三方服务放大流量）。防御思路各不相同。

## 标准回答

一句话结论：**DDoS 是用分布式流量耗尽目标资源，分流量型（SYN/UDP Flood、反射放大）、协议型（连接耗尽）、应用型（HTTP Flood/CC）三类；防御靠“带宽兜底 + 流量清洗 + 限流降级 + CDN 分散”，单机硬扛顶不住**。

要点展开：

- **流量型**：SYN Flood 半连接队列耗尽、UDP Flood 占带宽、反射放大利用 DNS/NTP/Memcached 把小请求变大成百上千倍响应。
- **协议型**：Slowloris 慢速 HTTP 占线程、TCP 连接 Flood 占满连接池。
- **应用型**：CC 攻击模拟真实业务请求（刷登录、刷搜索），消耗 CPU 和数据库，WAF 难识别。
- **核心防御**：云厂商高防 IP（T 级清洗）+ CDN 隐藏源站 + 应用层限流（令牌桶/漏桶）+ 弹性扩容。
- **不要做的事**：靠防火墙黑名单挡（IP 太多挡不完）、靠加机器硬扛（成本扛不住）、关掉服务“等攻击过去”（正中下怀）。

## 实现原理

### SYN Flood 攻击原理

TCP 三次握手：客户端发 SYN，服务端回 SYN+ACK 并把连接放入半连接队列（SYN_RCVD 状态），等客户端 ACK 才转 ESTABLISHED。

```
攻击者                  服务器
  | --- SYN (src=伪造IP) --> |  半连接队列 +1
  | <-- SYN+ACK ------------- |  (回复给伪造IP，无响应)
  | (不发 ACK)              |  半连接队列条目等超时（默认 60s）
  | --- SYN (src=伪造IP2) -> |  半连接队列 +1
  | --- SYN ...              |  队列满，正常用户的 SYN 被丢弃
```

攻击者伪造源 IP，发海量 SYN 不完成握手，半连接队列被占满（Linux 默认 `tcp_max_syn_backlog=1024`），正常用户握手失败。

防御：

- SYN Cookies：服务端不存半连接，把状态编码进 SYN+ACK 的 seq，客户端回 ACK 时再验证。Linux 默认开启 `net.ipv4.tcp_syncookies=1`。
- 调大 `tcp_max_syn_backlog`、缩短 `tcp_synack_retries`。
- 上游清洗：清洗设备代理握手，只把完成握手的流量回源。

### UDP Flood 与反射放大

UDP 无连接，攻击者可直接发 UDP 包占带宽。反射放大更进一步：攻击者伪造源 IP 为受害者 IP，向开放的 DNS/NTP/Memcached 服务发小请求，响应被发到受害者。

```
攻击者伪造 src=victim.com
  -> DNS 服务器: 查询 ANY 大记录 (60 字节请求)
DNS 服务器 -> victim.com: 3000 字节响应  (放大 50 倍)

Memcached 反射更夸张: 1:51000 放大倍数
  -> Memcached (UDP): "stats" 15 字节
Memcached -> victim: 1MB 响应
```

2018 年 GitHub 遭遇的 Memcached 反射攻击峰值 1.35 Tbps，是当时最大记录。

防御：

- 网络入口限速：ISP 或云厂商入口 BGP 流量清洗。
- 关闭服务器的 UDP 不必要端口；Memcached 不要暴露公网，且关闭 UDP。
- Anycast：用多个 IP 入口分散流量。

### HTTP Flood / CC 攻击

应用层攻击最隐蔽：攻击者模拟真实浏览器发请求，每个请求都合法，但量大到服务器扛不住。CC（Challenge Collapsar）是典型变种，针对动态接口（登录、搜索、报表）刷请求，消耗数据库连接和 CPU。

```
攻击者控制 1 万肉鸡
  -> 同时请求 /login (耗 CPU 验密码)
  -> 同时请求 /search?q=random (耗数据库)
  -> 同时请求 /report/generate (耗 CPU 生成报表)
服务器 CPU 100%，正常用户超时
```

特征：流量不大（可能就几百 Mbps），但请求都是真实业务接口，WAF 难以区分正常和恶意。

防御：

- 限流：令牌桶按 IP/用户/接口限速，超阈值返回 429。
- 行为校验：高频请求要求验证码、JS 计算挑战、浏览器指纹。
- 静态化：把动态页变静态缓存（CDN），攻击打不到源站。
- 业务降级：非核心接口直接 503，保住核心交易。

### Slowloris 慢速攻击

攻击者建立大量 HTTP 连接，每个连接慢速发请求头（一个字节一个字节发），占满 Web 服务器线程池（Tomcat/Apache 默认几百线程），正常用户无法连接。

```
攻击者 -> 服务器: POST / HTTP/1.1\r\nHost: x\r\n
(等几秒)
攻击者 -> 服务器: X-a: b\r\n
(等几秒)
攻击者 -> 服务器: X-b: c\r\n
... 一直不发 \r\n\r\n 结束请求头
服务器线程被占住，等超时（默认 60s）
```

防御：

- 调短 `ConnectionTimeout`、`ReadTimeout`。
- 限制单 IP 并发连接数。
- 用 Nginx 反向代理做缓冲，完整收完请求再转后端。

## 代码示例

### 应用层限流（Java + Redis 令牌桶）

```java
@Component
public class RateLimiter {
    @Resource
    private StringRedisTemplate redis;

    private static final int MAX_TOKENS = 100;       // 桶容量
    private static final double REFILL_RATE = 10.0;  // 每秒补充 10 个

    public boolean allow(String key) {
        String lua = """
            local k = KEYS[1]
            local now = tonumber(ARGV[1])
            local capacity = tonumber(ARGV[2])
            local rate = tonumber(ARGV[3])
            local bucket = redis.call('HMGET', k, 'tokens', 'ts')
            local tokens = tonumber(bucket[1]) or capacity
            local ts = tonumber(bucket[2]) or now
            tokens = math.min(capacity, tokens + (now - ts) * rate)
            if tokens < 1 then
                redis.call('HMSET', k, 'tokens', tokens, 'ts', now)
                redis.call('EXPIRE', k, 60)
                return 0
            end
            tokens = tokens - 1
            redis.call('HMSET', k, 'tokens', tokens, 'ts', now)
            redis.call('EXPIRE', k, 60)
            return 1
        """;
        Long r = redis.execute((RedisCallback<Long>) c ->
            (Long) c.eval(lua, 1, key,
                String.valueOf(System.currentTimeMillis() / 1000.0),
                String.valueOf(MAX_TOKENS), String.valueOf(REFILL_RATE)));
        return r != null && r == 1;
    }
}

// 拦截器
@Component
public class RateLimitInterceptor implements HandlerInterceptor {
    @Resource private RateLimiter limiter;
    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse resp, Object h) {
        String key = "rl:" + req.getRequestURI() + ":" + ClientIpUtil.get(req);
        if (!limiter.allow(key)) {
            resp.setStatus(429);
            return false;
        }
        return true;
    }
}
```

### Nginx 限流配置

```nginx
# 按 IP 限速，每秒 10 个请求，突发 20
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# 限制单 IP 并发连接数
limit_conn_zone $binary_remote_addr zone=conn:10m;

server {
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        limit_conn conn 10;
        proxy_pass http://backend;
    }
}

# 防 Slowloris：调短超时
client_body_timeout 5s;
client_header_timeout 5s;
keepalive_timeout 10s;
send_timeout 5s;
```

### Linux 内核 SYN 防护参数

```bash
# 开启 SYN Cookies（防 SYN Flood）
sysctl -w net.ipv4.tcp_syncookies=1

# 调大半连接队列
sysctl -w net.ipv4.tcp_max_syn_backlog=8192

# 减少 SYN+ACK 重试次数（默认 5 次）
sysctl -w net.ipv4.tcp_synack_retries=2

# 持久化到 /etc/sysctl.conf
```

## 实战场景

| 场景 | 攻击类型 | 防御手段 |
|------|----------|----------|
| 突发 Tbps 流量 | UDP Flood / 反射放大 | 云厂商高防 IP + BGP 清洗 |
| 业务接口被刷爆 | HTTP Flood / CC | 应用层令牌桶限流 + 验证码挑战 |
| TCP 连接占满 | SYN Flood | SYN Cookies + 调大 backlog |
| 大量慢连接 | Slowloris | Nginx 短超时 + 并发连接限制 |
| DNS 被查询洪水 | DNS Flood | DNS 厂商高防 + 本地缓存 |
| 游戏被 UDP 打 | UDP Flood | 入口限速 + UDP 反射过滤 |
| API 被 Key 滥用 | 应用层刷接口 | 按用户/Key 限流 + WAF 频率规则 |

## 深挖追问

**Q1：高防 IP 是怎么工作的？**

高防 IP 用 BGP Anycast 把攻击流量牵引到清洗中心。清洗中心用大带宽（T 级）兜底，通过特征过滤、行为分析、协议校验把恶意流量洗掉，干净流量回源到客户服务器。客户把域名解析改到高防 IP 即可，源站 IP 隐藏。关键是清洗中心的带宽要大于攻击流量，否则被压垮。

**Q2：CDN 能防 DDoS 吗？**

能，主要防流量型。CDN 节点分散在全球，攻击流量被打到最近的 CDN 节点，单点压力小。CDN 还会缓存静态内容，攻击打不到源站。但应用层 DDoS（刷动态接口）CDN 帮不上，因为请求必须回源。所以 CDN 是基础防护，应用层要叠加限流。

**Q3：SYN Cookies 为什么能防 SYN Flood？**

正常握手服务端要在半连接队列存连接状态，被刷满。SYN Cookies 把状态编码进 SYN+ACK 的初始 seq（seq = hash(sip, sport, dip, dport, secret) + 时间戳 + mss），服务端不存任何状态。客户端回 ACK 时，服务端用 ack-1 反算 hash 验证，合法才建立连接。半连接队列不再被占用，但代价是失去 TCP 选项协商（如窗口缩放），且增加 CPU 计算。

**Q4：限流用令牌桶还是漏桶？**

令牌桶允许突发（桶满时一次性消耗多个令牌），适合业务接口（用户偶尔连点几下不该被限）。漏桶匀速输出，适合下游保护（如调第三方 API 必须匀速）。分布式场景用 Redis + Lua 实现原子操作，避免竞态。

**Q5：被 DDoS 时第一反应是什么？**

1. 确认是哪层攻击（看监控：带宽打满是流量型，CPU 100% 是应用型）。
2. 流量型立即联系 ISP 或开启高防 IP 牵引。
3. 应用型立即启用限流（降阈值）、关闭非核心接口、开验证码挑战。
4. 临时扩容（弹性伸缩）顶住，但别无限扩，烧钱。
5. 收集攻击特征（IP 段、UA、请求模式）配 WAF 规则。
6. 事后复盘：补监控告警、调限流阈值、签高防服务。

## 易错点

- **靠加机器硬扛**：DDoS 是非对称攻击，攻击成本远低于防御成本，硬扛烧钱且没用。
- **黑名单挡 IP**：分布式攻击 IP 几万到几十万，黑名单挡不完且容易误伤。
- **只防流量型忽略应用层**：CC 攻击流量小但效果显著，必须应用层限流。
- **限流阈值设太高**：等于没设；设太低误伤正常用户。要根据压测数据动态调整。
- **限流只按 IP**：NAT 后大量用户共用一个 IP，按 IP 限流误伤；要叠加按用户/设备指纹。
- **`tcp_syncookies=0`**：默认应开启，关闭就是裸奔。
- **Memcached/MongoDB 暴露公网**：成为反射放大帮凶，必须只监听内网。
- **Nginx 没设超时**：被 Slowloris 攻击线程占满。
- **业务降级不到位**：被攻击时没预案，全站雪崩。

## 总结

DDoS 是用分布式流量耗尽目标资源的非对称攻击，分流量型、协议型、应用型三类。流量型靠高防 IP + CDN 兜底，应用型靠令牌桶限流 + 验证码挑战 + 业务降级，SYN Flood 靠 SYN Cookies。防御核心是“分层+纵深”：网络层清洗、CDN 分散、应用层限流、业务降级，单层防御顶不住大规模攻击。被攻击时第一反应是分类（流量型还是应用型），再针对性处置，不要硬扛或关服务。

## 参考资料

- [Cloudflare: What is a DDoS Attack](https://www.cloudflare.com/learning/ddos/what-is-a-ddos-attack/)
- [RFC 4987: TCP SYN Flooding Attacks and Common Mitigations](https://datatracker.ietf.org/doc/html/rfc4987)
- [Linux TCP SYN Cookies](https://github.com/torvalds/linux/blob/master/Documentation/networking/ip-sysctl.rst)
- [Nginx Rate Limiting](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)

---
