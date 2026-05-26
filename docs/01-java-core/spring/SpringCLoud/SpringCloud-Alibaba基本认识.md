# SpringCloud Alibaba基本认识

SpringCloud Alibaba基本认识
Spring Cloud Alibaba 是 Spring Cloud 生态的一部分，由阿里巴巴团队开发和维护。它提供了一系列与阿里巴巴中间件深度集成的工具和组件，旨在简化分布式系统的开发，特别是对于基于微服务架构的应用。

Spring Cloud Alibaba 核心功能：
服务治理
Nacos：提供服务注册、发现和配置管理功能。
服务注册与发现：类似 Eureka 或 Consul，支持多语言服务的动态注册与发现。
配置管理：统一管理配置，支持动态更新，减少配置变更带来的系统负担。

分布式事务
Seata：提供分布式事务解决方案。
支持强一致性事务处理（如分布式事务的全局回滚）。
常用模式包括 AT、TCC、Saga 等事务模型。

负载均衡
Spring Cloud LoadBalancer：与 Nacos 集成，支持多种负载均衡策略（如随机、轮询、权重等）。
Ribbon（已逐步淘汰）：为微服务间调用提供客户端负载均衡支持。

限流和熔断
Sentinel：负责流量控制、熔断降级、系统负载保护。
实时监控流量情况；
灵活的限流规则（如 QPS 限制、线程数限制等）；
集成 Hystrix 类似的熔断功能；

消息驱动
RocketMQ：高性能分布式消息队列。
支持事务消息、延时消息、顺序消息；
集成 Spring Cloud Stream，支持事件驱动架构；

分布式调用链监控
SkyWalking、Zipkin 或 Sleuth：与 Alibaba 组件兼容的链路追踪工具。
监控分布式系统的调用链路，快速定位问题。

RPC框架
Dubbo：分布式的RPC框架，支持高性能服务调用。

对象存储
Alibaba Cloud OSS：对象存储解决方案，便于与阿里云存储服务集成。
