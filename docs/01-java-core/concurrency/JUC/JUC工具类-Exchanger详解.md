# JUC工具类-Exchanger详解

## 核心概念

`Exchanger` 是 JUC 提供的线程间数据交换工具。它提供一个同步交换点：两个线程分别调用 `exchange()`，当双方都到达后，彼此交换携带的数据，然后继续执行。

它的语义很简单：**两个线程一手交数据，一手取数据；只有双方都到达，交换才完成**。

典型代码：

```java
Exchanger<String> exchanger = new Exchanger<>();

String other = exchanger.exchange("my data");
```

如果只有一个线程调用 `exchange()`，它会一直阻塞，直到另一个线程也调用 `exchange()`，或者等待超时、线程被中断。

## 面试官想考什么

面试里问 `Exchanger`，重点通常在这些方面：

1. 它和 `BlockingQueue` 都能在线程间传递数据，区别是什么？
2. 为什么 `Exchanger` 强调“两两配对”？
3. 高并发下多个线程同时交换时，它如何降低竞争？
4. 使用 `exchange()` 有哪些阻塞、超时和死等风险？
5. 它适合什么真实场景，不适合什么场景？

## 标准回答

可以这样回答：

> `Exchanger` 是 JUC 中用于两个线程之间交换数据的同步工具。线程 A 调用 `exchange(a)` 后，如果线程 B 还没到达，A 会等待；线程 B 调用 `exchange(b)` 后，两者完成配对，A 拿到 b，B 拿到 a。
>
> 它不是任务队列，而是双向同步交换点。底层在低竞争场景下优先使用单个 slot 槽位配对；竞争激烈时会启用 arena 多槽位结构，通过 CAS、自旋和 park/unpark 完成线程匹配，减少多个线程争抢同一个槽位的问题。
>
> 使用时要注意，它必须成对出现，否则可能一直阻塞，所以生产环境更推荐使用带超时的 `exchange(x, timeout, unit)`。

## 底层原理

### 交换模型

`Exchanger` 的核心不是“存储数据”，而是“匹配线程”。

一个线程到达时，大致会发生两种情况：

1. 没有匹配线程：
   - 当前线程把自己的数据放入节点；
   - 挂到某个槽位；
   - 自旋一小段时间，仍未匹配则阻塞。
2. 已有匹配线程：
   - 当前线程拿到对方节点；
   - 把自己的数据写入对方节点的 `match` 字段；
   - 唤醒对方线程；
   - 返回对方的数据。

### slot 与 arena

`Exchanger` 内部有两个重要概念：

- `slot`：单槽位，适用于低竞争场景。
- `arena`：多槽位数组，适用于高竞争场景。

低并发下，两个线程直接在 `slot` 上 CAS 配对，路径短、开销低。

高并发下，如果很多线程同时争抢 `slot`，会产生大量 CAS 失败，于是会扩展到 `arena`。不同线程根据哈希、探测和冲突次数选择不同槽位，降低热点竞争。

可以类比：

- `slot` 像一个固定交易窗口；
- `arena` 像开了多个交易窗口，让不同线程分散配对。

### Node 的关键字段

简化理解：

```java
static final class Node {
    int index;              // arena 下标
    int bound;              // 当前 arena 边界快照
    int collides;           // 冲突次数
    int hash;               // 探测用 hash
    Object item;            // 当前线程带来的数据
    volatile Object match;  // 匹配线程给自己的数据
    volatile Thread parked; // 阻塞时记录线程
}
```

其中：

- `item` 是“我要交给别人”的数据；
- `match` 是“别人交给我”的数据；
- `parked` 用于在匹配完成后唤醒等待线程。

### 为什么要先自旋再阻塞

线程配对通常很快，如果刚到达就阻塞，park/unpark 的上下文切换成本会比较高。

所以 `Exchanger` 会先短暂自旋，期望另一个线程很快到达；如果自旋后仍未匹配，再通过 `LockSupport.park()` 挂起。

这种策略适合短时间等待：

- 匹配很快：自旋成功，避免线程切换；
- 匹配较慢：转入阻塞，避免 CPU 空转。

## 深挖追问

### 1. Exchanger 和 BlockingQueue 有什么区别？

| 维度 | Exchanger | BlockingQueue |
|---|---|---|
| 数据流向 | 双向交换 | 通常单向传递 |
| 参与线程 | 两两配对 | 支持多生产者多消费者 |
| 是否存储数据 | 不适合作为缓冲区 | 队列可缓存多个元素 |
| 同步语义 | 双方必须同时到达交换点 | put/take 可由队列容量解耦 |
| 典型场景 | 双缓冲、配对校验、双线程协作 | 任务队列、削峰填谷、生产消费解耦 |

