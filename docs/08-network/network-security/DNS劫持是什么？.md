# DNS 劫持是什么？

## 核心概念

DNS 劫持是攻击者或不可信网络篡改域名解析结果，让用户访问错误 IP 的攻击。DNS 协议本身设计时未考虑安全（明文、无认证），所以从本机 hosts 到运营商递归 DNS 的任何一环都可能被篡改。结果就是用户输入 `bank.com`，浏览器拿到的却是攻击者的 IP，访问到钓鱼站点。

DNS 劫持与 HTTP 劫持要区分：DNS 劫持改的是“域名→IP”的解析结果，HTTP 劫持是在请求/响应传输过程中插入或篡改内容（如运营商往 HTTP 页面插广告）。两者发生位置不同，防护方式也不同——DNS 劫持靠可信 DNS + DoH/DoT，HTTP 劫持靠 HTTPS。

DNS 劫持的常见入口：本机 hosts 文件被改、路由器 DNS 被改、运营商递归 DNS 被污染（GFW 的 DNS 污染即属此类）、公共 Wi-Fi 伪造 DNS、恶意软件修改系统 DNS 配置。HTTPS 能让浏览器通过证书校验发现域名不匹配，但前提是用户不忽略警告、设备未安装恶意根证书。

## 标准回答

一句话结论：**DNS 劫持是解析结果被篡改让用户访问错误 IP，发生在本机/路由器/递归 DNS 任一环节；防护靠可信 DNS、DoH/DoT 加密解析、HTTPS 证书校验、HSTS、多地解析监控；HTTPS 能让浏览器发现伪造，但用户忽略警告或装了恶意根证书仍会失守**。

要点展开：

- **劫持位置**：本机 hosts、路由器 DNS、ISP 递归 DNS、公共 Wi-Fi、恶意软件。
- **与 DNS 污染的区别**：劫持是“主动改解析”，污染是“伪造响应抢先到达”。
- **与 HTTP 劫持的区别**：劫持改 IP，HTTP 劫持改传输内容。
- **核心防护**：用 1.1.1.1/8.8.8.8 等可信 DNS、DoH/DoT 加密 DNS 查询、强制 HTTPS + HSTS、证书固定（谨慎用）。
- **服务端治理**：正确配置证书、监控多地解析结果、配置 DNSSEC。

## 实现原理

### DNS 解析链路与劫持点

```
浏览器输入 www.example.com
  |
  v
1. 本机 hosts 文件         <- 劫持点 1: 改 hosts
  |
  v
2. 本机 DNS 缓存
  |
  v
3. 系统配置的 DNS 服务器   <- 劫持点 2: 改路由器/系统 DNS
  | (通常是路由器)
  v
4. ISP 递归 DNS 服务器     <- 劫持点 3: ISP 篡改/污染
  |
  v
5. 根 -> 顶级域 -> 权威 DNS <- 劫持点 4: 权威 DNS 被攻陷
```

任何一环被篡改，浏览器拿到的就是错误 IP。

### DNS 污染（DNS Poisoning）

DNS 查询默认走 UDP 53 明文，无认证。攻击者监听查询请求后，抢在真实响应前发一个伪造的 DNS 响应包，浏览器收到先到的那一个就用，结果被指向攻击者 IP。

```
受害者 -> DNS 服务器: 查询 facebook.com
攻击者 (监听中) -- 伪造响应: facebook.com -> 6.6.6.6 --> 受害者  (先到)
DNS 服务器 -------- 真实响应: facebook.com -> 31.13.66.35 -> 受害者  (丢弃)
```

GFW 的 DNS 污染就是这种机制：监听出境 DNS 查询，对敏感域名抢先返回伪造响应。

### DoH/DoT 防护原理

DoH（DNS over HTTPS）走 HTTPS 443 端口，DoT（DNS over TLS）走 TLS 853 端口。DNS 查询被加密，中间设备看不到查询的域名也无法伪造响应。

```
浏览器 -> DoH 服务器 (https://dns.example.com/dns-query):
  POST application/dns-message
  <加密的 DNS 查询>
服务器 -> 浏览器:
  <加密的 DNS 响应>

中间攻击者: 看不到查询内容，也无法伪造（TLS 校验）
```

### HTTPS + HSTS 的兜底作用

