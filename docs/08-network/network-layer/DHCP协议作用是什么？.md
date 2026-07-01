# DHCP 协议作用是什么

## 核心概念

DHCP（Dynamic Host Configuration Protocol，动态主机配置协议，RFC 2131）解决"主机接入网络后如何自动获取 IP 配置"的问题。它给主机分配的不只是 IP 地址，还包括子网掩码、默认网关、DNS 服务器、租期等一整套上网所需的参数。没有 DHCP，每台机器都要手工配 IP，运维成本不可想象；有了 DHCP，开机就能上网，这就是它成为局域网"事实标准"的原因。

DHCP 基于 UDP，服务器监听 67 端口，客户端监听 68 端口。它走的是经典的四步交互：DISCOVER → OFFER → REQUEST → ACK，俗称 DORA。整个交互过程中客户端还没有 IP，所以全程使用 `0.0.0.0` 作为源 IP、`255.255.255.255` 作为目的 IP 的广播通信。

DHCP 有租期机制：分配的 IP 不是永久的，租期到了要续约，否则会被收回。租期机制让 IP 可以回收复用，是 DHCP 与静态 IP 配置最本质的区别。

## 标准回答

DHCP 通过 DORA 四步交互让主机自动获取 IP 配置：客户端广播 DISCOVER 寻找服务器 → 服务器单播/广播回应 OFFER 提供 IP 参数 → 客户端广播 REQUEST 确认选择某一台服务器 → 服务器回 ACK 完成分配。之后客户端在租期内使用该 IP，到租期一半时单播 REQUEST 续约，租期 87.5% 时广播 REQUEST 再续一次，租期到期仍未续成功则放弃 IP。

要点：

- 客户端用 68 端口、服务器用 67 端口；交互基于 UDP，全程广播（除 ACK 可单播外）。
- 租期机制让 IP 可回收，租期内续约通过单播 REQUEST，无需重新走完整 DORA。
- 跨网段时路由器不转发广播，需要配置 DHCP Relay（中继代理）把广播包单播转发到服务器。
- DHCP 是无认证协议，私接 DHCP 服务器可导致整个网段主机拿到错误配置上不了网。
- DHCP 仅用于 IPv4；IPv6 用 DHCPv6（RFC 8415）和 SLAAC（无状态地址自动配置）两种方式。

## 实现原理

### DHCP 报文结构

DHCP 报文封装在 UDP 中（端口 67/68），UDP 又封装在 IP 中。报文结构继承自 BOOTP：

```
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| op (1=请求, 2=响应) | htype (1=Ethernet) | hlen (6) | hops (0) |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| xid (事务 ID，请求/响应配对用)                                |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| secs (客户端启动秒数)        | flags (0x8000=广播)            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| ciaddr (客户端 IP，DISCOVER 时为 0)                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| yiaddr (你的 IP，服务器分配给客户端的 IP)                     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| siaddr (下一跳服务器 IP，通常是 DHCP 服务器)                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| giaddr (中继代理 IP，跨网段时填)                              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| chaddr (客户端 MAC, 16 字节)                                 |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| sname (服务器主机名, 64 字节)                                |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| file (启动文件名, 128 字节)                                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| options (DHCP 选项，可变长度，最小 312 字节)                  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

关键 Options：

- Option 53：DHCP Message Type（1=DISCOVER, 2=OFFER, 3=REQUEST, 5=ACK, 6=NAK, 7=RELEASE, 8=INFORM）。
- Option 1：子网掩码。
- Option 3：默认网关。
- Option 6：DNS 服务器。
- Option 51：IP 地址租期（秒）。
- Option 54：DHCP Server Identifier。
- Option 50：请求的 IP（客户端想续约之前那个 IP）。

### DORA 四步交互

```
        客户端 (0.0.0.0:68)                服务器 (255.255.255.255:67)
              |                                   |
   1. DISCOVER | ───────────────────────────────► | "我是 aa:bb:cc:dd:ee:ff，给我个 IP"
              |                                   |
   2. OFFER    | ◄─────────────────────────────── | "给你 192.168.1.100，租期 86400s，网关/DNS..."
              |                                   |
   3. REQUEST  | ───────────────────────────────► | "我选 192.168.1.100，向服务器 192.168.1.1 续约"
              |                                   |
   4. ACK      | ◄─────────────────────────────── | "确认，参数同 OFFER"
              |                                   |
              ▼                                   ▼
         客户端配置好 IP，可以通信
