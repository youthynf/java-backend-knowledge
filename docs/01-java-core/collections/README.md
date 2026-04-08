# 集合框架

## 核心概念

### 集合框架整体架构

Java 集合框架主要分为两大接口体系：

1. **Collection 接口** - 单值集合
   - List：有序可重复（ArrayList、LinkedList、Vector）
   - Set：无序不可重复（HashSet、TreeSet、LinkedHashSet）
   - Queue：队列（LinkedList、PriorityQueue、ArrayDeque）

2. **Map 接口** - 键值对集合
   - HashMap、TreeMap、LinkedHashMap、ConcurrentHashMap

### HashMap 核心原理

**数据结构演进**：
- JDK 1.7：数组 + 链表
- JDK 1.8：数组 + 链表 + 红黑树（链表长度 ≥ 8 且数组长度 ≥ 64 时转红黑树）

**关键参数**：
```java
static final int DEFAULT_INITIAL_CAPACITY = 1 << 4;  // 默认容量 16
static final float DEFAULT_LOAD_FACTOR = 0.75f;       // 负载因子
static final int TREEIFY_THRESHOLD = 8;               // 链表转红黑树阈值
static final int MIN_TREEIFY_CAPACITY = 64;           // 转红黑树最小容量
```

**put 操作流程**：
1. 计算 key 的 hash 值（h ^ (h >>> 16)）
2. 定位数组位置：(n - 1) & hash
3. 如果位置为空，直接插入
4. 如果有冲突，遍历链表/红黑树
5. 更新已存在的 key 或插入新节点
6. 检查是否需要扩容

**扩容机制**：
- 触发条件：size > capacity * loadFactor
- 扩容为原来的 2 倍
- JDK 1.8 优化：元素位置要么不变，要么移动到原位置 + 原数组长度的位置

### ConcurrentHashMap 核心原理

**JDK 1.7 实现**：
- 分段锁（Segment + ReentrantLock）
- 默认 16 个 Segment，并发度最大 16

**JDK 1.8 实现**：
- 取消 Segment，使用 Node 数组 + CAS + synchronized
- 锁粒度更细：只锁链表头节点
- 性能更高：读操作无锁，写操作只锁单个桶

```java
// JDK 1.8 put 操作核心逻辑
final V putVal(K key, V value, boolean onlyIfAbsent) {
    // 1. 计算 hash
    int hash = spread(key.hashCode());
    for (Node<K,V>[] tab = table;;) {
        Node<K,V> f; int n, i, fh;
        // 2. 如果 table 为空，初始化
        if (tab == null || (n = tab.length) == 0)
            tab = initTable();
        // 3. 如果目标位置为空，CAS 插入
        else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
            if (casTabAt(tab, i, null, new Node<K,V>(hash, key, value, null)))
                break;
        }
        // 4. 如果正在扩容，帮助迁移
        else if ((fh = f.hash) == MOVED)
            tab = helpTransfer(tab, f);
        // 5. 否则加锁插入
        else {
            synchronized (f) {
                // 插入或更新节点
            }
        }
    }
    return null;
}
```

### ArrayList vs LinkedList

| 特性 | ArrayList | LinkedList |
|------|-----------|------------|
| 底层结构 | 动态数组 | 双向链表 |
| 随机访问 | O(1) | O(n) |
| 插入删除（头部/中间） | O(n) | O(1)（已知位置）|
| 内存占用 | 连续空间，较少 | 每个节点额外存储前后指针 |
| 扩容 | 1.5 倍扩容 | 无需扩容 |
| 适用场景 | 查询多、修改少 | 频繁插入删除 |

### HashSet 实现原理

HashSet 基于 HashMap 实现：
```java
public HashSet() {
    map = new HashMap<>();
}

// 添加元素时，value 为固定的 PRESENT 对象
public boolean add(E e) {
    return map.put(e, PRESENT) == null;
}
```

**特点**：
- 不允许重复元素（依赖 equals() 和 hashCode()）
- 允许 null
- 非线程安全
- 迭代顺序不保证

---

## 面试高频问题

### 1. HashMap 为什么线程不安全？

**问题场景**：

1. **JDK 1.7 扩容死循环**
   - 并发扩容时，链表可能形成环形结构
   - 导致 get 操作无限循环

2. **数据丢失**
   - 多线程同时 put，计算相同位置
   - 后插入的覆盖先插入的

3. **size 计数不准**
   - ++size 非原子操作

**解决方案**：
- 使用 ConcurrentHashMap
- 使用 Collections.synchronizedMap()
- 手动加锁

---

### 2. HashMap 的 hash 函数为什么要高低位异或？

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

**原因**：
- 数组长度 n 较小时，只有低位参与定位：(n - 1) & hash
- 高低位异或，让高位也参与计算
- 减少哈希冲突，分布更均匀

---

### 3. ConcurrentHashMap 为什么不允许 null 键值？

```java
// 这会抛出 NullPointerException
ConcurrentHashMap<String, String> map = new ConcurrentHashMap<>();
map.put(null, "value");  // 抛异常
map.put("key", null);    // 抛异常
```

**原因**：
- 在多线程环境下，无法区分 "没有找到 key" 和 "value 是 null"
- 避免二义性问题

---

### 4. ArrayList 扩容机制？

```java
private void grow(int minCapacity) {
    int oldCapacity = elementData.length;
    int newCapacity = oldCapacity + (oldCapacity >> 1);  // 1.5 倍
    if (newCapacity - minCapacity < 0)
        newCapacity = minCapacity;
    elementData = Arrays.copyOf(elementData, newCapacity);
}
```

**要点**：
- 每次扩容为原来的 1.5 倍
- 使用 Arrays.copyOf() 复制到新数组
- 如果指定了初始容量，可以避免多次扩容

