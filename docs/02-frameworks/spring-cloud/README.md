# Spring Cloud

## 核心概念

### Spring Cloud 架构全景

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           客户端请求                                     │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Spring Cloud Gateway                                 │
│              (路由、限流、鉴权、熔断、日志)                                │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   服务 A         │  │   服务 B         │  │   服务 C         │
│                  │  │                  │  │                  │
│  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌────────────┐  │
│  │  Sentinel  │  │  │  │  Sentinel  │  │  │  │  Sentinel  │  │
│  │  熔断限流   │  │  │  │  熔断限流   │  │  │  │  熔断限流   │  │
│  └────────────┘  │  │  └────────────┘  │  │  └────────────┘  │
│  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌────────────┐  │
│  │ OpenFeign  │  │  │  │ OpenFeign  │  │  │  │ OpenFeign  │  │
│  │ 服务调用   │  │  │  │ 服务调用   │  │  │  │ 服务调用   │  │
│  └────────────┘  │  │  └────────────┘  │  │  └────────────┘  │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────────┐
│                           Nacos                                          │
│              (服务注册发现 + 配置中心)                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

**核心组件**：

| 组件 | 作用 |
|------|------|
| Nacos | 服务注册发现 + 配置中心 |
| Gateway | API 网关，路由、限流、鉴权 |
| OpenFeign | 声明式 HTTP 客户端 |
| Sentinel | 流量控制、熔断降级 |
| LoadBalancer | 客户端负载均衡 |
| Seata | 分布式事务 |

---

## Nacos 服务注册发现

### 注册流程

```
┌────────────┐      1. 启动注册       ┌────────────┐
│  服务提供者 │ ─────────────────────▶ │   Nacos    │
│  Provider  │                        │  Server    │
│            │ ◀───────────────────── │            │
│            │     2. 返回注册成功     │            │
└────────────┘                        └─────┬──────┘
                                            │
                                      3. 推送服务列表
                                            │
┌────────────┐                        ┌─────▼──────┐
│  服务消费者 │ ◀───────────────────── │   Nacos    │
│  Consumer  │     4. 拉取服务列表     │  Client    │
│            │ ─────────────────────▶ │  (缓存)    │
│            │     5. 心跳续约         │            │
└────────────┘                        └────────────┘
```

### 服务注册配置

```yaml
# application.yml
spring:
  application:
    name: user-service
  cloud:
    nacos:
      discovery:
        server-addr: 127.0.0.1:8848
        namespace: dev
        group: DEFAULT_GROUP
        service: ${spring.application.name}
        weight: 1  # 权重（负载均衡）
        metadata:
          version: v1
          region: cn-east

server:
  port: 8080
```

### 服务发现与调用

```java
// 方式一：RestTemplate + @LoadBalanced
@Bean
@LoadBalanced
public RestTemplate restTemplate() {
    return new RestTemplate();
}

@Autowired
private RestTemplate restTemplate;

public User getUser(String userId) {
    // 使用服务名代替 IP:Port
    return restTemplate.getForObject(
        "http://user-service/api/users/" + userId, 
        User.class
    );
}

// 方式二：DiscoveryClient 直接获取实例
@Autowired
private DiscoveryClient discoveryClient;

public List<ServiceInstance> getInstances() {
    return discoveryClient.getInstances("user-service");
    // 返回：[ServiceInstance{host='192.168.1.1', port=8080}, ...]
}
```

### 健康检查机制

