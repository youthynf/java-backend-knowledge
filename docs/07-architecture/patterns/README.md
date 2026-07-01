# 架构设计模式

本目录从架构视角讲解常用设计模式在 Spring、AOP、RPC、消息队列等场景下的落地，与 [01-java-core/design-pattern/](../../01-java-core/design-pattern/) 偏 Java 实现的视角互补。每个模式用一句话点出"它在什么场景下救你"，并给出 JDK/Spring 中的应用与相似模式对比。

## 目录

- [代理模式是什么](代理模式是什么？.md) — Spring AOP、事务、RPC 客户端背后的统一拦截机制
- [单例模式怎么实现线程安全](单例模式怎么实现线程安全？.md) — 五种写法对比与 Spring 容器单例的作用域
- [策略模式如何消除 if-else](策略模式如何消除if-else？.md) — Spring Map 注入干掉分支判断
- [模板方法模式适合什么场景](模板方法模式适合什么场景？.md) — JdbcTemplate、RestTemplate、Servlet 的骨架复用
- [工厂模式有哪几种形态](工厂模式有哪几种形态？.md) — 简单工厂/工厂方法/抽象工厂与 Spring BeanFactory
