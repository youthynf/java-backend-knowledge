# 服务端出现大量 CLOSE_WAIT 状态原因是什么

## 核心概念

CLOSE_WAIT 是 TCP 四次挥手中**被动关闭方**收到对端 FIN 后回完 ACK 进入的状态，等待应用层调用 close() 发出自己的 FIN。如果应用层迟迟不 close()，连接会一直卡在 CLOSE_WAIT。所以**服务端大量 CLOSE_WAIT 几乎一定是应用代码 bug**——通常是忘记关闭流或连接池释放逻辑异常。

## 标准回答

CLOSE_WAIT 出现在被动关闭方，状态转移条件是"应用层调用 close()"。卡住不转移说明应用层没调 close()。常见原因：

1. **忘记关闭 InputStream/OutputStream/Socket**：异常路径下没走到 close。
2. **连接池泄漏**： borrowed 出来的连接没归还。
3. **业务逻辑阻塞**：处理慢，连接还借出去没还。
4. **第三方库 bug**：HTTP 客户端在异常时未关闭连接。

排查思路：先 `ss -tanp` 找 CLOSE_WAIT 对应的进程和 fd，再 jstack 看线程堆栈，定位卡在哪段代码。

## 详细机制

### CLOSE_WAIT 状态转移

四次挥手中被动关闭方的状态变化：

```
ESTABLISHED → 收到 FIN → 回 ACK → CLOSE_WAIT → 应用层 close() → 发 FIN → LAST_ACK → 收到 ACK → CLOSED
```

CLOSE_WAIT → LAST_ACK 的转移条件是**应用层调用 close()**。如果应用层不调 close()，连接永远卡在 CLOSE_WAIT。

### 应用层为什么没 close()

典型场景：

```java
// 反例：异常路径未关闭
Socket socket = new Socket("example.com", 80);
InputStream in = socket.getInputStream();
try {
    // 业务处理可能抛异常
    String line = in.readLine();
    process(line);
} catch (IOException e) {
    // 异常时没有 close，连接泄漏
    log.error("error", e);
}
// 缺少 finally 或 try-with-resources
```

正确写法：

```java
// 正例：try-with-resources 保证关闭
try (Socket socket = new Socket("example.com", 80);
     InputStream in = socket.getInputStream()) {
    String line = in.readLine();
    process(line);
} catch (IOException e) {
    log.error("error", e);
}
```

### 连接池泄漏

```java
// 反例：连接借出后没归还
Connection conn = dataSource.getConnection();
try {
    // 业务异常 → 没归还
    executeSql(conn);
} catch (SQLException e) {
    log.error("error", e);
    return; // 漏了 conn.close()
}
conn.close();
```

正确写法：

```java
try (Connection conn = dataSource.getConnection()) {
    executeSql(conn);
}
```

### 排查步骤

```bash
# 1. 统计 CLOSE_WAIT 数量
$ ss -tan state close-wait | wc -l
42

# 2. 找出占用 CLOSE_WAIT 的进程
$ ss -tanp state close-wait | head
Recv-Q Send-Q Local Address:Port Peer Address:Port Process
0      1      10.0.0.1:8080       10.0.0.2:54321   users:(("java",pid=12345,fd=42))

# 3. 看 fd 指向哪个连接
$ ls -l /proc/12345/fd/42
lrwx------ 1 user user 64 ... /proc/12345/fd/42 -> socket:[123456789]

# 4. jstack 看线程堆栈，定位卡在哪
$ jstack 12345 | grep -A 20 "socketRead"
```

### CLOSE_WAIT vs TIME_WAIT 区别

| 状态 | 出现在 | 触发条件 | 持续时间 |
|------|--------|----------|----------|
| CLOSE_WAIT | 被动关闭方 | 收到对端 FIN | 等应用层 close() |
| TIME_WAIT | 主动关闭方 | 自己发的 FIN 被确认 | 固定 2 MSL（60 秒） |

CLOSE_WAIT 持续时间不可预测（看应用何时 close），TIME_WAIT 是固定 60 秒。所以 CLOSE_WAIT 持续堆积基本是 bug，TIME_WAIT 堆积可能是正常流量。

