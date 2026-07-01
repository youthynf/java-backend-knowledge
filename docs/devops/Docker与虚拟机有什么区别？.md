# Docker 与虚拟机有什么区别

## 核心概念

Docker 是操作系统层虚拟化，虚拟机是硬件层虚拟化。两者都能隔离运行环境，但隔离的层级完全不同：虚拟机通过 Hypervisor 虚拟出完整硬件，每个 VM 跑一个完整的 Guest OS；Docker 容器直接共享宿主机内核，通过 Namespace、Cgroups、UnionFS 等 Linux 内核机制把进程隔离开。

一个关键认知是：**容器不是轻量虚拟机，而是隔离的进程**。容器内没有独立内核，没有 init/systemd 引导流程，启动一个容器本质上是宿主机上 `fork` 一个被 Namespace 包裹的进程。这就是为什么容器启动是秒级甚至毫秒级——不需要引导操作系统。

| 对比项 | Docker 容器 | 虚拟机 |
|--------|-------------|--------|
| 隔离层级 | 操作系统层，共享宿主机内核 | 硬件层，每个 VM 有独立 Guest OS |
| 启动速度 | 秒级甚至毫秒级 | 几十秒到分钟级 |
| 资源开销 | 小，镜像分层复用，单 GB 可跑几十个容器 | 大，每个 VM 需要完整 OS 内存 |
| 隔离强度 | 弱，共享内核，逃逸风险高 | 强，边界是虚拟硬件 + Guest OS |
| 镜像体积 | MB 级（alpine 5MB，jre-slim 80MB） | GB 级（含完整 OS） |
| 跨内核运行 | 不支持，Linux 容器不能直接跑 Windows 应用 | 支持，x86 上可虚拟 ARM、Windows、Linux |
| 适用场景 | 微服务、CI/CD、弹性扩缩容 | 多 OS、强隔离、传统系统迁移 |

## 标准回答

> Docker 和虚拟机都能隔离运行环境，但虚拟机在硬件层虚拟化，每个虚拟机运行完整操作系统；Docker 在操作系统层虚拟化，容器本质是宿主机上被 Namespace 和 Cgroups 隔离的进程，多个容器共享宿主机内核。Docker 启动快、资源开销小、镜像分发方便，适合微服务和 CI/CD；虚拟机隔离性更强，适合多操作系统、强安全隔离、传统应用迁移。生产中常见组合是底层用虚拟机或云主机提供资源边界和强隔离，上层用 Docker/K8s 管理应用，兼顾安全与敏捷。

## 详细机制

### Docker 隔离依赖的 Linux 内核能力

- **Namespace**：隔离进程视图，让容器内进程“看不到”宿主机和其他容器。包括 PID（进程号）、NET（网络栈）、MNT（挂载点）、UTS（主机名）、IPC（消息队列）、USER（用户 ID 映射）、Cgroup（cgroup 视图）。
- **Cgroups**：限制和计量 CPU、内存、IO、PID 数等资源，防止单个容器耗尽宿主机资源。
- **UnionFS / OverlayFS**：镜像分层存储和写时复制，多个容器共享同一份只读镜像层，只有变更部分写入可写层。
- **Capability / Seccomp / AppArmor / SELinux**：收敛容器内 root 权限和系统调用范围，降低逃逸风险。

### 为什么容器启动快

容器启动不需要 BIOS 自检、不需要引导内核、不需要启动 systemd 和一堆系统服务。`docker run` 实际上是：创建 Namespace → 挂载 OverlayFS 顶层 → `fork` 进程 → 执行 ENTRYPOINT 命令。整个过程是毫秒到秒级。虚拟机则要经历虚拟硬件初始化、Guest OS 内核加载、init 系统启动、登录服务等。

### 容器比虚拟机安全吗

不一定，**容器的隔离边界弱于虚拟机**。因为所有容器共享宿主机内核，一旦内核存在提权漏洞（如 Dirty COW）或容器运行时存在逃逸漏洞，攻击者可能从容器逃逸到宿主机。强隔离要求场景（多租户 PaaS、运行不可信代码）应该用虚拟机、Kata Containers（基于轻量 VM 的容器）、gVisor（用户态内核），或至少做到：

- 容器以非 root 用户运行；
- 禁用 `--privileged` 特权模式；
- 文件系统只读（`--read-only`）；
- 限制 Capability 和系统调用（`--cap-drop=ALL --cap-add=NET_BIND_SERVICE`）。

## 代码示例

### 限制容器资源

```bash
docker run -d --name api \
  --cpus=1.5 \                  # 限制最多使用 1.5 个核
  --memory=512m \               # 内存上限 512MB，超出会被 OOMKilled
  --memory-swap=512m \          # 禁止 swap，避免内存超卖
  --restart=always \            # 异常退出自动重启
  --read-only \                 # 根文件系统只读
  --tmpfs /tmp:size=64m \       # 临时目录走 tmpfs
  --user 1000:1000 \            # 非 root 运行
  my-api:1.0
```

### 验证容器本质是宿主机进程

