# HTTP、Socket 和 GET 的区别是什么

## 核心概念

HTTP、Socket、GET 是三个不同层面的概念，常被混淆。HTTP 是应用层协议，定义请求-响应的报文格式；Socket 是操作系统提供的网络编程接口，是 TCP/UDP 的封装；GET 是 HTTP 协议中的一个请求方法。三者关系是"协议 vs 接口 vs 协议内方法"，不在一个维度上。

## 标准回答

三者对比：

| 概念 | 层次 | 性质 | 用途 |
|------|------|------|------|
| HTTP | 应用层 | 协议 | 定义报文格式和请求-响应规则 |
| Socket | 传输层之上 | 编程接口 | OS 提供的使用 TCP/UDP 的 API |
| GET | HTTP 协议内 | 请求方法 | 描述"获取资源"的语义 |

简单说：**HTTP 是协议规范，Socket 是编程接口，GET 是 HTTP 协议里的一个动作**。

## 详细机制

### HTTP 是协议

HTTP（HyperText Transfer Protocol）是应用层协议，定义了：

- 报文格式（请求行/状态行 + 头部 + 空行 + 正文）
- 请求方法（GET/POST/PUT/DELETE 等）
- 状态码（200/404/500 等）
- 头部字段语义（Host、Content-Type 等）
- 连接管理（keep-alive、chunked 等）

HTTP 协议本身不规定如何传输，它依赖下层 TCP 提供可靠字节流。

### Socket 是接口

Socket 是操作系统提供的网络编程 API，是"传输层接口的封装"：

```c
// BSD Socket API（Linux/Unix/Windows 通用）
int fd = socket(AF_INET, SOCK_STREAM, 0);   // 创建 TCP socket
connect(fd, ...);                            // 连接服务端
send(fd, data, len, 0);                      // 发数据
recv(fd, buf, len, 0);                       // 收数据
close(fd);                                   // 关闭
```

Socket 不是协议，是"使用 TCP/UDP 的编程接口"。一个 Socket 对应一个五元组（协议、源 IP、源端口、目的 IP、目的端口）。

Java 中的 Socket 类：

```java
import java.net.*;

// TCP Socket
Socket socket = new Socket("example.com", 80);
OutputStream out = socket.getOutputStream();
out.write("GET / HTTP/1.1\r\nHost: example.com\r\n\r\n".getBytes());

// UDP Socket
DatagramSocket udpSocket = new DatagramSocket();
DatagramPacket packet = new DatagramPacket(...);
udpSocket.send(packet);
```

### GET 是 HTTP 方法

GET 是 HTTP 协议定义的请求方法之一，语义是"获取资源"：

```
GET /api/users/1 HTTP/1.1
Host: api.example.com
```

GET 与 POST、PUT、DELETE 等并列，都是 HTTP 协议内的方法。详见 `HTTP协议支持的请求方法有哪些？`。

### 三者关系

```
应用层:    HTTP（协议，定义报文和方法如 GET）
              ↓
              HTTP 客户端用 Socket 发送 HTTP 报文
              ↓
传输层:    TCP（协议，提供可靠字节流）
              ↓
              应用层通过 Socket API 使用 TCP
              ↓
网络层:    IP
```

具体来说：

```
HTTP 客户端代码
  ↓ 调用 Socket API
  ↓ socket.connect(...); socket.send("GET / HTTP/1.1\r\n...")
  ↓
内核 TCP 协议栈
  ↓ 加 TCP 头、IP 头
  ↓
网卡发出
```

HTTP 客户端（浏览器、curl、HttpClient）底层都用 Socket API 发送 HTTP 报文。Socket 是"管道"，HTTP 报文是"管道里流的水"，GET 是"水里的一种鱼"。

### 类比理解

- HTTP 像"邮件格式标准"（信封怎么写、内容怎么组织）
- Socket 像"邮局的窗口"（你通过窗口寄信）
- GET 像"挂号信、平信、特快"等不同类型

你不能拿"邮件格式"和"邮局窗口"比较，也不能拿"邮局窗口"和"挂号信"比较——它们不在一个维度。

### WebSocket 也是 Socket 吗？

WebSocket 名字带 Socket 但其实是应用层协议，建立在 HTTP 之上：

```
1. 客户端发 HTTP Upgrade 请求
   GET /ws HTTP/1.1
   Upgrade: websocket
   Connection: Upgrade

2. 服务端同意，101 Switching Protocols
   HTTP/1.1 101 Switching Protocols
   Upgrade: websocket

3. 后续在该 TCP 连接上用 WebSocket 帧通信
```

WebSocket 借用 HTTP 完成握手，之后切换为帧协议。和 Socket API 是两码事。

### 抓包示例

