# 既然有 HTTP 为什么还需要 WebSocket

## 核心概念

HTTP 是请求-响应模型，只能客户端发起请求、服务端响应，服务端无法主动推送。需要服务端推送的场景（如 IM、实时行情、协作编辑），HTTP 只能用轮询（低效）或长轮询（复杂）模拟。WebSocket 是基于 TCP 的全双工通信协议，通过 HTTP Upgrade 握手建立连接后，双方可随时双向发送消息，适合实时双向通信。

## 标准回答

HTTP 的局限：

- 请求-响应模型，服务端无法主动推送
- 模拟推送只能用轮询（每秒查询，浪费资源）或长轮询（连接保持，复杂）
- 头部开销大，每次请求都带完整头部

WebSocket 的优势：

- 全双工：双方随时可发消息
- 低延迟：建连后无需重复握手
- 低开销：帧头部仅 2-10 字节（vs HTTP 头部数百字节）
- 持久连接：一次建立，长期复用

适用场景：IM、实时游戏、协作编辑、股票行情、推送通知。不适合普通请求-响应（HTTP 更简单）。

## 详细机制

### HTTP 模拟推送的问题

#### 短轮询

客户端每隔几秒发一次请求：

```javascript
setInterval(() => {
    fetch('/api/messages').then(res => res.json()).then(msgs => {
        if (msgs.length) showMessages(msgs);
    });
}, 2000);   // 每 2 秒查一次
```

问题：

- 大量空响应（无新消息时仍发请求）
- 延迟高（消息最多等 2 秒才被拉取）
- 浪费带宽和服务器资源

#### 长轮询

客户端发请求，服务端 hold 住直到有消息或超时：

```javascript
function longPoll() {
    fetch('/api/messages?wait=30').then(res => res.json()).then(msgs => {
        showMessages(msgs);
        longPoll();   // 立即发起下一次
    });
}
```

服务端实现：

```java
@GetMapping("/api/messages")
public DeferredResult<List<Message>> getMessages(@RequestParam(defaultValue="30") int wait) {
    DeferredResult<List<Message>> result = new DeferredResult<>(wait * 1000L);
    messageQueue.subscribe(messages -> {
        result.setResult(messages);
    });
    return result;
}
```

问题：

- 服务端需维护等待中的请求
- 每次消息都要重新建立 HTTP 请求（开销）
- 复杂、易出错

### WebSocket 工作流程

#### 1. 建立连接（HTTP Upgrade）

```
Client → Server: HTTP 请求，带 Upgrade 头
GET /ws HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

Server → Client: 101 Switching Protocols
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

服务端用客户端的 `Sec-WebSocket-Key` + 固定 GUID 计算 SHA-1，返回 `Sec-WebSocket-Accept`，客户端验证后建立连接。

#### 2. 双向通信

```
Client ←→ Server: WebSocket 帧
  - 文本帧（opcode 1）：UTF-8 文本
  - 二进制帧（opcode 2）：二进制数据
  - 关闭帧（opcode 8）：关闭连接
  - Ping/Pong 帧（opcode 9/10）：心跳
```

帧头部仅 2-10 字节，比 HTTP 头部小得多。

#### 3. 关闭连接

任一方发关闭帧，另一方回关闭帧，连接关闭。

### WebSocket 帧结构

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|F|R|R|R| opcode|M| Payload len |    Extended payload length    |
|I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
|N|V|V|V|       |S|             |   (if payload len==126/127)   |
| |1|2|3|       |K|             |                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|     Extended payload length continued, if payload len == 127  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                               |Masking-key, if MASK set to 1  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Masking-key (continued)       |          Payload Data         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

字段：

- **FIN**：是否最后一帧
- **opcode**：帧类型（0 续帧、1 文本、2 二进制、8 关闭、9 Ping、10 Pong）
- **MASK**：客户端发送的帧必须掩码
- **Payload length**：数据长度
- **Payload Data**：实际数据

### WebSocket vs HTTP 轮询对比

| 维度 | 短轮询 | 长轮询 | SSE | WebSocket |
|------|--------|--------|-----|-----------|
| 通信方向 | 单向（客户端拉） | 单向 | 单向（服务端推） | 双向 |
| 延迟 | 高（轮询间隔） | 中 | 低 | 低 |
| 复杂度 | 简单 | 中 | 简单 | 中 |
| 资源开销 | 高（频繁请求） | 中 | 低 | 低 |
| 浏览器支持 | 全部 | 全部 | 大部分 | 大部分 |
| 代理/防火墙 | 友好 | 友好 | 友好 | 可能有问题 |

### SSE（Server-Sent Events）

SSE 是 HTTP 的扩展，服务端可单向推送：

```
GET /events HTTP/1.1
Accept: text/event-stream

HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"msg":"hello"}

