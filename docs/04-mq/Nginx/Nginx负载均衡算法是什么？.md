# Nginx 负载均衡算法是什么

## 核心概念

负载均衡把网络流量或一组任务按某种算法合理分配给各个处理节点，使节点得到平等使用并及时可靠地返回结果。Nginx 作为反向代理和七层负载均衡入口，其负载均衡算法决定请求如何分发到 upstream 后端实例。

理解负载均衡前先区分正向代理和反向代理。**正向代理代理的是客户端**，位于用户设备和互联网之间，真实客户端对服务器不可见，主要用于保护客户端、隐藏客户端 IP、解决访问限制。**反向代理代理的是服务端**，接受客户端请求转发给后端服务器再把结果返回给客户端，主要用于保护服务端隐私、隐藏真实 IP、负载均衡、缓存、SSL 卸载。助记：正向代理代理客户端，反向代理代理服务端。

## 标准回答

Nginx 负载均衡算法分静态和动态两类：

- **轮询（默认）**：请求按顺序轮换分发，适合后端能力相近的无状态服务。
- **加权轮询（weight）**：按权重分配流量，机器配置不同时用。
- **ip_hash**：按客户端 IP 哈希固定到同一后端，实现会话粘滞，但易流量倾斜。
- **least_conn**：分发到并发连接最少的后端，适合长连接或请求耗时差异大的场景。
- **hash（一致性哈希）**：按指定 key（URL、header 等）哈希，适合缓存命中和按 key 路由。

生产中还要配置健康检查、失败摘除、连接/读写超时、限流、熔断降级和日志监控。会话保持更推荐服务无状态化把 Session 放 Redis/JWT，避免 ip_hash 导致扩缩容困难。

## 正向代理 vs 反向代理

| 维度 | 正向代理 | 反向代理 |
|------|----------|----------|
| 代理对象 | 客户端 | 服务端 |
| 客户端感知 | 知道代理存在 | 不知道代理存在 |
| 服务端感知 | 看不到真实客户端 | 看到的是反向代理 |
| 典型用途 | 翻墙、隐藏客户端 IP、访问控制 | 负载均衡、隐藏服务端 IP、缓存、SSL 卸载 |
| 典型产品 | Squid、Shadowsocks | Nginx、HAProxy、F5 |

## 负载均衡算法

### 轮询（Round Robin，默认）

客户端请求按顺序轮换分发到不同服务实例。要求服务无状态。

```nginx
upstream backend {
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
    server 192.168.1.12:8080;
}
```

### 加权轮询（weight）

指定每个服务的权重，权重高的服务处理更多请求。机器配置不同时用。

```nginx
upstream backend {
    server 192.168.1.10:8080 weight=3;  # 30% 流量
    server 192.168.1.11:8080 weight=2;  # 20% 流量
    server 192.168.1.12:8080 weight=5;  # 50% 流量
}
```

### ip_hash（会话粘滞）

对客户端 IP 应用哈希函数，同一 IP 的请求始终路由到同一后端。适合客户端操作有连续性的场景（Session 绑定）。

```nginx
upstream backend {
    ip_hash;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}
```

缺点：流量倾斜（大量用户 NAT 出口 IP 相同会集中到一台）；后端扩缩容后哈希映射变化；不是真正的负载均衡。更推荐把 Session 外置到 Redis。

### least_conn（最少连接）

新请求发送到并发连接最少的服务节点。适合长连接或请求耗时差异大的场景（如文件下载、WebSocket）。

```nginx
upstream backend {
    least_conn;
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}
```

### hash（一致性哈希）

对指定 key（URL、arg、header 等）应用哈希函数，路由到对应后端。适合缓存命中（同一 URL 命中同一缓存节点）和按 key 路由。

```nginx
upstream backend {
    hash $request_uri consistent;  # 按 URL 一致性哈希
    server 192.168.1.10:8080;
    server 192.168.1.11:8080;
}
```

`consistent` 参数使用一致性哈希算法，后端增删时只有部分 key 重新映射，减少缓存失效。

### 算法对比

| 算法 | 类型 | 适用场景 | 缺点 |
|------|------|----------|------|
| 轮询 | 静态 | 后端能力相近、无状态 | 不考虑实际负载 |
| 加权轮询 | 静态 | 后端配置不同 | 权重需手动调整 |
| ip_hash | 静态 | 会话粘滞 | 流量倾斜、扩容困难 |
| least_conn | 动态 | 长连接、耗时差异大 | 需实时统计连接数 |
| hash | 静态 | 缓存命中、按 key 路由 | 后端变化影响部分 key |

## 限流

Nginx 限流基于漏桶算法，主要两个指令：

### limit_req（请求速率限流）

```nginx
# 定义限流维度：按客户端 IP，每秒 10 个请求（burst 桶大小 20）
limit_req_zone $binary_remote_addr zone=req_limit:10m rate=10r/s;

server {
    location /api/ {
        limit_req zone=req_limit burst=20 nodelay;
        proxy_pass http://backend;
    }
}
```

- `rate=10r/s`：平均每秒 10 个请求。
- `burst=20`：允许突发 20 个请求排队。
- `nodelay`：突发请求立即处理不延迟，超过则拒绝。

### limit_conn（连接数限流）

```nginx
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

server {
    location /api/ {
        limit_conn conn_limit 10;  # 单 IP 最多 10 个并发连接
        proxy_pass http://backend;
    }
}
```

## 反向代理配置

完整的反向代理 + 负载均衡 + 超时 + 健康检查配置。

