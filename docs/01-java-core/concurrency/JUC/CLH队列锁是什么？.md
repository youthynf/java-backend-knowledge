# CLH队列锁是什么？

CLH队列锁是什么？
一、概述
CLH锁是一种 基于队列的公平自旋锁，由 Craig、Landin 和 Hagersten 提出，广泛应用于 Java 并发框架（如 AQS 的部分实现）。它的核心思想是 通过链表实现线程排队，每个线程自旋监听前驱节点的状态，避免全局竞争，提高并发性能。
二、核心特征
数据结构特性
CLH 锁是一个 隐式的 FIFO 队列，每个等待线程通过以下结构组成链表：

class CLHNode {
    volatile boolean locked; // true=需要获取锁，false=已释放锁
}
其中locked为true表示该节点对应线程正在等待或持有锁，false则表示节点对应的线程已经释放锁。
关键变量
•  tail：原子引用，指向队列的尾部节点（新线程通过 CAS 加入队列）。
•  ThreadLocal<CLHNode>：每个线程保存自己的节点和前驱节点。

运行机制特点
•  本地变量自旋：每个新加入者在前驱节点的locked字段上自旋;
•  去中心化检测：仅需检测直接前驱的状态变化;
•  低开销通知：前驱释放只会使后继节点的缓存失效;
三、工作原理
工作流程
1.1 加锁（lock）

void lock() {
    CLHNode node = new CLHNode();      // 1. 创建新节点
    node.locked = true;                // 2. 标记为等待锁
    CLHNode pred = tail.getAndSet(node); // 3. CAS 加入队列尾部
    while (pred.locked) {              // 4. 自旋等待前驱节点释放锁
        // 空转（或可插入 Thread.yield() 减少 CPU 占用）
    }
    // 5. 成功获取锁（前驱节点的 locked=false）
}
过程解析：
•  每个线程创建一个CLHNode，并设置locked=true。
•  通过AtomicReference.getAndSet()将节点加入队列尾部，并获取前驱节点pred。
•  自旋监听前驱节点的locked字段，直到pred.locked=false（表示前驱线程释放锁）。
•  退出自旋，当前线程成功获取锁。

1.2 解锁（unlock）

void unlock() {
    currentNode.locked = false;        // 1. 标记当前节点为已释放
    currentNode = pred;                // 2. 重置当前节点（可选优化）
}
过程解析：
•  将当前线程的 CLHNode.locked 设为 false，通知后继线程。
•  复用前驱节点以减少对象创建开销（需处理内存可见性），该步骤可选

在AQS中的改进
•  数据结构升级 : 从单向→双向链表(Node.prev/next)
•  等待机制变更 : 自旋→阻塞唤醒(LockSupport.park/unpark)
•  状态扩展 : 新增waitStatus(CANCELLED/SIGNAL等)

四、应用场景：Java生态中的应用
•  AQS基础架构 : 所有基于AbstractQueuedSynchronizer的实现都依赖改造版CLQ.
•  ReentrantLock : 公平模式直接使用,非公平模式混合使用.
•  CountDownLatch : 共享模式下维护等待者.
五、优势分析
•  严格公平性 : 杜绝饥饿现象.
•  低竞争开销 : 仅需修改tail指针(CAS).
•  NUMA友好 : 本地化内存访问模式.
六、局限性及优化
•  空间消耗 : 每个等待者需独立Node对象.
•  优化方案 : 引入超时机制/适应性自旋策略.
"Doug Lea在设计AQS时指出:改造后的CLQ既保留了原始算法的公平性优势,又通过阻塞机制大幅降低了CPU空转消耗。"

## 面试总结

围绕「CLH队列锁是什么？」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

### 核心回答

1. JUC 提供锁、原子类、并发集合、线程池和同步工具，核心目标是降低并发编程复杂度。
2. 多数 JUC 工具底层围绕 CAS、volatile、AQS、LockSupport 和内存屏障构建。
3. 选择工具时要先明确共享状态、等待关系、吞吐要求和失败策略。

### 高频追问

- 这个工具和 synchronized/wait-notify 相比解决了什么问题？
- 它是独占、共享还是无锁算法？
- 高并发下可能出现什么性能瓶颈？

### 实战落地

- **选型前**：先判断是互斥访问、线程协作、任务编排，还是限流隔离。
- **编码时**：控制共享变量范围，明确锁对象、超时策略、异常处理和资源释放。
- **上线后**：观察线程数、队列长度、阻塞时间、拒绝次数和 RT 抖动，必要时用线程 Dump 验证。

### 易错点

- 不要只背 API，要能说明适用场景和边界。
- 并发集合只能保证单次操作线程安全，复合业务逻辑仍可能需要额外同步。
