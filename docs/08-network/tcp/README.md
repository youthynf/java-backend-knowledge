# TCP/IP 协议

## 核心概念

TCP/IP 是互联网的基础协议栈，定义了计算机网络如何互联互通。TCP（传输控制协议）提供可靠的、面向连接的数据传输，IP（网际协议）负责数据包的路由和寻址。

### TCP/IP 四层模型

| 层级 | 协议 | 功能 |
|------|------|------|
| 应用层 | HTTP、FTP、SMTP、DNS | 提供应用服务 |
| 传输层 | TCP、UDP | 端到端通信 |
| 网络层 | IP、ICMP、ARP | 路由和寻址 |
| 链路层 | Ethernet、Wi-Fi | 物理传输 |

### TCP vs UDP

| 特性 | TCP | UDP |
|------|-----|-----|
| 连接 | 面向连接 | 无连接 |
| 可靠性 | 可靠传输 | 尽力而为 |
| 顺序 | 有序 | 无序 |
| 流量控制 | 有 | 无 |
| 拥塞控制 | 有 | 无 |
| 速度 | 较慢 | 快 |
| 头部开销 | 20字节 | 8字节 |
| 应用 | Web、邮件、文件传输 | 视频流、DNS、游戏 |

---

## TCP 核心机制

### 三次握手（建立连接）

```
客户端                          服务端
   |                              |
   |------- SYN=1, seq=x ------->|  第一次握手
   |                              |  客户端发起连接请求
   |                              |  SYN=1 表示建立连接
   |                              |  seq=x 初始序列号
   |                              |
   |<----- SYN=1, ACK=1, seq=y ---|  第二次握手
   |        ack=x+1               |  服务端确认并同意连接
   |                              |  SYN=1, ACK=1 表示确认连接
   |                              |  seq=y 服务端初始序列号
   |                              |  ack=x+1 确认号
   |                              |
   |------- ACK=1, seq=x+1 ----->|  第三次握手
   |        ack=y+1               |  客户端确认
   |                              |  连接建立完成
```

**为什么是三次？**

- 两次握手：服务端无法确认客户端是否收到确认，可能建立无效连接
- 三次握手：双方都确认了对方的发送和接收能力
- 防止历史连接请求突然到达，造成混乱

```java
// 查看 TCP 连接状态
// Linux
netstat -nat | grep ESTABLISHED
ss -tn

// TCP 状态
LISTEN      // 服务端等待连接
SYN_SENT    // 客户端已发送 SYN
SYN_RCVD    // 服务端收到 SYN，等待 ACK
ESTABLISHED // 连接已建立
FIN_WAIT_1  // 主动关闭方发送 FIN
FIN_WAIT_2  // 主动关闭方等待对方 FIN
TIME_WAIT   // 主动关闭方等待 2MSL
CLOSE_WAIT  // 被动关闭方收到 FIN
LAST_ACK    // 被动关闭方发送 FIN
CLOSED      // 连接关闭
```

### 四次挥手（断开连接）

```
客户端                          服务端
   |                              |
   |------- FIN=1, seq=u ------->|  第一次挥手
   |                              |  客户端请求关闭
   |                              |  FIN=1 表示关闭连接
   |                              |
   |<----- ACK=1, seq=v ----------|  第二次挥手
   |        ack=u+1               |  服务端确认
   |                              |  此时服务端可能还有数据要发送
   |                              |
   |<----- FIN=1, ACK=1, seq=w ---|  第三次挥手
   |        ack=u+1               |  服务端请求关闭
   |                              |  FIN=1, ACK=1
   |                              |
   |------- ACK=1, seq=u+1 ----->|  第四次挥手
   |        ack=w+1               |  客户端确认
   |                              |
   |      TIME_WAIT 2MSL          |  客户端等待
   |                              |
   |      CLOSED                  |  连接关闭
```

**为什么是四次？**

- TCP 是全双工，每个方向的连接需要单独关闭
- 服务端收到 FIN 后可能还有数据要发送
- 不能像三次握手那样合并 SYN 和 ACK

**TIME_WAIT 状态**：

```bash
# TIME_WAIT 等待 2MSL（Maximum Segment Lifetime）
# 1. 确保最后的 ACK 到达服务端
# 2. 等待网络中旧的报文消失

# 查看 TIME_WAIT 数量
netstat -nat | grep TIME_WAIT | wc -l

# 大量 TIME_WAIT 可能导致端口耗尽
# 解决方案（服务端优化）
# /etc/sysctl.conf
net.ipv4.tcp_tw_reuse = 1      # 允许复用 TIME_WAIT 套接字
net.ipv4.tcp_tw_recycle = 1    # 快速回收（已废弃）
net.ipv4.tcp_fin_timeout = 30  # 减少等待时间
```

