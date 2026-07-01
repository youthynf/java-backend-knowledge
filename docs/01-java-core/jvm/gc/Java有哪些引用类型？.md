# Java 有哪些引用类型

## 核心概念

Java 提供四种引用类型：强引用（Strong）、软引用（Soft）、弱引用（Weak）、虚引用（Phantom）。它们由强到弱排列，区别在于 GC 回收时机和用途。引用类型让开发者能精细控制对象生命周期，实现缓存、ThreadLocal、堆外内存释放等场景。

```text
强引用 Strong ──── 永不回收（只要 GC Roots 可达）
软引用 Soft   ──── 内存不足时回收（适合缓存）
弱引用 Weak   ──── 下次 GC 时回收（适合 ThreadLocal、WeakHashMap）
虚引用 Phantom ─── 随时可回收，仅用于跟踪回收（管理堆外内存）
```

## 标准回答

Java 有四种引用类型，区别在 GC 回收时机和用途。强引用永不回收，软引用内存不足时回收（缓存），弱引用下次 GC 回收（ThreadLocal、WeakHashMap），虚引用随时可回收且无法通过它访问对象（跟踪回收、管理堆外内存）。

要点：

1. **强引用 StrongReference**：默认引用，只要可达就不回收。
2. **软引用 SoftReference**：内存不足时回收，适合内存敏感缓存。
3. **弱引用 WeakReference**：下次 GC 必回收，适合 ThreadLocal、WeakHashMap。
4. **虚引用 PhantomReference**：随时可回收，必须配合 ReferenceQueue，用于跟踪回收事件。
5. **引用队列 ReferenceQueue**：GC 回收引用时把 Reference 对象入队，供应用感知。

## 强引用 StrongReference

代码中默认的引用方式，只要强引用存在且对象可达，GC 永不回收。

```java
Object obj = new Object();  // 强引用
obj = null;                 // 取消强引用，对象可被 GC 回收
```

强引用是 OOM 的最常见原因：静态集合持有对象引用，对象永远不被回收，堆满后 OOM。

## 软引用 SoftReference

内存不足时（即将 OOM）才回收。适合实现内存敏感的缓存。

```java
Object obj = new Object();
SoftReference<Object> soft = new SoftReference<>(obj);
obj = null;  // 让对象只被软引用关联

Object o = soft.get();  // 可能返回 null（已回收）或对象
```

JVM 保证在抛 OOM 前回收所有软引用对象。但软引用回收有时机不确定性，不适合做关键资源管理。

适用场景：

- 图片缓存（Android 早期用 SoftReference）。
- 配置缓存。
- 临时大对象。

JDK 参数：`-XX:SoftRefLRUPolicyMSPerMB=1000` 控制软引用存活时间（每 MB 堆 1 秒）。

## 弱引用 WeakReference

下次 GC 时无论内存是否充足都回收。适合短生命周期的辅助引用。

```java
Object obj = new Object();
WeakReference<Object> weak = new WeakReference<>(obj);
obj = null;

System.gc();
weak.get();  // 大概率返回 null
```

典型应用：

- **ThreadLocal**：`ThreadLocalMap` 的 Entry 继承 WeakReference，key 是弱引用。ThreadLocal 对象本身被回收后，Entry 的 key 变 null，value 仍可能被持有导致泄漏，需要主动 `remove()`。
- **WeakHashMap**：key 是弱引用，key 被回收后 entry 自动清除。适合"附加属性"映射。
- **WeakReference 缓存**：不会阻止对象被回收，但缓存命中率不可控。

```java
// WeakHashMap 示例
WeakHashMap<Object, String> map = new WeakHashMap<>();
Object key = new Object();
map.put(key, "value");
key = null;
System.gc();
// entry 可能被清除
```

## 虚引用 PhantomReference

最弱的引用，无法通过虚引用访问对象（`get()` 永远返回 null）。唯一作用是：对象被回收时收到系统通知。

必须配合 `ReferenceQueue` 使用。GC 回收对象前，把 PhantomReference 加入队列，应用线程从队列取出后做清理工作（如释放堆外内存）。

```java
ReferenceQueue<Object> queue = new ReferenceQueue<>();
PhantomReference<Object> phantom = new PhantomReference<>(new Object(), queue);

phantom.get();  // 永远返回 null

// 检查队列
Reference<?> ref;
while ((ref = queue.poll()) != null) {
    // 对象被回收，执行清理
}
```

典型应用：

- **DirectByteBuffer**：通过 `Cleaner`（PhantomReference 子类）触发堆外内存释放。
- **资源清理**：替代 finalize()，跟踪对象回收后释放关联资源。

```java
// Cleaner 用法（JDK 9+）
public class Resource implements AutoCloseable {
    private static final Cleaner cleaner = Cleaner.create();
    private final Cleaner.Cleanable cleanable;

    public Resource() {
        this.cleanable = cleaner.register(this, new CleanerAction());
    }

    @Override public void close() {
        cleanable.clean();  // 主动触发清理
    }

    private static class CleanerAction implements Runnable {
        @Override public void run() {
            // 资源清理逻辑
        }
    }
}
```

## 引用队列 ReferenceQueue

GC 回收 SoftReference、WeakReference、PhantomReference 引用的对象时，把 Reference 对象本身加入关联的 ReferenceQueue。应用线程可以从队列取出 Reference，做后续处理。

