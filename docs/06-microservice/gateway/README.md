# API 网关

## 核心概念

### 什么是 API 网关

API 网关是系统的统一入口，负责请求路由、协议转换、认证鉴权、限流熔断等功能。类似于门面模式（Facade Pattern），将内部服务细节隐藏在网关之后。

### 为什么需要网关

**没有网关的问题**：
```
客户端 → 服务A
       → 服务B
       → 服务C

问题：
1. 客户端需要知道所有服务的地址
2. 每个服务都要实现认证、鉴权、限流
3. 跨域问题重复处理
4. 无法统一监控和日志
```

**有了网关**：
```
客户端 → API网关 → 服务A
                 → 服务B
                 → 服务C

优势：
1. 统一入口，简化客户端
2. 统一认证鉴权
3. 统一限流熔断
4. 统一日志监控
```

### 网关核心功能

| 功能 | 说明 |
|------|------|
| 路由转发 | 请求路径映射到后端服务 |
| 负载均衡 | 多实例负载分发 |
| 认证鉴权 | JWT 校验、权限验证 |
| 限流熔断 | 保护后端服务 |
| 协议转换 | HTTP ↔ gRPC、WebSocket |
| 灰度发布 | 流量比例控制 |
| 日志监控 | 请求链路追踪 |

## Spring Cloud Gateway

### 核心组件

```
┌─────────────────────────────────────────────┐
│                 Gateway Handler             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ Filter  │→ │ Filter  │→ │ Filter  │     │
│  │ (前置)  │  │ (前置)  │  │ (路由)  │     │
│  └─────────┘  └─────────┘  └────┬────┘     │
└─────────────────────────────────┼───────────┘
                                  ↓
                           ┌──────────┐
                           │  服务    │
                           └──────────┘
```

**三大核心概念**：
- **Route（路由）**：网关的基本构建块，包含 ID、目标 URI、断言和过滤器
- **Predicate（断言）**：匹配 HTTP 请求的条件
- **Filter（过滤器）**：在请求发送前后修改请求和响应

