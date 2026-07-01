# 线程池

本目录覆盖 Java 线程池的核心机制、参数调优、关闭流程、任务管理以及 CompletableFuture 异步编程。

## 目录

### 基础概念

- [Java 的并发模型如何理解？](Java的并发模型如何理解？.md) — 共享内存模型、线程与进程、JMM 三性问题
- [线程池有哪些状态？](线程池有哪些状态？.md) — RUNNING/SHUTDOWN/STOP/TIDYING/TERMINATED 五态流转与 ctl 编码

### 核心机制

- [ThreadPoolExecutor 任务执行流程是怎么样的？](ThreadPoolExecutor线程池任务执行流程是怎么样的？.md) — 核心线程→队列→非核心→拒绝四步流程与源码
- [为什么核心线程池满后先入队而不是直接创建线程？](为什么核心线程池满了之后是先加入阻塞队列而不是直接创建线程？.md) — 复用线程、削峰填谷、保护下游的设计动机
- [线程池为什么一定使用阻塞队列？](线程池为什么一定使用阻塞队列？.md) — take/offer 语义、生产消费解耦、常见队列对比
- [ThreadPoolExecutor 有哪些拒绝策略？](ThreadPoolExecutor线程池有哪些拒绝策略？.md) — 四种内置策略与自定义持久化重试

### 参数与调优

- [线程池核心线程数如何设置？](线程池中核心线程数如何设置？.md) — CPU 密集 N+1、IO 密集 2N、阻塞系数公式
- [线程池线上配置实战方案如何设计？](线程池线上配置实战方案如何设计？.md) — 任务分类、按场景配置、动态调参、监控告警

### 工具类与异步编程

- [如何使用 Executors 工具类创建线程池？](如何使用Executors工具类创建线程池？.md) — 四种预设线程池源码解析及阿里规范禁用原因
- [CompletableFuture 如何使用？](CompletableFuture如何使用？.md) — 链式回调、组合、异常处理 API 与实战
- [CompletableFuture 底层原理是什么？](CompletableFuture底层原理是什么？.md) — volatile 状态、CAS、Completion 回调栈、postComplete 触发

### 任务管理与异常

- [如何撤回提交给线程池中的任务？](如何撤回提交给线程池中的任务？.md) — Future.cancel 语义、remove 排队任务、协作式中断
- [线程发生异常会被移出线程池吗？](线程发生异常会被移出线程池吗？.md) — execute 与 submit 异常路径、Worker 补位机制

### 关闭机制

- [shutdown 与 shutdownNow 有什么区别？](线程池中的shutdown()与shutdownNow()有什么区别？.md) — 温和关闭 vs 强制关闭、状态切换、优雅停机
- [线程池中的线程是如何关闭的？](线程池中的线程是如何关闭的？.md) — interrupt 机制、Worker 中断、协作式停止
