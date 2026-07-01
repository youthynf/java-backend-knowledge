# Tomcat

Tomcat 是 Apache 软件基金会的开源 Java Servlet 容器，实现了 Servlet、JSP、WebSocket 规范。通过分层容器模型（Server/Service/Connector/Engine/Host/Context/Wrapper）提供 Web 服务能力。Spring Boot 默认内嵌 Tomcat，是 Java Web 最常用的运行容器。

## 目录

- [Tomcat 是什么](Tomcat是什么？.md) — 分层容器、Connector/Container、线程模型、调优
- [Tomcat 的类加载机制是怎么样的](Tomcat的类加载机制是怎么样的？.md) — 多级 ClassLoader、应用隔离、热部署

## 核心要点

- **分层容器**：Server → Service → Connector + Engine → Host → Context → Wrapper。
- **Connector**：网络通信层，支持 HTTP/1.1、HTTP/2、AJP 协议，NIO（默认）/NIO2/APR 模型。
- **Container**：请求处理层，按 Engine → Host → Context → Wrapper 找到对应 Servlet。
- **线程模型**：Master-Slave Reactor，Poller 线程轮询事件，Worker 线程池处理请求。
- **类加载**：每个 Web 应用独立 WebappClassLoader，优先加载 WEB-INF/classes 和 WEB-INF/lib，打破双亲委派实现应用隔离。
- **调优参数**：`maxThreads`、`acceptCount`、`maxConnections`、`connectionTimeout`、`minSpareThreads`。
