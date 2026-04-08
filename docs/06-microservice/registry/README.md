# 服务注册发现

## 核心概念

### 什么是服务注册发现

在微服务架构中，服务实例动态变化（扩缩容、故障重启），客户端需要一种机制来发现可用的服务实例，这就是服务注册发现。

**传统方式**：
```
客户端 → 硬编码服务地址
问题：
1. 服务地址变化需要修改配置
2. 无法自动感知服务上下线
3. 无法实现负载均衡
```

**服务注册发现**：
```
服务提供者 → 注册中心注册
服务消费者 → 注册中心订阅
注册中心 → 维护服务列表，推送变更
```

### 核心组件

```
┌──────────────────────────────────────────────────┐
│                  注册中心                          │
│  ┌─────────────────────────────────────────────┐ │
│  │ 服务注册表                                    │ │
│  │ user-service: [192.168.1.1:8080,            │ │
│  │                 192.168.1.2:8080]           │ │
│  │ order-service: [192.168.1.3:8080]           │ │
│  └─────────────────────────────────────────────┘ │
└────────────────────┬─────────────────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────↓────┐ ┌────↓────┐ ┌────↓────┐
    │ 服务A   │ │ 服务B   │ │ 服务C   │
    │ 注册    │ │ 注册    │ │ 订阅    │
    └─────────┘ └─────────┘ └─────────┘
```

## Nacos

### 简介

Nacos（Dynamic Naming and Configuration Service）是阿里开源的服务注册发现和配置中心。

**特点**：
- 同时支持服务注册发现和配置管理
- 支持 AP 和 CP 模式切换
- 提供 Web 控制台
- 支持多种语言

### 部署

```bash
# Docker 部署
docker run -d \
  --name nacos \
  -e MODE=standalone \
  -p 8848:8848 \
  nacos/nacos-server:2.2.0

# 访问控制台
http://localhost:8848/nacos
默认账号：nacos/nacos
```

### 服务注册

**依赖**：
```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
```

**配置**：
```yaml
spring:
  application:
    name: user-service
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
        namespace: dev
        group: DEFAULT_GROUP
        # 心跳间隔
        heart-beat-interval: 5000
        # 心跳超时
        heart-beat-timeout: 15000
        # IP 删除超时
        ip-delete-timeout: 30000

server:
  port: 8080
```

**启动类**：
```java
@SpringBootApplication
@EnableDiscoveryClient
public class UserServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(UserServiceApplication.class, args);
    }
}
```

### 服务发现

**方式一：DiscoveryClient**：
```java
@Autowired
private DiscoveryClient discoveryClient;

public List<String> getServiceInstances(String serviceId) {
    List<ServiceInstance> instances = discoveryClient.getInstances(serviceId);
    return instances.stream()
        .map(instance -> instance.getUri().toString())
        .collect(Collectors.toList());
}
```

**方式二：RestTemplate + @LoadBalanced**：
```java
@Configuration
public class RestTemplateConfig {
    
    @Bean
    @LoadBalanced
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}

@Service
public class UserService {
    
    @Autowired
    private RestTemplate restTemplate;
    
    public User getUser(Long userId) {
        // user-service 会被替换为实际的服务地址
        return restTemplate.getForObject(
            "http://user-service/api/user/" + userId, 
            User.class
        );
    }
}
```

**方式三：OpenFeign**：
```java
@FeignClient(name = "user-service")
public interface UserClient {
    
    @GetMapping("/api/user/{userId}")
    User getUser(@PathVariable("userId") Long userId);
}

@Service
public class OrderService {
    
    @Autowired
    private UserClient userClient;
    
    public Order createOrder(Long userId) {
        User user = userClient.getUser(userId);
        // ...
    }
}
```

### 健康检查

**临时实例**（默认）：
- 客户端主动发送心跳
- 心跳超时后自动剔除
- 适合微服务架构

**持久实例**：
- 服务端主动探测
- 支持多种探测方式（TCP、HTTP、MySQL）
- 适合传统应用

```yaml
spring:
  cloud:
    nacos:
      discovery:
        # 临时实例
        ephemeral: true
```

### AP/CP 切换

```bash
# AP 模式（默认）- 优先可用性
# 适合注册中心集群网络分区时，仍可注册发现

# CP 模式 - 优先一致性
# 适合需要强一致性的场景
curl -X PUT "localhost:8848/nacos/v1/ns/operator/switches?entry=serverMode&value=CP"
```

## Eureka

### 简介

Netflix 开源的服务注册中心，Spring Cloud 早期默认方案。

**特点**：
- AP 模式
- 自我保护机制
- 简单易用

### 服务端配置

```yaml
server:
  port: 8761

eureka:
  instance:
    hostname: localhost
  client:
    register-with-eureka: false
    fetch-registry: false
    service-url:
      defaultZone: http://${eureka.instance.hostname}:${server.port}/eureka/
```

### 客户端配置

```yaml
spring:
  application:
    name: user-service

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
  instance:
    lease-renewal-interval-in-seconds: 30  # 心跳间隔
    lease-expiration-duration-in-seconds: 90  # 过期时间
```

### 自我保护机制