```nginx
upstream backend {
    least_conn;
    server 192.168.1.10:8080 max_fails=3 fail_timeout=30s;
    server 192.168.1.11:8080 max_fails=3 fail_timeout=30s;
    server 192.168.1.12:8080 max_fails=3 fail_timeout=30s backup;  # 备用，主全挂才启用
    keepalive 32;  # 到后端的长连接池
}

server {
    listen 80;
    server_name api.example.com;

    # 限流
    limit_req zone=req_limit burst=20 nodelay;

    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";  # 启用到后端长连接
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # 超时设置
        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;

        # 失败重试（注意非幂等请求的副作用）
        proxy_next_upstream error timeout http_502 http_503 http_504;
        proxy_next_upstream_tries 2;
    }
}
```

- `max_fails=3 fail_timeout=30s`：30 秒内失败 3 次则摘除 30 秒（被动健康检查）。
- `keepalive 32`：到后端保持 32 个长连接复用，避免频繁握手。
- `proxy_next_upstream`：失败时自动重试到下一个后端，注意非幂等请求（POST 扣款）重试可能造成重复。

## 四层 vs 七层负载均衡

| 维度 | 四层（L4） | 七层（L7） |
|------|-----------|-----------|
| 工作层 | 传输层（TCP/UDP） | 应用层（HTTP/HTTPS） |
| 路由依据 | IP + 端口 | URL、Header、Cookie、Host |
| 性能 | 高（不解析协议） | 略低（需解析 HTTP） |
| 灵活性 | 低 | 高（按 URL 路由、缓存、改写） |
| 典型产品 | LVS、F5、Nginx stream | Nginx http、HAProxy |

Nginx 既能做七层（`http` 模块）也能做四层（`stream` 模块，1.9+ 支持）。

## 实战场景

| 场景 | 算法/配置 | 注意点 |
|------|-----------|--------|
| 电商 API 网关 | 加权轮询 + 健康检查 | 非幂等请求谨慎重试 |
| WebSocket 长连接 | least_conn | 避免连接集中到少数节点 |
| 静态资源缓存 | hash $request_uri consistent | 提升缓存命中率 |
| 灰度发布 | 按权重把 5% 流量切新版本 | 监控 5xx 自动摘除或回滚 |
| 文件下载 | least_conn | 大文件长连接不集中 |
| 限流防刷 | limit_req + limit_conn | 突发流量用 burst 缓冲 |

## 深挖追问

### 会话保持一定要 ip_hash 吗？

不推荐。ip_hash 会牺牲负载均衡效果（流量倾斜），且 NAT 出口 IP 相同的多个用户会集中到一台后端。更推荐服务无状态化，把 Session 放 Redis 或用 JWT，避免负载均衡绑定导致扩缩容困难。

### Nginx 重试有什么坑？

非幂等请求（POST 下单、扣款）被重试可能造成重复下单/扣款。`proxy_next_upstream` 默认对 GET/HEAD/PUT 等幂等方法重试，对非幂等方法需谨慎配置。生产中核心交易接口建议关闭自动重试，由业务层处理失败。

### 如何做灰度发布？

几种方式：

- **按权重**：`weight` 把部分流量导向新版本，逐步调整。
- **按 header/cookie**：`map` 指令按自定义 header 路由到不同 upstream。
- **按用户 ID hash**：取用户 ID 哈希，按比例路由到新版本。

```nginx
map $http_x_user_id $upstream_pool {
    default backend_stable;
    "~^[0-9]{1,2}$" backend_canary;  # 用户 ID 末两位小数进入灰度
}
```

### 四层负载均衡和七层区别？

四层工作在传输层，按 IP+端口转发，不解析协议，性能高但灵活性低（LVS、F5）。七层工作在应用层，按 URL/Header/Cookie 路由，可缓存、改写、限流，灵活但性能略低（Nginx、HAProxy）。Nginx 1.9+ 通过 `stream` 模块也支持四层。

### Nginx 健康检查怎么做？

开源版 Nginx 是被动检查：`max_fails` + `fail_timeout`，请求失败达到阈值才摘除。NGINX Plus（商业版）支持主动健康检查，定时探测后端状态主动摘除。开源方案可用 `nginx_upstream_check_module` 第三方模块或配合 Consul/网关做主动检查。

## 易错点

- **非幂等请求开自动重试**：POST 扣款、下单重试造成重复，核心交易应关闭 `proxy_next_upstream`。
- **ip_hash 当状态管理首选**：流量倾斜、扩容困难，应优先无状态化 + Redis Session。
- **超时配置不合理**：`proxy_read_timeout` 过短导致大文件下载被切断，过长导致雪崩；需结合业务 RT 设置。
- **只看 Nginx 指标忽略业务**：Nginx 只能感知代理层状态（5xx、超时），业务是否成功还需应用监控。
- **limit_req burst 配置不当**：burst 过小无法缓冲突发，过大失去限流效果；nodelay 让突发立即处理，超过则拒绝。
- **四层七层混淆**：四层无法按 URL 路由，需要 URL 路由必须用七层。

## 总结

Nginx 负载均衡算法分静态（轮询、加权轮询、ip_hash、hash）和动态（least_conn）两类。轮询适合后端能力相近的无状态服务；加权轮询按机器配置分配流量；ip_hash 实现会话粘滞但易流量倾斜；least_conn 适合长连接或耗时差异大场景；hash 适合缓存命中和按 key 路由。生产中还要配置健康检查、失败摘除、超时、限流、重试（注意幂等性）。会话保持优先无状态化 + Redis Session，避免 ip_hash 绑定。Nginx 既支持七层（http）也支持四层（stream）负载均衡。

## 参考资料

- [Nginx HTTP Load Balancing](https://nginx.org/en/docs/http/load_balancing.html)
- [Nginx ngx_http_upstream_module](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [Nginx limit_req Module](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)
- [Nginx Stream Module](https://nginx.org/en/docs/stream/ngx_stream_core_module.html)