### 基本配置

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: user-service
          uri: lb://user-service
          predicates:
            - Path=/api/user/**
          filters:
            - StripPrefix=1
            - name: RequestRateLimiter
              args:
                redis-rate-limiter.replenishRate: 10
                redis-rate-limiter.burstCapacity: 20
```

### 内置断言（Predicate）

```yaml
predicates:
  # 路径匹配
  - Path=/api/user/**
  
  # 请求方法
  - Method=GET,POST
  
  # 请求头
  - Header=X-Request-Id, \d+
  
  # 查询参数
  - Query=token
  
  # 时间
  - After=2024-01-01T00:00:00+08:00
  - Before=2024-12-31T23:59:59+08:00
  - Between=2024-01-01T00:00:00+08:00, 2024-12-31T23:59:59+08:00
  
  # Cookie
  - Cookie=session, .+
  
  # IP 地址
  - RemoteAddr=192.168.1.1/24
```

### 内置过滤器（Filter）

```yaml
filters:
  # 添加请求头
  - AddRequestHeader=X-Request-Foo, Bar
  
  # 添加响应头
  - AddResponseHeader=X-Response-Foo, Bar
  
  # 去除路径前缀
  - StripPrefix=1  # /api/user/123 → /user/123
  
  # 添加路径前缀
  - PrefixPath=/api  # /user/123 → /api/user/123
  
  # 重试
  - name: Retry
    args:
      retries: 3
      statuses: BAD_GATEWAY,SERVICE_UNAVAILABLE
      methods: GET
      backoff:
        firstBackoff: 100ms
        maxBackoff: 500ms
        
  # 限流
  - name: RequestRateLimiter
    args:
      redis-rate-limiter.replenishRate: 10
      redis-rate-limiter.burstCapacity: 20
      key-resolver: "#{@userKeyResolver}"
```

### 自定义过滤器

```java
@Component
public class AuthGatewayFilter implements GlobalFilter, Ordered {
    
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        
        // 1. 获取 token
        String token = request.getHeaders().getFirst("Authorization");
        if (StringUtils.isEmpty(token)) {
            return unauthorized(exchange);
        }
        
        // 2. 验证 token
        try {
            Claims claims = JwtUtil.parseToken(token);
            String userId = claims.getSubject();
            
            // 3. 添加用户信息到请求头
            ServerHttpRequest newRequest = request.mutate()
                .header("X-User-Id", userId)
                .build();
            
            return chain.filter(exchange.mutate().request(newRequest).build());
        } catch (Exception e) {
            return unauthorized(exchange);
        }
    }
    
    private Mono<Void> unauthorized(ServerWebExchange exchange) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        return response.writeWith(Mono.just(
            response.bufferFactory().wrap("Unauthorized".getBytes())
        ));
    }
    
    @Override
    public int getOrder() {
        return -100; // 优先级高，先执行
    }
}
```

### 限流配置

```java
// 基于 IP 限流
@Bean
public KeyResolver ipKeyResolver() {
    return exchange -> Mono.just(
        exchange.getRequest()
            .getRemoteAddress()
            .getAddress()
            .getHostAddress()
    );
}

// 基于用户 ID 限流
@Bean
public KeyResolver userKeyResolver() {
    return exchange -> Mono.just(
        exchange.getRequest()
            .getHeaders()
            .getFirst("X-User-Id")
    );
}

// 基于 API 路径限流
@Bean
public KeyResolver apiKeyResolver() {
    return exchange -> Mono.just(
        exchange.getRequest().getPath().value()
    );
}
```

## Kong 网关

### 简介

Kong 是基于 Nginx + OpenResty 的高性能 API 网关，支持插件扩展。

**特点**：
- 高性能（Nginx 底层）
- 丰富的插件生态
- 支持声明式配置
- 提供 Admin API 和 Dashboard

### 核心概念

```
Service（服务）
    ↑
Route（路由）
    ↑
Plugin（插件）
```

### Docker 部署

```bash
# 创建网络
docker network create kong-net

# 启动 PostgreSQL
docker run -d --name kong-database \
  --network kong-net \
  -p 5432:5432 \
  -e "POSTGRES_USER=kong" \
  -e "POSTGRES_DB=kong" \
  postgres:13

# 初始化数据库
docker run --rm \
  --network kong-net \
  -e "KONG_DATABASE=postgres" \
  -e "KONG_PG_HOST=kong-database" \
  kong:latest kong migrations bootstrap

# 启动 Kong
docker run -d --name kong \
  --network kong-net \
  -e "KONG_DATABASE=postgres" \
  -e "KONG_PG_HOST=kong-database" \
  -e "KONG_PROXY_ACCESS_LOG=/dev/stdout" \
  -e "KONG_ADMIN_ACCESS_LOG=/dev/stdout" \
  -p 8000:8000 \
  -p 8443:8443 \
  -p 8001:8001 \
  -p 8444:8444 \
  kong:latest
```

### 常用操作

```bash
# 添加服务
curl -i -X POST http://localhost:8001/services \
  -d "name=user-service" \
  -d "url=http://user-service:8080"

# 添加路由
curl -i -X POST http://localhost:8001/services/user-service/routes \
  -d "paths[]=/api/user"

# 添加 JWT 插件
curl -i -X POST http://localhost:8001/services/user-service/plugins \
  -d "name=jwt"

# 添加限流插件
curl -i -X POST http://localhost:8001/services/user-service/plugins \
  -d "name=rate-limiting" \
  -d "config.second=10" \
  -d "config.hour=10000"
```

## 认证鉴权

### JWT 认证流程

```
客户端                    网关                    用户服务
   |                       |                        |
   |---登录请求----------->|                        |
   |                       |---转发登录----------->|
   |                       |<--返回 JWT-----------|
   |<--返回 JWT-----------|                        |
   |                       |                        |
   |---带 JWT 的请求------>|                        |
   |                       |---验证 JWT            |
   |                       |---解析用户信息         |
   |                       |---转发请求----------->|
   |                       |<--返回数据-----------|
   |<--返回数据-----------|                        |
```

### 网关 JWT 验证

```java
@Component
public class JwtAuthFilter implements GlobalFilter, Ordered {
    
    @Value("${jwt.secret}")
    private String secret;
    
    // 白名单路径
    private static final List<String> WHITE_LIST = Arrays.asList(
        "/auth/login",
        "/auth/register",
        "/actuator/health"
    );
    
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getPath().value();
        
        // 白名单放行
        if (isWhiteListed(path)) {
            return chain.filter(exchange);
        }
        
        String token = extractToken(exchange.getRequest());
        if (token == null) {
            return onError(exchange, "Missing token", HttpStatus.UNAUTHORIZED);
        }
        
        try {
            Claims claims = Jwts.parserBuilder()
                .setSigningKey(secret)
                .build()
                .parseClaimsJws(token)
                .getBody();
            
            // 添加用户信息到请求头
            ServerHttpRequest request = exchange.getRequest().mutate()
                .header("X-User-Id", claims.getSubject())
                .header("X-User-Name", claims.get("username", String.class))
                .build();
            
            return chain.filter(exchange.mutate().request(request).build());
        } catch (ExpiredJwtException e) {
            return onError(exchange, "Token expired", HttpStatus.UNAUTHORIZED);
        } catch (Exception e) {
            return onError(exchange, "Invalid token", HttpStatus.UNAUTHORIZED);
        }
    }
    
    private boolean isWhiteListed(String path) {
        return WHITE_LIST.stream().anyMatch(path::startsWith);
    }
    
    private String extractToken(ServerHttpRequest request) {
        String bearer = request.getHeaders().getFirst("Authorization");
        if (bearer != null && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        return null;
    }
    
    @Override
    public int getOrder() {
        return -100;
    }
}
```

## 限流熔断

### 基于 Redis 的限流

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: user-service
          uri: lb://user-service
          predicates:
            - Path=/api/user/**
          filters:
            - name: RequestRateLimiter
              args:
                # 令牌桶每秒填充速率
                redis-rate-limiter.replenishRate: 10
                # 令牌桶容量
                redis-rate-limiter.burstCapacity: 20
                # 每次请求消耗的令牌数
                redis-rate-limiter.requestedTokens: 1
                # Key 解析器
                key-resolver: "#{@ipKeyResolver}"
```

### 熔断配置（Circuit Breaker）

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: user-service
          uri: lb://user-service
          predicates:
            - Path=/api/user/**
          filters:
            - name: CircuitBreaker
              args:
                name: userServiceCircuitBreaker
                fallbackUri: forward:/fallback/user
                statusCodes:
                  - 500
                  - 502
                  - 503

resilience4j:
  circuitbreaker:
    configs:
      default:
        slidingWindowSize: 10
        failureRateThreshold: 50
        waitDurationInOpenState: 10s
        permittedNumberOfCallsInHalfOpenState: 3
```

## 面试高频问题

### 1. Spring Cloud Gateway 和 Zuul 的区别？

**参考回答**：

| 对比项 | Gateway | Zuul 1.x |
|--------|---------|----------|
| 架构 | 响应式（WebFlux） | 阻塞式（Servlet） |
| 性能 | 高 | 一般 |
| 过滤器 | 丰富 | 有限 |
| 限流 | 内置 Redis 限流 | 需自行实现 |
| 状态 | 官方推荐 | 维护模式 |

### 2. 网关如何处理跨域？

```yaml
spring:
  cloud:
    gateway:
      globalcors:
        cors-configurations:
          '[/**]':
            allowedOrigins: "*"
            allowedMethods:
              - GET
              - POST
              - PUT
              - DELETE
            allowedHeaders: "*"
            allowCredentials: true
            maxAge: 3600
```

### 3. 网关如何实现灰度发布？

**参考回答**：
通过权重路由或请求头路由：

```yaml
# 权重路由（90% 到 v1，10% 到 v2）
routes:
  - id: user-service-v1
    uri: lb://user-service-v1
    predicates:
      - Path=/api/user/**
      - Weight=group1, 90
      
  - id: user-service-v2
    uri: lb://user-service-v2
    predicates:
      - Path=/api/user/**
      - Weight=group1, 10

# 请求头路由（根据版本号路由）
routes:
  - id: user-service-v2
    uri: lb://user-service-v2
    predicates:
      - Path=/api/user/**
      - Header=X-Version, v2
```

### 4. 网关如何保证高可用？

**参考回答**：
1. **多实例部署**：网关无状态，可水平扩展
2. **Nginx/LB 前置**：网关前置负载均衡
3. **服务降级**：熔断保护后端服务
4. **限流保护**：防止流量洪峰
5. **健康检查**：自动剔除故障节点

## 实战场景

### 场景1：统一认证鉴权

**需求**：所有请求都需要验证 JWT，部分接口需要权限校验

**方案**：
1. 网关验证 JWT，解析用户信息
2. 将用户信息透传到后端服务
3. 权限校验由各服务自行处理（或 RBAC 统一处理）

### 场景2：接口签名验证

**需求**：开放 API 需要签名验证

**方案**：
```java
@Component
public class SignatureFilter implements GlobalFilter, Ordered {
    
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String appId = exchange.getRequest().getHeaders().getFirst("X-App-Id");
        String timestamp = exchange.getRequest().getHeaders().getFirst("X-Timestamp");
        String nonce = exchange.getRequest().getHeaders().getFirst("X-Nonce");
        String sign = exchange.getRequest().getHeaders().getFirst("X-Sign");
        
        // 1. 检查时间戳（防重放）
        if (Math.abs(System.currentTimeMillis() - Long.parseLong(timestamp)) > 5 * 60 * 1000) {
            return onError(exchange, "Request expired");
        }
        
        // 2. 检查 nonce（防重放）
        if (redisTemplate.hasKey("nonce:" + nonce)) {
            return onError(exchange, "Duplicate request");
        }
        redisTemplate.opsForValue().set("nonce:" + nonce, "1", 5, TimeUnit.MINUTES);
        
        // 3. 验证签名
        String appSecret = getAppSecret(appId);
        String expectedSign = DigestUtils.md5Hex(appId + timestamp + nonce + appSecret);
        if (!expectedSign.equals(sign)) {
            return onError(exchange, "Invalid signature");
        }
        
        return chain.filter(exchange);
    }
}
```

## 延伸思考

1. **网关和服务网格（Service Mesh）的区别？**
   - 网关：南北向流量（外部→内部）
   - Service Mesh：东西向流量（服务间）

2. **网关的性能瓶颈在哪里？**
   - 认证鉴权：JWT 解析、权限查询
   - 限流：Redis 访问延迟
   - 日志：IO 开销

## 参考资料

- [Spring Cloud Gateway 官方文档](https://docs.spring.io/spring-cloud-gateway/docs/current/reference/html/)
- [Kong 官方文档](https://docs.konghq.com/)
- [API 网关设计模式](https://www.nginx.com/blog/building-microservices-using-an-api-gateway/)
