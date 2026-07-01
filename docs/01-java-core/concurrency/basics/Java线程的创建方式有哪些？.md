# Java 线程的创建方式有哪些

## 核心概念

Java 线程的本质是 `java.lang.Thread` 类的实例，每个 Thread 对象对应一个操作系统级别的本地线程。创建线程的核心问题在于：如何把一段业务代码交给 JVM 调度执行。Java 把"任务"和"线程"两个概念解耦——任务用 `Runnable` 或 `Callable` 描述，线程用 `Thread` 描述，二者通过构造方法绑定。

Java 提供四种创建线程的方式：继承 `Thread`、实现 `Runnable`、实现 `Callable` 配合 `FutureTask`、使用线程池 `ExecutorService`。前三种是语法层面的"造线程"，第四种是工程层面的"用线程"，本质都是创建 Thread 对象并调用 `start()`。

## 标准回答

一句话结论：创建线程的方式只有一种——构造 `Thread` 对象并调用 `start()`；而"任务"的描述方式有四种。

1. **继承 `Thread`**：重写 `run()`，new 出来直接 `start()`。缺点是 Java 单继承，业务类已经继承了别的类就没法用。
2. **实现 `Runnable`**：把任务写成 `Runnable`，丢给 `Thread` 构造方法。解耦任务和线程，推荐方式。
3. **实现 `Callable`**：与 `Runnable` 区别是有返回值、可以抛出受检异常。配合 `FutureTask` 包装后交给 `Thread` 或线程池执行，通过 `Future.get()` 拿结果。
4. **线程池 `ExecutorService`**：生产环境唯一推荐方式。避免频繁创建销毁线程的开销，统一管控线程数量、队列、拒绝策略。

无论是哪种方式，启动线程都是调用 `Thread.start()`，它会触发 JVM 创建本地线程并调用 `Thread.run()`。直接调用 `run()` 只是普通方法调用，不会启动新线程。

## 实现原理

### Thread 的 run() 派发逻辑

`Thread` 类本身实现了 `Runnable` 接口，它的 `run()` 方法源码逻辑大致是：

```java
// java.lang.Thread 简化版
public class Thread implements Runnable {
    private Runnable target; // 构造方法传入的任务

    @Override
    public void run() {
        if (target != null) {
            target.run(); // 委派给传入的 Runnable
        }
        // 如果是子类重写了 run()，则走子类逻辑
    }
}
```

这套设计解释了三种写法为什么等价：

- 继承 `Thread` 重写 `run()`：子类覆盖了父类的 `run()`，target 派发逻辑被绕过。
- 实现 `Runnable` 传给 `Thread`：用父类 `run()`，走 target.run()。
- `Callable + FutureTask`：`FutureTask` 实现了 `RunnableFuture`（继承 `Runnable`），内部 `run()` 调用 `Callable.call()` 并把结果存起来。

### start() 做了什么

`start()` 通过本地方法 `start0()` 让 JVM 创建操作系统线程，新线程会执行 `Thread.run()`。一个 Thread 对象只能 `start()` 一次，再次调用抛 `IllegalThreadStateException`。

### Callable 与 FutureTask 的协作

```java
// FutureTask 简化版状态机
public void run() {
    try {
        V result = callable.call(); // 执行业务
        set(result);                // 写入 outcome，状态 -> RAN
    } catch (Throwable ex) {
        setException(ex);
    }
}

public V get() throws InterruptedException, ExecutionException {
    awaitDone();      // 阻塞等待 run() 完成
    return report();  // 正常返回 outcome，异常包装抛出
}
```

`get()` 会阻塞调用线程直到任务跑完；`get(timeout, unit)` 支持超时。

## 代码示例

### 方式一：继承 Thread

```java
public class MyThread extends Thread {
    @Override
    public void run() {
        System.out.println(Thread.currentThread().getName() + " running");
    }

    public static void main(String[] args) {
        new MyThread().start();
    }
}
```

### 方式二：实现 Runnable（推荐）

```java
public class MyRunnable implements Runnable {
    @Override
    public void run() {
        System.out.println(Thread.currentThread().getName() + " running");
    }

    public static void main(String[] args) {
        Thread t = new Thread(new MyRunnable(), "worker-1");
        t.start();
    }
}
```

Java 8+ 用 lambda 更简洁：

```java
new Thread(() -> System.out.println("running"), "worker-1").start();
```