## 代码示例

模拟 CLOSE_WAIT 泄漏：

```java
import java.net.*;
import java.io.*;

public class CloseWaitLeak {
    public static void main(String[] args) throws Exception {
        ServerSocket server = new ServerSocket(8080);
        while (true) {
            Socket socket = server.accept();
            // 客户端连上后会立即主动关闭，服务端收到 FIN 进入 CLOSE_WAIT
            // 但服务端没有 close() —— 连接泄漏
            InputStream in = socket.getInputStream();
            int b = in.read();  // 读到 -1 表示 EOF
            System.out.println("Read EOF, but no close()");
            // 这里应该 socket.close()，但漏了
        }
    }
}
```

修复：

```java
import java.net.*;
import java.io.*;

public class CloseWaitFixed {
    public static void main(String[] args) throws Exception {
        ServerSocket server = new ServerSocket(8080);
        while (true) {
            try (Socket socket = server.accept();
                 InputStream in = socket.getInputStream()) {
                int b = in.read();
                System.out.println("Read EOF, will close");
            }
        }
    }
}
```

## 实战场景

| 场景 | 现象 | 处理 |
|------|------|------|
| HTTP 客户端未关闭 Response | 服务端 CLOSE_WAIT 增长 | 用 try-with-resources 关闭 Response.body |
| 数据库连接池借出不还 | CLOSE_WAIT 增长 | 用 try-with-resources 包 Connection |
| 第三方 SDK bug | 调用 SDK 后 CLOSE_WAIT | 升级 SDK 或加兜底 close |
| 业务线程阻塞 | 处理慢导致连接堆积 | 异步化或加超时 |
| Tomcat/Nginx 后端超时 | 后端关连接，前端没关 | 调整 keepalive 配置 |

## 深挖追问

**Q1：CLOSE_WAIT 会自动消失吗？**
不会，除非应用层主动 close() 或进程退出。这就是为什么 CLOSE_WAIT 堆积是 bug。

**Q2：CLOSE_WAIT 在哪一端？**
被动关闭方。如果服务端看到 CLOSE_WAIT，说明**客户端先发了 FIN**（客户端主动关闭），但服务端没回自己的 FIN。

**Q3：能不能强制清理 CLOSE_WAIT？**
不能直接清理。可以重启进程让操作系统回收所有 socket。根本解决要修复代码。

**Q4：CLOSE_WAIT 占 fd 吗？**
占。CLOSE_WAIT 期间 socket fd 仍被应用持有，会占用进程的 fd 配额。大量 CLOSE_WAIT 可能导致 `Too many open files`。

**Q5：HTTP 客户端如何避免 CLOSE_WAIT？**
确保 Response.body 完全消费并关闭。OkHttp 用 try-with-resources，HttpClient 调 `response.body().close()`。否则连接不会归还连接池。

## 易错点

- **"CLOSE_WAIT 是正常状态"** — 短暂存在是正常的，但持续堆积一定是 bug。
- **"调内核参数能解决"** — 不能。CLOSE_WAIT 是应用层问题，内核参数无法解决。
- **"客户端主动关闭会导致服务端 CLOSE_WAIT"** — 严格说是"客户端主动关闭 + 服务端没及时关闭"才会导致。
- **"CLOSE_WAIT 在主动关闭方"** — 反了，在被动关闭方。
- **"调短 keepalive 能解决"** — 不能根治，只是兜底断开。

## 总结

服务端大量 CLOSE_WAIT 几乎一定是应用层 bug：忘记 close() 流或连接、连接池泄漏、业务阻塞。排查用 `ss -tanp state close-wait` 找进程，`jstack` 看堆栈定位代码。修复要保证所有路径（包括异常路径）都调用 close()，最佳实践是用 try-with-resources。内核参数无法解决，必须改代码。

## 参考资料

- [RFC 793 — TCP, Section 3.5 Closing a Connection](https://datatracker.ietf.org/doc/html/rfc793#section-3.5)
- [Linux ss 命令文档](https://man7.org/linux/man-pages/man8/ss.8.html)