```

每一步的关键点：

1. **DISCOVER**：源 IP `0.0.0.0`，目的 IP `255.255.255.255`，源 MAC 自己，目的 MAC `ff:ff:ff:ff:ff:ff`。携带客户端 MAC 与一个随机 xid 用于配对响应。
2. **OFFER**：服务器回应，把拟分配的 IP 写入 `yiaddr` 字段。如果有多个 DHCP 服务器，客户端会收到多份 OFFER。
3. **REQUEST**：客户端广播确认。广播的意义是告诉所有服务器"我选了 A，没选上的可以回收你们预留的 IP"。即使只收到一份 OFFER 也广播，让其他服务器知道。
4. **ACK**：被选中的服务器确认分配，客户端正式可以使用该 IP。如果客户端此前请求的 IP 已被分配给他人，服务器回 NAK，客户端回到 DISCOVER。

### 租期与续约

租期是 DHCP 的灵魂。假设租期 86400 秒（24 小时）：

- T1（租期 50% = 12 小时）：客户端单播 REQUEST 给原服务器续约。
- T2（租期 87.5% = 21 小时）：若 T1 续约失败，客户端广播 REQUEST 寻找任一服务器续约。
- 租期到期：仍未续约成功则放弃 IP，回到 DISCOVER 状态，期间网络中断。

续约成功后租期重置为完整时长。这样既保证 IP 可回收（设备离开网络后 IP 在租期结束后可被复用），又避免每次续约都走完整 DORA 浪费带宽。

### DHCP Relay（中继代理）

路由器默认不转发广播，所以跨网段部署 DHCP 必须用 Relay。Relay 通常集成在路由器/三层交换机上：

1. 客户端广播 DISCOVER，路由器收到。
2. 路由器把 `giaddr` 字段填上入接口的 IP，把报文**单播**转发给配置的 DHCP 服务器。
3. 服务器看到 `giaddr` 不为 0，知道这是跨网段请求，从对应地址池分配 IP，把 OFFER 单播回 `giaddr`。
4. 路由器把 OFFER 广播（或单播）给客户端。

这样一台 DHCP 服务器就能为多个网段服务，是企业网络的标配。

## 代码示例

Linux 下查看与释放 DHCP 租约：

```bash
# 查看当前 DHCP 租约信息（dhclient）
cat /var/lib/dhclient/dhclient.leases
# systemd-networkd
networkctl status eth0

# 主动释放 IP 并重新获取
dhclient -r eth0       # release
dhclient eth0          # request

# 抓取 DHCP 四步交互
tcpdump -i eth0 -nn 'udp port 67 or udp port 68' -v

# 查看本机接口与默认网关
ip addr show eth0
ip route show
```

Java 中检测当前主机是否拿到 DHCP 配置：

```java
import java.net.*;
import java.util.*;

