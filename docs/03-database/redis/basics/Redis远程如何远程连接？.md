# Redis 如何远程连接？

## 核心概念

Redis 远程连接看起来只是 `redis-cli -h host -p port`，但生产环境真正考点不是“命令怎么写”，而是**如何安全地开放访问**。

一句话回答：**远程连接 Redis 需要确认 Redis 监听地址、端口、防火墙/安全组、认证方式、网络连通性；生产环境不要把 Redis 直接暴露到公网，应通过内网、VPN、堡垒机或 SSH 隧道访问，并开启 ACL/TLS 等安全控制。**

## 面试官想考什么

1. 是否知道 `bind`、`protected-mode`、`requirepass`/ACL 的作用；
2. 是否知道 Redis 默认不应该公网暴露；
3. 是否能排查连接失败；
4. 是否了解 Redis 6 ACL、TLS、危险命令禁用等生产安全实践。

## 标准回答

### 1. 基本连接命令

```bash
redis-cli -h 192.168.1.10 -p 6379
```

如果设置了密码：

```bash
redis-cli -h 192.168.1.10 -p 6379 -a 'your_password'
```

Redis 6+ 使用 ACL 用户：

```bash
redis-cli -h 192.168.1.10 -p 6379 --user app_user -a 'your_password'
```

连接后验证：

```bash
PING
# PONG
```

### 2. 服务端监听配置

Redis 配置文件通常是 `redis.conf`。

```conf
bind 127.0.0.1 192.168.1.10
port 6379
protected-mode yes
```

说明：

- `bind` 控制 Redis 监听哪些网卡地址；
- 只本机访问时绑定 `127.0.0.1`；
- 内网访问时绑定内网 IP；
- 不建议直接 `bind 0.0.0.0` 暴露所有网卡，除非有严格防火墙和认证；
- `protected-mode yes` 能避免无密码且公网可达时被直接访问。

修改后重启：

```bash
systemctl restart redis
```

或：

```bash
redis-server /path/to/redis.conf
```

### 3. 认证配置

Redis 6 之前常见：

```conf
requirepass strong_password_here
```

Redis 6+ 推荐 ACL：

```conf
user default off
user app_user on >strong_password_here ~app:* +get +set +del +expire
```

含义：关闭默认用户，创建 `app_user`，只允许访问 `app:*` key，并限制命令范围。

### 4. 防火墙和安全组

即使 Redis 有密码，也不要直接暴露公网。至少要限制来源 IP：

```bash
# 示例：只允许应用服务器访问 6379
iptables -A INPUT -p tcp -s 10.0.0.20 --dport 6379 -j ACCEPT
iptables -A INPUT -p tcp --dport 6379 -j DROP
```

云服务器还要检查安全组、NACL、VPC 路由。

## 深挖追问

1. **为什么不建议直接 `bind 0.0.0.0`？** 因为 Redis 一旦监听所有网卡，只要安全组、防火墙或密码配置有漏洞，就可能被公网扫描利用；生产应优先绑定内网地址并限制来源。
2. **`protected-mode` 能替代密码吗？** 不能。它只是安全兜底，避免无密码且外部可达时被直接访问；真正的生产安全还需要 ACL/密码、网络隔离和最小权限。
3. **连接超时和连接拒绝有什么区别？** 连接拒绝通常是服务未监听或端口不对；超时更常见于防火墙、安全组、路由不通。
4. **Redis 6 ACL 相比 `requirepass` 的优势是什么？** ACL 可以按用户限制 key pattern 和命令权限，更适合多应用共享 Redis 或最小权限访问。

## 生产安全最佳实践

### 1. 优先内网访问

推荐访问方式：

```text
应用服务器 -> 内网 Redis
运维人员 -> VPN/堡垒机/SSH 隧道 -> Redis
```

不推荐：

```text
公网 -> Redis:6379
```

### 2. 使用 SSH 隧道临时排查

如果 Redis 只监听内网，可以通过跳板机建立隧道：

```bash
ssh -L 6379:127.0.0.1:6379 user@redis-host
redis-cli -h 127.0.0.1 -p 6379
```

