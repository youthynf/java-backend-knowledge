# 什么是 Linux？

## 核心概念

Linux 严格来说是一个开源操作系统内核，由 Linus Torvalds 于 1991 年发布。日常说的“Linux 系统”通常指基于 Linux 内核，加上 GNU 工具链、Shell、包管理器、系统服务和发行版生态组成的完整操作系统，例如 Ubuntu、Debian、CentOS、Rocky Linux、AlmaLinux、Raspberry Pi OS。

Linux 在后端开发、云计算、容器和运维中非常重要，因为大多数服务器、Docker 容器和 Kubernetes 节点都运行在 Linux 之上。

## 面试官想考什么

- 是否知道 Linux 内核和 Linux 发行版的区别；
- 是否理解 Linux 的文件系统、进程、用户权限、网络和服务管理；
- 是否能使用常见命令排查线上问题；
- 是否知道“一切皆文件”的思想；
- 是否能结合 Java 后端部署说明 Linux 的价值。

## 标准回答

> Linux 是一个开源的类 Unix 操作系统内核，实际使用时通常指基于 Linux 内核的发行版。它提供进程调度、内存管理、文件系统、网络协议栈、设备驱动和权限模型。后端服务常部署在 Linux 上，因为它稳定、开源、资源占用低、脚本化能力强，并且是 Docker、Kubernetes、云服务器的基础。Java 后端开发需要掌握 Linux 的文件、进程、端口、日志、权限、systemd 服务等基本操作。

## 深挖追问

### Linux 内核和发行版有什么区别？

内核负责管理 CPU、内存、磁盘、网络和设备；发行版在内核之上集成 Shell、GNU 工具、包管理器、桌面环境或服务管理工具。Ubuntu、Debian、CentOS 的差异主要来自软件包管理、默认配置、发行节奏和生态支持。

### 什么叫“一切皆文件”？

Linux 把普通文件、目录、设备、管道、Socket、进程信息等都抽象成文件或文件描述符。例如 `/dev/sda` 代表磁盘设备，`/proc` 暴露进程和内核状态，网络连接在进程中也是文件描述符。这个设计让很多操作可以通过统一的读写接口完成。

### Linux 权限怎么看？

```bash
-rwxr-xr-- 1 app app 1024 Jun 23 app.sh
```

第一位表示类型，后面三组分别是所有者、所属组、其他用户的读 `r`、写 `w`、执行 `x` 权限。常见 `chmod 755` 表示所有者可读写执行，组和其他用户可读执行。

### systemd 是什么？

systemd 是多数现代 Linux 发行版的服务管理系统，用于启动、停止、重启服务，配置开机自启，并查看服务日志。常见命令是 `systemctl status/start/stop/restart` 和 `journalctl`。

## 实战场景/代码示例

### Java 服务部署后排查端口

```bash
ps -ef | grep java
ss -lntp | grep 8080
curl -v http://127.0.0.1:8080/actuator/health
```

### 查看日志和系统资源

```bash
tail -f /opt/app/logs/app.log
top
free -h
df -h
du -sh /opt/app/*
```

### systemd 管理 Java 服务

```ini
[Unit]
Description=user-service
After=network.target

[Service]
User=app
WorkingDirectory=/opt/user-service
ExecStart=/usr/bin/java -jar /opt/user-service/user-service.jar
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now user-service
sudo systemctl status user-service
journalctl -u user-service -f
```

## 易错点/总结

- Linux 不是某一个具体发行版，Ubuntu/CentOS/Debian 都是发行版；
- `root` 权限很大，生产环境不要随便用 root 跑业务进程；
- 文件无执行权限时脚本会报 permission denied，需要 `chmod +x`；
- 端口监听正常不代表服务健康，还要看应用日志和健康检查；
- 磁盘满、inode 满、权限错误、端口占用是线上高频问题；
- 容器环境同样依赖 Linux 内核能力。

## 参考资料

- Linux man pages
- The Linux Documentation Project
- systemd 官方文档