public class DhcpInfo {
    public static void main(String[] args) throws Exception {
        Enumeration<NetworkInterface> nifs = NetworkInterface.getNetworkInterfaces();
        while (nifs.hasMoreElements()) {
            NetworkInterface nif = nifs.nextElement();
            if (!nif.isUp() || nif.isLoopback()) continue;
            System.out.println("接口: " + nif.getName());
            for (InterfaceAddress ia : nif.getInterfaceAddresses()) {
                InetAddress addr = ia.getAddress();
                System.out.println("  IP=" + addr.getHostAddress()
                    + "  前缀长度=" + ia.getNetworkPrefixLength()
                    + "  广播=" + (ia.getBroadcast() != null ? ia.getBroadcast().getHostAddress() : "-"));
            }
        }
        // 默认网关需通过 ip route 查询，JDK 不直接提供
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 企业办公网 | DHCP 池按楼层/部门划分，绑定 MAC 分配固定 IP | 关键设备（打印机、IP 摄像头）用静态绑定避免 IP 漂移 |
| 数据中心 | 服务器多采用静态 IP，DHCP 仅用于带外管理 IPMI | 业务网卡走静态 IP 便于排查 |
| 云上 VPC | 云平台自带 DHCP（虚拟路由器），自动下发网关与 DNS | 自定义 DHCP 选项需在 VPC 控制台配置 |
| Wi-Fi 网络 | 客户端密度高，缩短租期到 1-2 小时加快回收 | 租期太长会导致 IP 池耗尽，新设备无法上线 |
| 跨网段办公网 | 在三层交换机配 DHCP Relay 指向中心 DHCP 服务器 | Relay 必须配在客户端网关接口上 |

## 深挖追问

- **为什么 DISCOVER 要广播，不能直接发到已知服务器？**
  客户端此时没有 IP 也不知道 DHCP 服务器在哪，只能广播"喊一声"找服务器。即便预知服务器 IP，源 IP `0.0.0.0` 的单播包很多网络设备也会丢弃，所以广播是唯一可靠方式。

- **DHCP 服务器如何避免把同一 IP 分给两台主机？**
  服务器在 OFFER 阶段会把 IP 标记为"预留"，等收到对应客户端的 REQUEST 才正式分配。租约表里记录 IP↔MAC 绑定。但若有第二台 DHCP 服务器误配，两台可能同时 OFFER 同一 IP，造成冲突——这就是为什么企业要严格管控 DHCP 服务器部署。

- **DHCP 续约失败会立刻断网吗？**
  不会。T1 失败后还有 T2（87.5%）兜底，T2 也失败才在租期到期时断网。这给运维留出故障窗口处理 DHCP 服务器宕机。

- **DHCP 与 DHCPv6 的主要区别？**
  IPv6 不要求所有节点都用 DHCPv6；可以用 SLAAC（无状态）让节点根据路由器通告自动构造 IP。DHCPv6 是有状态分配，端口改为 546/547，不再用广播，改用组播 `ff02::1:2`（所有 DHCP 代理）和 `ff02::1:3`（所有 DHCP 服务器）。

- **如何防御私接 DHCP 服务器？**
  交换机启用 DHCP Snooping：把信任端口（连合法 DHCP 服务器的端口）设为 trust，其他端口为 untrust，丢弃从 untrust 端口收到的 DHCP OFFER/ACK。这一机制也是 Dynamic ARP Inspection 的基础。

## 易错点

- **把 67 和 68 端口记反**：服务器 67，客户端 68。记忆口诀："客户端先发起（68 在前）"。
- **以为 DHCP 是可靠传输**：DHCP 基于 UDP，无确认无重传。丢包靠客户端超时重发 DISCOVER/REQUEST。
- **以为租期到了立刻不能上网**：还有 T1/T2 两次续约机会，租期到期前都能用。
- **以为 DHCP 只能在一个网段用**：配 Relay 后一台服务器可以服务多个网段，企业网常态。
- **以为 DHCP 与 NAT 是一回事**：DHCP 分配 IP，NAT 转换 IP，是两个独立机制。家用路由器同时实现两者，所以容易混。

## 总结

DHCP 是局域网"零配置接入"的基石，通过 DORA 四步完成 IP 与网络参数的下发，通过租期机制实现 IP 回收复用，通过 Relay 支持跨网段部署。理解 DHCP 的关键在于抓住"客户端没有 IP 时怎么通信"——答案是用 `0.0.0.0` → `255.255.255.255` 的广播。它与 ARP（解析 MAC）、NAT（公网转换）一起构成企业办公网的核心三件套。线上排查"设备拿不到 IP"、"IP 冲突"、"网段漂移"问题时，第一步永远是 `tcpdump udp port 67 or 68` 看 DORA 流程是否完整。

## 参考资料

- [RFC 2131 - Dynamic Host Configuration Protocol](https://www.rfc-editor.org/rfc/rfc2131)
- [RFC 2132 - DHCP Options and BOOTP Vendor Extensions](https://www.rfc-editor.org/rfc/rfc2132)
- [RFC 3046 - DHCP Relay Agent Information Option](https://www.rfc-editor.org/rfc/rfc3046)
- [RFC 8415 - Dynamic Host Configuration Protocol for IPv6 (DHCPv6)](https://www.rfc-editor.org/rfc/rfc8415)
- [ISC DHCP documentation](https://www.isc.org/dhcp/)

---
