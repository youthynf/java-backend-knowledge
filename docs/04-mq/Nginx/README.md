# Nginx

Nginx 是开源的高性能 HTTP 服务器、反向代理和负载均衡器，由 Igor Sysoev 用 C 语言编写。核心特点是事件驱动（epoll/kqueue）+ 多进程（Master-Worker）+ 异步非阻塞 IO，单机可支撑数万到数十万并发连接。常作为反向代理、七层负载均衡、静态资源服务、API 网关入口。

## 目录

- [Nginx 负载均衡算法是什么](Nginx负载均衡算法是什么？.md) — 正向/反向代理、轮询/加权/IP Hash/最少连接、限流与调优

## 核心要点

- **进程模型**：Master 进程管理 Worker，Worker 进程处理请求，单 Worker 处理数千连接。
- **事件驱动**：基于 epoll（Linux）/kqueue（BSD），异步非阻塞 IO，单 Worker 可处理数千连接。
- **模块化**：`events`（事件模块）、`http`（HTTP 模块）、`stream`（四层代理）、`mail`（邮件）等。
- **负载均衡**：默认轮询，支持加权轮询、ip_hash、least_conn、hash（一致性哈希）。
- **限流**：`limit_req`（请求速率）、`limit_conn`（连接数），基于漏桶算法。
- **健康检查**：开源版被动检查（失败摘除），NGINX Plus 主动健康检查。
