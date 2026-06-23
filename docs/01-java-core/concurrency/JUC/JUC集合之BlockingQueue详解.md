# JUC集合之BlockingQueue详解

JUC集合之BlockingQueue详解
BlockingQueue和BlockingDeque
BlockingQueue
BlockingQueue 概述
BlockingQueue 通常用于一个线程生产对象，而另外一个线程消费这些对象的场景。一个线程将会持续生产新对象并将其插入到队列之中，直到队列达到它所能容纳的临界点。如果该阻塞队列到达了其临界点，负责生产的线程将会在往里边插入新对象时发生阻塞。它会一直处于阻塞之中，直到负责消费的线程从队列中拿走一个对象。 负责消费的线程将会一直从该阻塞队列中拿出对象。如果消费线程尝试去从一个空的队列中提取对象的话，这个消费线程将会处于阻塞之中，直到一个生产线程把一个对象丢进队列。
BlockingQueue 的方法
BlockingQueue 具有 4 组不同的方法用于插入、移除以及对队列中的元素进行检查。四组不同的行为方式解释：
•  抛异常：如果试图的操作无法立即执行，抛一个异常（add/remove/element）。
•  特定值：如果试图的操作无法立即执行，返回一个特定的值，常常是 true / false（offer/poll/peek）。
•  阻塞：如果试图的操作无法立即执行，该方法调用将会发生阻塞，直到能够执行（put/take）。
•  超时：如果试图的操作无法立即执行，该方法调用将会发生阻塞，直到能够执行，但等待时间不会超过给定值。返回一个特定值以告知该操作是否成功，典型的是 true/false（offer/poll）。

无法向一个BlockingQueue中插入null。如果你试图插入null，BlockingQueue 将会抛出一个 NullPointerException。 可以访问到 BlockingQueue中的所有元素，而不仅仅是开始和结束的元素，如remove(o)，但是这么干效率并不高，因此你尽量不要用这一类的方法，除非你确实不得不那么做。

BlockingDeque
BlockingDeque概述
BlockingDeque是java.util.concurrent包里的接口，它表示一个线程安放入和提取实例的双端队列。BlockingDeque 类是一个双端队列，在不能够插入元素时，它将阻塞住试图插入元素的线程；在不能够抽取元素时，它将阻塞住试图抽取的线程。 deque(双端队列) 是 "Double Ended Queue" 的缩写。因此，双端队列是一个你可以从任意一端插入或者抽取元素的队列。在线程既是一个队列的生产者又是这个队列的消费者的时候可以使用到 BlockingDeque。如果生产者线程需要在队列的两端都可以插入数据，消费者线程需要在队列的两端都可以移除数据，这个时候也可以使用 BlockingDeque。

BlockingDeque的方法
一个BlockingDeque线程在双端队列的两端都可以插入和提取元素。 一个线程生产元素，并把它们插入到队列的任意一端。如果双端队列已满，插入线程将被阻塞，直到一个移除线程从该队列中移出了一个元素。如果双端队列为空，移除线程将被阻塞，直到一个插入线程向该队列插入了一个新元素。
BlockingDeque 具有 4 组不同的方法用于插入、移除以及对双端队列中的元素进行检查。四组不同的行为方式解释：
•  抛异常：如果试图的操作无法立即执行，抛一个异常。

addFirst(o)/removeFirst(o)/getFirst(o)
addLast(o)/removeLast(o)/getLast(o)
•  特定值：如果试图的操作无法立即执行，返回一个特定的值(常常是 true / false)。

offerFirst(o)/pollFirst(o)/peekFirst(o)
offerLast(o)/pollLast(o)/peekLast(o)
•  阻塞：如果试图的操作无法立即执行，该方法调用将会发生阻塞，直到能够执行。

putFirst(o)/takeFirst(o)
putLast(o)/takeLast(o)
•  超时：如果试图的操作无法立即执行，该方法调用将会发生阻塞，直到能够执行，但等待时间不会超过给定值。返回一个特定值以告知该操作是否成功(典型的是 true / false)。

offerFirst(o, timeout, timeunit)/pollFirst(timeout, timeunit)
offerLast(o, timeout, timeunit)/pollLast(timeout, timeunit)

BlockingDeque 与BlockingQueue关系
BlockingDeque接口继承自BlockingQueue接口。这就意味着你可以像使用一个BlockingQueue那样使用BlockingDeque。如果你这么干的话，各种插入方法将会把新元素添加到双端队列的尾端，而移除方法将会把双端队列的首端的元素移除。正如 BlockingQueue 接口的插入和移除方法一样。
BlockingQueue使用实例
数组阻塞队列 ArrayBlockingQueue
ArrayBlockingQueue类实现了BlockingQueue接口。ArrayBlockingQueue是一个有界的阻塞队列，其内部实现是将对象放到一个数组里。有界也就意味着，它不能够存储无限多数量的元素。它有一个同一时间能够存储元素数量的上限。你可以在对其初始化的时候设定这个上限，但之后就无法对这个上限进行修改了。 ArrayBlockingQueue 内部以FIFO(先进先出)的顺序对元素进行存储。队列中的头元素在所有元素之中是放入时间最久的那个，而尾元素则是最短的那个。 以下是在使用 ArrayBlockingQueue 的时候对其初始化的一个示例：

