# TIME_WAIT 过多有什么危害

## 核心概念

TIME_WAIT 是 TCP 主动关闭方的正常状态，但过多会占用资源。危害分两类：占用内存和连接表项（影响内核网络栈性能）、占用端口资源（影响本端发起新连接）。客户端和服务端受影响的维度不同。

## 标准回答

TIME_WAIT 过多的两大危害：

1. **占用内存和内核连接表项**：每条约 1.5-3 KB，10 万条约 30 MB。哈希表查找变慢，影响所有连接的处理速度。
2. **占用端口资源**：客户端发起连接需要本地端口，TIME_WAIT 期间端口被占。客户端端口耗尽后无法对**同一目的 IP+端口**发起新连接。

服务端 TIME_WAIT 多不会端口耗尽（监听同一端口，靠五元组区分），但占内存。客户端 TIME_WAIT 多会端口耗尽，无法发起新连接。

## 详细机制

### 端口资源限制

Linux 临时端口范围默认 32768-60999（约 28000 个）：

```bash
$ sysctl net.ipv4.ip_local_port_range
net.ipv4.ip_local_port_range = 32768  60999
```

客户端发起到同一目的 IP+端口的连接，每个连接需要一个本地端口。如果该目的端有 28000 个 TIME_WAIT，本地端口耗尽，新连接报 `Cannot assign requested address`。

但发起到**不同目的 IP 或端口**的连接不受影响，因为五元组不同。

### 内存和连接表项

每个 TIME_WAIT 项在内核中保留：
- sock 结构（约 1.5-3 KB，含五元组、序号等）
- 哈希表项（用于查找）
- 计时器

```bash
# 查看 TIME_WAIT 数量
$ ss -tan state time-wait | wc -l
12345

# 内核计数器
$ cat /proc/net/netstat | grep -i TW
```

### 客户端 vs 服务端

**客户端 TIME_WAIT 多**：端口耗尽，无法连接同一目的服务。常见于压测客户端、爬虫、短连接服务调用方。

**服务端 TIME_WAIT 多**：不耗端口（监听同一端口），但占内存和连接表项。常见于服务端主动关闭短连接（如 HTTP 1.0、健康检查、限流后断开）。

### 服务端 TIME_WAIT 增多的常见原因

1. **HTTP 没用长连接**：HTTP 1.0 默认短连接，每次请求都新建+关闭 TCP，服务端主动关闭后产生 TIME_WAIT。
2. **HTTP 长连接超时**：Nginx `keepalive_timeout` 到期主动关闭，产生 TIME_WAIT。
3. **HTTP 长连接请求数达到上限**：Nginx `keepalive_requests` 达到阈值主动关闭。
4. **限流/熔断后主动断开**：服务端拒绝请求后主动 close。

## 解决方案

### 方案 1：启用 `tcp_tw_reuse`

```bash
$ sysctl net.ipv4.tcp_tw_reuse=1
$ sysctl net.ipv4.tcp_timestamps=1  # 前提条件，默认已开
```

允许新连接复用 TIME_WAIT 状态的端口（仅客户端发起 connect 时生效，依赖 timestamps 防止旧报文复活）。这是最安全的优化方式。

### 方案 2：调大本地端口范围

```bash
$ sysctl net.ipv4.ip_local_port_range="10000 65535"
```

把临时端口从 28000 个扩到 55000 个，缓解客户端端口耗尽。

### 方案 3：让客户端主动关闭

服务端不主动 close，由客户端发起关闭，TIME_WAIT 转移到客户端。HTTP 1.1 默认 keep-alive 就是这个思路。

### 方案 4：使用 SO_LINGER 强制 RST

```java
Socket socket = new Socket();
socket.setSoLinger(true, 0);  // close 时发 RST 而非 FIN，跳过 TIME_WAIT
```

代价是接收方收到 `Connection reset by peer`，不是优雅关闭。仅在压测等场景使用，生产慎用。

### 方案 5：调小 `tcp_max_tw_buckets`

```bash
$ sysctl net.ipv4.tcp_max_tw_buckets=5000
```