```java
ReferenceQueue<Object> queue = new ReferenceQueue<>();
WeakReference<Object> weak = new WeakReference<>(new Object(), queue);

System.gc();
Thread.sleep(100);

Reference<?> ref;
while ((ref = queue.poll()) != null) {
    // weak 引用的对象已被回收
    // 这里可以清理关联资源
}
```

## 四种引用对比

| 引用类型 | 回收时机 | get() 返回 | 用途 | 典型应用 |
|---------|---------|-----------|------|---------|
| 强引用 | 永不（只要可达） | 对象 | 普通引用 | 默认 |
| 软引用 | 内存不足时 | 对象或 null | 内存敏感缓存 | 图片缓存 |
| 弱引用 | 下次 GC | 对象或 null | 短期辅助引用 | ThreadLocal、WeakHashMap |
| 虚引用 | 随时（不可达后） | 永远 null | 跟踪回收事件 | Cleaner、堆外内存 |

## 代码示例

完整引用类型示例：

```java
import java.lang.ref.*;

public class ReferenceDemo {
    public static void main(String[] args) throws InterruptedException {
        // 强引用
        Object strong = new Object();

        // 软引用
        SoftReference<Object> soft = new SoftReference<>(strong);

        // 弱引用
        WeakReference<Object> weak = new WeakReference<>(strong);

        // 虚引用（必须配合 ReferenceQueue）
        ReferenceQueue<Object> queue = new ReferenceQueue<>();
        PhantomReference<Object> phantom = new PhantomReference<>(strong, queue);

        // 取消强引用
        strong = null;

        // 触发 GC
        System.gc();
        Thread.sleep(100);

        System.out.println("Soft: " + soft.get());      // 可能仍非 null（内存足）
        System.out.println("Weak: " + weak.get());       // null（已被回收）
        System.out.println("Phantom: " + phantom.get()); // 永远 null

        Reference<?> ref;
        while ((ref = queue.poll()) != null) {
            System.out.println("Phantom referenced object was collected: " + ref);
        }
    }
}
```

## 实战场景

| 场景 | 引用类型 | 用法 |
|------|---------|------|
| 图片缓存 | SoftReference | 内存不足时自动回收 |
| ThreadLocal | WeakReference（key） | ThreadLocal 回收后 entry 自动失效 |
| WeakHashMap | WeakReference（key） | key 回收后 entry 清除 |
| 堆外内存释放 | PhantomReference | DirectByteBuffer 的 Cleaner |
| 监听器管理 | WeakReference | 避免监听器持有大对象阻止 GC |

## 深挖追问

### ThreadLocal 的 key 为什么用弱引用？

ThreadLocal 的 `ThreadLocalMap` 中 Entry 继承 WeakReference，key 是 ThreadLocal 对象的弱引用。这样当 ThreadLocal 实例本身没有强引用时，可以被 GC 回收，避免 ThreadLocal 对象泄漏。但 value 仍是强引用，需要主动 `remove()` 避免泄漏。

### 软引用和弱引用的区别？

软引用：内存不足时才回收，存活时间相对长。
弱引用：下次 GC 必回收，无论内存是否充足。

软引用适合缓存（宁可保留），弱引用适合辅助引用（不阻止回收）。

### 虚引用的 get() 为什么永远返回 null？

虚引用的设计目的是"对象被回收时通知"，不是"访问对象"。如果 `get()` 能返回对象，就阻止了回收，违背设计意图。虚引用必须配合 ReferenceQueue 使用，通过队列感知回收事件。

### Cleaner 和 finalize() 的区别？

| 维度 | Cleaner | finalize() |
|------|---------|-----------|
| JDK 版本 | JDK 9+ | JDK 1.0+，JDK 9 Deprecated |
| 实现 | PhantomReference + ReferenceQueue | JVM 调用 finalize() 方法 |
| 自救 | 不支持 | 支持（重新建立引用） |
| 性能 | 好 | 差 |
| 推荐 | 推荐 | 不推荐，将移除 |

## 易错点

- 把"软引用"和"弱引用"混淆，软引用内存不足才回收，弱引用下次 GC 必回收。
- 以为虚引用能访问对象，`get()` 永远返回 null。
- 忘记给 PhantomReference 配 ReferenceQueue，无法感知回收事件。
- 用 SoftReference 做关键资源管理，回收时机不确定，容易泄漏。
- ThreadLocal 用完不 `remove()`，导致 value 泄漏。

## 总结

Java 四种引用类型让开发者精细控制对象生命周期。强引用永不回收，软引用内存不足回收（缓存），弱引用下次 GC 必回收（ThreadLocal、WeakHashMap），虚引用随时可回收且不可访问对象（Cleaner、堆外内存）。ReferenceQueue 配合引用类型感知回收事件。理解引用类型是阅读 ThreadLocal、WeakHashMap、DirectByteBuffer 源码的基础。

## 参考资料

- [Java Reference Objects](https://www.oracle.com/technical-resources/articles/javase/finalization.html)
- [PhantomReference vs Cleanable](https://bugs.openjdk.org/browse/JDK-8145701)
- 《深入理解 Java 虚拟机》周志明 第 3 章

---

[← 返回 GC 目录](/01-java-core/jvm/gc/)
