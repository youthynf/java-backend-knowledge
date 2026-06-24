# 树莓派 Raspberry Pi OS（原生 Debian）常用指令大全

## 核心概念

Raspberry Pi OS 基于 Debian，常用命令与 Linux/Debian 基本一致，但树莓派还需要关注硬件温度、供电、电源管理、GPIO、系统配置、SD/NVMe 存储、服务自启动和远程访问。作为面试复习，可以把它归类为“小型 Linux 服务器运维”。

## 面试官想考什么

- 是否能把树莓派当作 Linux 服务器管理；
- 是否熟悉 Debian 包管理、systemd、网络、磁盘和日志；
- 是否知道树莓派特有命令，如温度、电压、配置工具；
- 是否能排查服务启动失败、网络不通、磁盘满、温度过高；
- 是否理解 ARM 架构对镜像和软件包的影响。

## 标准回答

> Raspberry Pi OS 是基于 Debian 的 Linux 发行版，因此常用 `apt/systemctl/journalctl/ss/df/free/top` 等命令管理软件、服务、网络和资源。树莓派额外要关注硬件状态，例如用 `vcgencmd measure_temp` 看温度，用 `raspi-config` 配置 SSH、I2C、SPI、启动项等。部署 Java 或 Docker 服务时，要确认 ARM64 镜像兼容、供电稳定、散热正常，并配置 systemd 或 Docker restart 策略保证自启动。

## 深挖追问

### 树莓派和普通 Linux 服务器有什么差异？

主要差异是 ARM 架构、资源较小、存储常用 SD/NVMe、供电和散热更敏感，外设接口更多。软件安装前要确认架构是 `arm64` 还是 `armhf`，容器镜像也要支持对应架构。

### 如何判断树莓派是否过热或降频？

```bash
vcgencmd measure_temp
vcgencmd get_throttled
```

`get_throttled` 返回值非 0 可能表示曾经或当前发生欠压、过热或降频，需要检查电源、散热和负载。

### 如何管理服务自启动？

使用 systemd：

```bash
sudo systemctl enable --now my-service
sudo systemctl status my-service
journalctl -u my-service -f
```

## 实战场景/代码示例

### 系统和包管理

```bash
cat /etc/os-release
uname -a
dpkg --print-architecture
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl vim htop
```

### 网络排查

```bash
ip addr
ip route
ping -c 4 8.8.8.8
ping -c 4 baidu.com
ss -lntp
```

### 资源和磁盘

```bash
free -h
df -h
du -sh /opt/* | sort -h
top
vcgencmd measure_temp
vcgencmd get_throttled
```

### Docker/Java 服务常用命令

```bash
docker ps -a
docker logs -f --tail=200 app
java -version
ps -ef | grep java
```

### raspi-config 常用入口

```bash
sudo raspi-config
```

常用于开启 SSH、配置本地化、调整启动选项、启用 I2C/SPI/串口等。

## 易错点/总结

- ARM 架构不兼容 amd64-only 镜像，部署前看镜像 manifest；
- 电源不稳会导致莫名重启、USB/NVMe 异常或降频；
- SD 卡长期写日志容易损耗，建议日志轮转或使用 SSD/NVMe；
- 服务监听 `127.0.0.1` 时，局域网/外网无法直接访问；
- 树莓派性能有限，不适合无节制跑重型数据库和大量容器；
- 远程访问优先密钥 SSH、Tailscale 或 VPN，避免公网弱口令。

## 参考资料

- Raspberry Pi Documentation
- Debian Administrator's Handbook
- systemd 文档

