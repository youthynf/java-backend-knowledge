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

<!-- interview-renovation:2026-06-24 -->

## 面试复习强化

### 核心概念

从面试角度看，**什么是 Linux？** 可以放在“DevOps”这一类知识中理解。复习时不要只背定义，要能说清：它解决什么问题、依赖哪些前提、正常流程是什么、异常情况下系统会怎样退化或恢复。

### 面试官想考什么

- 是否理解概念背后的设计目标，而不是只记住名词；
- 是否能把机制和真实工程场景联系起来；
- 是否能分析边界条件、失败场景、性能与安全取舍；
- 是否能给出可落地的排查、实现或优化步骤。

### 标准回答

> 兼顾概念、命令、部署流程、可观测性和故障恢复。 追问看是否真操作过：环境差异、权限、网络、存储、日志、进程管理、镜像/容器生命周期。 对于“什么是 Linux？”，回答时建议先给一句话定义，再按“工作流程/关键机制 → 典型场景 → 风险与优化”展开，最后补充一两个线上实践点。

### 深挖追问

- 如果该机制失效，会出现什么现象？如何定位是配置、代码、资源还是外部依赖导致？
- 它和相邻概念有什么区别？例如语义、适用场景、性能成本、可靠性保证分别是什么？
- 在高并发、网络抖动、服务重启、数据不一致或权限受限时，需要补充哪些保护措施？
- 有哪些指标可以证明方案有效？例如延迟、吞吐、错误率、资源使用率、重试次数或业务成功率。

### 示例 / 实战场景

- 设计方案时：先明确业务目标和约束，再选择对应机制，不要为了使用某个技术而引入复杂度。
- 排查问题时：先确认现象和影响面，再查看日志、监控、配置、版本变更和上下游依赖，最后小步验证修复。
- 复盘沉淀时：补充自动化测试、容量评估、告警阈值、降级预案和文档，避免同类问题再次发生。

### 本题高频补充

- Linux 题不要只背命令，要说明进程、文件、权限、网络、磁盘、日志和包管理的排查路径。

### 易错点 / 总结

- 只背结论、不讲原因，是面试扣分点；要主动解释“为什么这样设计”。
- 只讲正常路径、不讲异常路径，会显得缺少生产经验；至少补充超时、重试、降级、回滚或兜底。
- 不要把理论保证无限放大，工程实现通常还受网络、资源、配置、版本和业务语义约束。
- 总结一句：生产操作要考虑幂等、最小权限、备份、回滚和审计。

