# NAT 网络地址转换是什么

## 核心概念

NAT（Network Address Translation，网络地址转换，RFC 3022）解决 IPv4 地址不够用的问题。它的核心思想是：内网主机使用私有 IP（RFC 1918），出口路由器把私有 IP 转换成公网 IP 上网，多个内网主机复用一个或少量公网 IP。家里那台"路由器"实际上就是 NAT 网关——你家里的手机、电脑都用的 192.168.x.x，对外却共享一个公网 IP。

NAT 之所以有效，是因为绝大多数应用是"内网主动发起、外网响应"模式（出站连接），NAT 表只在出站时建立，外网回包按表项反向转换即可。这种"按需建立映射"让一个公网 IP 可以同时承载几万条内网连接（通过端口号区分）。

NAT 不是没有代价：它破坏了 IP 端到端语义、增加了转发延迟、使外部无法主动连入内网、对协议透明性有影响（如 FTP、SIP 等带 IP 地址的协议需要 ALG 辅助）。所以 NAT 是 IPv4 时代的"续命药"，IPv6 设计上不需要 NAT。

## 标准回答

NAT 是网络地址转换机制，让内网私有 IP 通过出口网关转换为公网 IP 上网，缓解 IPv4 地址耗尽。最常用的是 NAPT（Network Address and Port Translation），把"源 IP + 源端口"一起转换，让多个内网主机共享一个公网 IP。NAT 在出站时建立映射表，外网回包按表项反向转换。NAT 网关重启会丢失映射导致 TCP 连接重置，外部无法主动连入 NAT 后主机（这就是 NAT 穿透要解决的问题）。

要点：

- NAT 分为 SNAT（源地址转换，出站）、DNAT（目的地址转换，入站）、PNAT/NAPT（端口转换，最常用）。
- NAPT 通过"公网 IP + 端口"区分不同内网连接，一个公网 IP 可承载约 6 万条出站连接。
- NAT 表在连接建立时生成，连接结束（FIN/RST）后清除，超时也会清除。
- 外网无法主动连入 NAT 后主机，需要 UPnP、STUN、TURN 等穿透技术或端口映射。
- IPv6 地址充足，原则上不需要 NAT，但企业出于安全/审计仍可能部署 NPTv6。

## 实现原理

### NAT 类型

| 类型 | 转换内容 | 典型场景 |
|------|---------|---------|
| SNAT（Source NAT） | 源 IP 转换 | 内网访问公网，家用路由器、企业出口 |
| DNAT（Destination NAT） | 目的 IP 转换 | 公网访问内网服务（端口映射） |
| NAPT/PAT | 源 IP + 源端口转换 | 多内网主机共享一个公网 IP，最常用 |
| 双向 NAT | 同时转换源和目的 | 跨地址域互联 |
| NPTv6 | IPv6 前缀翻译（无端口） | IPv6 内网与公网前缀翻译，不做端口转换 |

### NAPT 工作流程

内网主机 A（192.168.1.100:5000）访问 8.8.8.8:53，NAT 网关公网 IP 为 203.0.113.5：

```
1. A 发出包: 源 192.168.1.100:5000 → 目的 8.8.8.8:53
2. NAT 网关收到，分配公网端口 38000，建立映射表:
   内网 192.168.1.100:5000  ↔  公网 203.0.113.5:38000
3. NAT 改写源地址后转发: 源 203.0.113.5:38000 → 目的 8.8.8.8:53
4. 8.8.8.8 回包: 源 8.8.8.8:53 → 目的 203.0.113.5:38000
5. NAT 查表反查 203.0.113.5:38000 → 192.168.1.100:5000
6. NAT 改写目的地址后转发给 A: 源 8.8.8.8:53 → 目的 192.168.1.100:5000
```

NAT 表样例：

| 协议 | 内网源 IP:端口 | 公网源 IP:端口 | 外部目的 IP:端口 | 超时 |
|------|---------------|---------------|-----------------|------|
| TCP  | 192.168.1.100:5000 | 203.0.113.5:38000 | 8.8.8.8:53 | 86400s |
| TCP  | 192.168.1.101:5000 | 203.0.113.5:38001 | 93.184.216.34:443 | 86400s |
| UDP  | 192.168.1.100:53000 | 203.0.113.5:38002 | 1.1.1.1:53 | 30s |

### NAT 表的生命周期

- **TCP**：SYN 包触发建立，FIN/RST 触发清除；空闲超时通常 86400 秒（Linux `nf_conntrack_tcp_timeout_established`）。
- **UDP**：发包即建立，空闲超时通常 30 秒（Linux `nf_conntrack_udp_timeout`）。
- **ICMP**：根据 ICMP id 区分流，超时通常 30 秒。

