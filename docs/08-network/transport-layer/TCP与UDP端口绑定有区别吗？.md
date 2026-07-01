# TCP 与 UDP 端口绑定有区别吗

## 核心概念

TCP 和 UDP 在内核中是两个独立的协议模块，端口号也各自独立。TCP 80 和 UDP 80 是两个不同的端口，可以同时被不同进程绑定。同协议下多进程绑定同一端口有特殊场景：默认不允许（`Address already in use`），但通过 `SO_REUSEADDR` 等选项可以在某些条件下复用。

## 标准回答

| 场景 | 是否允许 |
|------|---------|
| TCP 80 和 UDP 80 同时被不同进程绑定 | 允许 |
| 两个 TCP 进程绑定相同 IP+端口 | 不允许（除非用 `SO_REUSEPORT`） |
| 绑定 `0.0.0.0:8080` 和 `192.168.1.1:8080` | 不允许（`0.0.0.0` 包含所有 IP） |
| 绑定 `192.168.1.1:8080` 和 `192.168.1.2:8080` | 允许（IP 不同） |
| 重启进程绑定 TIME_WAIT 状态的端口 | 默认不允许，`SO_REUSEADDR` 允许 |

## 详细机制

### 为什么 TCP 和 UDP 端口独立

IP 包头部有"协议号"字段（TCP=6，UDP=17）。内核收到 IP 包后根据协议号分发到对应模块：

```
IP 包到达 → 检查协议号
  - 协议号=6  → TCP 模块 → 按 TCP 端口查找 socket
  - 协议号=17 → UDP 模块 → 按 UDP 端口查找 socket
```

TCP 和 UDP 是两个独立的哈希表，互不影响。所以 TCP 80 和 UDP 80 可以同时被占用。

```bash
# 查看 TCP 80 占用
$ ss -tlnp | grep :80
LISTEN 0  511  0.0.0.0:80  0.0.0.0:*  users:(("nginx",pid=1234,fd=6))

# 查看 UDP 80 占用
$ ss -ulnp | grep :80
UNCONN 0  0  0.0.0.0:80  0.0.0.0:*  users:(("myapp",pid=5678,fd=4))
# TCP 和 UDP 80 可以同时被不同进程占用
```

### 同协议多进程绑定同端口

默认情况下，第二个进程 bind 时会报错：

```bash
$ ./server1 &  # bind 0.0.0.0:8080
$ ./server2 &  # bind 0.0.0.0:8080
bind: Address already in use
```

特殊场景 1：绑定不同 IP 的同一端口可以共存：

```bash
$ ./server1 192.168.1.1 8080 &
$ ./server2 192.168.1.2 8080 &
# 两个进程都启动成功，因为 IP 不同
```

但绑定 `0.0.0.0:8080` 和 `192.168.1.1:8080` 不能共存，因为 `0.0.0.0` 是通配地址，包含 `192.168.1.1`。

特殊场景 2：`SO_REUSEPORT` 允许多进程绑定相同 IP+端口：

```c
int fd = socket(AF_INET, SOCK_STREAM, 0);
int on = 1;
setsockopt(fd, SOL_SOCKET, SO_REUSEPORT, &on, sizeof(on));
bind(fd, ...);
listen(fd, ...);
```

内核会把进入的连接在绑定的多个 socket 间负载均衡。Nginx 1.9.1+ 用这个特性实现多 worker 进程独立 accept。

### TIME_WAIT 与端口复用

服务端重启时常见错误：

```bash
$ ./server &
$ kill $!    # 重启服务端
$ ./server
bind: Address already in use

$ ss -tln | grep :8080
# 看似没有 LISTEN，但 TIME_WAIT 还占着五元组
$ ss -tan | grep :8080
TIME-WAIT 0 0  10.0.0.1:8080  10.0.0.2:54321
```

原因：服务端主动关闭连接后进入 TIME_WAIT，期间该五元组仍被认为占用，bind 同 IP+端口会失败。

解决：`SO_REUSEADDR` 允许新进程绑定 TIME_WAIT 状态的端口：

```java
ServerSocket server = new ServerSocket();
server.setReuseAddress(true);  // 等价于 SO_REUSEADDR
server.bind(new InetSocketAddress(8080));
```

```bash
# 内核参数 tcp_tw_reuse 控制客户端 connect 时的复用
$ sysctl net.ipv4.tcp_tw_reuse=1
# 注意：tcp_tw_reuse 是客户端 connect 时生效，与 SO_REUSEADDR（服务端 bind）不同
```

### 客户端 TIME_WAIT 与端口耗尽

客户端每次 connect 都会消耗一个临时端口（ephemeral port），主动关闭后该端口进入 TIME_WAIT。

```bash
# 临时端口范围
$ sysctl net.ipv4.ip_local_port_range
net.ipv4.ip_local_port_range = 32768  60999   # 约 28000 个
```

