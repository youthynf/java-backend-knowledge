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

## 面试总结

围绕「ComletableFuture入门详解」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

### 核心回答

1. Java 并发问题的核心是共享状态在多线程下的可见性、原子性和有序性。
2. 设计并发方案时要明确线程之间如何协作、如何退出、如何处理异常和超时。
3. 工程上还要考虑线程池复用、上下文清理、监控告警和压测验证。

### 高频追问

- 这个机制解决的是互斥、通信、调度还是资源隔离？
- 高并发下可能出现死锁、饥饿、活锁还是性能退化？
- 如何用线程 Dump 或指标证明你的判断？

### 实战落地

- **选型前**：先判断是互斥访问、线程协作、任务编排，还是限流隔离。
- **编码时**：控制共享变量范围，明确锁对象、超时策略、异常处理和资源释放。
- **上线后**：观察线程数、队列长度、阻塞时间、拒绝次数和 RT 抖动，必要时用线程 Dump 验证。

### 易错点

- 不要用 sleep 代替同步协作。
- 不要忽略中断、超时和资源释放。