超过阈值后强制清除 TIME_WAIT。比较暴力，但能防内存暴涨。默认值 18000（不同发行版可能不同）。

### 不推荐：`tcp_tw_recycle`

Linux 4.12 起已移除该选项。在 NAT 环境下会因 timestamp 不一致导致连接被错误丢弃，不要再开启。

## 代码示例

Java 客户端压测时启用端口复用：

```java
import java.net.*;

public class Client {
    public static void main(String[] args) throws Exception {
        for (int i = 0; i < 100000; i++) {
            Socket socket = new Socket();
            // 不直接生效（tcp_tw_reuse 是内核参数），但 SO_REUSEADDR 是相关概念
            socket.setReuseAddress(true);
            socket.connect(new InetSocketAddress("example.com", 80));
            socket.close();
        }
    }
}
```

实际生效要靠内核 `tcp_tw_reuse=1`：

```bash
# 永久生效
$ cat >> /etc/sysctl.conf <<EOF
net.ipv4.tcp_tw_reuse = 1
net.ipv4.ip_local_port_range = 10000 65535
EOF
$ sysctl -p
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 压测客户端端口耗尽 | `Cannot assign requested address` | 调大 port_range + tw_reuse |
| 服务端 TIME_WAIT 暴涨 | `ss -tan state time-wait` 数万 | 改长连接，让客户端主动关闭 |
| Nginx 后端 TIME_WAIT 多 | Nginx 主动关上游连接 | 启用 upstream keepalive |
| 短连接 API 服务 | 服务端 TIME_WAIT 多 | 改 HTTP 1.1 长连接 |
| 跨网关大量 TIME_WAIT | 网关主动断连 | 评估是否能改后端主动关闭 |

## 深挖追问

**Q1：TIME_WAIT 占 fd 吗？**
不占。TIME_WAIT 不持有文件描述符，只占内核连接表项和少量内存。

**Q2：`tcp_tw_reuse` 在服务端有用吗？**
对服务端 accept 新连接没用（服务端不主动 connect）。但如果服务端也作为客户端连别的服务（如反向代理），那部分连接的 TIME_WAIT 可以被复用。

**Q3：调大 `tcp_max_tw_buckets` 有风险吗？**
有。允许更多 TIME_WAIT 意味着更多内存占用。每个 TIME_WAIT 1.5-3 KB，10 万条 30 MB，可控；百万条就 300 MB，需要评估。

**Q4：为什么 `tcp_tw_recycle` 被移除？**
它在 NAT 环境下用 timestamp 判断报文是否来自同一连接，但 NAT 后多台机器 timestamp 不一致，导致部分连接被错误丢弃。Linux 4.12 起彻底移除。

**Q5：BBR 能减少 TIME_WAIT 吗？**
不能。BBR 是拥塞控制算法，和连接关闭无关。TIME_WAIT 是连接关闭后的状态，不受拥塞算法影响。

## 易错点

- **"服务端 TIME_WAIT 会端口耗尽"** — 不会，服务端监听固定端口，靠五元组区分连接。
- **"`tcp_tw_recycle` 还能用"** — 4.12 起已移除，不要再开。
- **"调短 TIME_WAIT 时长就好"** — Linux 中 TIME_WAIT 时长固定 60 秒，不可调。
- **"TIME_WAIT 占用 fd"** — 不占。
- **"开 `tcp_tw_reuse` 就万事大吉"** — 仅对客户端 connect 生效，且依赖 timestamps。

## 总结

TIME_WAIT 过多的危害分客户端和服务端：客户端端口耗尽影响发起新连接，服务端占内存影响内核性能。治本是改长连接让客户端主动关闭，治标是开 `tcp_tw_reuse` 和调大端口范围。`tcp_tw_recycle` 已废弃，`SO_LINGER` 强制 RST 是压测才用的非常手段。

## 参考资料

- [RFC 1337 — TIME-WAIT State Hazards](https://datatracker.ietf.org/doc/html/rfc1337)
- [Linux tcp_tw_reuse 文档](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
- [Linux 4.12 移除 tcp_tw_recycle](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=4396e46187ca)
