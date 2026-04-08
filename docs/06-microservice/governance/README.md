# 服务治理

## 核心概念

### 什么是服务治理

服务治理是指对微服务架构中的服务进行全生命周期管理，包括服务注册发现、负载均衡、熔断降级、限流、重试、超时控制等。

### 为什么需要服务治理

**微服务架构的问题**：
```
服务数量多 → 服务间调用复杂
网络不稳定 → 调用可能失败
服务不可用 → 雪崩效应
流量波动大 → 服务过载
```

**治理目标**：
- **高可用**：服务故障时自动降级
- **高性能**：合理分配流量
- **可观测**：监控服务健康状态

## 服务注册发现

### Nacos 注册中心

**服务注册**：
```java
@SpringBootApplication
@EnableDiscoveryClient
public class UserServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(UserServiceApplication.class, args);
    }
}
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
```

**服务发现**：
```java
@Autowired
private DiscoveryClient discoveryClient;

public List<ServiceInstance> getInstances(String serviceId) {
    return discoveryClient.getInstances(serviceId);
}
```

### 负载均衡策略

```java
@Configuration
public class LoadBalancerConfig {
    
    @Bean
    public ReactorLoadBalancer<ServiceInstance> randomLoadBalancer(
            Environment environment, LoadBalancerClientFactory factory) {
        String name = environment.getProperty(LoadBalancerClientFactory.PROPERTY_NAME);
        return new RandomLoadBalancer(
            factory.getLazyProvider(name, ServiceInstanceListSupplier.class), name);
    }
}
```

**常用策略**：
| 策略 | 说明 | 适用场景 |
|------|------|----------|
| RoundRobin | 轮询 | 无状态服务 |
| Random | 随机 | 无状态服务 |
| Weighted | 加权 | 配置不同的服务 |
| LeastConn | 最少连接 | 长连接场景 |
| ConsistentHash | 一致性哈希 | 缓存、会话 |

## 熔断降级

### Resilience4j

**依赖**：
```xml
<dependency>
    <groupId>io.github.resilience4j</groupId>
    <artifactId>resilience4j-spring-boot2</artifactId>
</dependency>
```

**配置**：
```yaml
resilience4j:
  circuitbreaker:
    configs:
      default:
        # 滑动窗口类型
        slidingWindowType: COUNT_BASED
        # 滑动窗口大小
        slidingWindowSize: 10
        # 失败率阈值
        failureRateThreshold: 50
        # 慢调用率阈值
        slowCallRateThreshold: 100
        # 慢调用时间阈值
        slowCallDurationThreshold: 2s
        # 最小调用次数
        minimumNumberOfCalls: 5
        # OPEN 状态等待时间
        waitDurationInOpenState: 10s
        # HALF_OPEN 状态允许的调用次数
        permittedNumberOfCallsInHalfOpenState: 3
    instances:
      userService:
        baseConfig: default
```

**使用**：
```java
@Service
public class OrderService {
    
    @CircuitBreaker(name = "userService", fallbackMethod = "getUserFallback")
    public User getUser(Long userId) {
        return userClient.getUser(userId);
    }
    
    public User getUserFallback(Long userId, Throwable t) {
        log.warn("getUser fallback, userId: {}", userId, t);
        return User.defaultUser();
    }
}
```

### 熔断器状态机

```
        失败率 >= 阈值
CLOSED ─────────────────> OPEN
   ↑                        │
   │                        │ 等待时间到
   │                        ↓
   │<───────────────── HALF_OPEN
   │   失败率 < 阈值          │
   └───────────────────────┘
```

**状态说明**：
- **CLOSED**：正常状态，请求正常通过
- **OPEN**：熔断状态，请求直接返回 fallback
- **HALF_OPEN**：探测状态，允许部分请求通过测试

## 限流

### Sentinel

**依赖**：
```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-sentinel</artifactId>
</dependency>
```

**配置**：
```yaml
spring:
  cloud:
    sentinel:
      transport:
        dashboard: localhost:8080
      datasource:
        flow:
          nacos:
            server-addr: localhost:8848
            data-id: sentinel-flow-rules
            rule-type: flow
```

**限流规则**：
```java
@SentinelResource(value = "getUser", blockHandler = "handleBlock")
public User getUser(Long userId) {
    return userRepository.findById(userId);
}

public User handleBlock(Long userId, BlockException ex) {
    return User.defaultUser();
}
```

**流控模式**：
| 模式 | 说明 |
|------|------|
| 直接 | 直接对该资源限流 |
| 关联 | 关联资源达到阈值，限流该资源 |
| 链路 | 只有从指定链路来的请求才限流 |

**流控效果**：
| 效果 | 说明 |
|------|------|
| 快速失败 | 直接抛出 BlockException |
| Warm Up | 预热，缓慢增加阈值 |
| 排队等待 | 请求排队，匀速通过 |

### 限流算法

**1. 固定窗口**：
```java
// 每分钟最多 100 次
private int count = 0;
private long windowStart = System.currentTimeMillis();

public boolean allow() {
    long now = System.currentTimeMillis();
    if (now - windowStart > 60000) {
        count = 0;
        windowStart = now;
    }
    if (count < 100) {
        count++;
        return true;
    }
    return false;
}
// 问题：窗口边界可能出现 2x 流量
```

**2. 滑动窗口**：
```java
// 维护多个小窗口
private LinkedList<Long> timestamps = new LinkedList<>();

public boolean allow() {
    long now = System.currentTimeMillis();
    // 移除 1 分钟前的时间戳
    while (!timestamps.isEmpty() && timestamps.peek() < now - 60000) {
        timestamps.poll();
    }
    if (timestamps.size() < 100) {
        timestamps.offer(now);
        return true;
    }
    return false;
}
```

