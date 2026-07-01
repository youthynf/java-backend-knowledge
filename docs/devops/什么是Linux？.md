# 什么是 Linux

## 核心概念

严格来说，Linux 只是一个操作系统内核，由 Linus Torvalds 在 1991 年发布。但日常说“Linux 系统”通常指基于 Linux 内核的完整操作系统，包括内核 + GNU 工具链 + Shell + 包管理器 + 系统服务 + 应用生态，这类组合叫 Linux 发行版（distribution）。常见的发行版有 Ubuntu、Debian、CentOS（已停止维护，后继者 Rocky Linux、AlmaLinux）、Alpine、Raspberry Pi OS 等。

Linux 在后端开发中的地位来自三件事：大多数服务器跑 Linux、Docker 容器底层是 Linux 内核、Kubernetes 节点几乎都是 Linux。Java 后端开发要掌握 Linux，不是为了当运维，而是为了在服务部署、日志排查、性能调优、容器化时能独立完成基本操作，不卡在这些环节上。

## 标准回答

> Linux 是一个开源的类 Unix 操作系统内核，实际使用时通常指基于 Linux 内核的发行版。它提供进程调度、内存管理、文件系统、网络协议栈、设备驱动和权限模型。后端服务大量部署在 Linux 上，因为稳定、开源、资源占用低、脚本化能力强，并且是 Docker、Kubernetes、云服务器的基础。Java 后端开发需要掌握 Linux 的文件、进程、端口、日志、权限、systemd 服务等基本操作，能用命令行完成线上排查。

## 详细机制

### 内核和发行版的区别

内核只管硬件抽象和资源调度：CPU 调度、内存管理、文件系统驱动、网络协议栈、设备驱动。发行版在内核之上集成 Shell（bash、zsh）、GNU 工具（ls、cp、grep）、包管理器（apt、yum、dnf、apk）、系统服务（systemd、init）、库（glibc、musl）。

Ubuntu、Debian、CentOS 的差异主要在包管理（apt vs dnf）、默认配置、发行节奏、生态支持，内核都是 Linux。Alpine 用 musl libc 而不是 glibc，所以镜像极小但部分 native 库不兼容。

### 一切皆文件

Linux 把普通文件、目录、设备、管道、Socket、进程信息都抽象成文件或文件描述符。这个设计让很多操作通过统一的 read/write 接口完成：

- `/dev/sda` 代表磁盘设备，`/dev/null` 是丢弃数据的黑洞。
- `/proc` 是内核和进程状态的虚拟文件系统：`/proc/<pid>/status` 看进程内存，`/proc/cpuinfo` 看 CPU 信息，`/proc/loadavg` 看负载。
- `/sys` 是设备和内核参数的虚拟文件系统：`/sys/class/net` 看网卡。
- 网络连接在进程中也是文件描述符，`lsof -p <pid>` 能看到。

这个抽象的关键价值是：任何工具只要能读写文件，就能配置和观测系统。`echo 1 > /proc/sys/net/ipv4/ip_forward` 这种写法就是“开 IP 转发”的官方方式。

### 权限模型

Linux 文件权限三元组：

```text
-rwxr-xr-- 1 app app 1024 Jun 23 app.sh
```

- 第 1 位：文件类型（`-` 普通文件，`d` 目录，`l` 符号链接）。
- 第 2-4 位 `rwx`：所有者权限（读、写、执行）。
- 第 5-7 位 `r-x`：所属组权限（读、执行）。
- 第 8-10 位 `r--`：其他用户权限（只读）。

数字表示法把 rwx 当成二进制：`rwx=7`，`r-x=5`，`r--=4`。所以 `chmod 754 app.sh` 设置的就是 `rwxr-xr--`。

目录的 `x` 权限含义不是“执行”，而是“能否进入该目录”。`r` 权限是“能否列出目录内容”。

### systemd 服务管理

systemd 是现代 Linux 发行版（CentOS 7+、Ubuntu 16.04+、Debian 8+）的 init 系统，替代了老的 SysV init。它管服务启停、开机自启、依赖关系、日志收集（journald）。

核心命令：

```bash
systemctl status user-service          # 看服务状态
systemctl start user-service           # 启动
systemctl stop user-service            # 停止
systemctl restart user-service         # 重启
systemctl enable user-service          # 开机自启
systemctl disable user-service         # 取消自启
journalctl -u user-service -f          # 实时看服务日志
journalctl -u user-service --since "1 hour ago"
```

## 代码示例

### Java 服务部署后排查端口

```bash
ps -ef | grep java                          # 看 Java 进程是否在
ss -lntp | grep 8080                        # 看 8080 端口是否监听
curl -v http://127.0.0.1:8080/actuator/health   # 测健康检查接口
```

`ss -lntp` 各参数：`-l` 只看监听 socket，`-n` 不解析端口名（显示 8080 而不是 http-alt），`-t` 只看 TCP，`-p` 显示占用进程（需要 root）。

### 查看日志和系统资源

```bash
tail -f /opt/app/logs/app.log               # 实时看应用日志
journalctl -u user-service -f               # 看 systemd 服务日志
top                                         # 看 CPU/内存占用
free -h                                     # 看内存
df -h                                       # 看磁盘
du -sh /opt/app/* | sort -h                 # 看目录占用
```

### 用 systemd 管理 Java 服务

服务单元文件 `/etc/systemd/system/user-service.service`：