```
┌─────────────────────────────────────────────────────────────┐
│                    Nacos 健康检查                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  临时实例（EPHEMERAL）          持久实例（PERSISTENT）       │
│  ┌─────────────────────┐       ┌─────────────────────┐     │
│  │ 客户端心跳检测        │       │ 服务端主动探测       │     │
│  │ 默认 5s 发送心跳      │       │ TCP/HTTP/MYSQL      │     │
│  │ 15s 未收到 → 标记不健康│       │ 自定义探测周期       │     │
│  │ 30s 未收到 → 剔除实例  │       │ 永久保留实例         │     │
│  └─────────────────────┘       └─────────────────────┘     │
│                                                             │
│  spring.cloud.nacos.discovery.ephemeral: true/false        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Nacos 配置中心

### 配置结构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nacos Config                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Namespace（命名空间）                                           │
│   ├── dev（开发环境）                                             │
│   │   ├── DEFAULT_GROUP                                          │
│   │   │   ├── user-service.yaml                                  │
│   │   │   ├── user-service-dev.yaml                              │
│   │   │   └── common.yaml                                        │
│   │                                                              │
│   ├── test（测试环境）                                            │
│   │   └── ...                                                    │
│   │                                                              │
│   └── prod（生产环境）                                            │
│       └── ...                                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

配置定位：namespace + group + dataId
例如：dev + DEFAULT_GROUP + user-service.yaml
```

### 配置加载顺序

```
启动顺序（后者覆盖前者）：

1. bootstrap.yaml（Nacos 配置）
         ↓
2. Nacos 共享配置（shared-configs）
         ↓
3. Nacos 扩展配置（extension-configs）
         ↓
4. Nacos 应用配置（dataId = ${spring.application.name}.yaml）
         ↓
5. Nacos 环境配置（dataId = ${spring.application.name}-${profile}.yaml）
         ↓
6. application.yaml（本地配置）
```

### 配置示例

```yaml
# bootstrap.yaml（先于 application.yaml 加载）
spring:
  application:
    name: user-service
  profiles:
    active: dev
  cloud:
    nacos:
      config:
        server-addr: 127.0.0.1:8848
        namespace: dev
        group: DEFAULT_GROUP
        file-extension: yaml
        # 共享配置
        shared-configs:
          - data-id: common.yaml
            group: DEFAULT_GROUP
            refresh: true
        # 扩展配置（优先级高于共享配置）
        extension-configs:
          - data-id: redis.yaml
            group: DEFAULT_GROUP
            refresh: true
          - data-id: mysql.yaml
            group: DEFAULT_GROUP
            refresh: true
        # 动态刷新
        refresh-enabled: true
```

### 配置动态刷新

```java
@RestController
@RefreshScope  // 支持配置动态刷新
public class ConfigController {
    
    @Value("${app.config.title:default}")
    private String title;
    
    @Value("${app.config.max-connections:100}")
    private Integer maxConnections;
    
    @GetMapping("/config")
    public Map<String, Object> getConfig() {
        return Map.of(
            "title", title,
            "maxConnections", maxConnections
        );
    }
}

// Nacos 控制台修改配置 → 自动推送到客户端 → @RefreshScope Bean 重新创建
```

---

## Spring Cloud Gateway

### 核心概念