### 方式三：Callable + FutureTask（需要返回值）

```java
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;

public class CallableDemo {
    public static void main(String[] args) throws ExecutionException, InterruptedException {
        FutureTask<Integer> future = new FutureTask<>(() -> {
            Thread.sleep(500);
            return 42;
        });
        new Thread(future, "compute-thread").start();

        Integer result = future.get(); // 阻塞直到任务完成
        System.out.println("result = " + result);
    }
}
```

### 方式四：线程池（生产推荐）

```java
import java.util.concurrent.*;

public class PoolDemo {
    public static void main(String[] args) throws ExecutionException, InterruptedException {
        ExecutorService pool = new ThreadPoolExecutor(
                4, 8, 60L, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(100),
                Executors.defaultThreadFactory(),
                new ThreadPoolExecutor.CallerRunsPolicy());

        // 提交 Runnable
        pool.execute(() -> System.out.println("execute runnable"));

        // 提交 Callable，拿到 Future
        Future<String> future = pool.submit(() -> "hello from callable");
        System.out.println(future.get());

        pool.shutdown();
    }
}
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 临时跑一个后台任务 | `new Thread(runnable).start()` | 仅限 demo / 一次性脚本，生产禁用 |
| 业务接口需要返回值 | `Callable + FutureTask` 或 `pool.submit(callable)` | `get()` 要设超时，避免线程被永久阻塞 |
| 高并发接口 | `ThreadPoolExecutor` 自定义参数 | 不要用 `Executors.newFixedThreadPool`，队列无界容易 OOM |
| 定时任务 | `ScheduledThreadPoolExecutor` | 任务抛异常会终止后续调度，需 try-catch |
| 大任务拆分 | `ForkJoinPool` 或 `CompletableFuture` | 注意任务粒度，过细反而增加调度开销 |

## 深挖追问

### run() 和 start() 的区别？

`start()` 创建本地线程并调度执行 `run()`；直接调用 `run()` 只是普通方法调用，仍在当前线程同步执行，不会启动新线程。面试常考。

### Runnable 和 Callable 的区别？

| 维度 | Runnable | Callable |
|------|----------|----------|
| 返回值 | 无（void） | 有（泛型 V） |
| 异常 | 不能抛受检异常 | 可以抛受检异常 |
| 配套 | `Thread` 直接执行 | 需要 `FutureTask` 包装 |
| JDK 版本 | 1.0 | 1.5 |

### 为什么推荐线程池而不是 new Thread？

`new Thread` 每次都创建销毁 OS 线程，开销大；线程数量不受控，高并发下可能拖垮系统。线程池复用线程、限制并发数、提供队列缓冲和拒绝策略，是生产环境标配。

### Thread 对象能 start 多次吗？

不能。Thread 内部维护一个 threadStatus 字段，`start()` 会检查状态，0 才允许启动。再次调用抛 `IllegalThreadStateException`。要重新跑任务只能 new 一个新 Thread。

### 守护线程 (Daemon) 怎么用？

`thread.setDaemon(true)` 必须在 `start()` 之前调用。守护线程在被 JVM 终止时不一定执行完 finally 块，因此不要在守护线程里做资源清理依赖。

## 易错点

- 直接调 `run()` 而不是 `start()`——不会启动新线程，是新手最常见错误。
- `Future.get()` 不设超时——任务卡死时调用线程永久阻塞。
- `setDaemon()` 在 `start()` 之后调用——抛 `IllegalThreadStateException`。
- 用 `Executors.newFixedThreadPool` / `newCachedThreadPool`——前者无界队列 OOM，后者无界线程数 OOM，阿里规约禁止。
- 在子线程抛出的受检异常无法被主线程 try-catch——必须在线程内处理，或用 `Callable + Future.get()` 包装。

## 总结

四种方式的本质是"任务的四种描述方式"，真正创建线程的动作只有 `new Thread().start()`。继承 `Thread` 受单继承限制；`Runnable` 解耦任务和线程；`Callable` 补上返回值能力；线程池是生产唯一推荐。区别 `run()` 和 `start()`、理解 `FutureTask` 状态机、避免 `Executors` 工厂方法，是面试和实战的核心要点。

## 参考资料

- [Java Thread 官方文档](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Thread.html)
- [Java Concurrency in Practice (Brian Goetz 等)](https://jcip.net/)
- [阿里巴巴 Java 开发手册——并发编程](https://github.com/alibaba/p3c)

---
