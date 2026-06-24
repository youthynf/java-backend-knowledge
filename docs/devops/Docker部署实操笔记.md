# Docker 部署实操笔记

## 核心概念

Docker 部署的核心链路是：编写 Dockerfile → 构建镜像 → 推送镜像仓库 → 在目标机器拉取并运行容器 → 配置日志、数据卷、网络、健康检查和重启策略。对 Java 后端来说，重点是镜像体积、JVM 参数、配置注入、日志输出和优雅停机。

## 面试官想考什么

- 是否能独立把 Spring Boot/Java 服务容器化；
- 是否理解镜像、容器、数据卷、端口映射、网络的关系；
- 是否会写合理 Dockerfile，而不是把所有东西塞进镜像；
- 是否知道容器中 Java 内存参数如何配置；
- 是否考虑日志、健康检查、重启策略和数据持久化。

## 标准回答

> Docker 部署一般先用 Dockerfile 构建应用镜像，推荐多阶段构建或使用精简 JRE 基础镜像，镜像中只放运行所需文件。运行容器时通过环境变量或配置文件挂载注入配置，通过 `-p` 暴露端口，通过 volume 持久化数据，通过 `--restart` 保证异常退出后自动拉起。Java 服务还要设置容器感知的 JVM 参数、优雅停机和健康检查，日志尽量输出到 stdout/stderr 交给平台采集。

## 深挖追问

### Dockerfile 为什么要分层和使用多阶段构建？

镜像是分层的，合理分层可以复用缓存、减少重复构建。多阶段构建可以把编译环境和运行环境分开，最终镜像只包含 JAR、JRE 和必要文件，降低体积和安全风险。

### 容器里的数据为什么不能只放可写层？

容器删除后可写层会消失，迁移和备份也困难。数据库、上传文件、持久缓存等数据应挂载 volume 或外部存储。应用日志更推荐输出到标准输出，由 Docker/K8s/日志系统采集。

### Java 容器内存如何配置？

Java 8u191+ 和较新 JDK 能识别容器限制，但生产仍建议显式设置 `-XX:MaxRAMPercentage`、`-Xms/-Xmx` 或通过 `JAVA_TOOL_OPTIONS` 管理，避免容器内存限制和 JVM 堆/非堆内存不匹配导致 OOMKilled。

## 实战场景/代码示例

### Spring Boot Dockerfile

```dockerfile
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY target/user-service.jar /app/app.jar
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
```

### 构建和运行

```bash
docker build -t user-service:1.0 .
docker run -d --name user-service \
  -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError" \
  --memory=1g --cpus=1 \
  --restart=always \
  user-service:1.0
```

### 查看状态和日志

```bash
docker ps
docker logs -f --tail=200 user-service
docker inspect user-service
docker exec -it user-service sh
```

### docker-compose 示例

```yaml
services:
  user-service:
    image: user-service:1.0
    ports:
      - "8080:8080"
    environment:
      SPRING_PROFILES_ACTIVE: prod
      JAVA_TOOL_OPTIONS: -XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError
    restart: always
```

## 易错点/总结

- 不要把密码写死进镜像或 Dockerfile；
- 不要用容器可写层保存关键数据；
- 镜像内尽量只放运行依赖，减少攻击面；
- Java 服务要关注堆、元空间、线程栈和直接内存总和；
- `docker exec` 适合临时排查，不应作为长期运维入口；
- 生产部署建议配合镜像仓库、CI/CD、健康检查和日志采集。

## 参考资料

- Dockerfile reference
- Docker Compose documentation
- Eclipse Temurin container images

<!-- interview-renovation:2026-06-24 -->

## 面试复习强化

### 核心概念

从面试角度看，**Docker 部署实操笔记** 可以放在“DevOps”这一类知识中理解。复习时不要只背定义，要能说清：它解决什么问题、依赖哪些前提、正常流程是什么、异常情况下系统会怎样退化或恢复。

### 面试官想考什么

- 是否理解概念背后的设计目标，而不是只记住名词；
- 是否能把机制和真实工程场景联系起来；
- 是否能分析边界条件、失败场景、性能与安全取舍；
- 是否能给出可落地的排查、实现或优化步骤。

### 标准回答

> 兼顾概念、命令、部署流程、可观测性和故障恢复。 追问看是否真操作过：环境差异、权限、网络、存储、日志、进程管理、镜像/容器生命周期。 对于“Docker 部署实操笔记”，回答时建议先给一句话定义，再按“工作流程/关键机制 → 典型场景 → 风险与优化”展开，最后补充一两个线上实践点。

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

