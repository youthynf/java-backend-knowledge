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

