# DevOps

本目录覆盖 Linux、容器（Docker/Kubernetes）、部署运维、日志分析、树莓派等工程实践主题。文章按“概念 → 标准回答 → 详细机制 → 代码示例 → 实战场景 → 深挖追问 → 易错点”结构组织，命令示例可直接复制运行。

## 目录

- [Docker 与 K8s 之间是什么关系](Docker与K8s之间是什么关系？.md) — Docker 解决打包运行，K8s 解决集群编排，两者通过 CRI 间接耦合
- [Docker 与虚拟机有什么区别](Docker与虚拟机有什么区别？.md) — 容器是进程隔离不是轻量虚拟机，隔离依赖 Namespace/Cgroups/OverlayFS
- [如何使用 Docker 部署 Spring Boot 服务](如何使用Docker部署Spring-Boot服务？.md) — 多阶段构建 + 分层 JAR + 容器感知 JVM 参数 + 优雅停机
- [Windows 11 如何使用 Docker 部署应用](Windows-11如何使用Docker部署应用？.md) — Docker Desktop + WSL2 backend，路径与端口排查
- [什么是 Linux](什么是Linux？.md) — 内核与发行版区分、一切皆文件、权限模型、systemd 服务管理
- [如何使用 Tailscale 外网访问树莓派](如何使用Tailscale外网访问树莓派？.md) — 基于 WireGuard 的零配置组网，Subnet Router 与 MagicDNS
- [如何从日志分析 PV 和 UV](如何从日志分析PV和UV？.md) — PV/UV 口径定义，awk/sort/uniq 临时分析，ClickHouse 大规模方案
- [常用的 Linux 命令有哪些](常用的Linux命令有哪些？.md) — 文件、文本、进程、网络、磁盘、权限、服务七大类命令组合
- [如何把树莓派 5 系统迁移到 NVMe SSD](如何把树莓派5系统迁移到NVMe-SSD？.md) — EEPROM 升级 + rsync 克隆 + fstab UUID + BOOT_ORDER 配置
- [Raspberry Pi OS 常用命令有哪些](Raspberry-Pi-OS常用命令有哪些？.md) — Debian 包管理 + vcgencmd 硬件监控 + raspi-config 配置

## 阅读建议

- **面试速查**：每篇开头的“标准回答”是 30 秒内要讲清楚的内容，先看这部分。
- **动手验证**：代码示例都可复制运行，建议在测试环境跑一遍加深印象。
- **避坑指南**：“易错点”一节集中了生产事故的高频原因，部署前对照检查。

---
