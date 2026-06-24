# JUC集合之ConcurrentHashMap详解

JUC集合之ConcurrentHashMap详解
一、概述
ConcurrentHashMap 是 Java 并发包(java.util.concurrent)中提供的一个线程安全的哈希表实现，它是对 HashMap 的线程安全版本，但在实现上与 Hashtable 有很大不同，提供了更高的并发性能。
二、架构设计对比
底层结构：JDK 7 使用 Segment数组 + HashEntry链表，JDK 8 使用 Node数组 + 链表/红黑树；
2. 并发单位：JDK 7 并发度为 Segment 个数（默认16个），JDK 8 的并发度则是桶（Bucket）的个数；
3. 锁粒度：JDK 7 采用段锁（锁住整个Segment）；JDK 8 使用桶锁（synchronized锁单个桶首节点）；
4. 锁实现：JDK 7 使用ReentrantLock作为锁，JDK 8 使用 CAS + synchronized（ 先CAS尝试修改，修改失败则对桶使用 synchronized 锁；

三、主要特点
1. 线程安全：支持多线程并发访问而不需要外部同步
2. 高并发性：通过分段锁(Java 7)或 CAS+synchronized(Java 8+)实现高并发
3. 弱一致性：迭代器反映的是创建迭代器时或之后的某个时刻的哈希表状态
4. 不允许 null 键或 null 值：与 HashMap 不同，ConcurrentHashMap 不允许 null 键或值

四、底层实现原理详解
JDK 7 底层原理实现 
在 Java 7 中，ConcurrentHashMap 使用分段锁(Segment)技术：

final Segment<K,V>[] segments;  // 段数组

static final class Segment<K,V> extends ReentrantLock {
   transient volatile HashEntry<K,V>[] table;  // 每个段内部的哈希表
   // ...
}
将整个哈希表分成多个段(Segment)，每个段相当于一个小的 Hashtable；
每个段有自己的锁，不同段可以并发操作；
默认并发级别(concurrencyLevel)为 16，即默认有 16 个段(Segment)，初始化时支持设置其他值，一旦初始化后，不支持修改；
整表的初始化容量为16（非单个Segment容量）。单个Segment容量的计算公式：

int segmentCapacity = initialCapacity / concurrencyLevel;
segmentCapacity = roundUpToPowerOf2(segmentCapacity); // 取不小于结果的2的幂
计算得到每个Segment=1，然后向上取2的幂为2，因此 Segment[i] 的默认大小为 2。
扩容是按 Segment 独立扩容的，负载因子是 0.75，初始容量为2，计算得出初始阈值为 1：

threshold = (int)(segmentCapacity * loadFactor); // segmentCapacity=2, loadFactor=0.75 → threshold=1
当插入第一个元素时，size=1≥threshold=1，触发扩容2倍，变为4。源码中会检查++count>threshold判断是否需要扩容。

JDK 8 底层实现原理
Java 8 对 ConcurrentHashMap 进行了重大改进：
移除了分段锁设计，改用 CAS + synchronized 实现更细粒度的锁；
当哈希冲突时，使用链表+红黑树结构（类似 HashMap，当链表长度超过阈值(默认为8)时，如果哈希表的容量达到64时，转换为红黑树，否则进行扩）；
使用 volatile 关键字和 Unsafe 类提供的 CAS 操作保证原子性；
使用 Node 数组代替了原来的 Segment 数组；

五、核心方法解析
put() 方法执行过程：
1.1 JDK 8 中的 put 过程
参数校验与哈希计算：哈希计算通过spread()方法保证分不行，且结果始终为正；

public V put(K key, V value) {
    return putVal(key, value, false);
}

final V putVal(K key, V value, boolean onlyIfAbsent) {
    // 1. 检查key/value是否为null（ConcurrentHashMap不允许null键值）
    if (key == null || value == null) throw new NullPointerException();
    
    // 2. 计算哈希值（扰动函数+强制正数）
    int hash = spread(key.hashCode()); // (h ^ (h >>> 16)) & 0x7fffffff
    int binCount = 0; // 记录链表长度（用于树化判断）
    // ...
}
表初始化：如果表为空，则initTable()初始化表，通过CAS保证线程安全；

for (Node<K,V>[] tab = table;;) {
    Node<K,V> f; int n, i, fh;
    // 1. 表为空则初始化（CAS保证线程安全）
    if (tab == null || (n = tab.length) == 0)
        tab = initTable(); // 内部使用sizeCtl控制并发初始化
    // ...
}
定位桶并尝试无锁插入：先通过Unsafe.getObjectVolatile原子读取桶头节点，通过CAS（也是Unsafe类方法）尝试插入，失败时继续循环；

else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
    // 1. 桶为空时，直接CAS插入新节点
    if (casTabAt(tab, i, null, new Node<K,V>(hash, key, value, null)))
        break; // 插入成功则退出循环
}
处理哈希冲突（锁细化控制）：仅锁定冲突桶的头节点（synchronized(f)），其他桶仍可访问，并二次检查
桶的头节点，防止加锁期间发生扩容修改。当链表长度≥8时触发转化红黑树，若表容量小于64则优先扩容，避免过早树化。
协助扩容与计数更新：遇到MOVED节点时，当前线程协助迁移数据（即多线程并行加速扩容）；通过使用countercell[]分段计数方式，避免单一baseCount的CAS竞争问题

