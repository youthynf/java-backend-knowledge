# ThreadPoolExecutor 线程池有哪些拒绝策略

## 核心概念

拒绝策略（RejectedExecutionHandler）是线程池的"最后一道防线"。当任务无法被接受时——通常是线程数达到 `maximumPoolSize` 且队列已满，或线程池已关闭——拒绝策略决定如何处理这个任务。

`ThreadPoolExecutor` 内置 4 种策略，全部是 `RejectedExecutionHandler` 接口的内部静态实现类。可以通过构造方法或 `setRejectedExecutionHandler` 设置，也可以自定义。

## 标准回答

四种内置拒绝策略：

1. `AbortPolicy`（默认）：直接抛 `RejectedExecutionException`，让调用方感知到失败。
2. `CallerRunsPolicy`：让提交任务的线程自己执行该任务，相当于"谁提交谁负责"。能起到自然限流的作用。
3. `DiscardPolicy`：静默丢弃新任务，不抛异常。生产几乎不用，因为问题被吞掉。
4. `DiscardOldestPolicy`：丢弃队列头部（最早入队）的任务，再尝试 `execute` 提交新任务。

如果以上都不满足业务需求，实现 `RejectedExecutionHandler` 接口写自定义策略，例如持久化到数据库、推送到 MQ、降级返回默认值。

## 实现原理

### 拒绝策略的触发时机

在 `execute` 中触发：

```java
public void execute(Runnable command) {
    // ... 核心线程、入队都失败
    else if (!addWorker(command, false))   // 非核心线程也创建失败
        reject(command);                   // 触发拒绝策略
}

final void reject(Runnable command) {
    handler.rejectedExecution(command, this);
}
```

另外，线程池处于非 RUNNING 状态时，`execute` 也会触发拒绝策略。

### 四种内置策略源码

```java
// 默认策略：抛异常
public static class AbortPolicy implements RejectedExecutionHandler {
    public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
        throw new RejectedExecutionException(
            "Task " + r.toString() + " rejected from " + e.toString());
    }
}

// 调用者线程执行
public static class CallerRunsPolicy implements RejectedExecutionHandler {
    public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
        if (!e.isShutdown()) {
            r.run();   // 直接在提交者线程同步执行
        }
    }
}

// 静默丢弃
public static class DiscardPolicy implements RejectedExecutionHandler {
    public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
        // 空实现，等于丢弃
    }
}

// 丢弃队列中最老的任务，重新提交当前任务
public static class DiscardOldestPolicy implements RejectedExecutionHandler {
    public void rejectedExecution(Runnable r, ThreadPoolExecutor e) {
        if (!e.isShutdown()) {
            e.getQueue().poll();   // 丢掉队首
            e.execute(r);          // 重新提交
        }
    }
}
```

### 四种策略对比

| 策略 | 行为 | 是否抛异常 | 适用场景 |
|------|------|-----------|----------|
| AbortPolicy | 抛 `RejectedExecutionException` | 是 | 关键业务，必须感知失败 |
| CallerRunsPolicy | 调用者线程同步执行 | 否 | 不允许丢任务，可承受短暂变慢 |
| DiscardPolicy | 直接丢弃新任务 | 否 | 极少用，仅限无关紧要的日志类任务 |
| DiscardOldestPolicy | 丢队首任务，重提新任务 | 否 | 新任务比老任务更重要（如实时数据） |

## 代码示例

### 内置策略使用

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
        2, 4, 30L, TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(2),
        Executors.defaultThreadFactory(),
        new ThreadPoolExecutor.CallerRunsPolicy());  // 调用者线程兜底
```

### 自定义策略：持久化重试

```java
public class PersistRetryPolicy implements RejectedExecutionHandler {
    private final TaskRepository taskRepository;
    private final AlertService alertService;

    public PersistRetryPolicy(TaskRepository repo, AlertService alert) {
        this.taskRepository = repo;
        this.alertService = alert;
    }

    @Override
    public void rejectedExecution(Runnable r, ThreadPoolExecutor executor) {
        if (executor.isShutdown()) {
            return; // 线程池已关闭，不再处理
        }
        if (r instanceof IdentifiableTask) {
            IdentifiableTask task = (IdentifiableTask) r;
            try {
                taskRepository.save(task.toTaskPO());
                log.warn("任务被拒绝，已持久化待重试: taskId={}", task.getTaskId());
            } catch (Exception e) {
                log.error("任务持久化失败，发送告警: taskId={}", task.getTaskId(), e);
                alertService.sendAlert("线程池拒绝且持久化失败: " + task.getTaskId());
            }
        } else {
            log.error("无法识别的任务类型被拒绝: {}", r.getClass().getName());
        }
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 订单核心链路 | AbortPolicy + 调用方 catch 后降级 | 必须显式处理异常，避免 500 |
| 异步日志/埋点 | DiscardPolicy 或自定义采样丢弃 | 可接受少量丢失 |
| 实时行情推送 | DiscardOldestPolicy | 旧数据无价值，只保最新 |
| 不能丢的回调任务 | CallerRunsPolicy 或持久化重试 | CallerRunsPolicy 会让调用线程变慢，注意反压 |
| 高优先级后台任务 | 自定义 + MQ 重投 | MQ 自身故障时还要有兜底告警 |

## 深挖追问

### CallerRunsPolicy 会让调用线程执行任务，会有什么副作用？

调用线程在任务执行期间被阻塞，无法继续提交新任务，相当于天然的反压限流。但如果调用链上有多个线程池嵌套，且下游池也用 CallerRunsPolicy，可能造成线程互相占用、整体卡死。建议在依赖链上至少有一层用"快速失败 + 降级"。

### DiscardOldestPolicy 用在什么队列上有坑？

用在优先级队列 `PriorityBlockingQueue` 上时，`poll()` 取出的是优先级最高（而非最早入队）的任务，可能误丢关键任务。用在 `SynchronousQueue` 上时队列没有元素可 poll，等于直接走 `execute` 又触发拒绝，循环无意义。

### 拒绝策略能恢复执行任务吗？

可以。`DiscardOldestPolicy` 就是先 `poll` 再 `execute`。但要注意 `execute` 仍可能再次拒绝（极端情况），可能进入死循环——所以生产自定义策略时一般加次数限制或转持久化。

### 线程池关闭后调用 execute 会走拒绝策略吗？

会。`execute` 开头检查到非 RUNNING 状态会走拒绝策略（默认 AbortPolicy 抛异常）。所以优雅停机期间提交任务要 catch `RejectedExecutionException`。

## 易错点

- 用 `DiscardPolicy` 处理关键任务，问题被静默吞掉，线上故障排查时没日志没异常。
- `CallerRunsPolicy` 配合调用线程极度敏感的接口（如 RPC 入口线程），把入口线程拖死。
- 自定义策略不判断 `executor.isShutdown()`，导致线程池已关闭还在做持久化等副作用。
- 以为有界队列 + AbortPolicy 就够，实际上"被拒绝"的处理路径必须明确（重试、降级、告警）。

## 总结

拒绝策略是线程池压力过载时的兜底机制。理解 4 种内置策略的行为差异和适用场景，能在配置时快速选型；生产环境更常见的是自定义策略——持久化重试、降级、采样丢弃。选型核心是回答两个问题：任务能不能丢？不能丢的话调用方能否承受被阻塞？

## 参考资料

- [JDK ThreadPoolExecutor 源码](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/ThreadPoolExecutor.java)
- [美团技术团队 - Java 线程池实现原理及其在美团业务中的实践](https://tech.meituan.com/2020/04/02/java-pooling-pratice-in-meituan.html)

---