NAT 网关重启或表项过期都会导致已建立的连接断开，这是 NAT 网关故障时业务中断的根本原因。

### NAT 穿透（NAT Traversal）

外部主动连入 NAT 后主机是 NAT 最大的痛点。常见穿透方案：

- **静态端口映射（Port Forwarding）**：在 NAT 网关上配置"公网端口 X → 内网主机 Y:端口 Z"的固定映射。简单可靠但需手动配置，且每端口只能映射到一台内网主机。
- **UPnP IGD**：应用通过 UPnP 协议让 NAT 网关动态建立端口映射。家用路由器常支持，企业网关通常禁用（安全风险）。
- **STUN（Session Traversal Utilities for NAT）**：客户端通过 STUN 服务器发现自己出口的公网 IP 与端口，把此地址告诉对端，让对端直接连入。适用于 Cone NAT（不严格）。
- **TURN（Traversal Using Relays around NAT）**：当 NAT 类型太严格（Symmetric NAT）无法穿透时，通过中继服务器转发流量。开销大但兜底可靠。
- **ICE（Interactive Connectivity Establishment）**：综合 STUN + TURN + 直连尝试，按优先级选择最优路径。WebRTC 标配。

### NAT 类型（影响穿透难度）

RFC 3489 把 NAT 行为分为四类，从易到难：

| 类型 | 行为 | 穿透难度 |
|------|------|---------|
| Full Cone（完全锥形） | 同一内网 IP:端口映射到同一公网 IP:端口，任何外部主机都可通过该公网 IP:端口连入 | 最易 |
| Restricted Cone（限制锥形） | 同上，但只允许内网先发过包的外部 IP 连入 | 较易 |
| Port Restricted Cone | 同上，且只允许内网先发过包的外部 IP:端口连入 | 中等 |
| Symmetric NAT（对称型） | 同一内网 IP:端口对不同外部目的映射到不同公网端口 | 极难，常需 TURN |

家用路由器多为 Cone NAT（穿透友好），企业 NAT 设备多为 Symmetric NAT（穿透困难）。

## 代码示例

Linux 下用 iptables 配置 NAT：

```bash
# 查看当前 NAT 规则
iptables -t nat -L -n -v

# SNAT: 内网 192.168.1.0/24 出口经 eth0 公网 IP 上网
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE
# 或固定公网 IP
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j SNAT --to-source 203.0.113.5

# DNAT: 公网 443 端口映射到内网 192.168.1.100:443
iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 443 -j DNAT --to-destination 192.168.1.100:443
iptables -A FORWARD -p tcp -d 192.168.1.100 --dport 443 -j ACCEPT

# 查看 NAT 连接跟踪表
cat /proc/net/nf_conntrack | head

# 调整 NAT 表大小
sysctl net.netfilter.nf_conntrack_max          # 默认 65536，高并发需调大
sysctl net.netfilter.nf_conntrack_tcp_timeout_established   # TCP 超时
sysctl net.netfilter.nf_conntrack_udp_timeout               # UDP 超时

# 抓取 NAT 转换前后包对比
tcpdump -i eth0 -nn 'host 203.0.113.5 and port 443'
tcpdump -i eth1 -nn 'host 192.168.1.100 and port 443'
```

Java 中检测自身公网 IP（STUN 简化版）：