### 滑动窗口（流量控制）

**目的**：防止发送方发送过快，接收方来不及处理。

```
发送方窗口：
+-------+-------+-------+-------+-------+-------+
| 已发送 | 已发送 | 可发送 | 可发送 | 不可发送 | ... |
| 已确认 | 未确认 |       |       |         |     |
+-------+-------+-------+-------+-------+-------+
        |<- 窗口大小 ->|

接收方窗口：
+-------+-------+-------+-------+
| 已处理 | 可接收 | 可接收 | ... |
+-------+-------+-------+-------+
        |<- 窗口大小 ->|

# 窗口大小动态调整
# 接收方在 ACK 中携带窗口大小
# 发送方根据窗口大小控制发送速率
```

**零窗口问题**：

```java
// 接收方窗口为 0 时，发送方停止发送
// 接收方处理完数据后发送窗口更新通知
// 如果更新通知丢失，会造成死锁

// 解决：零窗口探测（Zero Window Probe）
// 发送方定时发送 1 字节探测报文
// 触发接收方重新发送窗口大小
```

### 拥塞控制

**目的**：防止网络过载，全局控制。

```
四种算法：
1. 慢启动（Slow Start）
2. 拥塞避免（Congestion Avoidance）
3. 快速重传（Fast Retransmit）
4. 快速恢复（Fast Recovery）

┌────────────────────────────────────────────┐
│  慢启动：指数增长                           │
│  cwnd = 1 MSS                              │
│  每收到一个 ACK：cwnd = cwnd + 1 MSS       │
│  每轮：cwnd = cwnd * 2                     │
│                                            │
│  拥塞避免：线性增长                         │
│  每收到一个 ACK：cwnd = cwnd + 1/cwnd      │
│  每轮：cwnd = cwnd + 1                     │
└────────────────────────────────────────────┘
```

**详细过程**：

```
1. 慢启动
   - 初始 cwnd = 1 MSS（最大报文段长度）
   - 每收到一个 ACK，cwnd 翻倍
   - 1 -> 2 -> 4 -> 8 -> 16 ...
   - 达到 ssthresh（慢启动阈值）后转入拥塞避免

2. 拥塞避免
   - cwnd 线性增长：每 RTT 增加 1 MSS
   - 检测到拥塞时：
     * 超时：ssthresh = cwnd/2, cwnd = 1，重新慢启动
     * 3个重复ACK：快速重传和快速恢复

3. 快速重传
   - 收到 3 个重复 ACK，立即重传丢失的报文
   - 不等待超时

4. 快速恢复
   - ssthresh = cwnd/2
   - cwnd = ssthresh + 3 MSS
   - 进入拥塞避免（不重新慢启动）
```

### 可靠传输机制

**ARQ（自动重传请求）**：

```java
// 停止等待 ARQ
// 发送一个报文，等待 ACK，超时重传
// 效率低，已不使用

// 连续 ARQ（回退 N 帧）
// 发送窗口内的报文，出错时重传从出错位置开始的所有报文
// Go-Back-N

// 选择重传 ARQ
// 只重传出错的报文
// 需要 SACK（Selective ACK）选项
```

**超时重传时间（RTO）**：

```
RTO = RTT + 4 * RTT偏差

RTT（往返时间）动态测量：
- 测量报文发送到收到 ACK 的时间
- 加权平均：RTT_new = α * RTT_old + (1-α) * RTT_sample
- α 通常为 0.875
```

---

## IP 协议

### IP 地址分类

```
IPv4 地址：32位，4字节，点分十进制

分类：
A类：1.0.0.0 - 126.255.255.255   | 网络位 8 位  | 大型网络
B类：128.0.0.0 - 191.255.255.255 | 网络位 16 位 | 中型网络
C类：192.0.0.0 - 223.255.255.255 | 网络位 24 位 | 小型网络
D类：224.0.0.0 - 239.255.255.255 | 组播地址
E类：240.0.0.0 - 255.255.255.255 | 保留

特殊地址：
127.0.0.1       // 本地回环
0.0.0.0         // 当前主机
255.255.255.255 // 广播地址
192.168.x.x     // 私有地址
10.x.x.x        // 私有地址
172.16.x.x      // 私有地址
```