---

### 5. 如何实现一个线程安全的 List？

**方案对比**：

| 方案 | 实现原理 | 适用场景 |
|------|----------|----------|
| Vector | 方法级 synchronized | 不推荐，性能差 |
| Collections.synchronizedList | 包装类 + synchronized | 低并发场景 |
| CopyOnWriteArrayList | 写时复制 | 读多写少 |
| 手动加锁 | synchronized/List | 灵活控制 |

**CopyOnWriteArrayList 特点**：
```java
public boolean add(E e) {
    synchronized (lock) {
        Object[] es = getArray();
        int len = es.length;
        es = Arrays.copyOf(es, len + 1);  // 复制新数组
        es[len] = e;
        setArray(es);
        return true;
    }
}
```

- 写操作复制整个数组，性能开销大
- 读操作无锁，性能极高
- 适合读多写少场景

---

## 实战场景

### 场景 1：高频缓存

使用 HashMap + 双向链表实现 LRU 缓存：

```java
public class LRUCache<K, V> extends LinkedHashMap<K, V> {
    private final int maxSize;
    
    public LRUCache(int maxSize) {
        super(maxSize, 0.75f, true);  // accessOrder = true
        this.maxSize = maxSize;
    }
    
    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > maxSize;
    }
}
```

### 场景 2：高并发计数器

使用 ConcurrentHashMap + LongAdder：

```java
public class ConcurrentCounter {
    private final ConcurrentHashMap<String, LongAdder> counter = new ConcurrentHashMap<>();
    
    public void increment(String key) {
        counter.computeIfAbsent(key, k -> new LongAdder()).increment();
    }
    
    public long get(String key) {
        LongAdder adder = counter.get(key);
        return adder == null ? 0 : adder.sum();
    }
}
```

### 场景 3：线程安全的发布订阅

```java
public class EventBus {
    private final ConcurrentHashMap<String, CopyOnWriteArraySet<Consumer<String>>> subscribers 
        = new ConcurrentHashMap<>();
    
    public void subscribe(String topic, Consumer<String> consumer) {
        subscribers.computeIfAbsent(topic, k -> new CopyOnWriteArraySet<>()).add(consumer);
    }
    
    public void publish(String topic, String message) {
        Set<Consumer<String>> consumers = subscribers.get(topic);
        if (consumers != null) {
            consumers.forEach(c -> c.accept(message));
        }
    }
}
```

---

## 代码示例

### 自定义 HashMap（简化版）

```java
public class SimpleHashMap<K, V> {
    private Node<K, V>[] table;
    private int size;
    private final float loadFactor = 0.75f;
    
    static class Node<K, V> {
        final int hash;
        final K key;
        V value;
        Node<K, V> next;
        
        Node(int hash, K key, V value) {
            this.hash = hash;
            this.key = key;
            this.value = value;
        }
    }
    
    @SuppressWarnings("unchecked")
    public SimpleHashMap() {
        table = (Node<K, V>[]) new Node[16];
    }
    
    public V put(K key, V value) {
        int hash = key == null ? 0 : key.hashCode();
        int index = (table.length - 1) & hash;
        
        Node<K, V> node = table[index];
        if (node == null) {
            table[index] = new Node<>(hash, key, value);
        } else {
            // 遍历链表
            while (true) {
                if (node.hash == hash && 
                    (node.key == key || (key != null && key.equals(node.key)))) {
                    V oldValue = node.value;
                    node.value = value;
                    return oldValue;
                }
                if (node.next == null) {
                    node.next = new Node<>(hash, key, value);
                    break;
                }
                node = node.next;
            }
        }
        
        size++;
        // 扩容检查省略...
        return null;
    }
    
    public V get(K key) {
        int hash = key == null ? 0 : key.hashCode();
        int index = (table.length - 1) & hash;
        
        Node<K, V> node = table[index];
        while (node != null) {
            if (node.hash == hash && 
                (node.key == key || (key != null && key.equals(node.key)))) {
                return node.value;
            }
            node = node.next;
        }
        return null;
    }
}
```

---

## 延伸思考

### 1. 为什么 HashMap 的容量必须是 2 的幂次？

1. 位运算效率：`(n - 1) & hash` 比 `%` 取模更快
2. 数据分布均匀：2 的幂次 - 1 的二进制全是 1，与 hash 与运算后分布更均匀
3. 扩容优化：JDK 1.8 扩容时可以根据最高位判断元素位置

### 2. ConcurrentHashMap 能完全替代 Hashtable 吗？

**不能**：
- ConcurrentHashMap 不支持 null 键值
- 某些遗留 API 可能依赖 Hashtable 的同步语义
- ConcurrentHashMap 的迭代器是弱一致性的

### 3. 如何选择合适的集合？

| 需求 | 推荐集合 |
|------|----------|
| 快速随机访问 | ArrayList |
| 频繁头部插入删除 | LinkedList |
| 去重、快速查找 | HashSet |
| 有序去重 | LinkedHashSet / TreeSet |
| 键值对存储 | HashMap |
| 键有序 | TreeMap / LinkedHashMap |
| 高并发读写 | ConcurrentHashMap |
| 高并发读多写少 | CopyOnWriteArrayList |

---

## 参考资料

- [HashMap 源码分析 - 美团技术团队](https://tech.meituan.com/2016/06/24/java-hashmap.html)
- [ConcurrentHashMap 源码分析](https://www.cnblogs.com/ITtangtang/p/8044481.html)
- [Java 集合框架 - Oracle 官方文档](https://docs.oracle.com/javase/tutorial/collections/)
- 《Java 并发编程的艺术》

---

*最后更新: 2026-04-08*