即使 DNS 被劫持到攻击者 IP，攻击者通常没有 `bank.com` 的合法证书。浏览器 TLS 握手时校验证书域名不匹配，会阻止访问。

```
浏览器 -> 6.6.6.6 (攻击者伪造的 IP): TLS 握手
攻击者 -> 浏览器: 自签证书 CN=evil.com
浏览器: 证书域名 != bank.com，警告并阻止
```

但有两种情况会失守：

1. **用户忽略证书警告**：点击“继续访问”就中招。
2. **设备被安装恶意根证书**：攻击者用自签 CA 给 `bank.com` 签证书，浏览器信任了根 CA 就不会警告。这是企业内网常用的合法拦截方式，也是恶意软件的攻击手法。

HSTS（HTTP Strict Transport Security）让浏览器强制走 HTTPS 且不允许忽略证书错误，进一步兜底：

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### DNSSEC

DNSSEC 用数字签名给 DNS 响应加认证，递归服务器能验证响应是否被篡改。它解决的是“响应真伪”问题，不解决“查询隐私”（仍明文）。DNSSEC 部署复杂，普及率不高，但银行、政府等高安全场景会用。

## 代码示例

### 命令行排查 DNS 劫持

```bash
# 用不同 DNS 服务器查询，对比结果
nslookup example.com 8.8.8.8        # Google DNS
nslookup example.com 1.1.1.1        # Cloudflare DNS
nslookup example.com 223.5.5.5      # 阿里 DNS

# dig 显示更详细信息
dig example.com @8.8.8.8
dig example.com @1.1.1.1 +short

# 检查本机 hosts 是否被改
cat /etc/hosts                       # Linux/macOS
type C:\Windows\System32\drivers\etc\hosts  # Windows

# 查询 DNSSEC 验证状态
dig example.com +dnssec
```

如果同一域名在不同 DNS 解析到不同 IP，且其中一个 IP 异常，基本可判断存在劫持。

### 服务端配置 HSTS（Nginx）

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/ssl/example.com.crt;
    ssl_certificate_key /etc/ssl/example.com.key;

    # 强制 HTTPS，禁止忽略证书警告
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # HTTP 跳转 HTTPS
    if ($scheme = http) {
        return 301 https://$host$request_uri;
    }
}
```

### 客户端配置 DoH（Java 11+ HttpClient）

```java
import java.net.http.*;
import java.net.URI;

public class DohClient {
    public static void main(String[] args) throws Exception {
        // 通过 DoH 代理服务器解析（实际需系统级 DoH 配置）
        HttpClient client = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_2)
            .build();

        HttpRequest req = HttpRequest.newBuilder()
            .uri(URI.create("https://dns.google/resolve?name=example.com&type=A"))
            .header("Accept", "application/dns-json")
            .GET()
            .build();

        HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
        System.out.println(resp.body());
        // {"Status":0,"Answer":[{"name":"example.com.","type":1,"TTL":300,"data":"93.184.216.34"}]}
    }
}
```

### 多地 DNS 解析监控脚本（Python）

```python
import dns.resolver
import requests

DOMAIN = "example.com"
EXPECTED_IPS = {"93.184.216.34"}
DNS_SERVERS = ["8.8.8.8", "1.1.1.1", "223.5.5.5", "9.9.9.9"]

def check():
    for server in DNS_SERVERS:
        resolver = dns.resolver.Resolver()
        resolver.nameservers = [server]
        try:
            answers = resolver.resolve(DOMAIN, "A")
            ips = {r.address for r in answers}
            if not ips & EXPECTED_IPS:
                alert(f"DNS anomaly on {server}: got {ips}")
        except Exception as e:
            alert(f"DNS query failed on {server}: {e}")

def alert(msg):
    requests.post("https://hooks.slack.com/services/xxx",
                  json={"text": f"[DNS Monitor] {msg}"})

if __name__ == "__main__":
    check()
