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

