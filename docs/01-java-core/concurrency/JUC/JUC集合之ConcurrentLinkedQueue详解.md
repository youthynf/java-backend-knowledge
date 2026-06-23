# JUC集合之ConcurrentLinkedQueue详解

JUC集合之ConcurrentLinkedQueue详解
ConcurrentLinkedQueue是 Java 并发包 (java.util.concurrent) 提供的一个线程安全的无界非阻塞队列，基于单向链表实现，采用 CAS（Compare-And-Swap）无锁算法保证线程安全，适用于高并发场景。

核心数据结构
ConcurrentLinkedQueue 内部采用单向链表存储数据，每个节点（Node）包含：
•  item：存储当前节点的数据（可能为null）
•  next：指向下一个节点（volatile修饰，保证可见性）

private static class Node<E> {
   volatile E item;
   volatile Node<E> next;
   // CAS 操作相关代码...
}

关键特性
无锁（Lock-Free）并发
•  使用CAS（Compare-And-Swap）实现无锁并发，避免线程阻塞。
•  head和tail指针：
- head：指向队列头部（可能不是真正的第一个节点，为了优化性能）
- tail：指向队列尾部（可能滞后，不总是最后一个节点）

弱一致性（Weakly Consistent）
•  迭代器（iterator）和size()方法不保证强一致性：
- size()需要遍历整个链表，可能不准确。
- 迭代器只能反映某一时刻的状态，后续修改可能不可见。

无界队列
•  动态扩容，没有容量限制（Integer.MAX_VALUE）。

入队（offer）流程

public boolean offer(E e) {
   checkNotNull(e);
   final Node<E> newNode = new Node<E>(e); // 创建新节点
   for (Node<E> t = tail, p = t;;) {
       Node<E> q = p.next;
       if (q == null) { // 如果 p 是最后一个节点
           if (p.casNext(null, newNode)) { // CAS 插入新节点
               if (p != t) // 检查 tail 是否需要更新
                   casTail(t, newNode); // 不总是更新 tail，减少 CAS 竞争
               return true;
           }
       }
       else if (p == q) // 处理已删除节点（p.next == p）
           p = (t != (t = tail)) ? t : head;
       else // 继续向后查找
           p = (p != t && t != (t = tail)) ? t : q;
   }
}
步骤：
1. 创建新节点 newNode。
2. 从tail开始遍历，找到真正的最后一个节点p（p.next == null）。
3. CAS 插入新节点（p.casNext(null, newNode)）。
4. 延迟更新tail（不每次更新，减少 CAS 竞争）。

出队（poll）流程

public E poll() {
   restartFromHead:
   for (;;) {
       for (Node<E> h = head, p = h, q;;) {
           E item = p.item;
           if (item != null && p.casItem(item, null)) { // CAS 置空 item
               if (p != h) // 更新 head
                   updateHead(h, ((q = p.next) != null) ? q : p);
               return item;
           }
           else if ((q = p.next) == null) { // 队列为空
               updateHead(h, p);
               return null;
           }
           else if (p == q) // 处理已删除节点
               continue restartFromHead;
           else
               p = q; // 继续向后查找
       }
   }
}
步骤：
1. 从head开始遍历，找到第一个item != null的节点p。
2. CAS 置空item（p.casItem(item, null)）。
3. 更新head（不总是移动head，减少 CAS 竞争）。
4. 返回数据。

关键优化点
延迟更新head和tail
•  head不总是指向第一个元素，可能滞后（减少 CAS 竞争）。
•  tail不总是指向最后一个元素，可能滞后（减少 CAS 竞争）。

HOPS跳数优化
•  不是每次操作都更新head或tail，而是间隔一定次数（HOPS）才更新，减少 CAS 竞争。

处理已删除节点
•  如果p.next == p，说明该节点已被删除，需要重新从head或tail开始遍历。

对比LinkedBlockingQueue
锁机制：ConcurrentLinkedQueue使用无锁CAS方式，而LinkedBlockingQueue则使用ReentrantLock实现，两者都是线程安全；
阻塞行为：ConcurrentLinkedQueue非阻塞，LinkedBlockingQueue的put/take操作阻塞；
容量：ConcurrentLinkedQueue无界，LinkedBlockingQueue可配置有界/无界；
使用场景：ConcurrentLinkedQueue适合高并发、非阻塞场景，而LinkedBlockingQueue适合生产者-消费者模型；

使用场景
适合：
•  高并发环境（如消息队列、事件总线）。
•  不需要阻塞操作（如take()/put()）。
•  不严格要求实时size()准确性。

不适合：
•  需要阻塞操作（应使用BlockingQueue）。
•  需要精确的size()（应使用LinkedBlockingQueue）。

总结
•  无锁并发：基于 CAS 实现，避免线程阻塞。
•  弱一致性：size()和迭代器不保证强一致性。
•  延迟更新：head和tail不总是最新，减少 CAS 竞争。
•  高性能：适用于高并发场景，但需要理解其弱一致性特点。
ConcurrentLinkedQueue是 Java 并发编程中的重要工具，适合高吞吐量、低延迟的场景，但使用时需注意其弱一致性问题。

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **JUC集合之ConcurrentLinkedQueue详解**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

## 面试官想考什么

- 是否能用自己的话讲清楚概念，而不是只背术语。
- 是否理解底层机制、关键流程以及它和相邻知识点的区别。
- 是否能把知识点落到真实项目：如何使用、如何排查、如何调优、什么时候不该用。
- 是否知道常见坑点，例如线程安全、可见性、阻塞、内存泄漏、GC 停顿或参数误用。

## 标准回答

JUC 相关问题要说明它解决的并发痛点：减少手写同步代码、提供高性能线程安全容器、原子类、锁、同步器和任务编排工具。回答时需要把 API 用法和底层机制联系起来，例如 CAS、AQS、队列、阻塞/唤醒、弱一致性迭代等。

## 深挖追问

- AQS 的 state、同步队列、独占/共享模式分别是什么作用？
- CAS 的 ABA、自旋开销、只能保护单变量等问题如何处理？
- JUC 容器和 `Collections.synchronizedXxx` 的适用场景有什么区别？
- 公平锁和非公平锁在吞吐、延迟、饥饿风险上如何取舍？

## 实战场景/代码示例

```java
AtomicInteger counter = new AtomicInteger();
int value = counter.incrementAndGet(); // 适合简单计数；复杂临界区仍应使用锁
```

## 易错点/总结

- 不要脱离场景背结论：并发和 JVM 问题通常都和负载、线程数、内存大小、JDK 版本有关。
- 面试回答建议采用“定义 → 原理 → 场景 → 风险/排查”的顺序。
- 如果涉及源码或参数，说明核心思路即可；不确定的版本差异要明确限定，不要绝对化。