// 1. 检测到扩容中（ForwardingNode标记）
else if ((fh = f.hash) == MOVED) // MOVED = -1
    tab = helpTransfer(tab, f); // 协助数据迁移

// 2. 更新元素计数（CAS+分段计数）
addCount(1L, binCount);

1.2 JDK7 中的 put 过程
JDK7 的 ConcurrentHashMap 采用分段锁(Segment)设计，put 过程如下：
计算段位置：
首先计算 key 的 hash 值
根据 hash 值确定应该放在哪个 Segment 中

// 当前 segmentShift 的值为 32 - 4 = 28，segmentMask 为 16 - 1 = 15
Segment<K,V> segment = segments[(hash >>> segmentShift) & segmentMask]
获取段锁：尝试获取该 Segment 的锁（可重入锁），如果获取失败，线程会阻塞等待。
段内操作：
获取锁后，在 Segment 内部的 HashEntry 数组上进行操作
计算桶位置：

int index = (tab.length - 1) & hash
遍历链表查找是否已存在相同 key，如果存在，更新 value，如果不存在，采用头插法插入新节点；
检查扩容：
检查是否需要扩容（超过阈值）
扩容时只扩容当前 Segment 的 HashEntry 数组
释放锁：操作完成后释放 Segment 锁

伪代码实现：

public V put(K key, V value) {
   Segment<K,V> s;
   // 1. 计算hash
   int hash = hash(key);
   // 2. 找到对应的Segment
   int j = (hash >>> segmentShift) & segmentMask;
   s = ensureSegment(j);
   // 3. 调用Segment的put方法
   return s.put(key, hash, value, false);
}

// Segment内部的put方法
final V put(K key, int hash, V value, boolean onlyIfAbsent) {
   // 加锁
   HashEntry<K,V> node = tryLock() ? null : scanAndLockForPut(key, hash, value);
   try {
       // 在锁保护下操作
       HashEntry<K,V>[] tab = table;
       int index = (tab.length - 1) & hash;
       HashEntry<K,V> first = entryAt(tab, index);
       // 遍历链表...
       // 插入或更新...
       // 检查扩容...
   } finally {
       unlock(); // 释放锁
   }
}

get 方法的执行过程：
get() 操作时无锁的，以来 volatile 和 final 语义来保证线程安全。

public V get(Object key) {
    Node<K,V>[] tab; Node<K,V> e, p; int n, eh; K ek;
    // 1. 计算哈希
    int h = spread(key.hashCode());
    
    // 2. 定位桶位置（volatile 读取）
    if ((tab = table) != null && (n = tab.length) > 0 &&
        (e = tabAt(tab, (n - 1) & h)) != null) {
        
        // 3. 检查桶头节点
        if ((eh = e.hash) == h) {
            if ((ek = e.key) == key || (ek != null && key.equals(ek)))
                return e.val; // 直接匹配头节点
        }
        
        // 4. 特殊节点处理
        else if (eh < 0) 
            return (p = e.find(h, key)) != null ? p.val : null;
        
        // 5. 遍历链表
        while ((e = e.next) != null) {
            if (e.hash == h &&
                ((ek = e.key) == key || (ek != null && key.equals(ek))))
                return e.val;
        }
    }
    return null; // 未找到
}
关键设计：
通过 Unsafe.getObjectVolatile() 实现原子读（tabAt()）；
Node.val 和 Node.next 用 volatile 修饰保证可见性；
遇到 ForwardingNode（hash=MOVED）时调用其 find() 方法自动跳转到新表；

size 方法执行过程
Java 8 中使用一个 volatile 变量 baseCount 和 CounterCell 数组来统计元素数量，通过 CAS 更新，避免了锁的使用。size() 不保证强一致性，采用分治统计优化并发性能。
读取 baseCount
判断是否存在 cuonterCell[]
若不存在，直接返回 baseCount 结果；若存在则便利 counterCell[] 累加所有单元格值，最后跟 baseCount 相加后返回。

public int size() {
    long n = sumCount(); // 实际统计方法
    return (n < 0L) ? 0 : (n > Integer.MAX_VALUE) ? Integer.MAX_VALUE : (int)n;
}

final long sumCount() {
    CounterCell[] as = counterCells;
    long sum = baseCount;
    if (as != null) {
        for (CounterCell a : as) {
            if (a != null)
                sum += a.value; // 累加所有分片
        }
    }
    return sum;
}

技术更新机制（在 addCount()中）：
优先尝试 CAS 更新 baseCount：

if (U.compareAndSwapLong(this, BASECOUNT, s = baseCount, s + x))
    return;
竞争时初始化/更新 CounterCell：
线程通过哈希（ThreadLocalRandom.getProbe()）定位自己的 CounterCell 槽位，然后通过 CAS 更新所属槽位的值：

