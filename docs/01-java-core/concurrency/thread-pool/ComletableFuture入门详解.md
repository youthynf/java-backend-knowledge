# ComletableFuture入门详解

ComletableFuture入门详解
CompletableFuture 和普通的 Future 都是 Java 中用于处理异步计算的工具，但它们在功能、灵活性和使用场景上有显著区别。普通 Future 是 Java 5 引入的基础异步结果容器，而 CompletableFuture 是 Java 8 基于 Future 扩展的增强版，弥补了前者的诸多不足。
功能丰富度：CompletableFuture 更强大
普通 Future 仅提供最基础的异步结果操作：
通过 get() 阻塞获取结果（可设置超时）；
通过 cancel() 取消任务；
通过 isDone() 轮询任务是否完成。
而 CompletableFuture 在 Future 基础上，新增了 CompletionStage 接口的能力，支持：
基于前一个任务的结果自动执行后续任务（链式操作）；
组合多个异步任务的结果（如 “两个任务都完成后合并结果”）；
非阻塞的回调通知（任务完成时自动触发处理逻辑）。

链式操作：CompletableFuture 支持流程串联
普通 Future 无法直接串联任务，若要基于一个任务的结果执行另一个任务，需手动阻塞获取结果后再提交新任务，代码繁琐且效率低：

// 普通 Future 的串联方式（繁琐）
ExecutorService executor = Executors.newFixedThreadPool(2);
Future<String> future1 = executor.submit(() -> "Hello");

// 必须阻塞获取 future1 的结果，才能执行 future2
String result1 = future1.get(); 
Future<String> future2 = executor.submit(() -> result1 + " World");
CompletableFuture 可通过 thenApply 等方法直接串联，无需手动阻塞，代码更简洁：

// CompletableFuture 的链式操作（优雅）
CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> "Hello")
    .thenApply(s -> s + " World") // 自动在前一个任务完成后执行
    .thenApply(s -> s + "!");     // 继续串联

System.out.println(future.get()); // 输出：Hello World!

多任务组合：CompletableFuture 简化协作逻辑
普通 Future 处理多个异步任务时，需手动判断所有任务是否完成，逻辑复杂：

// 普通 Future 组合多任务（繁琐）
ExecutorService executor = Executors.newFixedThreadPool(3);
Future<Integer> f1 = executor.submit(() -> 10);
Future<Integer> f2 = executor.submit(() -> 20);
Future<Integer> f3 = executor.submit(() -> 30);

// 必须逐个阻塞等待，才能汇总结果
int sum = f1.get() + f2.get() + f3.get();
CompletableFuture 提供了专门的组合方法，无需手动等待：

// 组合多个任务（全部完成后汇总）
CompletableFuture<Integer> f1 = CompletableFuture.supplyAsync(() -> 10);
CompletableFuture<Integer> f2 = CompletableFuture.supplyAsync(() -> 20);
CompletableFuture<Integer> f3 = CompletableFuture.supplyAsync(() -> 30);

// 所有任务完成后执行汇总
CompletableFuture<Integer> sumFuture = CompletableFuture.allOf(f1, f2, f3)
    .thenApply(v -> f1.join() + f2.join() + f3.join());

System.out.println(sumFuture.get()); // 输出：60

异常处理：CompletableFuture 更优雅
普通 Future 的异常只能在调用 get() 时通过 ExecutionException 捕获，且需手动判断异常来源：

// 普通 Future 的异常处理（被动）
Future<String> future = Executors.newSingleThreadExecutor().submit(() -> {
    throw new RuntimeException("任务失败");
});

try {
    future.get(); // 异常被包装为 ExecutionException
} catch (ExecutionException e) {
    Throwable cause = e.getCause(); // 需要手动获取真实异常
    System.out.println("错误：" + cause.getMessage());
}
CompletableFuture 提供了主动的异常处理机制，可在链式操作中直接捕获：

// CompletableFuture 的异常处理（主动）
CompletableFuture<String> future = CompletableFuture.supplyAsync(() -> {
    throw new RuntimeException("任务失败");
})
.exceptionally(ex -> { // 专门处理异常的方法
    System.out.println("捕获异常：" + ex.getMessage());
    return "默认值"; // 异常时返回默认结果
});

System.out.println(future.get()); // 输出：默认值

结果获取：CompletableFuture 支持非阻塞回调
普通 Future 必须通过 get() 阻塞当前线程，或通过 isDone() 轮询（低效），无法在任务完成时 “自动通知”：

// 普通 Future 必须阻塞或轮询
Future<String> future = Executors.newSingleThreadExecutor().submit(() -> "结果");
while (!future.isDone()) {
    // 轮询等待（浪费资源）
}
String result = future.get(); // 最终仍需 get() 获取
CompletableFuture 可通过 thenAccept 注册回调，任务完成时自动执行，无需阻塞：

// 非阻塞回调（任务完成时自动触发）
CompletableFuture.supplyAsync(() -> "结果")
    .thenAccept(result -> System.out.println("任务完成，结果：" + result));

// 主线程无需等待，可继续执行其他逻辑
System.out.println("主线程继续工作...");

手动完成：CompletableFuture 可主动控制结果
普通 Future 的结果由异步任务自身决定，外部无法干预。而 CompletableFuture 允许手动设置结果或异常，适合 “结果可能来自非异步任务” 的场景：

// 手动完成 CompletableFuture
CompletableFuture<String> future = new CompletableFuture<>();

// 模拟外部事件触发结果（如用户输入、消息通知）
new Thread(() -> {
    try {
        Thread.sleep(1000);
        future.complete("手动设置的结果"); // 手动完成
        // 若发生错误，可调用 future.completeExceptionally(ex)
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
}).start();

System.out.println(future.get()); // 输出：手动设置的结果

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **ComletableFuture入门详解**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

线程池相关问题要围绕 `ThreadPoolExecutor` 的核心参数、任务提交流程和生命周期来回答：先看核心线程数、最大线程数、阻塞队列、拒绝策略，再看任务执行过程中线程如何复用、如何退出、异常如何处理。生产中不建议无脑使用 `Executors` 的快捷方法，应根据业务类型配置有界队列、命名线程工厂、拒绝策略和监控指标。

## 深挖追问

- `execute()` 和 `submit()` 在异常表现、返回值上的区别是什么？
- 核心线程、非核心线程分别什么时候创建和回收？
- 阻塞队列选择无界、有界、同步移交队列时，对吞吐和稳定性有什么影响？
- 拒绝策略应该如何和降级、限流、告警结合？

## 实战场景/代码示例

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
        8,
        16,
        60, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(1000),
        r -> new Thread(r, "biz-worker-" + r.hashCode()),
        new ThreadPoolExecutor.CallerRunsPolicy()
);

try {
    executor.execute(() -> {
        // 业务逻辑：注意捕获异常、设置超时、避免无限阻塞
    });
} finally {
    // 应用停止时再统一 shutdown，不要每提交一个任务就关闭线程池
}
```

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

