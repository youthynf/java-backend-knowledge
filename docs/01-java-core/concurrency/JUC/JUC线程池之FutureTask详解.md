# JUC线程池之FutureTask详解

## 核心概念

`FutureTask` 是 JUC 中对 `Future` 的一个基础实现，同时也实现了 `Runnable`。它可以把一个 `Callable` 或 `Runnable` 包装成“可执行、可取消、可获取结果”的异步任务。

它有两个核心身份：

1. **作为 Runnable**：可以被 `Thread` 或线程池执行。
2. **作为 Future**：可以通过 `get()` 获取任务结果，通过 `cancel()` 取消任务，通过 `isDone()` 判断任务是否结束。

一句话：**FutureTask 是 Runnable 和 Future 的结合体，既能执行任务，又能代表任务执行结果。**

## 面试官想考什么

面试问 `FutureTask`，通常不是只想听“它实现了 RunnableFuture”，而是想确认你是否理解：

1. `Runnable`、`Callable`、`Future`、`FutureTask` 的关系。
2. `get()` 为什么会阻塞，阻塞线程如何被唤醒。
3. `cancel(true)` 和 `cancel(false)` 的区别。
4. FutureTask 的状态流转。
5. 为什么 FutureTask 可以保证任务只执行一次。
6. FutureTask 在异步任务、线程池、缓存加载中的应用。

## 标准回答

可以这样回答：

> `FutureTask` 实现了 `RunnableFuture` 接口，而 `RunnableFuture` 同时继承 `Runnable` 和 `Future`。所以 FutureTask 既可以作为任务被线程执行，也可以作为异步计算结果被调用方持有。
>
> FutureTask 内部维护任务状态、执行线程、结果 outcome 和等待线程栈。任务初始状态是 NEW，执行成功后进入 NORMAL，执行异常后进入 EXCEPTIONAL，被取消后进入 CANCELLED 或 INTERRUPTED。调用 `get()` 时，如果任务还没完成，当前线程会被挂起；任务完成后会唤醒等待线程并返回结果或抛出异常。
>
> 它通过 CAS 修改状态，保证任务只会被一个线程真正执行。生产中常用于提交 Callable 获取结果、异步预加载、任务去重以及配合线程池做异步编排。

## 类关系

`FutureTask` 的继承关系可以简化为：

```java
public class FutureTask<V> implements RunnableFuture<V> {
}

public interface RunnableFuture<V> extends Runnable, Future<V> {
    void run();
}
```

所以 FutureTask 同时具备两类能力：

- `Runnable.run()`：可以被线程执行。
- `Future.get()/cancel()/isDone()`：可以代表异步执行结果。

## Runnable、Callable、Future、FutureTask 的区别

| 类型 | 作用 | 是否有返回值 | 是否能抛受检异常 | 是否能被线程直接执行 |
|---|---|---|---|---|
| Runnable | 定义一段任务逻辑 | 否 | 否 | 是 |
| Callable | 定义一段有结果的任务逻辑 | 是 | 是 | 否，需要包装 |
| Future | 表示异步任务结果 | 是 | 不负责执行 | 否 |
| FutureTask | 任务 + 结果的组合体 | 是 | 支持 Callable 异常封装 | 是 |

常见理解：

- `Callable` 只是任务定义。
- `Future` 只是结果句柄。
- `FutureTask` 把任务定义和结果句柄封装在一起。

## 基本使用

### 1. FutureTask + Thread

```java
import java.util.concurrent.Callable;
import java.util.concurrent.FutureTask;

public class FutureTaskDemo {
    public static void main(String[] args) throws Exception {
        FutureTask<Integer> task = new FutureTask<>(new Callable<Integer>() {
            @Override
            public Integer call() throws Exception {
                Thread.sleep(1000);
                return 100;
            }
        });

        new Thread(task, "future-task-thread").start();

        // 如果任务还没执行完，get 会阻塞当前线程
        Integer result = task.get();
        System.out.println(result);
    }
}
```

### 2. FutureTask + ExecutorService

```java
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.FutureTask;

public class FutureTaskExecutorDemo {
    public static void main(String[] args) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);

        FutureTask<String> task = new FutureTask<>(() -> {
            return "success";
        });

        executor.submit(task);

        String result = task.get();
        System.out.println(result);

        executor.shutdown();
    }
}
```