### 子网划分

```
CIDR（无类别域间路由）
IP地址/前缀长度

示例：
192.168.1.0/24  // 网络位 24 位，主机位 8 位
子网掩码：255.255.255.0
主机数量：2^8 - 2 = 254

子网划分：
192.168.1.0/26  // 借用 2 位主机位
子网掩码：255.255.255.192
子网数量：2^2 = 4
每个子网主机：2^6 - 2 = 62

子网：
192.168.1.0/26   // 192.168.1.1 - 192.168.1.62
192.168.1.64/26  // 192.168.1.65 - 192.168.1.126
192.168.1.128/26 // 192.168.1.129 - 192.168.1.190
192.168.1.192/26 // 192.168.1.193 - 192.168.1.254
```

### IPv6

```
IPv6 地址：128位，16字节，冒号十六进制

格式：2001:0db8:0000:0000:0000:ff00:0042:8329
简写：2001:db8::ff00:42:8329

优势：
- 地址空间巨大（2^128）
- 简化头部，提高处理效率
- 内置安全（IPSec）
- 更好的 QoS 支持
- 自动配置

过渡技术：
- 双栈：同时运行 IPv4 和 IPv6
- 隧道：IPv6 报文封装在 IPv4 中
- 翻译：NAT64，IPv4 和 IPv6 互通
```

---

## 相关协议

### ARP 协议

```
地址解析协议：IP 地址 -> MAC 地址

工作流程：
1. 主机 A 检查 ARP 缓存
2. 缓存中没有则广播 ARP 请求
   "谁有 IP 192.168.1.100？请告诉我 MAC 地址"
3. 目标主机 B 收到后单播回复
   "我是 192.168.1.100，MAC 是 xx:xx:xx:xx:xx:xx"
4. 主机 A 缓存 IP-MAC 映射

查看 ARP 缓存：
arp -a

ARP 欺骗防护：
- 静态 ARP 绑定
- ARP 防火墙
- 交换机端口安全
```

### ICMP 协议

```
互联网控制报文协议：用于网络诊断和错误报告

常用类型：
Type 0  - Echo Reply（ping 响应）
Type 8  - Echo Request（ping 请求）
Type 3  - Destination Unreachable（目标不可达）
Type 11 - Time Exceeded（超时，traceroute 使用）

Ping 原理：
发送 ICMP Echo Request，等待 Echo Reply

Traceroute 原理：
1. 发送 TTL=1 的报文，第一个路由器返回超时
2. 发送 TTL=2 的报文，第二个路由器返回超时
3. 依此类推，直到到达目标
```

### DNS 协议

```
域名系统：域名 -> IP 地址

DNS 查询过程：
1. 浏览器缓存
2. 操作系统缓存
3. 本地 DNS 服务器
4. 根域名服务器 -> 顶级域名服务器 -> 权威域名服务器

DNS 记录类型：
A     // 域名 -> IPv4
AAAA  // 域名 -> IPv6
CNAME // 别名
MX    // 邮件服务器
NS    // 域名服务器
PTR   // IP -> 域名（反向解析）
TXT   // 文本记录

DNS 查询工具：
nslookup google.com
dig google.com
```

---

## 面试高频问题

### 1. 三次握手为什么不是两次或四次？

**两次不够**：
- 服务端无法确认客户端收到自己的 SYN+ACK
- 可能建立无效连接，浪费资源
- 历史连接请求可能导致混乱

**三次足够**：
- 双方都确认了对方的发送和接收能力
- 同步了双方的初始序列号

**四次冗余**：
- 第二次握手已经包含确认，不需要分开

### 2. 四次挥手为什么 TIME_WAIT 要等 2MSL？

**原因**：
1. 确保最后的 ACK 能到达服务端（如果丢失，服务端会重发 FIN）
2. 等待网络中所有旧的报文消失，避免影响新连接

**2MSL**：
- MSL（Maximum Segment Lifetime）报文最大生存时间
- 往返时间 = 1MSL
- 等待 2MSL 确保旧报文完全消失

### 3. TCP 如何保证可靠传输？

**核心机制**：
1. **校验和**：检测数据传输错误
2. **序列号**：保证数据有序、去重
3. **确认应答**：ACK 机制确认收到
4. **超时重传**：未收到 ACK 则重传
5. **滑动窗口**：流量控制
6. **拥塞控制**：防止网络过载
7. **连接管理**：三次握手、四次挥手

