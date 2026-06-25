# JUC工具类-Phaser详解

## 核心概念

`Phaser` 是 Java JUC 包中的多阶段同步器。它可以让一组线程在多个阶段（phase）上反复同步，并且支持运行时动态注册、注销参与者。

它可以理解为 `CountDownLatch` 和 `CyclicBarrier` 的增强版：

- 像 `CountDownLatch` 一样，可以让线程到达某个点后通知别人；
- 像 `CyclicBarrier` 一样，可以让一组线程到齐后再进入下一阶段；
- 但它更灵活，支持**多阶段同步**和**动态调整参与线程数**。

核心关键词：

- **phase**：阶段编号，从 0 开始，每完成一轮同步就递增。
- **parties**：注册到 Phaser 的参与者数量。
- **arrived**：当前阶段已经到达的参与者数量。
- **unarrived**：当前阶段还没到达的参与者数量。
- **termination**：Phaser 是否终止。

## 面试官想考什么

面试问 `Phaser`，通常不是让你背 API，而是想看你是否理解复杂线程协作：

1. `Phaser` 和 `CountDownLatch`、`CyclicBarrier` 的边界区别。
2. 为什么 `Phaser` 能支持多阶段，并且能动态增减参与者。
3. `arrive()`、`arriveAndAwaitAdvance()`、`arriveAndDeregister()` 的语义差异。
4. `onAdvance()` 怎么控制阶段推进和终止条件。
5. 线程数很多时，分层 Phaser 如何减少竞争。
6. 线上如何避免等待线程永久阻塞。

## 标准回答

可以这样回答：

> `Phaser` 是 JUC 提供的多阶段同步工具，用来协调一组线程按阶段推进。每个线程可以先注册为 party，然后在每个阶段调用 `arrive()` 或 `arriveAndAwaitAdvance()` 表示自己到达。当当前阶段所有已注册 party 都到达后，Phaser 会推进到下一个 phase。
>
> 相比 `CountDownLatch`，它可以复用；相比 `CyclicBarrier`，它支持动态注册和注销参与者，也支持通过 `onAdvance()` 定制阶段结束逻辑。它适合分阶段任务、批量处理、多轮游戏、动态任务编排等场景。

## 核心 API

### 1. register()

注册一个新的参与者，`parties + 1`，当前阶段未到达数量也会相应增加。

```java
Phaser phaser = new Phaser();
phaser.register();
```

如果任务是动态创建的，可以在启动任务前调用 `register()`。

### 2. arrive()

表示当前参与者已经到达当前阶段，但不等待其他线程。

```java
int phase = phaser.arrive();
```

它更像“我已经完成本阶段了，你们继续等吧”。调用后当前线程可以继续做其他事情。

### 3. arriveAndAwaitAdvance()

表示当前参与者到达当前阶段，并等待其他参与者也到达。

```java
phaser.arriveAndAwaitAdvance();
```

这是最像 `CyclicBarrier.await()` 的方法，适合“大家都完成阶段 1 后，再一起进入阶段 2”。

### 4. arriveAndDeregister()

表示当前参与者到达当前阶段，并从后续阶段中注销。

```java
phaser.arriveAndDeregister();
```

适合任务执行完毕后退出协作，避免后续阶段继续等待这个线程。

### 5. awaitAdvance(int phase)

等待 Phaser 从指定 phase 推进到下一阶段。

```java
int phase = phaser.arrive();
phaser.awaitAdvance(phase);
```

`arriveAndAwaitAdvance()` 本质上可以理解为 `arrive()` + `awaitAdvance(phase)` 的组合。

### 6. onAdvance(int phase, int registeredParties)

阶段推进时的回调方法，可以通过继承 `Phaser` 重写。

```java
Phaser phaser = new Phaser(3) {
    @Override
    protected boolean onAdvance(int phase, int registeredParties) {
        System.out.println("阶段 " + phase + " 完成");
        return phase >= 2 || registeredParties == 0;
    }
};
```

返回值含义：

- `false`：继续进入下一阶段；
- `true`：终止 Phaser。