```bash
# 抓 HTTP 流量（底层是 TCP）
$ tcpdump -i any -n -A 'tcp port 80'
10:00:00 IP C.5000 > S.80: Flags [S], seq 1              # TCP 握手
10:00:00 IP S.80 > C.5000: Flags [S.], seq 2, ack 2
10:00:00 IP C.5000 > S.80: Flags [.], ack 2
10:00:00 IP C.5000 > S.80: Flags [P.], seq 2:50          # HTTP 报文（含 GET）
10:00:00 IP S.80 > C.5000: Flags [P.], seq 2:500, ack 50 # HTTP 响应

# 看到的就是 Socket（TCP 连接）上传输的 HTTP 报文（含 GET 方法）
```

## 代码示例

Java 用 Socket 手动发 HTTP 请求：

```java
import java.net.*;
import java.io.*;

public class HttpOverSocket {
    public static void main(String[] args) throws Exception {
        // 用 Socket API 建立 TCP 连接
        Socket socket = new Socket("example.com", 80);

        // 在 Socket 上发 HTTP 报文（含 GET 方法）
        OutputStream out = socket.getOutputStream();
        out.write("GET / HTTP/1.1\r\n".getBytes());       // 请求行（GET 方法）
        out.write("Host: example.com\r\n".getBytes());    // 头部
        out.write("Connection: close\r\n".getBytes());
        out.write("\r\n".getBytes());                     // 空行
        out.flush();

        // 在 Socket 上读 HTTP 响应
        BufferedReader in = new BufferedReader(
            new InputStreamReader(socket.getInputStream()));
        String line;
        while ((line = in.readLine()) != null) {
            System.out.println(line);
        }
        socket.close();
    }
}
```

Java HttpClient 封装了 Socket：

```java
import java.net.http.*;
import java.net.URI;

// HttpClient 底层也是用 Socket，但封装了 HTTP 协议细节
HttpClient client = HttpClient.newHttpClient();
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("http://example.com/"))
    .GET()                                  // GET 方法
    .build();
HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
// 不用手写 HTTP 报文，HttpClient 自动处理
```

## 实战场景

| 场景 | 用什么 | 原因 |
|------|-------|------|
| Web 应用 | HTTP 客户端（HttpClient、OkHttp） | 协议封装好，无需手写报文 |
| 自定义协议 | 直接用 Socket | 协议自定义，灵活 |
| 高性能 RPC | Netty（封装 Socket） | 事件驱动，避免线程阻塞 |
| 实时双向通信 | WebSocket | 全双工，比 HTTP 长轮询高效 |
| 简单数据查询 | HTTP GET | 标准、可缓存、易调试 |

## 深挖追问

**Q1：Socket 一定是 TCP 吗？**
不一定。Socket 是通用接口，支持 TCP（`SOCK_STREAM`）、UDP（`SOCK_DGRAM`）、原始套接字（`SOCK_RAW`）等。

**Q2：HTTP 一定要用 Socket 吗？**
应用层视角是。HTTP 客户端要用 Socket API 调用内核 TCP。但用户代码可以不直接用 Socket，用 HttpClient 等高层封装。

**Q3：Netty 和 Socket 什么关系？**
Netty 是 Java NIO 的封装，NIO 底层用 Socket。Netty 提供事件驱动、零拷贝、编解码等高级特性，但本质仍是 Socket 编程。

**Q4：Unix Socket 是什么？**
Unix Domain Socket 是本机进程间通信（IPC）的 Socket，不走网络协议栈，性能比 TCP Socket 高。Redis、MySQL 本机连接常用。

**Q5：HTTP/3 还用 Socket 吗？**
HTTP/3 over QUIC over UDP，应用层仍通过 Socket API（UDP Socket）发包。QUIC 在用户态实现可靠性，不依赖内核 TCP。

## 易错点

- **"Socket 是协议"** — 不是，是编程接口。
- **"HTTP 和 Socket 是替代关系"** — 不是，HTTP 跑在 Socket 之上。
- **"GET 是 HTTP 协议本身"** — GET 是 HTTP 协议定义的请求方法之一。
- **"WebSocket 等于 Socket"** — 不，WebSocket 是应用层协议。
- **"Socket 只能跑 TCP"** — 不，UDP、原始套接字都行。

## 总结

HTTP 是应用层协议规范，Socket 是传输层编程接口，GET 是 HTTP 协议里的请求方法。三者层次不同，不是对比关系：HTTP 客户端通过 Socket API 调用 TCP 发送 HTTP 报文，报文中包含 GET 等方法。理解三者层次关系能避免面试中混淆回答，也是学习网络编程的基础。

## 参考资料

- [RFC 7230 — HTTP/1.1 Message Syntax and Routing](https://datatracker.ietf.org/doc/html/rfc7230)
- [BSD Sockets — Wikipedia](https://en.wikipedia.org/wiki/Berkeley_sockets)
- [Java Socket API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/net/Socket.html)
