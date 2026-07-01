# ARP 协议作用是什么

## 核心概念

ARP（Address Resolution Protocol，地址解析协议，RFC 826）解决一个非常具体的问题：**已知下一跳的 IPv4 地址，求它在局域网内的 MAC 地址**。网络层 IP 包要交给链路层封装成以太网帧，而以太网帧头需要的是 MAC 地址，不是 IP 地址。这两套地址体系必须有一个映射机制把它们对接起来，这就是 ARP。

ARP 只在**同一个二层广播域**内有效。跨网段时，源主机用 ARP 解析的是"默认网关"的 MAC，而不是目标主机的 MAC——后续每一跳路由器都会再用 ARP 找下一跳。理解这一点就能解释很多诡异现象，比如"为什么换网关后老 ARP 缓存还在用导致网络不通"。

IPv6 不再使用 ARP，而是用 NDP（Neighbor Discovery Protocol，RFC 4861）替代，通过 ICMPv6 报文完成同样的功能。

## 标准回答

ARP 通过"广播请求 + 单播响应"在局域网内完成 IP 到 MAC 的解析。主机 A 想给同网段主机 B 发包但不知道 B 的 MAC 时，先广播一个 ARP 请求（"谁是 192.168.1.100？告诉我"），B 收到后单播回复一个 ARP 响应（"192.168.1.100 的 MAC 是 aa:bb:cc:dd:ee:ff"）。结果会被双方都缓存进 ARP 表，默认保留数分钟，避免重复广播。

要点：

- ARP 请求是**链路层广播**（目的 MAC `ff:ff:ff:ff:ff:ff`），ARP 响应是**链路层单播**。
- ARP 表条目有生存时间（Linux 默认 60 秒 reachable + GC 阶段，可配置），超时后清除。
- 跨网段通信时 ARP 解析的是网关的 MAC，不是目标主机 MAC。
- ARP 是无认证协议，局域网内任何主机都可以伪造 ARP 响应，这就是 ARP 欺骗的根源。
- IPv6 用 NDP 取代 ARP，且强制使用 IPsec 加密，安全性更高。

## 实现原理

### ARP 报文结构

ARP 报文直接封装在以太网帧中（EtherType = `0x0806`），**不经过 IP 层**：

```
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| 硬件类型 (Hardware Type) = 1 (Ethernet)                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| 协议类型 (Protocol Type) = 0x0800 (IPv4)                      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| 硬件地址长度 | 协议地址长度 |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| 操作 (Operation) = 1 请求 / 2 响应                            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| 发送方硬件地址 (Sender MAC, 6 字节)                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| 发送方协议地址 (Sender IP, 4 字节)                            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| 目标硬件地址 (Target MAC, 6 字节，请求时为 0)                 |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| 目标协议地址 (Target IP, 4 字节)                              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

ARP 报文长度固定 28 字节，加上以太网帧头 14 字节共 42 字节，不足以太网最小帧 64 字节时尾部补 0。

### 工作流程

同网段通信（A 给 B 发数据，A=192.168.1.10，B=192.168.1.100）：

1. A 查路由表，发现 192.168.1.100 与自己在同网段，下一跳就是 B 本身。
2. A 查 ARP 缓存，无 192.168.1.100 条目。
3. A 构造 ARP 请求：发送方 MAC=A 的 MAC，发送方 IP=192.168.1.10，目标 IP=192.168.1.100，目标 MAC=00:00:00:00:00:00；以太网帧目的 MAC=`ff:ff:ff:ff:ff:ff` 广播。
4. 同网段所有主机收到广播并拆开 ARP 报文；B 发现目标 IP 是自己，于是更新自己的 ARP 缓存（学到了 A 的 MAC），再单播回复 ARP 响应：操作码=2，发送方 MAC=B 的 MAC，发送方 IP=192.168.1.100，目标 MAC/IP=A 的。
5. A 收到响应，把 192.168.1.100 → B 的 MAC 写入 ARP 缓存，开始正常发包。

跨网段通信（A=192.168.1.10 访问 8.8.8.8，网关 192.168.1.1）：

1. A 查路由表，发现 8.8.8.8 不在同网段，下一跳是默认网关 192.168.1.1。
2. A 通过 ARP 解析 192.168.1.1 的 MAC（不是 8.8.8.8 的）。
3. A 把 IP 包目的 IP 写 8.8.8.8，但以太网帧目的 MAC 写网关的 MAC。
4. 网关收到帧，拆掉以太网头，看 IP 包目的地址 8.8.8.8，查路由表，再用 ARP 找下一跳路由器的 MAC，重新封装转发。
5. 每一跳路由器重复"查路由表 → ARP 解下一跳 MAC → 重新封装"的过程。

### 免费 ARP

主机启动或 IP 变更时，会主动广播一个"发送方 IP = 目标 IP = 自己 IP"的 ARP 请求，称为免费 ARP（Gratuitous ARP）。作用：

- 检测 IP 冲突：如果有人回复，说明同网段有人用了相同 IP。
- 通知邻居更新 ARP 缓存：在网卡更换、集群 VIP 漂移（如 Keepalived 主备切换）时让交换机和其他主机快速学到新 MAC。

### RARP（逆地址解析协议）

RARP 已基本淘汰（RFC 903），用于无盘工作站启动时已知 MAC 求 IP。现代网络用 DHCP 替代，DHCP 不仅分配 IP 还下发网关、DNS 等完整配置。

## 代码示例

Linux 下查看和管理 ARP 缓存：

```bash
# 查看当前 ARP 缓存表
ip neigh show
# 等价老命令
arp -n

# 手动添加一条静态 ARP 条目（防止 ARP 欺骗、固定网关 MAC）
ip neigh add 192.168.1.1 lladdr aa:bb:cc:dd:ee:ff dev eth0 nud permanent