## 底层原理

### 状态如何表示

`Phaser` 内部用一个 `volatile long state` 同时编码多个信息：

- 当前阶段 `phase`；
- 已注册参与者数量 `parties`；
- 当前阶段未到达数量 `unarrived`；
- 是否终止。

可以粗略理解为：

```text
state = [termination bit][phase][parties][unarrived]
```

这种设计的好处是，Phaser 可以通过 CAS 一次性更新多个状态字段，减少锁竞争。

### 阶段推进流程

以 `arriveAndAwaitAdvance()` 为例：

1. 当前线程到达，使用 CAS 将 `unarrived - 1`。
2. 如果递减后 `unarrived != 0`，说明还有线程没到，当前线程等待 phase 变化。
3. 如果递减后 `unarrived == 0`，说明自己是当前阶段最后一个到达的参与者：
   - 调用 `onAdvance(phase, parties)`；
   - 如果不终止，则 `phase + 1`；
   - 重置下一阶段的 `unarrived = parties`；
   - 唤醒等待当前 phase 的线程。
4. 等待线程发现 phase 变化后继续执行。

### 为什么能动态注册和注销

`register()` 会增加 `parties`；`arriveAndDeregister()` 会减少 `parties`。

也就是说，Phaser 每一轮要等待的人数不是固定写死的，而是由当前注册的 party 数决定。只要注册和注销时机设计合理，它就能支持动态任务编排。

### 分层 Phaser

当参与线程很多时，所有线程都竞争同一个 Phaser，CAS 冲突会增加。

Phaser 支持父子结构：多个子 Phaser 分别管理一部分线程，子 Phaser 完成阶段后再向父 Phaser 汇报。这样可以把一个大热点拆成多个小热点。

```java
Phaser root = new Phaser();
Phaser child1 = new Phaser(root, 4);
Phaser child2 = new Phaser(root, 4);
```

这种结构适合大量任务分组同步，但普通业务不必一上来就用，复杂度也更高。

## 深挖追问

### 1. Phaser、CountDownLatch、CyclicBarrier 怎么选？

| 维度 | CountDownLatch | CyclicBarrier | Phaser |
|---|---|---|---|
| 是否可复用 | 不可复用 | 可复用 | 可复用 |
| 是否支持多阶段 | 不支持 | 支持固定参与方多轮同步 | 原生支持多阶段 |
| 参与者是否可动态变化 | 不支持 | 不支持 | 支持 |
| 典型语义 | 一个线程等多个任务完成 | 固定线程互相等待 | 动态任务分阶段推进 |
| 终止控制 | 计数归零结束 | reset/broken | onAdvance/forceTermination |

一句话选型：

- 一次性等待任务完成：用 `CountDownLatch`。
- 固定线程数反复集合：用 `CyclicBarrier`。
- 多阶段、参与者动态变化：用 `Phaser`。

### 2. arrive() 和 arriveAndAwaitAdvance() 有什么区别？

`arrive()` 只报告到达，不等待其他线程；`arriveAndAwaitAdvance()` 报告到达后还会等待阶段推进。

示例：

```java
int phase = phaser.arrive();              // 我到了，但我不等
phaser.awaitAdvance(phase);               // 如果需要，后面再等

phaser.arriveAndAwaitAdvance();           // 我到了，并且立刻等待大家到齐
```

### 3. arriveAndDeregister() 为什么重要？

因为 Phaser 后续阶段会等待所有已注册 party。

如果某个任务已经结束，但没有调用 `arriveAndDeregister()`，后续阶段仍然会把它算作参与者，其他线程就可能一直等待。

所以动态任务里一定要在任务完成、取消或异常退出时正确注销。

### 4. Phaser 如何支持超时？

`arriveAndAwaitAdvance()` 本身没有超时参数。要实现超时，一般拆成两步：

```java
int phase = phaser.arrive();
try {
    phaser.awaitAdvanceInterruptibly(phase, 3, TimeUnit.SECONDS);
} catch (TimeoutException e) {
    // 记录日志、取消任务或触发降级
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();
}
```

