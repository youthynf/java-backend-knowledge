# 链路追踪

## 核心概念

### 什么是链路追踪

链路追踪（Distributed Tracing）用于追踪分布式系统中请求的完整调用链路，帮助定位性能瓶颈、排查故障。

### 为什么需要链路追踪

**微服务架构的问题**：
```
用户请求 → 网关 → 服务A → 服务B → 服务C → 数据库
                   ↓
                 缓存
                   
问题：
1. 请求慢，哪个服务慢？
2. 请求失败，哪个服务失败？
3. 服务依赖关系是什么？
```

### 核心术语

**Trace（追踪）**：
- 一次完整请求的追踪
- 包含多个 Span
- 用 Trace ID 标识

**Span（跨度）**：
- 一个工作单元
- 包含开始时间、持续时间、操作名称
- Span 之间有父子关系

**Annotation（标注）**：
- Span 中的事件点
- CS（Client Send）、SR（Server Receive）、SS（Server Send）、CR（Client Receive）

```
Trace ID: abc123
├── Span: gateway (100ms)
│   └── Span: service-a (80ms)
│       ├── Span: mysql (20ms)
│       └── Span: redis (5ms)
└── Span: service-b (50ms)
    └── Span: http-call (45ms)
```

## 主流方案

### 对比

| 方案 | 开源 | 存储 | 特点 |
|------|------|------|------|
| Zipkin | 是 | ES/MySQL/Cassandra | 简单易用 |
| Jaeger | 是 | ES/Cassandra/Kafka | Uber 开源，云原生 |
| SkyWalking | 是 | ES/H2 | APM，无侵入 |
| Pinpoint | 是 | HBase | 韩国开源，功能全面 |
| CAT | 是 | MySQL | 美团，监控告警 |

## SkyWalking

### 架构

```
┌─────────────┐
│   应用服务   │
│  (Agent)    │
└──────┬──────┘
       │ gRPC
       ↓
┌─────────────┐     ┌─────────────┐
│     OAP     │────→│    OAL      │
│   Server    │     │  (分析引擎)  │
└──────┬──────┘     └─────────────┘
       │
       ↓
┌─────────────┐
│  Storage    │
│  (ES/H2)    │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│     UI      │
└─────────────┘
```

### 部署

```bash
# 下载 SkyWalking
wget https://archive.apache.org/dist/skywalking/9.0.0/apache-skywalking-apm-9.0.0.tar.gz
tar -xzf apache-skywalking-apm-9.0.0.tar.gz

# 启动（包含 ES、OAP、UI）
cd apache-skywalking-apm-bin
bin/startup.sh

# 访问 UI
http://localhost:8080
```

### Agent 接入

```bash
# Java 应用启动参数
java -javaagent:/path/to/skywalking-agent.jar \
     -Dskywalking.agent.service_name=user-service \
     -Dskywalking.collector.backend_service=localhost:11800 \
     -jar app.jar
```

### 核心功能

**1. 服务拓扑图**：
- 自动发现服务依赖
- 可视化服务调用关系

**2. 链路追踪**：
- 查看每个请求的完整调用链
- 定位慢调用

**3. 性能指标**：
- 服务 SLA
- 响应时间分布
- 吞吐量

**4. 告警**：
- 服务可用性告警
- 响应时间告警

## Zipkin

### 架构

```
┌─────────────┐
│   应用服务   │
│ (Reporter)  │
└──────┬──────┘
       │ HTTP/Kafka
       ↓
┌─────────────┐
│   Zipkin    │
│   Server    │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Storage    │
│ (ES/MySQL)  │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│     UI      │
└─────────────┘
```

### 集成 Spring Boot

```xml
<dependency>
    <groupId>io.zipkin.brave</groupId>
    <artifactId>brave-instrumentation-spring-webmvc</artifactId>
</dependency>
<dependency>
    <groupId>io.zipkin.reporter2</groupId>
    <artifactId>zipkin-sender-okhttp3</artifactId>
</dependency>
```

```yaml
spring:
  zipkin:
    base-url: http://localhost:9411
    sender:
      type: web
  sleuth:
    sampler:
      probability: 1.0  # 采样率 100%
```

### 自定义 Span

```java
@Autowired
private Tracer tracer;

public void customSpan() {
    // 创建自定义 Span
    Span span = tracer.nextSpan().name("custom-operation").start();
    
    try (SpanScoped scope = tracer.withSpanInScope(span)) {
        // 业务逻辑
        doSomething();
        
        // 添加标签
        span.tag("userId", "12345");
        
        // 添加事件
        span.annotate("operation.complete");
    } finally {
        span.finish();
    }
}
```

### 采样策略

```java
// 固定采样
spring.sleuth.sampler.probability=0.1  // 10%

// 动态采样
@Bean
public AlwaysSampler defaultSampler() {
    return new AlwaysSampler();
}

// 限流采样
@Bean
public RateLimitingSampler sampler() {
    return RateLimitingSampler.create(100); // 每秒 100 个 trace
}
```

## 面试高频问题

### 1. 链路追踪的原理是什么？

**参考回答**：
通过在请求入口生成 Trace ID，在每个服务间调用时传递（通过 HTTP Header），每个服务记录自己的 Span，最终汇总到追踪系统。

### 2. SkyWalking 和 Zipkin 的区别？

| 对比项 | SkyWalking | Zipkin |
|--------|------------|--------|
| 接入方式 | Java Agent（无侵入） | 埋点（侵入） |
| 语言支持 | 多语言 | 多语言 |
| 存储 | ES 为主 | 多种 |
| 性能开销 | 较低 | 中等 |
| 社区活跃 | 活跃 | 活跃 |

### 3. 如何选择采样率？

**参考回答**：
- 测试/预发环境：100%
- 生产环境：10%-50%（根据流量）
- 高流量：1%-5%
- 关键请求：100%

### 4. 链路追踪能解决什么问题？

**参考回答**：
1. **定位慢请求**：找出哪个服务、哪个操作最慢
2. **定位失败请求**：快速定位错误来源
3. **分析依赖**：了解服务调用关系
4. **性能优化**：发现性能瓶颈

## 实战场景

### 场景1：排查慢请求

```
1. 查看慢请求列表
2. 点击查看详情
3. 发现 service-b 调用 mysql 耗时 3s
4. 优化该 SQL
```

### 场景2：排查请求失败

```
1. 查看错误请求
2. 查看调用链
3. 发现 service-c 抛出异常
4. 查看异常堆栈
5. 定位问题根因
```

## 延伸思考

1. **OpenTracing 和 OpenTelemetry 的区别？**
   - OpenTracing：标准接口，Jaeger 实现
   - OpenTelemetry：合并 OpenTracing + OpenCensus，厂商中立

2. **全链路压测如何结合链路追踪？**
   - 标记压测流量（Header）
   - 单独追踪压测数据
   - 与正常流量对比分析

## 参考资料

- [SkyWalking 官方文档](https://skywalking.apache.org/docs/)
- [Zipkin 官方文档](https://zipkin.io/)
- [OpenTelemetry 官方文档](https://opentelemetry.io/)