```bash
docker run -d --name nginx nginx:alpine
pid=$(docker inspect -f '{{.State.Pid}}' nginx)   # 取容器首进程在宿主机的 PID
ps -fp "$pid"                                      # 在宿主机 ps 中能看到这个进程
ls /proc/$pid/ns                                   # 查看进程的 Namespace 链接
```

`docker inspect -f '{{.State.Pid}}'` 返回容器内 PID=1 进程映射到宿主机的真实 PID，可以看到它在宿主机上就是个普通进程，只是被 Namespace 隔离了视图。

### 多阶段构建减小镜像体积

```dockerfile
# 第一阶段：编译
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests

# 第二阶段：运行，只拷贝产物
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=builder /build/target/user-service.jar /app/app.jar
USER 1000
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

第一阶段几百 MB（含 Maven、JDK），第二阶段只保留 JRE 和 JAR，最终镜像通常 200MB 左右，比单阶段构建小 60% 以上。

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 微服务容器化 | Dockerfile 多阶段构建 → 推仓库 → K8s 部署 | JVM 内存按容器 limits 配 `MaxRAMPercentage`，避免 OOMKilled |
| 本地多服务联调 | Docker Compose 一键起 MySQL + Redis + 应用 | 频繁读写的代码目录挂载用 volume，避免性能问题 |
| 强隔离多租户 | 用 Kata Containers 或 gVisor 替换默认 runc | 性能有 5%~20% 损耗，根据安全需求取舍 |
| 不同 OS 共存 | Windows Server 跑 Linux 容器需用 WSL2 或 Hyper-V Linux VM | Linux 容器不能直接跑在 Windows 内核上 |
| 传统 Java 单体上云 | 先容器化（不拆微服务），再迁 K8s | 优先用 jib 或 Spring Boot layered jar 优化镜像分层 |

## 深挖追问

### Docker 的隔离依赖哪些技术？

Namespace 隔离进程、网络、挂载点等视图；Cgroups 限制 CPU、内存、IO 资源；OverlayFS 实现镜像分层和写时复制；Capability/Seccomp/AppArmor 收敛权限和系统调用。这四类机制都是 Linux 内核能力，所以 Linux 容器只能跑在 Linux 内核上。

### 容器删除后数据会丢失吗？

会。容器的可写层（OverlayFS 顶层）随容器删除而消失。持久化数据必须挂载 volume（`-v mydata:/data`）或 bind mount（`-v /host/path:/container/path`），数据库文件、上传文件、日志等都应该走 volume。生产环境更推荐把日志输出到 stdout/stderr，由 Docker/K8s 日志驱动或日志采集器统一收集。

### `--privileged` 为什么危险？

特权模式禁用了所有 Namespace 隔离和 Capability 限制，容器内 root 等价于宿主机 root，可以访问宿主机所有设备、加载内核模块、修改 cgroup。除非特殊场景（如在容器内运行 Docker、需要访问 USB 设备），生产环境严禁使用。需要部分特权时应该用 `--cap-add` 精确添加 Capability，而不是一刀切给 `--privileged`。

### 容器和镜像的关系？

镜像是静态模板（分层只读），容器是镜像运行时的实例（镜像层 + 可写层）。一个镜像可以启动多个容器，互不影响；容器 `commit` 后可以反向生成新镜像，但生产环境不推荐这种做法，应该用 Dockerfile 保证可重建。

## 易错点

- 把容器当虚拟机用，在容器里跑 systemd、SSH：容器设计哲学是“一个容器一个进程”，多进程场景应该拆成多个容器或用 Supervisor。
- 容器以 root 运行：一旦逃逸，攻击者直接拿到宿主机 root。Dockerfile 应该 `USER 1000` 指定非 root 用户。
- 把密码、Token 写进 Dockerfile 或镜像：镜像分层会让密钥留在历史层中，即使后面删除也能被还原。密钥应通过运行时环境变量或 K8s Secret 注入。
- `--memory` 不设 `--memory-swap`：默认 swap 是 memory 的 2 倍，容器可能使用 swap 拖慢整机性能。生产建议 `--memory-swap` 等于 `--memory` 禁用 swap。
- 在容器内频繁写日志文件：可写层走 OverlayFS 性能差，应输出到 stdout 或挂载 volume。
- `docker exec` 作为长期运维入口：exec 是临时排查工具，不是运维通道，日志和监控要走标准通道。

## 总结

Docker 是进程级隔离，虚拟机是硬件级隔离，二者不是替代关系而是互补关系。容器胜在轻量、敏捷、镜像可复用，弱在隔离强度；虚拟机胜在强隔离、跨内核，弱在资源开销和启动速度。生产环境典型组合是“虚拟机提供资源边界 + 容器提供应用敏捷”，强隔离场景再加 Kata/gVisor 这层安全容器。

## 参考资料

- [Docker Overview](https://docs.docker.com/get-started/overview/)
- [Linux namespaces man page](https://man7.org/linux/man-pages/man7/namespaces.7.html)
- [cgroups v2 documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- [Open Container Initiative](https://opencontainers.org/)

---
