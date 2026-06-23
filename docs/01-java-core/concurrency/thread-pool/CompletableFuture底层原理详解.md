# CompletableFuture底层原理详解

CompletableFuture底层原理详解
CompletableFuture 底层实现依赖于状态管理、回调链机制和线程池协助，核心是通过高效的并发控制（如 CAS 操作）和回调任务的链式触发，实现异步操作的灵活组合。

一、核心状态管理
CompletableFuture 内部通过状态变量和结果存储维护异步任务的生命周期，核心字段包括：
volatile Object result：存储任务的结果（正常完成时）或异常（异常完成时）。
volatile int status：表示任务的状态，核心状态值如下：
0：未完成（默认状态）。
1：正常完成（NORMAL）。
2：异常完成（EXCEPTIONAL）。
其他值（如 3 以上）：表示已被取消或中断（较少用到）。
这些字段通过 volatile 修饰保证内存可见性，状态变更通过 CAS 操作（sun.misc.Unsafe 或 VarHandle）实现原子性，避免并发冲突。

二、任务执行与结果设置
当通过 supplyAsync 或 runAsync 提交任务时，CompletableFuture 会将任务提交到指定线程池（默认 ForkJoinPool.commonPool()），执行流程如下：
任务提交：supplyAsync(Supplier) 会将 Supplier 包装为一个 AsyncSupply 任务（实现 Runnable），提交到线程池；
任务执行与结果设置：线程池执行 AsyncSupply 时，会调用 Supplier.get() 获取结果，然后通过 complete(value) 方法设置结果：

// 简化的 complete 逻辑
boolean complete(T value) {
    if (status == 0 && CAS_STATUS(0, 1)) { // CAS 原子更新状态为“正常完成”
        this.result = value;
        postComplete(); // 触发后续回调
        return true;
    }
    return false;
}
若任务执行过程中抛出异常，则通过 completeExecptionally(Throwable) 方法设置异常结果，状态更新为 EXCEPTIONAL。

三、回调链的存储与触发
CompletableFuture 的核心能力是链式操作（如 thenApply、thenAccept），其底层通过回调任务的存储与触发实现。
1. 回调任务的存储：
每个链式方法（如 thenApply）会创建一个新的 CompletableFuture（作为后续任务的载体），并将当前 CompletableFuture 与后续任务的关系记录在回调链表中。例如 thenApply 会创建一个 UniApply 节点（实现 Completion 接口），包含：
后续任务的处理逻辑（如 Function）。
关联的下一个 CompletableFuture（用于传递结果）。
这些回调节点通过 volatile Completion stack 字段存储在当前 CompletableFuture 中，形成一个栈结构（或链表）。

// 简化的 Completion 接口
interface Completion {
    Completion next; // 指向栈中的下一个节点（形成链表）
    boolean tryFire(int mode); // 触发回调执行，返回是否成功
}

// 简化的 UniApply 类（thenApply 的底层实现）
class UniApply<T, U> extends Completion {
    CompletableFuture<U> dep; // 回调对应的新 CompletableFuture（后续任务）
    Function<? super T, ? extends U> fn; // 注册的转换函数
    CompletableFuture<T> src; // 前序任务的 CompletableFuture

    UniApply(CompletableFuture<T> src, Function<? super T, ? extends U> fn, CompletableFuture<U> dep) {
        this.src = src;
        this.fn = fn;
        this.dep = dep;
    }

    // 核心：触发回调执行
    boolean tryFire(int mode) {
        CompletableFuture<T> s = src;
        CompletableFuture<U> d = dep;
        if (s == null || d == null || !d.uniApply(s.result, s.status))
            return false;
        src = null;
        dep = null;
        return true;
    }
}

// 每个 CompletableFuture 内部通过 volatile Completion stack 字段存储回调链
public class CompletableFuture<T> implements Future<T>, CompletionStage<T> {
    volatile Object result; // 任务结果或异常
    volatile int status; // 任务状态（0：未完成，1：正常，2：异常）
    volatile Completion stack; // 回调链（栈结构）
    // ...
}

// 简化的注册逻辑（以 thenApply 为例）
public <U> CompletableFuture<U> thenApply(Function<? super T, ? extends U> fn) {
    CompletableFuture<U> dep = new CompletableFuture<>(); // 新的后续任务
    // 创建 UniApply 节点，并压入当前 CompletableFuture 的 stack
    if (stack == null)
        stack = new UniApply<>(this, fn, dep);
    else
        // 通过 CAS 操作将新节点压入栈顶（stack 指向新节点，新节点的 next 指向原 stack）
        UNSAFE.compareAndSwapObject(this, STACK, stack, new UniApply<>(this, fn, dep).linkNext(stack));
    return dep;
}