```ini
[Unit]
Description=user-service
After=network.target

[Service]
User=app
WorkingDirectory=/opt/user-service
ExecStart=/usr/bin/java -Xms512m -Xmx512m -jar /opt/user-service/user-service.jar
ExecStop=/bin/kill -TERM $MAINPID
Restart=always
RestartSec=5
SuccessExitStatus=143
StandardOutput=append:/var/log/user-service/app.log
StandardError=append:/var/log/user-service/app.log

[Install]
WantedBy=multi-user.target
```

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now user-service
sudo systemctl status user-service
journalctl -u user-service -f
```

`Restart=always` 让进程异常退出后 5 秒自动拉起；`SuccessExitStatus=143` 把 SIGTERM（exit code 143）当作正常退出，避免触发"失败"告警。

### 一切皆文件示例

```bash
cat /proc/cpuinfo | grep "model name" | head -1   # 看 CPU 型号
cat /proc/meminfo | head -3                        # 看内存信息
echo 1 > /proc/sys/vm/drop_caches                  # 释放页缓存
cat /proc/<pid>/status | grep VmRSS                # 看进程实际占用内存
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 服务部署后端口不通 | `ss -lntp` → `curl localhost:port` → 防火墙规则 | 端口监听 `127.0.0.1` 外部访问不到，要 `0.0.0.0` |
| 磁盘满告警 | `df -h` → `du -sh` → 删大文件 | `lsof \| grep deleted` 查被进程占用的已删文件 |
| Java CPU 飙高 | `top -Hp <pid>` → `printf '%x\n' <tid>` → `jstack` | 转换线程 ID 为 16 进制后在 jstack 输出中 grep |
| 服务异常退出 | `journalctl -u service` 看日志 + `systemctl status` 看 exit code | 配 `Restart=always` 自动拉起 |
| 文件权限错误 | `chmod 755` + `chown app:app` | 不要 `chmod 777`，扩大攻击面 |
| 定时任务 | `crontab -e` 写 cron 表达式 | 任务输出默认邮件给用户，重定向到日志文件 |

## 深挖追问

### Linux 内核和发行版有什么区别？

内核只管硬件抽象和资源调度（CPU、内存、文件系统、网络、设备驱动）。发行版在内核之上集成 Shell、GNU 工具、包管理器、系统服务、库。Ubuntu、Debian、CentOS 用同一个 Linux 内核，差异在包管理（apt vs dnf）、默认配置、发行节奏和生态支持。Alpine 用 musl libc 而不是 glibc，所以镜像小但兼容性差一些。

### 什么是“一切皆文件”？

Linux 把普通文件、目录、设备、管道、Socket、进程信息都抽象成文件或文件描述符。`/dev/sda` 是磁盘设备，`/proc/<pid>/status` 是进程内存信息，`/sys/class/net` 是网卡配置。这个设计让任何能读写文件的工具都能配置和观测系统，比如 `echo 1 > /proc/sys/net/ipv4/ip_forward` 就是开 IP 转发的官方方式。

### systemd 相比 SysV init 有什么改进？

- 并行启动服务，加快开机速度。
- 声明式依赖关系（`After=`、`Requires=`、`Wants=`）。
- 集成 journald 统一收集日志，`journalctl` 一条命令查所有服务日志。
- 支持 socket 激活、timer（替代 cron）、cgroup 集成。

### Linux 的运行级别（runlevel）和 systemd target 是什么？

老 SysV init 用运行级别 0-6：0 关机、1 单用户、3 多用户无图形、5 图形、6 重启。systemd 用 target 替代：`multi-user.target` 等同于 runlevel 3，`graphical.target` 等同于 runlevel 5。`systemctl get-default` 看默认 target。

### chmod 数字怎么算？

把 rwx 当 3 位二进制：`rwx=111=7`、`rw-=110=6`、`r-x=101=5`、`r--=100=4`。`chmod 755` = 所有者 `rwx`（7）+ 组 `r-x`（5）+ 其他 `r-x`（5）。特殊位：`chmod 4755` 的 4 是 setuid，让程序以文件所有者身份运行（如 `passwd` 命令）。

## 易错点

- 把 Linux 等同于某个发行版：Ubuntu/CentOS/Debian 都是发行版，内核都是 Linux。
- 用 root 跑业务进程：root 权限过大，逃逸后影响整机，应该建独立用户。
- 脚本无执行权限：`permission denied`，要 `chmod +x script.sh`。
- 端口监听 `127.0.0.1`：外部访问不到，要监听 `0.0.0.0` 或具体 IP。
- 误删正在写入的日志文件：文件被进程持有句柄不会真正释放空间，应 `: > app.log` 清空或 `logrotate`。
- 磁盘满后无法登录：root 分区满导致 SSH 写日志失败，要进入单用户模式或救援模式清理。
- 容器内 Linux 与宿主机 Linux 共享内核：所以 Linux 容器不能跑 Windows 应用。

## 总结

Linux 是后端开发的基础设施，掌握它不是为了当运维，而是为了在服务部署、日志排查、性能调优时不卡壳。核心要理解：内核与发行版的区分、一切皆文件的设计、文件权限三元组、systemd 服务管理。Java 后端开发重点掌握 ps、ss、grep、awk、systemctl、journalctl 这几条命令的组合使用，能覆盖 80% 的线上排查场景。

## 参考资料

- [The Linux Kernel Archives](https://www.kernel.org/)
- [Linux man pages online](https://man7.org/linux/man-pages/)
- [systemd Documentation](https://www.freedesktop.org/wiki/Software/systemd/)
- [The Linux Documentation Project](https://tldp.org/)

---