实际项目中，更常见的是直接使用：

```java
Future<String> future = executor.submit(() -> "success");
```

但线程池内部本质上也会把提交的 `Callable` 包装成类似 `FutureTask` 的任务对象。

## 核心属性

FutureTask 的源码中有几个关键字段：

```java
private volatile int state;
private Callable<V> callable;
private Object outcome;
private volatile Thread runner;
private volatile WaitNode waiters;
```

它们的作用是：

- `state`：任务状态，使用 volatile 保证可见性。
- `callable`：真正要执行的任务。
- `outcome`：任务结果或异常信息。
- `runner`：当前执行任务的线程。
- `waiters`：调用 `get()` 后被阻塞的等待线程。

## 状态流转

FutureTask 的典型状态包括：

```java
private static final int NEW          = 0;
private static final int COMPLETING   = 1;
private static final int NORMAL       = 2;
private static final int EXCEPTIONAL  = 3;
private static final int CANCELLED    = 4;
private static final int INTERRUPTING = 5;
private static final int INTERRUPTED  = 6;
```

### 正常执行

```text
NEW -> COMPLETING -> NORMAL
```

任务执行成功后，结果会写入 `outcome`，状态最终变成 `NORMAL`。

### 执行异常

```text
NEW -> COMPLETING -> EXCEPTIONAL
```

如果 `Callable.call()` 抛出异常，异常会被保存到 `outcome`，调用 `get()` 时再包装成 `ExecutionException` 抛出。

### 取消任务

```text
NEW -> CANCELLED
NEW -> INTERRUPTING -> INTERRUPTED
```

调用 `cancel(false)` 时，如果任务还未完成，状态会变为 `CANCELLED`。

调用 `cancel(true)` 时，如果任务正在执行，会尝试中断 `runner`，状态先变成 `INTERRUPTING`，再变成 `INTERRUPTED`。

## get 为什么会阻塞

当线程调用 `get()` 时，FutureTask 会先判断任务是否已完成：

- 如果已经完成：直接返回结果或抛出异常。
- 如果没有完成：把当前线程封装成等待节点，加入等待队列，然后挂起。

任务执行完成后，FutureTask 会调用类似 `finishCompletion()` 的逻辑，唤醒所有等待 `get()` 的线程。

可以这样理解：

```text
调用线程 get()
   ↓
发现 state 还是 NEW
   ↓
加入 waiters 等待栈
   ↓
park 当前线程
   ↓
任务线程执行完成
   ↓
写 outcome，修改 state
   ↓
unpark 等待线程
   ↓
get 返回结果
```

所以 `get()` 的阻塞不是忙等，而是线程被挂起，等待任务完成后唤醒。

## cancel 的语义

### cancel(false)

`cancel(false)` 表示取消任务，但不尝试中断正在运行的线程。

- 如果任务还没开始：任务不会再执行。
- 如果任务已经开始：不会中断执行线程，但 FutureTask 状态可能变为取消态，调用方后续 `get()` 会抛 `CancellationException`。

### cancel(true)

`cancel(true)` 表示取消任务，并尝试中断正在运行的线程。

注意是“尝试中断”，不是强制杀死线程。任务能不能停下来，取决于任务代码是否响应中断。

```java
FutureTask<Void> task = new FutureTask<>(() -> {
    while (!Thread.currentThread().isInterrupted()) {
        // 执行业务逻辑
    }
    return null;
});
```

如果任务内部完全不检查中断，也没有可中断阻塞方法，那么 `cancel(true)` 也不一定能让任务马上停止。

## 为什么 FutureTask 只会执行一次

FutureTask 的 `run()` 方法执行前，会通过 CAS 抢占执行权：

1. 只有状态为 `NEW` 的任务可以执行。
2. 通过 CAS 把 `runner` 设置为当前线程。
3. 如果多个线程同时调用同一个 FutureTask 的 `run()`，只有一个线程能设置成功。
4. 执行完成后状态进入终态，后续再调用 `run()` 不会重复执行。

