# Windows 11 使用 Docker 部署 OpenClaw

## 核心概念

Windows 11 上使用 Docker 通常依赖 Docker Desktop + WSL2。Docker Desktop 提供容器运行环境、镜像管理和网络转发；WSL2 提供 Linux 内核兼容层。部署 OpenClaw 这类服务时，关注点是：WSL2 是否启用、Docker Desktop 是否正常、端口是否冲突、数据目录如何挂载、环境变量和日志如何管理。

## 面试官想考什么

- 是否理解 Windows 上 Docker Desktop 与 WSL2 的关系；
- 是否知道容器部署的一般流程：拉镜像/构建镜像、运行容器、映射端口、挂载目录；
- 是否能排查端口占用、容器启动失败、镜像拉取失败；
- 是否知道 Windows 路径挂载和 Linux 路径差异；
- 是否能把个人部署经验沉淀为可复现步骤。

## 标准回答

> Windows 11 使用 Docker 部署服务，一般先开启 WSL2 和虚拟化，安装 Docker Desktop 并启用 WSL integration。之后通过 Dockerfile 或镜像启动容器，使用 `-p` 做端口映射，用 volume 挂载配置和数据目录，用环境变量注入运行参数。排查时先看 `docker ps -a` 和 `docker logs`，再检查端口占用、挂载路径、镜像架构和网络访问。

## 深挖追问

### 为什么推荐 WSL2 backend？

WSL2 提供真实 Linux 内核兼容能力，文件系统、网络和容器行为更接近 Linux 服务器。相比旧的 Hyper-V 后端，WSL2 与开发环境集成更自然。

### Windows 路径挂载有什么注意点？

Windows 路径如 `C:\Users\me\data` 在 Docker 中可挂载，但跨 Windows 文件系统和 WSL 文件系统时性能可能不同。频繁读写的项目文件建议放在 WSL Linux 文件系统中，例如 `~/projects`，再从 WSL 终端运行 Docker 命令。

### 容器启动后访问不了怎么办？

先确认容器是否运行，再确认服务在容器内监听的端口、Docker 端口映射、Windows 防火墙和本机端口占用。

```bash
docker ps -a
docker logs --tail=200 openclaw
netstat -ano | findstr :8080
```

## 实战场景/代码示例

### 基本运行模板

```bash
docker run -d --name openclaw \
  -p 8080:8080 \
  -v openclaw-data:/app/data \
  -e TZ=Asia/Shanghai \
  --restart=unless-stopped \
  openclaw:latest
```

### 使用本地目录挂载配置

PowerShell 示例：

```powershell
docker run -d --name openclaw `
  -p 8080:8080 `
  -v ${PWD}\data:/app/data `
  -e TZ=Asia/Shanghai `
  --restart=unless-stopped `
  openclaw:latest
```

WSL bash 示例：

```bash
docker run -d --name openclaw \
  -p 8080:8080 \
  -v "$PWD/data:/app/data" \
  -e TZ=Asia/Shanghai \
  --restart=unless-stopped \
  openclaw:latest
```

### 常用排查命令

```bash
docker ps -a
docker logs -f --tail=200 openclaw
docker inspect openclaw
docker restart openclaw
docker exec -it openclaw sh
```

## 易错点/总结

- BIOS/系统虚拟化未开启会导致 Docker Desktop 无法正常运行；
- Windows 端口被占用时，容器即使启动也无法映射该端口；
- 镜像架构要匹配，arm64/amd64 不一致可能需要多架构镜像；
- 配置和数据建议挂载 volume，避免删除容器后丢失；
- 生产环境不建议依赖个人 Windows 桌面长期运行关键服务；
- 遇到问题先看容器日志，不要只看浏览器访问结果。

## 参考资料

- Docker Desktop for Windows 文档
- WSL2 官方文档

<!-- interview-renovation:2026-06-24 -->

## 面试复习强化

### 核心概念

从面试角度看，**Windows 11 使用 Docker 部署 OpenClaw** 可以放在“DevOps”这一类知识中理解。复习时不要只背定义，要能说清：它解决什么问题、依赖哪些前提、正常流程是什么、异常情况下系统会怎样退化或恢复。

### 面试官想考什么

- 是否理解概念背后的设计目标，而不是只记住名词；
- 是否能把机制和真实工程场景联系起来；
- 是否能分析边界条件、失败场景、性能与安全取舍；
- 是否能给出可落地的排查、实现或优化步骤。

### 标准回答

> 兼顾概念、命令、部署流程、可观测性和故障恢复。 追问看是否真操作过：环境差异、权限、网络、存储、日志、进程管理、镜像/容器生命周期。 对于“Windows 11 使用 Docker 部署 OpenClaw”，回答时建议先给一句话定义，再按“工作流程/关键机制 → 典型场景 → 风险与优化”展开，最后补充一两个线上实践点。

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

- Docker 回答要区分镜像、容器、仓库、网络、卷、namespace/cgroup，以及可复现构建和运行时隔离。

### 易错点 / 总结

- 只背结论、不讲原因，是面试扣分点；要主动解释“为什么这样设计”。
- 只讲正常路径、不讲异常路径，会显得缺少生产经验；至少补充超时、重试、降级、回滚或兜底。
- 不要把理论保证无限放大，工程实现通常还受网络、资源、配置、版本和业务语义约束。
- 总结一句：生产操作要考虑幂等、最小权限、备份、回滚和审计。