**3. 令牌桶**：
```java
private int tokens = 100;
private int capacity = 100;
private int rate = 10; // 每秒补充 10 个令牌
private long lastRefill = System.currentTimeMillis();

public synchronized boolean allow() {
    // 补充令牌
    long now = System.currentTimeMillis();
    int newTokens = (int) ((now - lastRefill) / 1000.0 * rate);
    tokens = Math.min(capacity, tokens + newTokens);
    lastRefill = now;
    
    // 消耗令牌
    if (tokens > 0) {
        tokens--;
        return true;
    }
    return false;
}
```

**4. 漏桶**：
```java
private int water = 0;
private int capacity = 100;
private int rate = 10; // 每秒流出 10 个请求
private long lastLeak = System.currentTimeMillis();

public synchronized boolean allow() {
    // 漏水
    long now = System.currentTimeMillis();
    int leaked = (int) ((now - lastLeak) / 1000.0 * rate);
    water = Math.max(0, water - leaked);
    lastLeak = now;
    
    // 加水
    if (water < capacity) {
        water++;
        return true;
    }
    return false;
}
```

## 重试与超时

### 重试策略

```java
@Configuration
public class RetryConfig {
    
    @Bean
    public RetryTemplate retryTemplate() {
        RetryTemplate template = new RetryTemplate();
        
        // 重试策略
        SimpleRetryPolicy retryPolicy = new SimpleRetryPolicy();
        retryPolicy.setMaxAttempts(3);
        template.setRetryPolicy(retryPolicy);
        
        // 退避策略
        ExponentialBackOffPolicy backOffPolicy = new ExponentialBackOffPolicy();
        backOffPolicy.setInitialInterval(100);
        backOffPolicy.setMultiplier(2);
        backOffPolicy.setMaxInterval(1000);
        template.setBackOffPolicy(backOffPolicy);
        
        return template;
    }
}
```

**使用**：
```java
retryTemplate.execute(context -> {
    return userClient.getUser(userId);
}, context -> {
    // 重试失败后执行
    return User.defaultUser();
});
```

### 超时控制

```yaml
# Feign 超时配置
feign:
  client:
    config:
      default:
        connectTimeout: 5000
        readTimeout: 10000

# Ribbon 超时配置（如果使用）
ribbon:
  ConnectTimeout: 5000
  ReadTimeout: 10000
```

## 面试高频问题

### 1. 熔断、降级、限流的区别？

**参考回答**：

| 概念 | 目的 | 触发条件 |
|------|------|----------|
| 熔断 | 保护系统 | 失败率达到阈值 |
| 降级 | 保证核心功能 | 系统压力过大 |
| 限流 | 防止过载 | 请求超过阈值 |

### 2. 熔断器的三种状态是什么？

**参考回答**：
- **CLOSED**：关闭状态，请求正常通过
- **OPEN**：打开状态，请求直接返回 fallback
- **HALF_OPEN**：半开状态，允许少量请求探测服务是否恢复

### 3. 限流算法有哪些？各有什么优缺点？

**参考回答**：

| 算法 | 优点 | 缺点 |
|------|------|------|
| 固定窗口 | 简单 | 边界问题 |
| 滑动窗口 | 精确 | 内存占用 |
| 令牌桶 | 允许突发 | 需要定时补充 |
| 漏桶 | 匀速流出 | 不允许突发 |

### 4. 什么是雪崩效应？如何预防？

**参考回答**：
雪崩效应：一个服务故障导致依赖它的服务也故障，依次扩散。

**预防措施**：
1. **熔断**：故障时快速失败
2. **降级**：返回兜底数据
3. **限流**：控制请求量
4. **超时**：避免长时间等待
5. **隔离**：线程池隔离、舱壁模式

## 实战场景

### 场景1：订单服务调用用户服务

```java
@Service
public class OrderService {
    
    @CircuitBreaker(name = "userService", fallbackMethod = "getUserFallback")
    @RateLimiter(name = "userService")
    @Retry(name = "userService")
    public Order createOrder(Long userId, Long productId) {
        User user = userClient.getUser(userId);
        Product product = productClient.getProduct(productId);
        
        Order order = new Order();
        order.setUserId(userId);
        order.setProductId(productId);
        order.setUserName(user.getName());
        order.setProductName(product.getName());
        
        return orderRepository.save(order);
    }
    
    // 降级方法
    public Order getUserFallback(Long userId, Long productId, Throwable t) {
        log.warn("createOrder fallback", t);
        Order order = new Order();
        order.setUserId(userId);
        order.setProductId(productId);
        order.setUserName("默认用户");
        return order;
    }
}
```

### 场景2：热点参数限流

```java
// Sentinel 热点参数限流
@SentinelResource(value = "getProduct", blockHandler = "handleBlock")
public Product getProduct(Long productId) {
    return productRepository.findById(productId);
}

// 热点参数规则
// productId = 1001 的 QPS 限制为 10
// 其他 productId 的 QPS 限制为 100
```

## 延伸思考

1. **服务治理和服务网格的关系？**
   - 服务治理是概念，服务网格是实现方式之一
   - Service Mesh 将治理逻辑下沉到 Sidecar

2. **熔断和降级哪个先触发？**
   - 熔断：服务端故障
   - 降级：主动策略
   - 实际可能同时存在

## 参考资料

- [Resilience4j 官方文档](https://resilience4j.readme.io/)
- [Sentinel 官方文档](https://sentinelguard.io/zh-cn/)
- [服务治理最佳实践](https://www.martinfowler.com/articles/microservice-trade-offs.html)