这也是 FutureTask 可以用于“异步加载去重”的原因：多个线程拿到同一个 FutureTask，真正的计算只会发生一次。

## 代码示例：异步加载缓存

```java
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;

public class FutureTaskCache<K, V> {
    private final Map<K, FutureTask<V>> cache = new ConcurrentHashMap<>();

    public V get(K key, Callable<V> loader) throws ExecutionException, InterruptedException {
        FutureTask<V> task = cache.get(key);
        if (task == null) {
            FutureTask<V> newTask = new FutureTask<>(loader);
            task = cache.putIfAbsent(key, newTask);
            if (task == null) {
                task = newTask;
                newTask.run();
            }
        }
        return task.get();
    }
}
```

这个例子体现了 FutureTask 的一个典型价值：

- 第一个线程负责创建并执行任务。
- 后续线程复用同一个 FutureTask。
- 多个线程等待同一份结果，避免重复加载。

生产代码里还需要处理加载失败后清理缓存、超时、降级等问题。

## 高频追问

### 1. FutureTask 和 Future 有什么区别？

`Future` 是接口，只描述异步结果的操作能力；`FutureTask` 是具体实现，既能被执行，又能作为 Future 获取结果。

### 2. FutureTask 和 CompletableFuture 有什么区别？

`FutureTask` 更基础，主要解决“异步执行 + 获取结果 + 取消”。

`CompletableFuture` 更适合复杂异步编排，支持回调、组合、串联、异常处理，例如 `thenApply`、`thenCompose`、`allOf` 等。

如果只是把一个 `Callable` 丢到线程里执行，FutureTask 足够；如果要做多个异步任务组合，CompletableFuture 更合适。

### 3. get 会一直阻塞怎么办？

可以使用带超时的 `get`：

```java
String result = future.get(3, TimeUnit.SECONDS);
```

生产中不建议无脑使用无超时 `get()`，否则下游卡住时，调用线程也可能被长期阻塞，最终导致线程池耗尽。

### 4. cancel(true) 一定能停止任务吗？

不一定。`cancel(true)` 只是调用执行线程的 `interrupt()`。如果任务不响应中断，或者没有进入可中断阻塞方法，任务可能仍然继续运行。

### 5. isDone 返回 true 是否代表任务成功？

不代表。任务正常完成、异常完成、被取消，`isDone()` 都可能返回 true。要判断是否成功，需要调用 `get()` 并处理异常。

### 6. get 抛出的异常有哪些？

常见异常包括：

- `InterruptedException`：等待结果时当前线程被中断。
- `ExecutionException`：任务执行过程中抛异常。
- `CancellationException`：任务被取消。
- `TimeoutException`：调用带超时时间的 get 超时。

## 实战场景

### 场景一：异步预加载

系统启动后提前加载配置、字典、缓存数据。主线程可以继续做其他初始化，真正需要结果时再调用 `get()`。

### 场景二：任务去重

多个请求同时查询同一个热点数据时，可以用 FutureTask 包装加载任务，避免每个请求都打到数据库。

### 场景三：线程池提交任务

调用 `ExecutorService.submit(Callable)` 后返回的 `Future`，底层就体现了类似 FutureTask 的思想：任务执行与结果获取解耦。

### 场景四：超时控制

通过 `future.get(timeout, unit)` 控制等待时间，超时后降级或取消任务，避免调用链被无限拖住。

## 易错点

1. 认为 `isDone()` 为 true 就代表任务成功，忽略异常和取消状态。
2. 调用无超时 `get()`，导致调用线程长期阻塞。
3. 认为 `cancel(true)` 可以强制停止线程，忽略中断只是协作机制。
4. 任务抛异常后不处理 `ExecutionException`，导致真实异常被包装后丢失上下文。
5. 在线程池任务内部等待同一个小线程池里的其他 Future，可能造成线程饥饿死锁。
6. 缓存 FutureTask 时，加载失败后不清理失败任务，导致后续请求一直拿到失败结果。

## 总结

FutureTask 的核心价值是把“任务执行”和“结果获取”统一起来。面试回答要抓住三点：**RunnableFuture 双重身份、状态流转、get/cancel 语义**。工程使用时重点关注超时、异常、取消、中断响应和线程池饥饿问题。