```java
import java.net.*;
import java.io.*;

public class PublicIpDetector {
    public static void main(String[] args) throws Exception {
        // 通过外部 HTTP 服务获取 NAT 后的公网 IP
        URL url = new URL("https://api.ipify.org");
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(url.openStream()))) {
            String publicIp = reader.readLine();
            System.out.println("公网 IP: " + publicIp);
        }

        // 本机内网 IP
        InetAddress local = InetAddress.getLocalHost();
        System.out.println("本机 IP: " + local.getHostAddress());
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 家庭/办公出口 | MASQUERADE 让内网共享公网 IP 上网 | 高并发需调大 conntrack 表 |
| 公网入站服务 | DNAT 端口映射把 443 转发到内网服务器 | 安全组与 iptables FORWARD 都要放行 |
| 容器/K8s | kube-proxy 用 iptables/IPVS 做 NAT，Service ClusterIP → Pod IP | 大规模集群 conntrack 表会爆，IPVS 模式缓解 |
| 高并发网关 | 调大 `nf_conntrack_max`、缩短超时、用 IPVS 替代 iptables | conntrack 表满导致丢包，监控 `nf_conntrack_count` |
| 跨地域互联 | 多机房用 IPSEC VPN + NAT 穿越 | NAT-T（UDP 4500）封装 ESP 解决 ESP 穿越 NAT 问题 |
| 移动端推流 | STUN/TURN 协助 P2P 穿透 NAT | Symmetric NAT 必须 TURN 中继，成本高 |

## 深挖追问

- **为什么一个公网 IP 能承载几万条内网连接？**
  NAPT 用"公网 IP + 端口"区分不同内网连接。端口 16 位，理论上有 65535 个端口可用，扣除 0-1023 系统端口，约 6.4 万端口可用。每个端口对应一条内网连接，所以一个公网 IP 理论上可承载约 6.4 万条出站连接。实际 Linux 默认端口范围 `net.ipv4.ip_local_port_range = 32768-60999`，约 2.8 万端口。

- **NAT 网关重启为什么会导致 TCP 连接断开？**
  NAT 表是内存状态，重启后丢失。即使内网主机和外部服务器 TCP 连接还活着，回包到达 NAT 时找不到表项会被丢弃，TCP 收不到 ACK 后重传失败最终 RST。这就是为什么 NAT 网关主备切换会断业务。

- **FTP 主动模式为什么在 NAT 后面会有问题？**
  FTP 主动模式下客户端在 PORT 命令里把自己的 IP:端口告诉服务器，服务器主动连入。但客户端报的是私有 IP，服务器无法路由；且 NAT 默认不让外部主动连入。解决方案是 FTP ALG（应用层网关）改写 PORT 命令中的 IP 与端口，并动态建立 DNAT。被动模式（PASV）更友好。

- **IPv6 还需要 NAT 吗？**
  IPv6 地址充足，原则上不需要 NAT。但企业出于安全/审计习惯仍会部署 NPTv6（Network Prefix Translation，RFC 6296），只翻译前缀不翻译端口，保留端到端可达性。家用路由器 IPv6 一般做 Prefix Delegation 而非 NAT。

- **Symmetric NAT 为什么难以穿透？**
  Symmetric NAT 对同一内网 IP:端口，根据不同外部目的分配不同公网端口。STUN 探测出的公网端口只对 STUN 服务器有效，对端用此端口连入时 NAT 会分配新端口，连不进来。需要 TURN 中继兜底。

## 易错点

- **以为 NAT 只是改 IP**：NAPT 同时改 IP 和端口，端口号才是复用公网 IP 的关键。
- **以为 NAT 表是永久的**：TCP 有超时（默认 86400s），UDP 更短（默认 30s），空闲连接会被清除。
- **以为 DNAT 配置就够了**：DNAT 后还需 FORWARD 链放行，否则包被默认策略丢弃。
- **以为 NAT 不影响应用层**：FTP、SIP、P2P 等带 IP/端口的协议需 ALG 辅助，否则穿透失败。
- **以为 conntrack 表无限大**：默认 65536，高并发场景会被打满导致丢包，需调大并监控。

## 总结

NAT 是 IPv4 时代的"地址续命药"，通过 NAPT 让多个内网主机共享一个公网 IP 上网。它解决了地址耗尽问题，但破坏了 IP 端到端语义、使外部无法主动连入。NAT 表是内存状态，重启或表满都会导致业务断开。生产中要关注 conntrack 表大小、NAT 超时配置、ALG 兼容性；高并发网关建议用 IPVS 替代 iptables。IPv6 设计上不需要 NAT，过渡期与 NPTv6/NAT64 共存。掌握 NAT 的关键在于理解"出站建表、入站查表、表项生命周期"这套机制，以及 Cone 与 Symmetric NAT 的穿透差异。

## 参考资料

- [RFC 3022 - Traditional IP Network Address Translator (Traditional NAT)](https://www.rfc-editor.org/rfc/rfc3022)
- [RFC 3489 - STUN - Simple Traversal of UDP Through NAT](https://www.rfc-editor.org/rfc/rfc3489)
- [RFC 5389 - Session Traversal Utilities for NAT (STUN)](https://www.rfc-editor.org/rfc/rfc5389)
- [RFC 8489 - STUN Usage for ICE](https://www.rfc-editor.org/rfc/rfc8489)
- [RFC 6296 - IPv6-to-IPv6 Network Prefix Translation (NPTv6)](https://www.rfc-editor.org/rfc/rfc6296)
- [Linux conntrack documentation](https://www.kernel.org/doc/html/latest/networking/nf_conntrack-sysctl.html)

---