回调任务的触发：
当当前 CompletableFuture 完成（状态变为 NORMAL 或 EXCEPTIONAL）时，会调用 postComplete() 方法遍历回调链，触发后续任务：

// 正常完成时触发回调
boolean complete(T value) {
    if (status == 0 && UNSAFE.compareAndSwapInt(this, STATUS, 0, 1)) { // CAS 更新状态为正常
        result = value;
        postComplete(); // 触发回调链
        return true;
    }
    return false;
}

// 异常完成时触发回调
boolean completeExceptionally(Throwable ex) {
    if (status == 0 && UNSAFE.compareAndSwapInt(this, STATUS, 0, 2)) { // CAS 更新状态为异常
        result = ex;
        postComplete(); // 触发回调链
        return true;
    }
    return false;
}

// 简化的 postComplete() 逻辑
void postComplete() {
    Completion c;
    // 循环处理栈中的所有节点（直到栈为空）
    while ((c = stack) != null) {
        // 原子化移除栈顶节点（通过 CAS 将 stack 指向 c.next）
        if (UNSAFE.compareAndSwapObject(this, STACK, c, c.next)) {
            // 触发当前节点的回调执行
            c.tryFire(0); 
            continue;
        }
    }
}
tryFire() 方法会根据当前任务的结果（正常或异常），执行回调逻辑（如调用 Function.apply），并将结果设置到下一个 CompletableFuture 中，从而触发下一级回调。

// 简化的 UniApply.tryFire() 逻辑
boolean tryFire(int mode) {
    CompletableFuture<T> s = src; // 前序任务
    CompletableFuture<U> d = dep; // 后续任务
    if (s == null || d == null) return false;

    Object srcResult = s.result;
    int srcStatus = s.status;

    if (srcStatus == 1) { // 前序任务正常完成
        // 执行转换函数（Function）
        U res = fn.apply((T) srcResult);
        // 将结果设置到后续任务，触发其回调链
        d.complete(res); 
    } else if (srcStatus == 2) { // 前序任务异常完成
        // 将异常传递给后续任务
        d.completeExceptionally((Throwable) srcResult);
    }

    // 清理引用，避免内存泄漏
    src = null;
    dep = null;
    return true;
}

四、线程池的协作机制
CompletableFuture 的回调任务执行依赖线程池，遵循以下规则：
默认线程池：若未指定线程池，回调任务默认使用 ForkJoinPool.commonPool()（除非当前线程是 ForkJoinWorkerThread，此时可能直接在当前线程执行，避免线程切换）。
自定义线程池：链式方法（如 thenApplyAsync(Function, Executor)）可指定线程池，回调任务会提交到该线程池执行。
执行时机：回调任务的执行时机由前序任务的完成时间决定，前序任务完成后，回调任务会被立即提交到线程池（或直接执行）。

五、组合操作的实现（如 allOf、thenCombine）
1. allOf 实现：
allOf(CompletableFuture<?>... cfs) 会创建一个新的 CompletableFuture，并为每个输入的 cfs 注册一个回调。当所有 cfs 完成时，这个新的 CompletableFuture 才会完成。底层通过计数器实现：初始化计数器为 cfs 的长度，每个 cfs 完成时计数器减 1，当计数器变为 0 时，触发 allOf 返回的 CompletableFuture 完成。
2. thenCombine 实现：
thenCombine(CompletableFuture<? extends U> other, BiFunction<? super T,? super U,? extends V> fn) 会为当前 CompletableFuture 和 other 各注册一个回调。当两者都完成后，从两个 CompletableFuture 中获取结果，通过 BiFunction 合并，并设置到新的 CompletableFuture 中。

六、异常处理的底层逻辑
exceptionally(Function<Throwable,? extends T> fn) 方法会注册一个异常处理回调，其底层实现：
当 CompletableFuture 状态为 EXCEPTIONAL 时，触发异常回调，Function 接收异常并返回默认值，新结果会设置到一个新的 CompletableFuture 中。
若 CompletableFuture 正常完成，则异常回调会被忽略，直接传递原始结果。

总结
CompletableFuture 的底层核心是：
用 volatile 状态 + CAS 操作实现线程安全的状态管理和结果设置。
用回调链（Completion 节点栈）存储依赖关系，前序任务完成后通过 postComplete() 触发后续回调。
结合线程池实现异步任务的执行与回调的调度。
通过计数器等机制实现多任务组合（如 allOf）。
这种设计让 CompletableFuture 既能高效处理单个异步任务，又能灵活组合多个任务，成为 Java 异步编程的核心工具。

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **CompletableFuture底层原理详解**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

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