```

## 实战场景

| 场景 | 劫持点 | 防御 |
|------|--------|------|
| 用户连公共 Wi-Fi 被劫持 | 路由器/递归 DNS | 用 DoH/DoT + HTTPS + HSTS |
| 运营商插广告 | ISP 递归 DNS | 改用可信 DNS + HTTPS |
| 路由器被改 DNS | 路由器配置 | 改路由器密码 + 静态 DNS |
| 手机 App 被劫持 | 系统 DNS | App 内置 IP 直连 + 证书固定 |
| 企业内网合法拦截 | 内网 CA + DNS | 用户已知，内网专用 |
| 域名被注册商劫持 | 权威 DNS | 启用注册商锁 + DNSSEC |
| 邮件服务器被劫持 | MX 记录改向 | SPF + DKIM + DMARC |

## 深挖追问

**Q1：HTTPS 能完全防 DNS 劫持吗？**

不能完全防“解析被改”，但能防“用户被钓鱼”。即使 DNS 被劫持到攻击者 IP，攻击者没有目标域名的合法证书，浏览器会阻止。例外：用户手动忽略证书警告、设备被装恶意根证书、攻击者通过 CA 误发证书（CT 日志监控可发现）。

**Q2：DoH 和 DoT 哪个更好？**

DoH 走 443 端口，与正常 HTTPS 流量混在一起，难以被网络层识别和封锁，适合对抗审查场景。DoT 走 853 专用端口，易被防火墙屏蔽，但运维更清晰。企业内部管理推荐 DoT，对抗外部劫持推荐 DoH。

**Q3：证书固定（Certificate Pinning）该用吗？**

谨慎用。证书固定是把特定证书指纹写死在客户端，不信任系统 CA。安全性高，但证书轮换时如果客户端没及时更新会被锁死（曾导致 Telsat、陌陌等 App 大规模不可用）。建议只在金融、政务等高安全 App 用，且要有备用 Pin 和应急更新通道。

**Q4：DNSSEC 和 DoH 是替代关系吗？**

不是。DNSSEC 解决“响应真伪”（防篡改），DoH 解决“查询隐私”（防窃听和中间人）。两者正交，可以叠加：DoH 加密传输 + DNSSEC 签名验证 = 既隐私又可信。

**Q5：怎么排查 DNS 劫持？**

按链路逐层查：

1. `cat /etc/hosts` 看本机有没有异常条目。
2. `nslookup domain 8.8.8.8` 与 `nslookup domain 223.5.5.5` 对比，看是否一致。
3. 检查路由器 DNS 配置是否被改。
4. 换网络（4G vs Wi-Fi）对比解析结果。
5. `dig domain +dnssec` 看是否有 RRSIG 记录。
6. 浏览器访问看证书域名是否匹配。

## 易错点

- **混淆 DNS 劫持和 HTTP 劫持**：前者改 IP，后者改内容。
- **混淆 DNS 劫持和 DNS 污染**：劫持是主动改，污染是伪造响应抢先。
- **以为 HTTPS 完全防 DNS 劫持**：能发现伪造，但用户忽略警告或装恶意 CA 仍失守。
- **以为换公共 DNS 就绝对安全**：到递归 DNS 之间的链路仍可能被污染，要叠加 DoH/DoT。
- **企业内网“合法劫持”当成攻击**：内网 CA + DNS 分流是常见合规做法，要先确认场景。
- **HSTS preload 误用**：一旦预加载到浏览器列表，撤销极慢，确认域名长期 HTTPS 再提交。
- **证书固定不预留应急 Pin**：证书轮换失败导致 App 锁死。
- **不监控多地解析**：DNS 劫持可能只影响部分区域，不监控发现不了。

## 总结

DNS 劫持是解析链路任一环节被篡改导致用户访问错误 IP，与 HTTP 劫持（改内容）和 DNS 污染（伪造响应）要区分。防护靠“可信 DNS + DoH/DoT 加密 + HTTPS 证书校验 + HSTS”多层叠加，单层防御都有漏洞。HTTPS 是兜底——即使 DNS 被改，攻击者没有合法证书就无法伪装。生产实践：服务端配置 HSTS、客户端用 DoH、监控多地解析、谨慎用证书固定。

## 参考资料

- [RFC 8484: DNS Queries over HTTPS (DoH)](https://datatracker.ietf.org/doc/html/rfc8484)
- [RFC 7858: Specification for DNS over TLS](https://datatracker.ietf.org/doc/html/rfc7858)
- [RFC 6797: HTTP Strict Transport Security (HSTS)](https://datatracker.ietf.org/doc/html/rfc6797)
- [RFC 4033: DNS Security Introduction and Requirements](https://datatracker.ietf.org/doc/html/rfc4033)

---