### 4. 什么是 TCP 粘包/拆包？如何解决？

**原因**：
- TCP 是字节流协议，没有消息边界
- 发送方多次写入可能合并成一个报文
- 接收方一次读取可能包含多个消息

**解决方案**：

```java
// 方案1：固定长度
// 每条消息固定 100 字节，不足补空格

// 方案2：分隔符
// 每条消息末尾加 \n
BufferedReader reader = new BufferedReader(
    new InputStreamReader(socket.getInputStream()));
String line = reader.readLine();  // 读取到 \n

// 方案3：长度字段
// 消息头 4 字节存储消息长度
DataInputStream dis = new DataInputStream(socket.getInputStream());
int length = dis.readInt();  // 读取长度
byte[] data = new byte[length];
dis.readFully(data);  // 读取数据

// 方案4：协议封装
// 消息 = 魔数 + 版本 + 类型 + 长度 + 数据 + 校验
```

### 5. TCP 和 UDP 的应用场景？

**TCP 适用**：
- Web 浏览（HTTP/HTTPS）
- 文件传输（FTP）
- 邮件（SMTP、IMAP）
- 数据库连接
- SSH 远程登录

**UDP 适用**：
- 视频直播、语音通话（实时性优先）
- DNS 查询（简单快速）
- 在线游戏（低延迟）
- 广播/组播

---

## 实战场景

### 场景1：TCP 连接超时排查

```bash
# 现象：连接建立慢或失败

# 1. 检查网络连通性
ping target-server

# 2. 检查端口是否开放
telnet target-server 80
nc -zv target-server 80

# 3. 抓包分析
tcpdump -i eth0 port 80 -w capture.pcap

# 4. 查看连接状态
netstat -nat | grep target-ip

# 5. 检查防火墙
iptables -L -n

# 常见原因：
# - SYN 包被防火墙拦截
# - 服务端 backlog 满了（SYN 队列）
# - 网络拥塞导致 SYN 丢失
```

### 场景2：大量 TIME_WAIT 问题

```bash
# 现象：服务器出现大量 TIME_WAIT，端口耗尽

# 查看连接状态
netstat -nat | awk '{print $6}' | sort | uniq -c

# 解决方案（/etc/sysctl.conf）
# 允许复用 TIME_WAIT 套接字
net.ipv4.tcp_tw_reuse = 1

# 开启 TCP 快速回收（Linux 4.12 后已移除）
# net.ipv4.tcp_tw_recycle = 1  # 不推荐

# 减少 TIME_WAIT 时间
net.ipv4.tcp_fin_timeout = 30

# 扩大端口范围
net.ipv4.ip_local_port_range = 1024 65535

# 应用配置
sysctl -p
```

### 场景3：TCP 参数调优

```bash
# /etc/sysctl.conf

# 增大 TCP 缓冲区
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# 增加 SYN 队列长度（防 SYN Flood）
net.ipv4.tcp_max_syn_backlog = 8192
net.core.somaxconn = 8192

# 开启 SYN Cookies
net.ipv4.tcp_syncookies = 1

# 减少 Keepalive 探测时间
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 3

# 增加文件描述符限制（/etc/security/limits.conf）
* soft nofile 65535
* hard nofile 65535
```

---

## 延伸思考

### Q1: TCP 如何处理丢包？

1. **超时重传**：RTO 内未收到 ACK，重传报文
2. **快速重传**：收到 3 个重复 ACK，立即重传
3. **SACK**：选择性确认，只重传丢失的数据块

### Q2: 为什么建立连接是三次，断开是四次？

- 建立连接：SYN 和 ACK 可以合并发送
- 断开连接：服务端收到 FIN 后可能还有数据要发送，不能立即发送 FIN

### Q3: TCP 如何实现流量控制和拥塞控制的区别？

- **流量控制**：端到端，接收方控制发送方，防止接收方溢出
- **拥塞控制**：全局，发送方根据网络状况调整，防止网络过载

---

## 参考资料

- 《计算机网络：自顶向下方法》
- 《TCP/IP 详解 卷1：协议》
- [RFC 793: TCP](https://www.rfc-editor.org/rfc/rfc793)
- [RFC 791: IP](https://www.rfc-editor.org/rfc/rfc791)
- [TCP 拥塞控制](https://datatracker.ietf.org/doc/html/rfc5681)