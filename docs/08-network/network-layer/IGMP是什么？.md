# IGMP 是什么

## 核心概念

IGMP（Internet Group Management Protocol，互联网组管理协议，RFC 3376）是 IPv4 网络里管理**组播组成员关系**的协议。它工作在主机与"最后一跳路由器"之间，告诉路由器"我这个网段有没有主机想接收某个组播组的流量"。如果没有 IGMP，路由器要么把所有组播流量都转发（浪费带宽），要么全不转发（组播不可用）。

组播（Multicast）是介于单播和广播之间的通信方式：发送方只发一份包，网络在分叉处复制，让"加入组"的主机收到，没加入的不收。组播地址用 D 类地址（`224.0.0.0/4`）。组播常用于视频直播、股票行情、IPTV、OSPF 协议本身（`224.0.0.5`）等"一对多"场景。

IGMP 只管"成员管理"，不管组播路由（那是 PIM、MOSPF 等协议的事）。所以理解 IGMP 时要把它定位为"主机告诉路由器我要加入/离开组"的信令协议，而不是数据传输协议。

## 标准回答

IGMP 是 IPv4 组播的信令协议，让主机告诉"最后一跳路由器"自己是否要接收某个组播组的流量。路由器据此决定是否把组播流量引入本网段。IGMP 有三个版本（v1/v2/v3），主流是 v3，向前兼容 v2/v1。报文封装在 IP 中（协议号 2），TTL=1（仅本网段，不被路由器转发）。

要点：

- IGMP 解决"组播流量如何按需分发到本网段"的问题，避免组播包在不需要的网段浪费带宽。
- 主机通过 Membership Report（成员关系报告）声明加入某组，通过 Leave Group（离组）声明离开（v2+）。
- 路由器周期性发 General Query（常规查询），根据响应更新组播转发决策。
- IGMP 只工作在主机-路由器这一跳，组播跨网段转发靠 PIM-SM/PIM-DM 等组播路由协议。
- IPv6 用 MLD（Multicast Listener Discovery，RFC 3810）替代 IGMP，机制类似但基于 ICMPv6。

## 实现原理

### IGMP 报文结构

IGMP 报文封装在 IP 包中（IP 协议号 2，TTL=1）：

```
IGMPv2 报文（8 字节，最常用）:
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Type (8 位)  | Max Resp Time (8 位) | Checksum (16 位)      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Multicast Group Address (32 位)                              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+

Type 取值:
  0x11 = Membership Query（成员查询，包括 General 与 Group-Specific）
  0x16 = Membership Report v2（成员关系报告）
  0x17 = Leave Group（离组）
  0x12 = Membership Report v1（兼容）
```

TTL=1 是关键约束：保证 IGMP 报文不会跨越路由器，只在"主机-本网段路由器"之间传递。

### 三个版本的演进

| 版本 | RFC | 关键能力 |
|------|-----|---------|
| IGMPv1 | RFC 1112 | 只有 Join（Report），没有显式 Leave；离组靠超时（默认 60s × 3 次查询） |
| IGMPv2 | RFC 2236 | 增加 Leave Group 与 Group-Specific Query，离组延迟从分钟级降到秒级 |
| IGMPv3 | RFC 3376 | 支持 SSM（Source-Specific Multicast），可指定"只想接收来自哪些源的组播" |

### 工作机制

#### 1. 主机加入组播组

主机想加入组播组 `239.1.1.1` 时，直接向该组播地址发送 Membership Report（Type 0x16）。这个报告同时有两个作用：

- 告诉本网段路由器"我要收 239.1.1.1 的流量"。
- 让同网段其他也想加入该组的主机听到后**抑制自己的报告**，避免多个 Report 浪费带宽。

#### 2. 路由器常规查询（General Query）

路由器默认每 60 秒（`query-interval`）向 `224.0.0.1`（本网段所有主机）发送 General Query（Type 0x11，Group Address = 0.0.0.0），询问"你们想收哪些组？"。

主机收到后启动一个**随机延迟计时器**（0 ~ Max Resp Time，默认 10 秒），到点才发 Report。如果在计时器到点前听到其他主机报告了某组，就取消该组的报告（"已经有人替我报告了"）。这种抑制机制让每个组每周期只产生一份 Report，节省带宽。

#### 3. 主机离开组（IGMPv2+）

主机想离开 `239.1.1.1` 时，向 `224.0.0.2`（本网段所有路由器）发 Leave Group（Type 0x17）。路由器收到后立即发 Group-Specific Query（针对 239.1.1.1 的查询），连续发 2 次（间隔 `last-member-query-interval`，默认 1 秒）。如果还有主机想留，会响应 Report；如果没有任何响应，路由器认为本网段无人需要 239.1.1.1，停止转发该组流量。

#### 4. 组播路由协议

IGMP 只解决"最后一跳"的成员管理，组播流量在路由器之间如何转发由 PIM（Protocol Independent Multicast，RFC 7761）等组播路由协议决定。PIM-SM（Sparse Mode）通过 RP（Rendezvous Point）汇聚点建立组播分发树，PIM-DM（Dense Mode）用洪泛-修剪方式。这部分超出 IGMP 范围。

## 代码示例

Linux 下查看与配置组播：