```
┌─────────────────────────────────────────────────────────────────┐
│                      Gateway Handler                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│   │   Route     │   │   Route     │   │   Route     │          │
│   │  Locator    │   │  Predicate  │   │   Filter    │          │
│   │  路由定位器  │   │  断言工厂    │   │  过滤器工厂  │          │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘          │
│          │                 │                 │                  │
│          ▼                 ▼                 ▼                  │
│   ┌──────────────────────────────────────────────────┐         │
│   │              Route Definition                     │         │
│   │  id: user-service-route                           │         │
│   │  uri: lb://user-service                           │         │
│   │  predicates: Path=/api/users/**                   │         │
│   │  filters: AddRequestHeader=X-Request-Id, ${uuid}  │         │
│   └──────────────────────────────────────────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 路由配置

```yaml
spring:
  cloud:
    gateway:
      routes:
        # 用户服务
        - id: user-service-route
          uri: lb://user-service
          predicates:
            - Path=/api/users/**
            - Method=GET,POST
            - Header=X-Request-Id, \d+
            - Query=token
            - After=2024-01-01T00:00:00+08:00
          filters:
            - AddRequestHeader=X-Response-Time, ${timestamp}
            - AddRequestParameter=source, gateway
            - StripPrefix=1  # /api/users/1 → /users/1
            - name: RequestRateLimiter
              args:
                redis-rate-limiter.replenishRate: 10
                redis-rate-limiter.burstCapacity: 20
                key-resolver: "#{@userKeyResolver}"
        
        # 订单服务
        - id: order-service-route
          uri: lb://order-service
          predicates:
            - Path=/api/orders/**
          filters:
            - name: Hystrix
              args:
                name: fallbackCmd
                fallbackUri: forward:/fallback
        
      # 全局跨域
      globalcors:
        cors-configurations:
          '[/**]':
            allowed-origins: "*"
            allowed-methods: "*"
            allowed-headers: "*"
            allow-credentials: true
```

### 常用断言（Predicate）

| 断言 | 说明 | 示例 |
|------|------|------|
| Path | 路径匹配 | `Path=/api/users/**` |
| Method | HTTP 方法 | `Method=GET,POST` |
| Header | 请求头匹配 | `Header=X-Request-Id, \d+` |
| Query | 查询参数 | `Query=token` |
| After/Before/Between | 时间限制 | `After=2024-01-01T00:00:00+08:00` |
| Cookie | Cookie 匹配 | `Cookie=session, abc.` |
| Host | 主机名匹配 | `Host=**.example.com` |
| RemoteAddr | IP 匹配 | `RemoteAddr=192.168.1.1/24` |
| Weight | 权重路由 | `Weight=group1, 80` |

### 常用过滤器（Filter）

```yaml
# 请求处理
- AddRequestHeader=X-Request-Foo, Bar     # 添加请求头
- AddRequestParameter=foo, bar            # 添加请求参数
- RemoveRequestHeader=X-Request-Foo       # 移除请求头
- StripPrefix=1                           # 移除路径前缀

# 响应处理
- AddResponseHeader=X-Response-Foo, Bar   # 添加响应头
- RemoveResponseHeader=X-Response-Foo     # 移除响应头
- SetStatus=200                           # 设置状态码

# 限流
- name: RequestRateLimiter
  args:
    redis-rate-limiter.replenishRate: 10   # 每秒补充令牌数
    redis-rate-limiter.burstCapacity: 20   # 令牌桶容量
    key-resolver: "#{@userKeyResolver}"    # 限流 Key 解析器

# 重试
- name: Retry
  args:
    retries: 3
    statuses: BAD_GATEWAY,SERVICE_UNAVAILABLE
    methods: GET
    backoff:
      firstBackoff: 100ms
      maxBackoff: 500ms
      factor: 2

# 熔断
- name: CircuitBreaker
  args:
    name: myCircuitBreaker
    fallbackUri: forward:/fallback
```

### 自定义全局过滤器

```java
@Component
public class AuthGlobalFilter implements GlobalFilter, Ordered {
    
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String token = exchange.getRequest().getHeaders().getFirst("Authorization");
        
        // 鉴权逻辑
        if (token == null || !validateToken(token)) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }
        
        // 传递用户信息
        String userId = getUserId(token);
        ServerHttpRequest request = exchange.getRequest().mutate()
            .header("X-User-Id", userId)
            .build();
        
        return chain.filter(exchange.mutate().request(request).build());
    }
    
    @Override
    public int getOrder() {
        return -100;  // 优先级，越小越先执行
    }
}
```

---

## OpenFeign 服务调用

### 基本使用

```java
// 1. 定义 Feign 客户端
@FeignClient(
    name = "user-service",           // 服务名
    path = "/api/users",             // 公共路径前缀
    fallback = UserClientFallback.class  // 降级处理
)
public interface UserClient {
    
    @GetMapping("/{id}")
    User getById(@PathVariable("id") Long id);
    
    @PostMapping
    User create(@RequestBody UserDTO userDTO);
    
    @GetMapping
    List<User> list(@RequestParam("status") Integer status);
}

// 2. 降级处理
@Component
public class UserClientFallback implements UserClient {
    
    @Override
    public User getById(Long id) {
        return User.builder()
            .id(id)
            .name("默认用户")
            .build();
    }
    
    @Override
    public User create(UserDTO userDTO) {
        throw new RuntimeException("用户服务不可用");
    }
    
    @Override
    public List<User> list(Integer status) {
        return Collections.emptyList();
    }
}

// 3. 使用
@Service
public class OrderService {
    
    @Autowired
    private UserClient userClient;
    
    public OrderDTO getOrderWithUser(Long orderId) {
        Order order = orderRepository.findById(orderId);
        User user = userClient.getById(order.getUserId());
        return OrderDTO.from(order, user);
    }
}
```

### 配置优化

```yaml
# application.yml
feign:
  client:
    config:
      default:  # 全局配置
        connect-timeout: 5000   # 连接超时
        read-timeout: 10000     # 读取超时
        logger-level: BASIC     # 日志级别
        
      user-service:  # 特定服务配置
        connect-timeout: 3000
        read-timeout: 5000
        
  compression:
    request:
      enabled: true
      mime-types: application/json
      min-request-size: 2048
    response:
      enabled: true
      
  httpclient:
    enabled: true  # 使用 Apache HttpClient（支持连接池）
    max-connections: 200
    max-connections-per-route: 50
    
  sentinel:
    enabled: true  # 整合 Sentinel

# 开启熔断
ribbon:
  ReadTimeout: 10000
  ConnectTimeout: 5000
  MaxAutoRetries: 1
  MaxAutoRetriesNextServer: 1
```

### Feign 性能优化

```java
// 1. 替换默认 HTTP 客户端（使用 OkHttp 或 Apache HttpClient）
// pom.xml
<dependency>
    <groupId>com.squareup.okhttp3</groupId>
    <artifactId>okhttp</artifactId>
</dependency>
<dependency>
    <groupId>io.github.openfeign</groupId>
    <artifactId>feign-okhttp</artifactId>
</dependency>

// 2. GZIP 压缩
// Spring Cloud Gateway 已配置，Feign 端也开启
feign.compression.request.enabled = true
feign.compression.response.enabled = true

// 3. 请求/响应拦截器
@Component
public class FeignRequestInterceptor implements RequestInterceptor {
    
    @Override
    public void apply(RequestTemplate template) {
        // 添加公共请求头
        template.header("X-Request-Id", UUID.randomUUID().toString());
        template.header("X-Source", "feign-client");
        
        // 传递用户上下文
        String userId = UserContext.getUserId();
        if (userId != null) {
            template.header("X-User-Id", userId);
        }
    }
}

// 4. 自定义编码器/解码器
@Configuration
public class FeignConfig {
    
    @Bean
    public Encoder jsonEncoder(ObjectMapper objectMapper) {
        return new JacksonEncoder(objectMapper);
    }
    
    @Bean
    public Decoder jsonDecoder(ObjectMapper objectMapper) {
        return new JacksonDecoder(objectMapper);
    }
    
    @Bean
    public Logger.Level feignLogger() {
        return Logger.Level.FULL;  // 生产环境用 BASIC
    }
}
```

---

## Sentinel 熔断限流

### 核心概念

```
┌─────────────────────────────────────────────────────────────────┐
│                     Sentinel 保护机制                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  流量控制（Flow Control）                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │   请求 ──▶ [Sentinel] ──▶ 通过 ──▶ 业务处理              │    │
│  │              │                                          │    │
│  │              │ 拒绝                                      │    │
│  │              ▼                                          │    │
│  │         [fallback] ──▶ 降级处理                         │    │
│  │                                                          │    │
│  │  策略：直接拒绝 / 冷启动 / 匀速排队                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  熔断降级（Circuit Breaker）                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │   正常：闭合状态（CLOSED）                                │    │
│  │        ↓ 失败率/响应时间超阈值                           │    │
│  │   打开状态（OPEN）：快速失败，不调用服务                   │    │
│  │        ↓ 达到熔断时长                                    │    │
│  │   半开状态（HALF_OPEN）：尝试调用                        │    │
│  │        ↓ 成功 → 闭合；失败 → 再次打开                    │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 规则配置

```java
// 1. 流控规则
List<FlowRule> rules = new ArrayList<>();
FlowRule rule = new FlowRule("order-service")
    .setGrade(RuleConstant.FLOW_GRADE_QPS)  // QPS/线程数
    .setCount(100)                           // 阈值
    .setControlBehavior(RuleConstant.CONTROL_BEHAVIOR_DEFAULT)
    .setStrategy(RuleConstant.STRATEGY_DIRECT);  // 直接限流
rules.add(rule);
FlowRuleManager.loadRules(rules);

// 2. 熔断规则
List<CircuitBreakerRule> rules = new ArrayList<>();
CircuitBreakerRule rule = CircuitBreakerRule.builder()
    .setResource("order-service")
    .setGrade(CircuitBreakerRule.SLOW_REQUEST_RATIO)  // 慢调用比例
    .setCount(0.5)                                      // 比例阈值 50%
    .setMinRequestAmount(10)                           // 最小请求数
    .setStatIntervalMs(10000)                          // 统计周期 10s
    .setTimeWindow(10)                                 // 熔断时长 10s
    .build();
rules.add(rule);
CircuitBreakerRuleManager.loadRules(rules);

// 3. 热点规则
List<ParamFlowRule> rules = new ArrayList<>();
ParamFlowRule rule = new ParamFlowRule("getUser")
    .setParamIdx(0)                    // 参数索引（userId）
    .setCount(10)                      // 单个参数 QPS 阈值
    .setControlBehavior(RuleConstant.CONTROL_BEHAVIOR_DEFAULT)
    .setDurationInSec(1)
    .setMaxQueueingTimeMs(500);
rules.add(rule);
ParamFlowRuleManager.loadRules(rules);
```

### 整合使用

```java
// 1. 定义资源
@SentinelResource(
    value = "getUser",
    blockHandler = "handleBlock",      // 限流/熔断降级
    fallback = "handleFallback"        // 异常降级
)
@GetMapping("/{id}")
public User getUser(@PathVariable("id") Long id) {
    return userService.getById(id);
}

// 2. 降级处理
public User handleBlock(Long id, BlockException e) {
    // 限流/熔断时的处理
    return User.builder()
        .id(id)
        .name("服务繁忙，请稍后重试")
        .build();
}

public User handleFallback(Long id, Throwable e) {
    // 业务异常处理
    log.error("获取用户失败: {}", id, e);
    return User.builder()
        .id(id)
        .name("服务异常")
        .build();
}

// 3. Feign 整合 Sentinel
@FeignClient(
    name = "user-service",
    fallback = UserClientFallback.class,
    configuration = FeignSentinelConfiguration.class
)
public interface UserClient {}

// FeignSentinelConfiguration
@Configuration
public class FeignSentinelConfiguration {
    
    @Bean
    public Fallback fallback() {
        return new FeignFallback();
    }
    
    static class FeignFallback implements Fallback<MethodMetadata> {
        @Override
        public Object create(MethodMetadata methodMetadata) {
            // 返回降级对象
            return getDefaultValue(methodMetadata.getReturnType());
        }
    }
}
```

---

## 负载均衡 LoadBalancer

### 策略配置

```yaml
# application.yml
spring:
  cloud:
    loadbalancer:
      configurations: round-robin, random  # 启用策略
      # 某服务指定策略
      integrations:
        user-service:
          strategy: random
      
# 全局默认策略
ribbon:
  NFLoadBalancerRuleClassName: com.alibaba.cloud.nacos.ribbon.NacosRule

# 代码配置
@Configuration
public class LoadBalancerConfig {
    
    @Bean
    public ReactorLoadBalancer<ServiceInstance> randomLoadBalancer(
            ServiceInstanceListSupplier supplier) {
        return new RandomReactorLoadBalancer<>(supplier);
    }
}
```

### 负载均衡策略

| 策略 | 说明 |
|------|------|
| RandomRule | 随机选择 |
| RoundRobinRule | 轮询（默认） |
| WeightedResponseTimeRule | 响应时间加权 |
| NacosRule | Nacos 加权路由 |
| BestAvailableRule | 选择最小并发数 |
| AvailabilityFilteringRule | 过滤不可用后轮询 |

---

## 面试高频问题

### 1. Nacos 与 Eureka 的区别？

| 特性 | Nacos | Eureka |
|------|-------|--------|
| 服务注册 | 支持 | 支持 |
| 配置中心 | 支持 | 不支持 |
| 持久化 | 支持（MySQL） | 不支持 |
| 多环境 | Namespace/Group | - |
|  CAP | 支持 CP/AP | 仅 AP |
| 健康检查 | TCP/HTTP/MySQL | 心跳 |
| 同步机制 | 广播 | Peer to Peer |

### 2. Gateway 与 Nginx 的区别？

| 对比项 | Gateway | Nginx |
|--------|---------|-------|
| 层次 | 应用层 | 传输层/应用层 |
| 功能 | 路由/限流/鉴权 | 负载均衡/反向代理 |
| 动态路由 | 支持 | 需手动配置 |
| 限流粒度 | 路径/参数/用户 | IP/连接数 |
| 集成 | Spring Cloud | 通用 |

**最佳实践**：Nginx（负载均衡） + Gateway（微服务路由）

### 3. Feign 调用失败如何处理？

```
1. 超时：配置 connect-timeout / read-timeout
2. 熔断：配置 Sentinel fallback
3. 重试：配置 Ribbon 重试策略
4. 降级：实现 FallbackFactory
5. 日志：配置 feign.logger-level
```

### 4. 如何保证微服务配置的安全性？

```yaml
# 1. 敏感配置加密
spring.cloud.nacos.config.secret-key=xxx

# 2. 命名空间隔离
# dev/test/prod 独立 namespace

# 3. 权限控制
# Nacos 配置 ACL

# 4. 加密存储
# 使用 jasypt 或配置中心加密存储
```

---

## 延伸思考

### Spring Cloud Alibaba 生态

```
Spring Cloud Alibaba
├── Nacos          → 服务注册发现 + 配置中心
├── Sentinel       → 熔断限流
├── Seata          → 分布式事务
├── RocketMQ       → 消息队列
└── Dubbo          → RPC 框架

对比 Spring Cloud Netflix
├── Eureka         → 注册中心（已停止维护）
├── Hystrix        → 熔断（推荐 Sentinel）
├── Ribbon         → 负载均衡（推荐 LoadBalancer）
├── Feign          → 服务调用（推荐 OpenFeign）
└── Zuul           → 网关（推荐 Gateway）
```

### 服务注册发现选择

| 场景 | 推荐方案 |
|------|----------|
| 新项目 | Nacos |
| 追求简单 | Nacos |
| 需要配置中心 | Nacos |
| 存量 Eureka 项目 | 继续用 或 迁移 |
| 金融级（CP） | Nacos（CP模式）/Zookeeper |

---

## 参考资料

- [Spring Cloud Alibaba 官方文档](https://spring.io/projects/spring-cloud-alibaba)
- [Nacos 官方文档](https://nacos.io/zh-cn/docs/what-is-nacos.html)
- [Sentinel 官方文档](https://sentinelguard.io/zh-cn/docs/introduction.html)
- [Spring Cloud Gateway 官方文档](https://docs.spring.io/spring-cloud-gateway/docs/current/reference/html/)

---

*最后更新: 2026-04-08*