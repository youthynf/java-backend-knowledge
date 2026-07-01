# TCP 粘包问题如何解决

## 核心概念

"粘包"不是 TCP 的 bug，而是 TCP 面向字节流的必然结果。TCP 不知道应用层消息的边界，发送方两次 write() 的数据可能合并成一个 TCP 段发出（粘包），也可能一次 write() 的数据被拆成多个段（拆包）。解决粘包本质是**应用层自己定义消息边界**。

## 标准回答

粘包/拆包是应用层视角的现象，TCP 本身没有这个问题——它只是按字节流传数据。解决方法有三种：

1. **固定长度**：每条消息固定 N 字节，不足补齐。简单但浪费带宽。
2. **特殊分隔符**：消息间用 `\r\n` 等特殊字符分隔，内容中出现的分隔符需转义。HTTP、Redis 协议用此方案。
3. **长度前缀（TLV/LV）**：包头固定长度，含一个长度字段，告诉接收方后续数据多长。最常用，Dubbo、gRPC、自定义协议都用此方案。

## 详细机制

### 粘包/拆包的三种典型场景

```
发送方两次 write: "ABC" 和 "DEF"

场景 1：粘包（一个 TCP 段）
接收方 read 一次得到 "ABCDEF"

场景 2：拆包（两个 TCP 段）
接收方 read 第一次得到 "ABC"，第二次得到 "DEF"

场景 3：混合
接收方 read 第一次得到 "ABCDE"，第二次得到 "F"
```

### 三种解决方案

**方案 1：固定长度**
```java
// 每条消息 8 字节，不足补 0
byte[] msg = "ABC".getBytes();
byte[] buf = new byte[8];
System.arraycopy(msg, 0, buf, 0, msg.length);
out.write(buf);
```

**方案 2：特殊分隔符**
```
HTTP/1.1 200 OK\r\n
Content-Length: 5\r\n
\r\n
Hello
```
分隔符是 `\r\n\r\n`（空行表示头部结束）。`Content-Length` 决定 body 长度。

**方案 3：长度前缀（最常用）**

```
+--------+--------+
| Length |  Data  |
| 4 byte | N byte |
+--------+--------+
```

Netty 中的实现：

```java
// 解码器：自动按长度切分
pipeline.addLast(new LengthFieldBasedFrameDecoder(
    1024 * 1024,  // 最大帧长 1 MB
    0,             // 长度字段偏移
    4,             // 长度字段 4 字节
    0,             // 长度调整
    4              // 跳过长度字段本身
));
// 编码器：自动加长度前缀
pipeline.addLast(new LengthFieldPrepender(4));
```

### Netty 内置拆包器

| 拆包器 | 用途 |
|--------|------|
| `FixedLengthFrameDecoder` | 固定长度 |
| `DelimiterBasedFrameDecoder` | 特殊分隔符 |
| `LengthFieldBasedFrameDecoder` | 长度前缀（最常用） |
| `LineBasedFrameDecoder` | 换行符分隔 |

## 代码示例

完整可运行的长度前缀协议：

```java
import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import io.netty.handler.codec.LengthFieldPrepender;

public class Server {
    public static void main(String[] args) throws Exception {
        EventLoopGroup boss = new NioEventLoopGroup(1);
        EventLoopGroup worker = new NioEventLoopGroup();
        try {
            ServerBootstrap b = new ServerBootstrap();
            b.group(boss, worker)
             .channel(NioServerSocketChannel.class)
             .childHandler(new ChannelInitializer<SocketChannel>() {
                 @Override
                 protected void initChannel(SocketChannel ch) {
                     ChannelPipeline p = ch.pipeline();
                     // 解码：4 字节长度前缀
                     p.addLast(new LengthFieldBasedFrameDecoder(1024 * 1024, 0, 4, 0, 4));
                     // 编码：自动加 4 字节长度前缀
                     p.addLast(new LengthFieldPrepender(4));
                     p.addLast(new SimpleChannelInboundHandler<byte[]>() {
                         @Override
                         protected void channelRead0(ChannelHandlerContext ctx, byte[] msg) {
                             System.out.println("Recv: " + new String(msg));
                         }
                     });
                 }
             });
            b.bind(8080).sync().channel().closeFuture().sync();
        } finally {
            boss.shutdownGracefully();
            worker.shutdownGracefully();
        }
    }
}
```

## 实战场景

| 场景 | 方案 | 注意点 |
|------|------|--------|
| HTTP 1.1 | Content-Length 或 chunked 编码 | 流式响应用 chunked |
| gRPC | Protobuf + HTTP/2 帧 | HTTP/2 自带帧边界，无粘包问题 |
| Dubbo | 长度前缀 + 协议头 | 协议头含魔数、请求 ID 等 |
| Redis | 行分隔（\r\n） | 大 value 用 `$N\r\n` 标长度 |
| MQTT | 长度前缀（变长编码） | 长度字段用 7-bit 编码省空间 |

## 深挖追问

**Q1：UDP 有粘包问题吗？**
没有。UDP 面向报文，一次 sendto 对应一次 recvfrom，保留消息边界。应用层看到的就是发送方写入的整包。

**Q2：粘包是 TCP 的 bug 吗？**
不是。TCP 设计目标就是字节流，应用层自己定义边界是合理分工。如果 TCP 强制保留消息边界，就和 UDP 没区别了。

**Q3：HTTP/2 有粘包吗？**
没有。HTTP/2 把数据切成帧（Frame），每帧有长度字段和流 ID，本身就是带边界的协议，不需要应用层再处理。

**Q4：长度前缀用大端还是小端？**
协议自定义。网络协议传统用大端（如 IP/TCP），但应用层协议可以自己定义。Java 用 `ByteBuffer.order(ByteOrder.BIG_ENDIAN)` 显式指定。

**Q5：长度字段本身被拆包了怎么办？**
解码器要处理半包问题。Netty 的 `LengthFieldBasedFrameDecoder` 内部会等够 4 字节长度字段，再等够 N 字节数据，否则缓冲等待。

## 易错点

- **"粘包是 TCP 协议 bug"** — 不是，是字节流的固有特性。
- **"TCP_NODELAY 能解决粘包"** — 不能。Nagle 只影响发包时机，不影响消息边界。
- **"read 一次 = 一次 write"** — 错。TCP 是字节流，read 返回的字节数和 write 次数无关。
- **"长度前缀只 4 字节就够"** — 大文件可能不够，需要 8 字节或变长编码。
- **"分隔符就是 \n"** — 不一定，要选数据中不会出现的字符，或转义。

## 总结

粘包是字节流协议的必然现象，解决方案就是应用层自定义消息边界：固定长度、分隔符、长度前缀三选一。生产中最常用的是长度前缀（LV/TLV 格式），Netty 的 `LengthFieldBasedFrameDecoder` 是标准实现。HTTP/2、gRPC 等现代协议本身就有帧边界，应用层无需再处理。

## 参考资料

- [Netty LengthFieldBasedFrameDecoder 文档](https://netty.io/4.1/api/io/netty/handler/codec/LengthFieldBasedFrameDecoder.html)
- [RFC 2616 — HTTP/1.1 Message Length](https://datatracker.ietf.org/doc/html/rfc2616#section-4.4)
