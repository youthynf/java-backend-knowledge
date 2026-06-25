# Docker 与虚拟机有什么区别？

## 核心概念

Docker 是容器化技术，虚拟机是硬件虚拟化技术。二者都能实现环境隔离，但隔离层级不同：虚拟机通过 Hypervisor 虚拟出完整硬件并运行完整操作系统；Docker 容器共享宿主机内核，通过 Namespace、Cgroups、UnionFS 等机制隔离进程、网络、文件系统和资源。

| 对比项 | Docker 容器 | 虚拟机 |
| --- | --- | --- |
| 隔离层级 | 操作系统层，多个容器共享宿主机内核 | 硬件层，每个 VM 有完整 Guest OS |
| 启动速度 | 秒级甚至毫秒级 | 通常几十秒到分钟级 |
| 资源开销 | 小，镜像分层复用 | 大，需要完整系统资源 |
| 隔离强度 | 弱于虚拟机，依赖内核隔离 | 更强，边界是虚拟硬件/Guest OS |
| 部署方式 | 镜像不可变、易复制 | 镜像/快照较重 |
| 适用场景 | 微服务、CI/CD、弹性扩缩容 | 多 OS、强隔离、传统系统迁移 |

## 面试官想考什么

- 是否理解容器不是轻量虚拟机，而是进程隔离；
- 是否知道 Docker 依赖 Linux 内核能力：Namespace、Cgroups、UnionFS；
- 是否能从启动速度、资源消耗、隔离性、部署效率对比；
- 是否知道容器安全边界弱于 VM；
- 是否能结合生产部署场景说明如何选择。

## 标准回答

> Docker 和虚拟机都能隔离运行环境，但虚拟机是在硬件层虚拟化，每个虚拟机运行完整操作系统；Docker 是操作系统层虚拟化，容器本质上是宿主机上的隔离进程，多个容器共享宿主机内核。Docker 启动快、资源开销小、镜像分发方便，适合微服务和 CI/CD；虚拟机隔离性更强，适合多操作系统、强安全隔离和传统应用迁移。生产中常见组合是：底层用云主机/虚拟机提供资源边界，上层用 Docker/Kubernetes 管理应用。

## 深挖追问

### Docker 为什么启动更快？

容器启动不需要引导完整操作系统，只是基于镜像创建文件系统视图并启动一个或多个进程。虚拟机则要经历虚拟硬件初始化、Guest OS 启动、系统服务启动等过程。

### Docker 的隔离依赖哪些技术？

- Namespace：隔离进程号、网络、挂载点、用户、主机名等视图；
- Cgroups：限制 CPU、内存、IO 等资源；
- UnionFS/OverlayFS：镜像分层和写时复制；
- Capability/Seccomp/AppArmor/SELinux：收敛容器权限和系统调用。

### 容器比虚拟机安全吗？

不是。容器共享宿主机内核，如果内核或容器运行时存在漏洞，逃逸风险更高。安全要求高的场景可以使用虚拟机、Kata Containers、gVisor，或至少限制 root、禁用特权容器、设置只读文件系统和最小权限。

## 实战场景/代码示例

### 限制容器资源

```bash
docker run -d --name api \
  --cpus=1.5 \
  --memory=512m \
  --restart=always \
  my-api:1.0
```

### 查看容器本质是进程

```bash
docker run -d --name nginx nginx:alpine
pid=$(docker inspect -f '{{.State.Pid}}' nginx)
ps -fp "$pid"
```

### 生产选择建议

- 微服务快速交付：Docker + Kubernetes；
- 需要不同内核/不同 OS：虚拟机；
- 强租户隔离：优先 VM 或安全容器；
- 本地开发环境一致性：Docker Compose。

## 易错点/总结

- Docker 不是完整操作系统，容器通常只运行一个主进程；
- Linux 容器共享宿主机 Linux 内核，不能直接运行 Windows 内核应用；
- 容器删除后可写层会丢失，持久数据应使用 volume；
- 不要在生产中随意使用 `--privileged`；
- 镜像越小越好维护，推荐多阶段构建和最小基础镜像。

## 参考资料

- Docker Documentation
- Linux namespaces / cgroups 文档