# 删除一条 ARP 缓存
ip neigh del 192.168.1.100 dev eth0

# 抓取 ARP 报文
tcpdump -i eth0 -nn arp

# 抓 ARP 并展开字段
tcpdump -i eth0 -nn -e arp
```

Java 中检测同网段主机是否在线（利用 ARP 解析结果判断）：

```java
import java.net.*;

public class ArpProbe {
    public static void main(String[] args) throws Exception {
        // Java 标准库不直接暴露 ARP，但可通过 NetworkInterface 获取本机 MAC 与接口信息
        NetworkInterface nif = NetworkInterface.getByName("eth0");
        if (nif != null && nif.getHardwareAddress() != null) {
            byte[] mac = nif.getHardwareAddress();
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < mac.length; i++) {
                sb.append(String.format("%02X%s", mac[i], (i < mac.length - 1) ? ":" : ""));
            }
            System.out.println("本机 MAC: " + sb);
        }

        // 通过 InetAddress.isReachable 触发底层 ARP（同网段）或 ICMP（跨网段）
        InetAddress target = InetAddress.getByName("192.168.1.100");
        boolean reachable = target.isReachable(1000);
        System.out.println(target + " reachable=" + reachable);
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| VIP 漂移后业务不通 | Keepalived 主备切换后免费 ARP 通知交换机更新 MAC 表 | 某些老旧交换机 MAC 表老化慢，需手动 `ip neigh flush` 或重启交换机端口 |
| ARP 欺骗防御 | 网关 MAC 绑定静态 ARP、启用 DHCP Snooping + Dynamic ARP Inspection | 静态 ARP 在主机重启后失效，需写入启动脚本 |
| 容器跨主机不通 | 检查 veth pair、bridge 的 ARP 表与 MAC 学习 | Flannel/VXLAN 模式下 ARP 在宿主机 bridge 上学，容器内部 MAC 是虚拟的 |
| IP 冲突排查 | 抓包看是否有重复 ARP 响应；用 `arping -D` 检测 | `arping -D` 返回非 0 表示冲突 |
| 老旧设备接入网络 | 配置静态 ARP 或开启端口安全 | 工控设备、打印机常不响应 ARP，需手动绑定 |

## 深挖追问

- **ARP 请求是广播，ARP 响应为什么是单播？**
  广播响应会让同网段所有主机都被迫处理无用报文，浪费带宽和 CPU。请求方已经把自己的 MAC/IP 放在请求里，被请求方直接单播回复即可。

- **ARP 缓存为什么不能永久保留？**
  网卡更换、IP 重新分配、设备迁移都会让旧的 IP→MAC 映射失效。永久保留会导致主机一直给错误 MAC 发包，永远无法恢复。Linux 默认 reachable 状态 60 秒，之后进入 stale 再 GC 清除。

- **ARP 欺骗如何防御？**
  局域网内可启用交换机 DHCP Snooping + Dynamic ARP Inspection（DAI）；主机侧配置静态 ARP 绑定网关；更彻底的方案是改用 802.1X 端口认证或迁移到 IPv6（NDP 强制加密）。

- **跨网段通信时 ARP 请求里的目标 IP 写什么？**
  写下一跳路由器的 IP，不是最终目的主机的 IP。因为以太网帧只能在同网段内传递，跨网段必须由路由器中转。

- **IPv6 为什么不用 ARP？**
  ARP 设计上无认证、易欺骗，且广播帧打扰全网段。IPv6 用 NDP（基于 ICMPv6）替代，使用组播（solicited-node multicast）而非广播，只打扰相关主机；同时 IPSec 强制支持，安全性更好。

## 易错点

- **以为 ARP 是 IP 层协议**：ARP 直接封装在以太网帧里（EtherType 0x0806），不走 IP；但功能上属于 L3，因为它操作 IP 地址。
- **以为跨网段时 ARP 解析的是目标主机 MAC**：实际解析的是网关 MAC，目标 IP 仍写在 IP 头里。
- **以为 ARP 缓存是永久的**：Linux 默认 60 秒 reachable，超时后进入 stale 状态，再被 GC 清除。
- **以为 ARP 欺骗只能骗网关**：任何主机都可伪造 ARP 响应，可同时欺骗网关和其他主机。
- **以为 IPv6 也用 ARP**：IPv6 用 NDP（Neighbor Discovery Protocol），通过 ICMPv6 类型 133-137 报文完成地址解析。

## 总结

ARP 是网络层与链路层的"翻译官"，把 IP 地址翻译成 MAC 地址让以太网帧能正确送达。它只在同网段内有效，跨网段时解析的是网关 MAC。无认证、易欺骗是它的根本缺陷，IPv6 用 NDP 替代并引入加密。线上排障遇到"IP 通但 MAC 不对"、"VIP 漂移后不通"、"ARP 缓存陈旧"等问题，第一步永远是 `ip neigh show` 看缓存、`tcpdump arp` 抓报文。

## 参考资料

- [RFC 826 - An Ethernet Address Resolution Protocol](https://www.rfc-editor.org/rfc/rfc826)
- [RFC 5227 - IPv4 Address Conflict Detection](https://www.rfc-editor.org/rfc/rfc5227)
- [RFC 4861 - Neighbor Discovery for IP version 6 (IPv6)](https://www.rfc-editor.org/rfc/rfc4861)
- [Linux ip-neigh man page](https://man7.org/linux/man-pages/man8/ip-neigh.8.html)
- [TCP/IP Illustrated, Volume 1, ARP chapter](https://www.oreilly.com/library/view/tcpip-illustrated-volume/9780132806208/)

---
