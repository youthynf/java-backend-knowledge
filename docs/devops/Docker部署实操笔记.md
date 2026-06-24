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

