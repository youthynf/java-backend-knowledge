# 使用 Tailscale 外网访问树莓派

## 核心概念

Tailscale 是基于 WireGuard 的组网工具，可以把多台设备加入同一个私有 Tailnet，实现跨网络安全访问。对树莓派来说，它适合在没有公网 IP、路由器不方便做端口映射、或希望避免暴露 SSH 到公网时使用。

Tailscale 的核心优势是：自动 NAT 穿透、设备身份认证、端到端加密、访问控制简单。常见用途包括远程 SSH 树莓派、访问树莓派上的 Web 服务、作为家庭内网入口。

## 面试官想考什么

- 是否理解 VPN、内网穿透、端口映射的区别；
- 是否知道 Tailscale 基于 WireGuard，默认是私有网络访问；
- 是否能说明为什么比直接暴露 SSH 更安全；
- 是否了解 ACL、MagicDNS、Subnet Router、Exit Node；
- 是否能排查设备不在线、端口不通、服务只监听本地等问题。

## 标准回答

> Tailscale 可以把树莓派和电脑/手机加入同一个私有网络，为每台设备分配 100.x 的 Tailscale IP，并通过 WireGuard 加密通信。这样即使树莓派没有公网 IP，也能从外网安全 SSH 或访问服务。相比路由器端口转发，Tailscale 不需要把 SSH 暴露到公网，安全边界由设备登录、ACL 和密钥控制。部署后要确保服务监听在正确地址，防火墙放行，必要时开启 MagicDNS 或 Subnet Router。

## 深挖追问

### Tailscale 和传统内网穿透有什么区别？

很多内网穿透工具通过中转服务器暴露一个公网入口；Tailscale 更像零配置 WireGuard VPN，优先点对点直连，无法直连时使用 DERP 中继。访问入口只对 Tailnet 内认证设备可见。

### MagicDNS 是什么？

MagicDNS 允许通过设备名访问节点，而不是记 100.x IP。例如树莓派设备名为 `raspberrypi`，可以用 `ssh pi@raspberrypi` 或访问 `http://raspberrypi:8080`。

### Subnet Router 有什么用？

Subnet Router 可以让树莓派代理访问其所在局域网的其他设备。例如把 `192.168.1.0/24` 宣告到 Tailnet 后，外部设备可通过 Tailscale 访问家中 NAS、路由器管理页等。开启时要谨慎配置 ACL。

## 实战场景/代码示例

### 安装和登录

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

查看状态：

```bash
tailscale status
tailscale ip -4
```

### 远程 SSH 树莓派

```bash
ssh pi@100.x.y.z
# 或启用 MagicDNS 后
ssh pi@raspberrypi
```

### 访问树莓派上的 Web 服务

假设服务监听 8080：

```bash
curl http://100.x.y.z:8080
```

如果只能在树莓派本机访问，检查服务是否只监听 `127.0.0.1`：

```bash
ss -lntp | grep 8080
```

需要外部访问时通常应监听 `0.0.0.0` 或 Tailscale IP。

### 宣告子网路由

```bash
sudo tailscale up --advertise-routes=192.168.1.0/24
```

然后到 Tailscale 管理后台批准该路由。

## 易错点/总结

- 不要把 SSH 直接暴露公网，优先使用 Tailscale 或至少配置密钥登录和防火墙；
- Tailscale 在线不代表业务端口可访问，还要看服务监听地址和防火墙；
- MagicDNS 方便但要确认客户端 DNS 设置已生效；
- Subnet Router 权限更大，应配合 ACL 控制；
- DERP 中继会增加延迟，但不影响基本可用性；
- 树莓派重启后可通过 systemd 确认 Tailscale 服务是否自动启动。

## 参考资料

- Tailscale Documentation
- WireGuard Documentation