data: {"msg":"world"}
```

SSE 简单但只能服务端推。如果只需服务端推送（如通知），SSE 比 WebSocket 简单。

### 抓包与调试

```bash
# WebSocket 握手抓包
$ tcpdump -i any -A 'tcp port 80 and host example.com'
GET /ws HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

# 后续是 WebSocket 二进制帧
# 用 wscat 测试
$ wscat -c ws://example.com/ws
> hello
< world
```

## 代码示例

Java WebSocket 服务端（JSR 356）：

```java
import javax.websocket.*;
import javax.websocket.server.*;

@ServerEndpoint("/ws")
public class ChatEndpoint {

    @OnOpen
    public void onOpen(Session session) {
        System.out.println("Connected: " + session.getId());
    }

    @OnMessage
    public void onMessage(String message, Session session) {
        System.out.println("Received: " + message);
        // 广播给所有连接
        for (Session s : session.getOpenSessions()) {
            s.getAsyncRemote().sendText("Echo: " + message);
        }
    }

    @OnClose
    public void onClose(Session session) {
        System.out.println("Closed: " + session.getId());
    }

    @OnError
    public void onError(Throwable t) {
        t.printStackTrace();
    }
}
```

JavaScript 客户端：

```javascript
const ws = new WebSocket('ws://example.com/ws');

ws.onopen = () => {
    console.log('Connected');
    ws.send('Hello');
};

ws.onmessage = (event) => {
    console.log('Received:', event.data);
};

ws.onclose = () => {
    console.log('Disconnected');
    // 自动重连
    setTimeout(() => location.reload(), 5000);
};

ws.onerror = (err) => {
    console.error('Error:', err);
};
```

Spring Boot WebSocket 配置：

```java
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new ChatHandler(), "/ws")
            .setAllowedOrigins("*");
    }
}

@Component
public class ChatHandler extends TextWebSocketHandler {
    private final List<WebSocketSession> sessions = new CopyOnWriteArrayList<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        for (WebSocketSession s : sessions) {
            if (s.isOpen()) {
                s.sendMessage(new TextMessage("Echo: " + message.getPayload()));
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
    }
}
```

STOMP over WebSocket（订阅模型）：

```java
@Configuration
@EnableWebSocketMessageBroker
public class StompConfig implements WebSocketMessageBrokerConfigurer {
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }
}

@Controller
public class ChatController {
    @MessageMapping("/chat")
    @SendTo("/topic/messages")
    public String chat(String message) {
        return "Echo: " + message;
    }
}
```

## 实战场景

| 场景 | 选择 | 原因 |
|------|------|------|
| IM 聊天 | WebSocket | 双向实时 |
| 实时游戏 | WebSocket | 低延迟双向 |
| 协作编辑 | WebSocket | 双向同步 |
| 股票行情 | WebSocket 或 SSE | 实时推送 |
| 推送通知 | SSE | 单向推送 |
| 普通查询 | HTTP | 请求-响应 |
| 文件上传 | HTTP | multipart |

## 深挖追问

**Q1：WebSocket 一定能用吗？**
不一定。部分代理/防火墙不支持 Upgrade 头，会阻断 WebSocket。生产中常用 SockJS 等降级方案。

**Q2：WebSocket 怎么处理心跳？**
客户端定期发 Ping 帧，服务端回 Pong。长时间无响应判定连接死亡，主动断开重连。

**Q3：WebSocket 怎么做负载均衡？**
Nginx/HAProxy 支持 WebSocket 转发（基于 Upgrade 头识别）。粘滞会话或共享 Session 存储。

**Q4：WebSocket 和 gRPC 双向流哪个好？**
浏览器场景用 WebSocket（原生支持），内部服务用 gRPC 双向流（更高效、强类型）。

**Q5：WebSocket 连接数有限制吗？**
单服务端可维持数万连接（受 fd 和内存限制）。大规模需用 Netty 等异步框架 + 集群部署。

## 易错点

- **"WebSocket 是 HTTP 的扩展"** — 不，仅握手用 HTTP，之后是独立协议。
- **"WebSocket 不能跨域"** — 可以，但需 CORS 配置。
- **"WebSocket 一定比 HTTP 快"** — 实时双向场景快，单次请求-响应 HTTP 更简单。
- **"WebSocket 不需要心跳"** — 需要，NAT/防火墙会清空闲连接。
- **"WebSocket 不能加密"** — 可以，用 wss://（WebSocket over TLS）。

## 总结

WebSocket 是基于 TCP 的全双工通信协议，通过 HTTP Upgrade 握手建立连接后双方可随时双向发送消息。适合 IM、实时游戏、协作编辑等场景。HTTP 轮询模拟推送效率低、复杂度高，WebSocket 是更好的方案。生产中要注意心跳、断线重连、负载均衡、代理兼容性。普通请求-响应仍用 HTTP 更简单。

## 参考资料

- [RFC 6455 — The WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)
- [MDN — WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [JSR 356 — Java API for WebSocket](https://www.jcp.org/en/jsr/detail?id=356)