BlockingQueue queue = new ArrayBlockingQueue(1024);
queue.put("1");
Object object = queue.take();
以下是使用了 Java 泛型的一个 BlockingQueue 示例。注意其中是如何对 String 元素放入和提取的：

BlockingQueue<String> queue = new ArrayBlockingQueue<String>(1024);
queue.put("1");
String string = queue.take();

2. 延迟队列 DelayQueue
DelayQueue 实现了BlockingQueue接口。DelayQueue 对元素进行持有直到一个特定的延迟到期。注入其中的元素必须实现java.util.concurrent.Delayed接口，该接口定义：

public interface Delayed extends Comparable<Delayed< {
   public long getDelay(TimeUnit timeUnit);
}

DelayQueue将会在每个元素的getDelay()方法返回的值的时间段之后才释放掉该元素。如果返回的是0或者负值，延迟将被认为过期，该元素将会在 DelayQueue 的下一次 take 被调用的时候被释放掉。Delayed 接口也继承了java.lang.Comparable接口，这也就意味着Delayed对象之间可以进行对比。这个可能在对DelayQueue队列中的元素进行排序时有用，因此它们可以根据过期时间进行有序释放。 以下是使用 DelayQueue 的例子：

public class DelayQueueExample {
   public static void main(String[] args) {
       DelayQueue queue = new DelayQueue();
       Delayed element1 = new DelayedElement();
       queue.put(element1);
       Delayed element2 = queue.take();
   }
}
DelayedElement是我所创建的一个DelayedElement接口的实现类，它不在 java.util.concurrent 包里。你需要自行创建你自己的 Delayed接口的实现以使用DelayQueue类。
链阻塞队列LinkedBlockingQueue
LinkedBlockingQueue类实现了BlockingQueue接口。LinkedBlockingQueue内部以一个链式结构(链接节点)对其元素进行存储。如果需要的话，这一链式结构可以选择一个上限。如果没有定义上限，将使用 Integer.MAX_VALUE 作为上限。LinkedBlockingQueue 内部以FIFO(先进先出)的顺序对元素进行存储。队列中的头元素在所有元素之中是放入时间最久的那个，而尾元素则是最短的那个。 以下是 LinkedBlockingQueue 的初始化和使用示例代码：

BlockingQueue<String> unbounded = new LinkedBlockingQueue<String>();
BlockingQueue<String> bounded   = new LinkedBlockingQueue<String>(1024);
bounded.put("Value");
String value = bounded.take();

具有优先级的阻塞队列PriorityBlockingQueue
PriorityBlockingQueue类实现了BlockingQueue 接口。PriorityBlockingQueue是一个无界的并发队列。它使用了和类java.util.PriorityQueue一样的排序规则。你无法向这个队列中插入null值。 所有插入到 PriorityBlockingQueue 的元素必须实现 java.lang.Comparable接口。因此该队列中元素的排序就取决于你自己的Comparable实现。 注意PriorityBlockingQueue对于具有相等优先级(compare() == 0)的元素并不强制任何特定行为。同时注意，如果你从一个 PriorityBlockingQueue 获得一个Iterator的话，该Iterator并不能保证它对元素的遍历是以优先级为序的。 以下是使用 PriorityBlockingQueue的示例：

BlockingQueue queue   = new PriorityBlockingQueue();
//String implements java.lang.Comparable
queue.put("Value");
String value = queue.take();

5. 同步队列 SynchronousQueue
SynchronousQueue 类实现了BlockingQueue接口。SynchronousQueue是一个特殊的队列，它的内部同时只能够容纳单个元素。如果该队列已有一元素的话，试图向队列中插入一个新元素的线程将会阻塞，直到另一个线程将该元素从队列中抽走。同样，如果该队列为空，试图向队列中抽取一个元素的线程将会阻塞，直到另一个线程向队列中插入了一条新的元素。 据此，把这个类称作一个队列显然是夸大其词了。它更多像是一个汇合点。
BlockingDeque使用实例
java.util.concurrent包提供了以下BlockingDeque接口的实现类: LinkedBlockingDeque。以下是如何使用 BlockingDeque 方法的一个简短代码示例：

BlockingDeque<String> deque = new LinkedBlockingDeque<String>();
deque.addFirst("1");
deque.addLast("2");

String two = deque.takeLast();
String one = deque.takeFirst();

链阻塞双端队列 LinkedBlockingDeque
LinkedBlockingDeque类实现了BlockingDeque接口。deque(双端队列) 是"Double Ended Queue"的缩写。因此，双端队列是一个你可以从任意一端插入或者抽取元素的队列。LinkedBlockingDeque是一个双端队列，在它为空的时候，一个试图从中抽取数据的线程将会阻塞，无论该线程是试图从哪一端抽取数据。以下是 LinkedBlockingDeque 实例化以及使用的示例：

BlockingDeque<String> deque = new LinkedBlockingDeque<String>();
deque.addFirst("1");
deque.addLast("2");

String two = deque.takeLast();
String one = deque.takeFirst();

---

# 面试复习补充

## 核心概念补充

这篇文章的主题是 **JUC集合之BlockingQueue详解**。复习时应先给出定义，再说明它在 Java 并发或 JVM 体系中的位置，最后结合使用场景、限制条件和常见误区展开。

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