```bash
# 查看本机加入的组播组
netstat -g
# 或
ip maddr show

# 查看网卡组播支持
ip link show eth0   # 关键字 MULTICAST 表示支持

# 开启/关闭网卡组播
ip link set eth0 multicast on

# 抓取 IGMP 报文
tcpdump -i eth0 -nn igmp -v

# 加入一个组播组（测试用，需 root）
# Python 一行：socket 套接字加入组
python -c "import socket,struct; s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.setsockopt(socket.IPPROTO_IP,socket.IP_ADD_MEMBERSHIP,socket.inet_aton('239.1.1.1')+socket.inet_aton('0.0.0.0')); s.bind(('',5000)); print(s.recvfrom(1500))"
```

Java 中加入组播组接收数据：

```java
import java.net.*;

public class MulticastReceiver {
    public static void main(String[] args) throws Exception {
        // 设置组播组与端口
        InetAddress group = InetAddress.getByName("239.1.1.1");
        int port = 5000;

        // 创建组播套接字并加入组
        MulticastSocket socket = new MulticastSocket(port);
        socket.joinGroup(group);   // 底层触发 IGMP Membership Report

        System.out.println("已加入组播组 239.1.1.1，等待接收数据...");

        byte[] buf = new byte[1024];
        DatagramPacket packet = new DatagramPacket(buf, buf.length);
        socket.receive(packet);    // 收到组播包

        System.out.println("收到来自 " + packet.getAddress()
            + " : " + new String(packet.getData(), 0, packet.getLength()));

        socket.leaveGroup(group);  // 底层触发 IGMP Leave Group
        socket.close();
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 视频直播 | 用组播分发降低骨干带宽，路由器按需复制 | 接收端需支持 IGMP，跨网段需 PIM 配合 |
| 股票行情推送 | 一份行情数据多终端订阅 | 关注组播组规划，避免组地址冲突 |
| OSPF 协议 | OSPF Hello 报文发往 `224.0.0.5`（所有 OSPF 路由器） | TTL=1，仅本网段，路由器不会转发 |
| IPTV / 监控 | 机顶盒加入/离开频道对应组播组 | 频道切换延迟受 IGMP Query/Response 影响 |
| 容器/K8s | 通常不使用组播，CNI 多用单播 + overlay | 多播 overlay 复杂，多数 CNI 不支持原生组播 |

## 深挖追问

- **IGMP 为什么 TTL=1？**
  IGMP 只关心"本网段主机与本网段路由器"的关系，跨网段管理是 PIM 的事。TTL=1 保证它不会被路由器转发出去，避免组播成员信息扩散到不必要的网段。

- **为什么需要"随机延迟 + 抑制"机制？**
  路由器查询时如果所有主机同时响应，会产生流量尖峰。随机延迟让响应分散到时间窗口内；某个主机响应后其他主机听到就抑制，最终每个组只产生一份 Report，节省带宽。

- **IGMP Snooping 是什么？**
  二层交换机默认会把组播帧当广播在所有端口转发，浪费带宽。IGMP Snooping 让交换机"偷听"IGMP 报文，学习哪些端口加入了哪些组，从而只在需要的端口复制组播流量。这是企业交换机的必备功能。

- **IGMP 与 PIM 是什么关系？**
  IGMP 是"主机-路由器"层面的成员管理，PIM 是"路由器-路由器"层面的组播路由。两者协作：IGMP 让最后一跳路由器知道本网段要哪些组，PIM 让网络中其他路由器知道如何把组播流量送到这台最后一跳路由器。

- **为什么 IPv6 不用 IGMP？**
  IPv6 用 MLD（Multicast Listener Discovery，RFC 3810）替代，机制与 IGMPv2/v3 类似，但基于 ICMPv6（Type 130/131/132/143）实现。IPv6 设备必须支持 MLD，因为 IPv6 邻居发现本身就依赖组播。

## 易错点

- **以为 IGMP 负责组播数据传输**：IGMP 只管成员管理（加入/离开/查询），数据传输由 IP 组播 + PIM 完成。
- **以为 IGMP 是传输层协议**：IGMP 封装在 IP 中（协议号 2），属网络层控制协议，没有端口概念。
- **以为任何主机都能收到组播**：必须显式加入组（IGMP Report），不加入不会收到（除非交换机不支持 IGMP Snooping 把组播当广播）。
- **以为组播能跨公网**：公网运营商通常不允许组播穿越，组播主要用于局域网/企业网。跨域组播需 MBGP + MSDP，部署极少。
- **以为 IGMP 离组立即生效**：路由器收到 Leave 后还会发 2 次 Group-Specific Query 确认，离组生效有秒级延迟。

## 总结

IGMP 是 IPv4 组播的"成员管理信令"，让主机告诉本网段路由器要加入或离开哪些组播组，使组播流量按需分发到本网段。它只工作在主机-路由器这一跳，跨网段转发由 PIM 等组播路由协议负责。掌握 IGMP 的关键在于分清"成员管理（IGMP）"与"组播路由（PIM）"两个层次，并理解 IGMP Snooping 在二层交换机上的优化作用。IPv6 用 MLD 替代，但机制类似。

## 参考资料

- [RFC 3376 - Internet Group Management Protocol, Version 3](https://www.rfc-editor.org/rfc/rfc3376)
- [RFC 2236 - Internet Group Management Protocol, Version 2](https://www.rfc-editor.org/rfc/rfc2236)
- [RFC 1112 - Host Extensions for IP Multicasting (IGMPv1)](https://www.rfc-editor.org/rfc/rfc1112)
- [RFC 3810 - Multicast Listener Discovery Version 2 (MLDv2) for IPv6](https://www.rfc-editor.org/rfc/rfc3810)
- [RFC 7761 - Protocol Independent Multicast - Sparse Mode (PIM-SM)](https://www.rfc-editor.org/rfc/rfc7761)

---