if (cellsBusy == 0 && counterCells == as &&
     U.compareAndSwapInt(this, CELLSBUSY, 0, 1)) {
     try {
         // 扩容或初始化 CounterCell 数组
     } finally {
         cellsBusy = 0;
     }
}
动态扩容 CounterCell 数组：当检测到冲突频繁时，通过 CELLSBUSY 锁双倍扩容数组。

六、扩容机制对比
JDK7 扩容机制
1.1 核心特点
分段扩容：每个Segment独立扩容，不影响其他Segment
单线程扩容：每个Segment的扩容由持有该Segment锁的线程完成
扩容时机：当单个Segment中的元素数量超过 `容量×负载因子`

2.2 扩容流程
创建一个新的HashEntry数组，大小为原来的2倍
重新计算所有元素在新数组中的位置
将旧数组中的元素迁移到新数组
用新数组替换旧数组

关键代码片段

// Segment内部的rehash方法
void rehash() {
   HashEntry<K,V>[] oldTable = table;
   int oldCapacity = oldTable.length;
   if (oldCapacity >= MAXIMUM_CAPACITY)
       return;
   
   // 新数组是原数组大小的2倍
   HashEntry<K,V>[] newTable = HashEntry.newArray(oldCapacity<<1);
   threshold = (int)(newTable.length * loadFactor);
   // ...迁移数据...
   table = newTable;
}

JDK8 扩容机制
核心特点
整体扩容：整个哈希表一起扩容
多线程协同：多个线程可以共同参与扩容
渐进式迁移：不需要一次性完成所有数据迁移
扩容时机：当元素总数超过 `容量×负载因子` 或链表长度≥8但表容量<64

扩容流程
创建新数组（大小为原数组2倍）
分配迁移任务给多个线程（每个线程负责一个桶区间）
迁移时对每个桶加锁（synchronized）
使用ForwardingNode标记已迁移的桶
迁移完成后替换旧数组

关键优化
并发迁移：通过`transferIndex`和`sizeCtl`协调多线程扩容
无锁化任务分配：使用CAS操作分配迁移任务
扩容期间读写不阻塞：读操作可以访问新旧表，写操作协助迁移

七、Hash值计算
JDK 7 的 Hash 计算
在 JDK 7 中，ConcurrentHashMap的 hash 计算方式如下：

private int hash(Object k) {
   int h = k.hashCode();
   h += (h << 15) ^ 0xffffcd7d;
   h ^= (h >>> 10);
   h += (h << 3);
   h ^= (h >>> 6);
   h += (h << 2) + (h << 14);
   return h ^ (h >>> 16);
}
多次位运算：通过多次位移和异或操作，使哈希值更分散，减少冲突。
2. 无扰动优化：虽然计算复杂，但未采用类似 `HashMap` 的 扰动函数（如 `hash ^ (hash >>> 16)`）。
3. 分段锁依赖：由于 JDK 7 采用 Segment 分段锁，哈希计算主要用于确定 Segment 索引和 HashEntry 数组索引。

JDK 8 的 Hash 计算
在 JDK 8 中，ConcurrentHashMap 的 hash 计算方式改为：

static final int spread(int h) {
   return (h ^ (h >>> 16)) & 0x7fffffff;
}
扰动优化：
采用 h ^ (h >>> 16)（类似 HashMap），使高位参与运算，减少哈希冲突。
& 0x7fffffff 确保结果为正数（因为 ConcurrentHashMap 的桶索引不能为负）。
更简单高效：
相比 JDK 7 的复杂位运算，JDK 8 的计算更简洁，性能更高。
适应新结构：
JDK 8 改用数组 + 链表 + 红黑树结构，不再依赖 Segment 分段锁，而是使用 CAS + synchronized 优化并发性能。
为什么 JDK 8 优化 Hash 计算？
1. 减少���算开销：JDK 7 的多次位运算在并发场景下可能成为性能瓶颈。
2. 适应新结构：JDK 8 改用红黑树处理冲突，即使哈希冲突稍多，也能保证 O(log n) 的查询效率。
3. CAS 友好：更简单的哈希计算能提高 CAS（Compare-And-Swap）操作的效率。

八、使用示例

ConcurrentHashMap<String, Integer> map = new ConcurrentHashMap<>();

// 线程安全的put
map.put("key1", 1);

// 线程安全的复合操作
map.compute("key1", (k, v) -> v == null ? 1 : v + 1);

// 线程安全的遍历
map.forEach((k, v) -> System.out.println(k + ": " + v));

九、适用场景
•  高并发环境下的键值存储
•  需要线程安全的哈希表且对性能要求较高
•  替代传统的 Hashtable 或 Collections.synchronizedMap

十、注意事项
虽然线程安全，但复合操作(如 check-then-act)仍需额外同步
迭代器是弱一致性的，不保证反映最新的修改
批量操作(如 putAll)不保证原子性
Java 8 后的版本性能优于早期版本

总结
ConcurrentHashMap 是 Java 并发编程中的重要工具类，合理使用可以显著提高多线程环境下的程序性能。

## 面试总结

围绕「JUC集合之ConcurrentHashMap详解」，面试官通常不只考概念定义，更关注你能否把机制、使用场景和线上问题串起来。

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
