# Docker 与 K8s 之间的关系是什么？

## 核心概念

Docker 负责把应用及其依赖打包成镜像，并以容器方式运行；Kubernetes（K8s）负责在多台机器上编排、调度和治理容器。可以把 Docker 理解为“单机容器工具”，K8s 理解为“集群级容器操作系统”。

需要注意：K8s 并不等于 Docker 的上层封装。K8s 通过 CRI（Container Runtime Interface）对接容器运行时，既可以使用 Docker 相关组件，也可以使用 containerd、CRI-O 等运行时。较新版本 K8s 已移除 dockershim，生产中常见运行时是 containerd。

## 面试官想考什么

- 是否知道 Docker 和 K8s 的职责边界；
- 是否理解镜像、容器、Pod、Deployment、Service 的关系；
- 是否知道 K8s 不再强依赖 Docker；
- 是否能说明 K8s 解决了单机 Docker 解决不了的问题；
- 是否有基本的部署、扩缩容、滚动发布认知。

## 标准回答

> Docker 主要解决应用打包和单机容器运行问题，Kubernetes 解决容器在集群中的调度、编排、服务发现、扩缩容、滚动发布和自愈问题。K8s 的最小调度单位不是容器，而是 Pod，一个 Pod 中可以包含一个或多个共享网络和存储的容器。K8s 通过 CRI 调用容器运行时，因此不一定依赖 Docker，生产中常用 containerd。实际项目中通常先用 Docker 构建镜像，再把镜像部署到 K8s 的 Deployment、StatefulSet 等工作负载中。

## 深挖追问

### 为什么 K8s 的最小单位是 Pod，而不是容器？

Pod 表示一组强绑定、需要共同调度的容器。它们共享网络命名空间和部分存储卷，适合 sidecar 模式，例如业务容器旁边放日志采集、代理或配置刷新容器。K8s 调度 Pod，可以保证这些协作容器落在同一节点。

### K8s 比 Docker Compose 多解决了什么？

Docker Compose 更适合单机开发和简单部署；K8s 面向集群，提供调度、节点故障迁移、服务发现、弹性伸缩、滚动升级、配置/密钥管理、资源配额和控制器机制。

### K8s 为什么移除 dockershim？

Docker 不是符合 CRI 的底层运行时，K8s 早期通过 dockershim 适配 Docker。后来 containerd 已经成熟，K8s 为降低维护成本移除了 dockershim。镜像格式仍兼容 OCI，开发者仍可以用 Docker 构建镜像并推送仓库。

## 实战场景/代码示例

### 从 Docker 镜像到 K8s Deployment

```bash
docker build -t registry.example.com/user-service:1.0 .
docker push registry.example.com/user-service:1.0
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: user-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: user-service
  template:
    metadata:
      labels:
        app: user-service
    spec:
      containers:
        - name: user-service
          image: registry.example.com/user-service:1.0
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "1"
              memory: "1Gi"
```

### Service 暴露服务

```yaml
apiVersion: v1
kind: Service
metadata:
  name: user-service
spec:
  selector:
    app: user-service
  ports:
    - port: 80
      targetPort: 8080
```

## 易错点/总结

- Docker 是容器工具，K8s 是容器编排平台；
- K8s 最小调度单位是 Pod，不是单个容器；
- K8s 不再强依赖 Docker，常用运行时是 containerd；
- 镜像构建失败、镜像拉取失败、探针失败是部署排查高频点；
- 生产部署要配置资源 requests/limits、健康检查、日志和监控；
- StatefulSet、Deployment、DaemonSet 适用场景不同，不能混用。

## 参考资料

- Kubernetes Documentation
- Docker Documentation
- Container Runtime Interface (CRI)

<!-- interview-renovation:2026-06-24 -->

## 面试复习强化

### 核心概念

从面试角度看，**Docker 与 K8s 之间的关系是什么？** 可以放在“DevOps”这一类知识中理解。复习时不要只背定义，要能说清：它解决什么问题、依赖哪些前提、正常流程是什么、异常情况下系统会怎样退化或恢复。

### 面试官想考什么

- 是否理解概念背后的设计目标，而不是只记住名词；
- 是否能把机制和真实工程场景联系起来；
- 是否能分析边界条件、失败场景、性能与安全取舍；
- 是否能给出可落地的排查、实现或优化步骤。

### 标准回答

> 兼顾概念、命令、部署流程、可观测性和故障恢复。 追问看是否真操作过：环境差异、权限、网络、存储、日志、进程管理、镜像/容器生命周期。 对于“Docker 与 K8s 之间的关系是什么？”，回答时建议先给一句话定义，再按“工作流程/关键机制 → 典型场景 → 风险与优化”展开，最后补充一两个线上实践点。

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
- K8s 回答要覆盖 Pod、Deployment、Service、Ingress、ConfigMap/Secret、滚动发布、健康检查和自动恢复。

### 易错点 / 总结

- 只背结论、不讲原因，是面试扣分点；要主动解释“为什么这样设计”。
- 只讲正常路径、不讲异常路径，会显得缺少生产经验；至少补充超时、重试、降级、回滚或兜底。
- 不要把理论保证无限放大，工程实现通常还受网络、资源、配置、版本和业务语义约束。
- 总结一句：生产操作要考虑幂等、最小权限、备份、回滚和审计。