如果客户端持续连接同一目的 IP+端口（如压测一个服务），28000 个端口耗尽后无法再 connect：

```bash
$ curl http://example.com/
curl: (7) Failed to connect to example.com port 80: Cannot assign requested address
```

但连接**不同**目的 IP 或端口的连接不受影响，因为五元组不同。

## 代码示例

TCP 和 UDP 同时绑定 8080：

```java
import java.net.*;

public class TcpUdpSamePort {
    public static void main(String[] args) throws Exception {
        // TCP 绑定 8080
        ServerSocket tcp = new ServerSocket(8080);
        System.out.println("TCP listening on 8080");

        // UDP 绑定 8080，可以成功
        DatagramSocket udp = new DatagramSocket(8080);
        System.out.println("UDP listening on 8080");

        // 两个都成功
    }
}
```

服务端启用 `SO_REUSEADDR`：

```java
ServerSocket server = new ServerSocket();
server.setReuseAddress(true);   // 关键：允许复用 TIME_WAIT 端口
server.bind(new InetSocketAddress(8080));
```

`SO_REUSEPORT` 多进程 accept（Linux 3.9+）：

```java
// Java 9+ 支持 SO_REUSEPORT
ServerSocket server = new ServerSocket();
server.setOption(StandardSocketOptions.SO_REUSEPORT, true);
server.bind(new InetSocketAddress(8080));
// 多个 JVM 进程都绑定 8080，内核负载均衡
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| 服务重启报 `Address already in use` | TIME_WAIT 占用端口 | 启用 `SO_REUSEADDR` |
| 客户端压测端口耗尽 | `Cannot assign requested address` | 调大 `ip_local_port_range`，开 `tcp_tw_reuse` |
| Nginx 多 worker | 单进程 accept 成为瓶颈 | 用 `SO_REUSEPORT` 多进程独立 accept |
| DNS 服务 | TCP 53 和 UDP 53 共存 | 协议独立，正常绑定 |
| 容器端口映射 | 宿主机端口冲突 | 检查宿主机端口占用 |

## 深挖追问

**Q1：`SO_REUSEADDR` 和 `tcp_tw_reuse` 的区别？**
`SO_REUSEADDR` 是 socket 选项，影响 bind 行为（服务端复用 TIME_WAIT 端口）。`tcp_tw_reuse` 是内核参数，影响 connect 行为（客户端复用 TIME_WAIT 端口）。

**Q2：`SO_REUSEPORT` 和 `SO_REUSEADDR` 的区别？**
`SO_REUSEADDR` 允许复用 TIME_WAIT 状态的端口；`SO_REUSEPORT` 允许多个 socket 同时绑定完全相同的 IP+端口，内核做负载均衡。前者解决重启问题，后者解决多进程 accept 问题。

**Q3：UDP 也有 TIME_WAIT 吗？**
没有。UDP 是无连接的，没有连接状态机，不产生 TIME_WAIT。所以 UDP 服务重启不会遇到 `Address already in use`。

**Q4：客户端能绑定固定源端口吗？**
可以，bind 后再 connect。但通常不推荐，固定源端口会限制并发（一个端口只能对应一个连接五元组）。除非对端有防火墙白名单要求。

**Q5：`0.0.0.0` 和具体 IP 的 bind 冲突吗？**
冲突。`0.0.0.0` 是通配地址，包含所有 IP。先 bind `0.0.0.0:8080` 后，再 bind `192.168.1.1:8080` 会失败，反之亦然。

## 易错点

- **"TCP 和 UDP 端口共享"** — 错，两个协议端口独立。
- **"`SO_REUSEADDR` 能让多进程同时监听同端口"** — 不能，那需要 `SO_REUSEPORT`。
- **"`tcp_tw_reuse` 服务端有用"** — 没用，只对客户端 connect 生效。
- **"客户端 TIME_WAIT 不影响连接其他服务器"** — 影响仅在连接同一目的 IP+端口时，连接不同服务不受影响。
- **"bind `0.0.0.0` 和具体 IP 可以共存"** — 不可以，`0.0.0.0` 包含所有 IP。

## 总结

TCP 和 UDP 端口独立，可以同时绑定同一端口号。同协议下默认不允许重复绑定，但 `SO_REUSEADDR` 解决服务端重启 TIME_WAIT 占用问题，`SO_REUSEPORT` 解决多进程同时监听同端口问题。客户端 TIME_WAIT 过多会导致端口耗尽，调大 `ip_local_port_range` 和开启 `tcp_tw_reuse` 是治标，改长连接是治本。

## 参考资料

- [Linux socket(7) 文档 — SO_REUSEADDR, SO_REUSEPORT](https://man7.org/linux/man-pages/man7/socket.7.html)
- [Linux ip-sysctl 文档 — tcp_tw_reuse, ip_local_port_range](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