一句话：

- `Exchanger` 是“面对面交换”；
- `BlockingQueue` 是“放进队列，谁来取都行”。

### 2. Exchanger 是否只能两个线程使用？

不是只能创建两个线程使用，而是每次交换只发生在两个线程之间。

如果有很多线程同时调用同一个 `Exchanger`，它们会被两两配对。至于哪个线程和哪个线程配对，不应该依赖固定顺序。

因此如果业务要求“线程 A 必须和线程 B 交换”，应该使用独立的 `Exchanger` 实例或额外的路由逻辑。

### 3. 一个线程调用 exchange 后另一个线程永远不到怎么办？

无参 `exchange(x)` 会一直阻塞，直到：

- 另一个线程到达并匹配；
- 当前线程被中断。

生产环境建议使用带超时版本：

```java
try {
    Data other = exchanger.exchange(data, 3, TimeUnit.SECONDS);
} catch (TimeoutException e) {
    // 记录日志、降级、取消任务或重试
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();
}
```

### 4. Exchanger 交换的是对象副本还是引用？

交换的是对象引用，不是深拷贝。

如果交换的是可变对象，比如 `StringBuilder`、`List`、`Map`，交换后对象所有权要约定清楚。否则两个线程继续同时修改同一个对象，仍然会有并发安全问题。

### 5. Exchanger 的内存可见性如何保证？

`Exchanger` 的配对过程涉及 volatile 字段、CAS 和线程阻塞/唤醒，能够保证交换前对对象引用的发布对另一方可见。

但这不代表交换后的对象可以被两个线程无保护地并发修改。它保证的是交换动作的同步语义，不自动保证对象内部后续操作线程安全。

## 实战场景

### 场景一：双缓冲交换

一个线程负责填充缓冲区，另一个线程负责消费缓冲区。双方交换缓冲区引用，避免频繁创建对象。

```java
Exchanger<StringBuilder> exchanger = new Exchanger<>();

Thread producer = new Thread(() -> {
    StringBuilder buffer = new StringBuilder();
    try {
        while (!Thread.currentThread().isInterrupted()) {
            buffer.append(loadData());
            buffer = exchanger.exchange(buffer); // 把满缓冲交给消费者，拿回空缓冲
            buffer.setLength(0);
        }
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    }
});

Thread consumer = new Thread(() -> {
    StringBuilder buffer = new StringBuilder();
    try {
        while (!Thread.currentThread().isInterrupted()) {
            buffer = exchanger.exchange(buffer); // 拿到生产者填好的缓冲
            consume(buffer.toString());
        }
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    }
});
```

这种方式适合单生产者、单消费者、批量交换数据的场景。

### 场景二：两个算法阶段互相校验

比如两个线程分别计算同一批数据的不同结果，在某个点互换结果做校验。

```java
Result myResult = calculate();
Result otherResult = exchanger.exchange(myResult, 1, TimeUnit.SECONDS);
compare(myResult, otherResult);
```

### 场景三：遗传算法中的配对交换

遗传算法或模拟退火等场景中，两个工作线程可以周期性交换部分状态，进行协作优化。不过要注意配对的不确定性，不能依赖固定线程顺序。

## 易错点

### 1. 把 Exchanger 当队列用

`Exchanger` 不适合多生产者、多消费者任务分发。它没有队列缓冲语义，也不保证哪个消费者拿到哪个任务。任务分发应该优先使用 `BlockingQueue`、线程池队列或消息队列。

### 2. 忘记超时，导致永久阻塞

只要某一方没有到达，另一方就可能一直等待。线上代码建议默认使用超时版本，并在超时后做取消、重试或告警。

### 3. 交换可变对象后继续共享修改

交换的是引用。如果生产者把 `List` 交给消费者后自己还继续写这个 `List`，仍然会出现并发问题。正确做法是明确所有权转移：交出去之后当前线程不再修改。

### 4. 假设多线程配对顺序稳定

多个线程共用一个 `Exchanger` 时，配对关系受调度、竞争和 arena 探测影响，不应该写依赖特定配对顺序的业务逻辑。

## 总结

`Exchanger` 的核心价值是：**让两个线程在同步点进行双向数据交换**。

面试回答记住四句话：

1. 它是两两配对的交换工具，不是队列。
2. 低竞争用 `slot`，高竞争用 `arena`，通过 CAS、自旋和 park/unpark 完成匹配。
3. 只调用一方会阻塞，生产环境要优先使用带超时的 `exchange`。
4. 交换的是对象引用，交换后仍要注意可变对象的所有权和线程安全。