### 3. 开启 TLS

对跨网络访问，建议使用 TLS：

```bash
redis-cli --tls -h redis.example.com -p 6380 \
  --cert client.crt --key client.key --cacert ca.crt
```

具体配置取决于 Redis 版本和部署方式。

### 4. 限制高危命令

生产环境可以禁用或重命名危险命令：

```conf
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG ""
```

Redis 6+ 更推荐通过 ACL 精细控制命令权限。

## 常见连接失败排查

### 1. 连接被拒绝

```bash
redis-cli -h 192.168.1.10 -p 6379
# Could not connect: Connection refused
```

排查：

- Redis 是否启动：`systemctl status redis`；
- 是否监听端口：`ss -lntp | grep 6379`；
- `bind` 是否只绑定了 `127.0.0.1`；
- 端口是否写错。

### 2. 连接超时

通常是网络、防火墙、安全组问题：

```bash
nc -vz 192.168.1.10 6379
```

检查来源 IP 是否被允许，云安全组是否放行。

### 3. NOAUTH Authentication required

说明服务端开启了认证，需要带密码或 ACL 用户：

```bash
AUTH app_user your_password
```

### 4. DENIED Redis is running in protected mode

说明 Redis 认为当前处于不安全暴露状态。正确做法不是简单关闭 protected-mode，而是配置 bind、密码、ACL、防火墙。

## 易错点

- 不要为了远程连接直接 `protected-mode no` + `bind 0.0.0.0`；
- 不要把 Redis 6379 暴露公网；
- 密码不能写在 shell 历史中，生产建议使用配置文件或环境变量；
- Redis 密码不等于安全，仍然需要网络隔离；
- 主从、哨兵、Cluster 还要额外开放对应节点和总线端口。

## 总结

Redis 远程连接的命令很简单，但生产重点是安全：监听内网地址、开启 ACL/密码、限制来源 IP，必要时使用 TLS、VPN、堡垒机或 SSH 隧道。面试时不要只回答 `redis-cli -h -p -a`，要主动补充 `bind`、`protected-mode`、ACL、防火墙和公网暴露风险。

---

## 面试版详细讲解

### 核心概念

这道题属于 **Redis 基础** 的高频考点，核心要抓住：内存 KV、网络连接、协议、与 Memcache 对比。Redis 不只是缓存，还支持丰富数据类型、持久化、Lua、事务、发布订阅、Stream 和集群；远程连接要关注绑定地址、认证、TLS/内网和慢命令。

### 面试官想考什么

面试官通常不是只想听定义，而是想确认你能否说明：数据结构丰富度、持久化、集群、高可用、客户端连接安全；还能否把它和真实业务里的性能、可靠性、可维护性联系起来。

### 标准回答

Redis 不只是缓存，还支持丰富数据类型、持久化、Lua、事务、发布订阅、Stream 和集群；远程连接要关注绑定地址、认证、TLS/内网和慢命令。

答题时建议用“三段式”：

1. 先给结论，明确适用前提；
2. 再解释底层机制或执行过程；
3. 最后补充业务取舍、风险点和排查手段。

### 深挖追问

- 这个结论在高并发或大数据量下是否仍然成立？
- 它依赖哪些版本、配置、索引/编码或业务一致性要求？
- 线上异常时应该看哪些命令、日志、指标或执行计划？

### 示例 / 实战场景

生产 Redis 不应裸露公网；连接池要设置超时、最大连接数和重试策略。

```bash
# 先小范围验证命令复杂度和返回量，避免线上直接扫大 key
redis-cli --scan --pattern 'biz:*' | head
redis-cli --bigkeys
```

### 易错点

- 只背概念，不说明适用场景、代价和边界。
- 忽略数据量、并发量、版本差异和线上配置，给出绝对化结论。
- 没有把问题落到可观测手段：执行计划、慢日志、监控指标、客户端超时或错误日志。

### 一句话总结

这类题的面试核心不是“知道名词”，而是能说清 **机制 + 取舍 + 落地排查**。先给稳定结论，再讲底层原因，最后结合业务场景说明如何使用和如何避免坑。