当短时间内丢失大量心跳时，Eureka 认为是网络问题，不剔除服务实例。

```yaml
eureka:
  server:
    enable-self-preservation: true  # 开启自我保护
    renewal-percent-threshold: 0.85  # 阈值
```

## Consul

### 简介

HashiCorp 开源的服务注册发现工具。

**特点**：
- CP 模式（Raft 协议）
- 支持多数据中心
- 提供 Key/Value 存储
- 支持健康检查

### 部署

```bash
# Docker 部署
docker run -d \
  --name consul \
  -p 8500:8500 \
  consul:1.15

# 访问控制台
http://localhost:8500
```

### 服务注册

```yaml
spring:
  application:
    name: user-service
  cloud:
    consul:
      host: localhost
      port: 8500
      discovery:
        service-name: ${spring.application.name}
        health-check-interval: 10s
        health-check-path: /actuator/health
```

## 负载均衡

### Ribbon（已停止维护）

Spring Cloud 2020 后已移除 Ribbon，改用 Spring Cloud LoadBalancer。

### Spring Cloud LoadBalancer

**依赖**：
```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-loadbalancer</artifactId>
</dependency>
```

**配置**：
```yaml
spring:
  cloud:
    loadbalancer:
      ribbon:
        enabled: false
```

**自定义负载均衡策略**：
```java
@Configuration
public class LoadBalancerConfig {
    
    @Bean
    ReactorLoadBalancer<ServiceInstance> randomLoadBalancer(
            Environment environment, LoadBalancerClientFactory factory) {
        String name = environment.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
        return new RandomLoadBalancer(
            factory.getLazyProvider(name, ServiceInstanceListSupplier.class), name);
    }
}
```

## 面试高频问题

### 1. Nacos 和 Eureka 的区别？

| 对比项 | Nacos | Eureka |
|--------|-------|--------|
| CAP | AP/CP 可切换 | AP |
| 健康检查 | 心跳/TCP/HTTP/MySQL | 心跳 |
| 配置中心 | 支持 | 不支持 |
| 控制台 | 支持 | 支持 |
| 社区 | 活跃 | 停止维护 |

### 2. 服务注册发现的工作流程？

**注册流程**：
```
服务启动 → 向注册中心发送注册请求 → 
注册中心保存服务信息 → 返回成功
```

**发现流程**：
```
服务启动 → 向注册中心订阅服务 → 
注册中心返回服务列表 → 本地缓存 → 
注册变更时推送新列表
```

**心跳机制**：
```
服务实例 → 定期发送心跳 → 注册中心
↓
注册中心 → 超时未收到心跳 → 剔除实例
```

### 3. 注册中心如何保证高可用？

**参考回答**：
1. **集群部署**：多节点，数据同步
2. **数据持久化**：Nacos 支持 MySQL 持久化
3. **本地缓存**：客户端缓存服务列表
4. **自我保护**：Eureka 自我保护机制

### 4. 服务下线如何保证优雅？

```java
@PreDestroy
public void onShutdown() {
    // 1. 标记为不可用（不接收新请求）
    nacosNamingService.deregisterInstance(serviceName, ip, port);
    
    // 2. 等待正在处理的请求完成
    Thread.sleep(5000);
    
    // 3. 关闭资源
    // ...
}
```

## 实战场景

### 场景1：多环境隔离

```yaml
# 开发环境
spring:
  cloud:
    nacos:
      discovery:
        namespace: dev
        group: ORDER_GROUP

# 生产环境
spring:
  cloud:
    nacos:
      discovery:
        namespace: prod
        group: ORDER_GROUP
```

### 场景2：灰度发布

```java
// 基于 Metadata 的灰度路由
@Bean
public ServiceInstanceListSupplier grayServiceInstanceListSupplier(
        ConfigurableApplicationContext context) {
    return new GrayServiceInstanceListSupplier(
        ServiceInstanceListSupplier.builder()
            .withDiscoveryClient()
            .build(context)
    );
}

public class GrayServiceInstanceListSupplier implements ServiceInstanceListSupplier {
    
    @Override
    public Flux<List<ServiceInstance>> get() {
        // 根据 Header 中的版本号选择实例
        String version = RequestContext.getVersion();
        return delegate.get()
            .map(instances -> instances.stream()
                .filter(instance -> version.equals(
                    instance.getMetadata().get("version")))
                .collect(Collectors.toList()));
    }
}
```

## 延伸思考

1. **为什么 Eureka 采用 AP 而 Consul 采用 CP？**
   - Eureka：优先保证可用性，网络分区时仍可服务
   - Consul：保证数据一致性，网络分区时可能不可用

2. **服务注册发现和服务网格的关系？**
   - 传统：SDK 方式，侵入应用
   - Service Mesh：Sidecar 方式，对应用透明

## 参考资料

- [Nacos 官方文档](https://nacos.io/zh-cn/docs/what-is-nacos.html)
- [Spring Cloud LoadBalancer](https://docs.spring.io/spring-cloud-commons/docs/current/reference/html/#spring-cloud-loadbalancer)
- [服务注册发现原理](https://www.nginx.com/blog/service-discovery-in-a-microservices-architecture/)