线上代码不建议无限等待，尤其是参与方可能异常退出的场景。

### 5. onAdvance 在哪个线程执行？

`onAdvance()` 通常由最后一个到达当前阶段、负责推进 phase 的线程执行。

因此这里不适合写很重的逻辑。它适合做阶段统计、日志、轻量状态切换、判断是否终止；不适合做长时间 IO 或远程调用。

## 实战场景

### 场景一：分阶段批量任务

多个线程都要经历“加载数据 → 清洗数据 → 写入结果”三个阶段，每个阶段必须等所有线程完成后再进入下一阶段。

```java
Phaser phaser = new Phaser(workerCount);

for (int i = 0; i < workerCount; i++) {
    new Thread(() -> {
        try {
            loadData();
            phaser.arriveAndAwaitAdvance();

            cleanData();
            phaser.arriveAndAwaitAdvance();

            writeResult();
            phaser.arriveAndDeregister();
        } catch (Exception e) {
            phaser.arriveAndDeregister();
            throw e;
        }
    }).start();
}
```

关键点：任务结束或异常时要注销，否则其他线程可能等不到阶段推进。

### 场景二：动态任务编排

任务数量不是一开始就固定的，运行过程中会继续提交子任务。

```java
Phaser phaser = new Phaser(1); // 主线程先注册

for (Task task : tasks) {
    phaser.register();
    executor.submit(() -> {
        try {
            task.run();
        } finally {
            phaser.arriveAndDeregister();
        }
    });
}

phaser.arriveAndAwaitAdvance(); // 主线程等待当前批次任务完成
phaser.arriveAndDeregister();
```

这里 `Phaser(1)` 的 1 代表主线程。主线程也作为一个参与方，避免任务还没注册完阶段就提前推进。

### 场景三：多轮游戏或比赛同步

每一轮所有玩家完成操作后，系统统一结算，再进入下一轮。

```java
Phaser phaser = new Phaser(playerCount) {
    @Override
    protected boolean onAdvance(int phase, int registeredParties) {
        settleRound(phase);
        return phase >= 9 || registeredParties == 0;
    }
};
```

## 易错点

### 1. 注册和注销不成对

动态注册后，如果任务失败没有注销，其他线程会一直等。

推荐写法：

```java
phaser.register();
executor.submit(() -> {
    try {
        doWork();
    } finally {
        phaser.arriveAndDeregister();
    }
});
```

### 2. 主线程没有注册导致阶段提前推进

动态提交任务时，如果主线程没有作为 party 注册，可能出现任务还没全部注册，已注册任务就完成并推进 phase 的情况。

因此动态批量提交时常用：

```java
Phaser phaser = new Phaser(1); // 主线程占位
```

### 3. 无限等待没有兜底

参与线程异常退出、线程池拒绝任务、任务被取消，都可能导致某个 party 永远不到达。线上建议使用 `awaitAdvanceInterruptibly` 加超时，或者在异常路径中注销。

### 4. onAdvance 写重逻辑

`onAdvance()` 在阶段推进路径上执行，写重逻辑会拖慢所有等待线程。复杂汇总可以只在 `onAdvance()` 里投递异步任务，避免阻塞阶段推进。

### 5. 混淆 arrive 和 await

`arrive()` 不会阻塞，调用后线程会继续运行。如果业务要求“大家都到齐后才能继续”，必须使用 `arriveAndAwaitAdvance()` 或 `arrive()` + `awaitAdvance()`。

## 总结

`Phaser` 的核心价值是：**支持动态参与者的多阶段线程同步**。

面试回答抓住五句话：

1. `Phaser` 是比 `CountDownLatch`、`CyclicBarrier` 更灵活的多阶段同步器。
2. 它通过 phase、parties、unarrived 管理阶段推进。
3. 它支持动态注册和注销，适合任务数量变化的场景。
4. `onAdvance()` 可以控制阶段结束逻辑和终止条件。
5. 线上使用要特别注意注销、超时和异常兜底，避免线程永久等待。
