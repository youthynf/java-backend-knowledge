# CopyOnWriteArrayList 底层实现原理是怎么样的

## 核心概念

`CopyOnWriteArrayList` 是 Java 并发包下的线程安全 List，核心思想是**写时复制**：读操作不加锁，写操作先复制一份新数组，在新数组上修改后，把内部数组引用切换到新数组。

它牺牲写入性能（每次写都要复制整个数组），换取两件事：**读操作完全无锁**和**迭代器看到的是稳定快照**。所以它只适合读多写少且数据量不大的场景，例如监听器列表、配置黑白名单。

## 标准回答

一句话结论：**CopyOnWriteArrayList 底层是一个 `volatile Object[]` 数组，读直接访问数组无锁；写时加 `synchronized` 锁，复制新数组完成修改后用 volatile 引用替换旧数组；迭代器是创建瞬间的快照。**

三个关键点：

1. **`volatile Object[] array`**：保证写线程替换数组引用后，其他线程立即可见。
2. **写时 `synchronized` 加锁**：同一时刻只允许一个写线程复制并替换数组，避免写写冲突。
3. **读无锁、迭代器是快照**：读不会抛 `ConcurrentModificationException`，但读到的可能不是最新数据。

## 实现原理

### 底层数据结构

```java
public class CopyOnWriteArrayList<E> {
    private transient volatile Object[] array;   // volatile 数组引用
    final Object getArray() { return array; }
    final void setArray(Object[] a) { array = a; }
}
```

注意：`volatile` 修饰的是**数组引用**，不是数组元素。所以 `volatile` 保证的是"引用切换的可见性"，不保证"数组内部元素修改的可见性"。CopyOnWriteArrayList 之所以这样设计安全，是因为它从不原地修改数组，永远通过"复制 + 替换引用"更新数据。

### 写入流程（add）

```java
public boolean add(E e) {
    synchronized (lock) {                       // 1. 加锁
        Object[] es = getArray();               // 2. 读旧数组
        int len = es.length;
        es = Arrays.copyOf(es, len + 1);        // 3. 复制长度+1 的新数组
        es[len] = e;                            // 4. 新数组末尾写入
        setArray(es);                           // 5. 替换引用（volatile 写）
        return true;
    }
}
```

注意 JDK 11+ 把锁对象从 `final Object lock = new Object()` 改成了 `synchronized (lock)`，本质都是同一把锁，不影响原理。

### 读取流程（get）

```java
public E get(int index) {
    return elementAt(getArray(), index);        // 直接读 volatile 引用
}
```

读不竞争锁，性能和 ArrayList 相当。但读到的是某一时刻的快照，可能在 get 调用瞬间其他线程已经替换了新数组，但本次 get 仍然返回旧数组中的值。

### 删除流程（remove）

```java
public E remove(int index) {
    synchronized (lock) {
        Object[] es = getArray();
        int len = es.length;
        E oldValue = elementAt(es, index);
        int numMoved = len - index - 1;
        Object[] newElements;
        if (numMoved == 0) {
            newElements = Arrays.copyOf(es, len - 1);
        } else {
            newElements = new Object[len - 1];
            System.arraycopy(es, 0, newElements, 0, index);
            System.arraycopy(es, index + 1, newElements, index, numMoved);
        }
        setArray(newElements);
        return oldValue;
    }
}
```

删除同样复制一份新数组（长度 -1），把要删的元素跳过，再替换引用。

### 迭代器：快照语义

```java
public Iterator<E> iterator() {
    return new COWIterator<>(getArray(), 0);   // 创建瞬间拿到当前数组快照
}

private static final class COWIterator<E> implements ListIterator<E> {
    private final Object[] snapshot;            // 快照引用
    private int cursor;

    // 不支持 remove/set/add，调了抛 UnsupportedOperationException
}
```

特点：

- 迭代器持有的 `snapshot` 是创建瞬间的数组引用，之后永远不会变。
- 其他线程修改 list，迭代器看不到。
- 迭代器不支持 `remove` / `set` / `add`。

## 代码示例

### 监听器列表

```java
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class EventBus {
    // 监听器注册少，事件通知频繁 → 完美匹配 CopyOnWriteArrayList
    private final List<Listener> listeners = new CopyOnWriteArrayList<>();

    public void register(Listener l) {
        listeners.add(l);            // 写少
    }

    public void fire(Event e) {
        for (Listener l : listeners) {     // 读多，无锁遍历
            l.on(e);
        }
    }

    interface Listener { void on(Event e); }
    static class Event {}
}
```

### 不当使用：高频写入

```java
// 反例：高频写入 + 大数据量 → 每次写复制整个数组，CPU/GC 飙升
List<String> bad = new CopyOnWriteArrayList<>();
for (int i = 0; i < 1_000_000; i++) {
    bad.add("x" + i);   // 每次都复制，O(n^2)
}
// 应该用 ArrayList 或 ConcurrentLinkedQueue
```

## 实战场景

| 场景 | 用法 | 注意点 |
|------|------|--------|
| 事件监听器列表 | `new CopyOnWriteArrayList<Listener>()` | 注册/注销少，遍历通知多 |
| 黑白名单 / 路由表快照 | 启动时加载，运行期偶尔更新 | 读多写少，且读到旧值无影响 |
| 配置项缓存 | 修改时整体替换 | 配合 `volatile` 引用发布更稳 |
| 高频写入任务队列 | **不要用**，改用 `LinkedBlockingQueue` | 写复制成本 `O(n)`，会拖死系统 |
| 强实时读 | **不要用**，迭代器/读是快照 | 改用 `synchronizedList` 或加锁 |

## 深挖追问

### 为什么读不加锁还线程安全？

因为写操作从不原地修改数组，永远通过"复制新数组 → 修改副本 → 替换引用"三步更新。读线程读到的要么是旧数组，要么是新数组，不会读到"改一半"的中间状态。`volatile` 保证替换瞬间对所有线程可见。

### volatile 修饰的是数组引用，元素修改可见吗？

不可见。但 CopyOnWriteArrayList 的设计是"永远不原地改元素"，每次修改都生成新数组并替换引用。所以即便 `volatile` 不保证元素级可见性，仍然安全。如果业务代码绕过 API 反射改数组元素，那 volatile 确实兜不住。

### 为什么不适合写多场景？

每次写入要复制整个数组，时间复杂度 `O(n)`。n 越大、写越频繁，CPU 和 GC 压力越大。10 万元素的 list 每秒写 1000 次，等于每秒复制 1 亿次对象引用，直接拖垮系统。

### 迭代器为什么不支持 remove？

迭代器持有的是创建瞬间的快照，对快照做删除不会影响原 list，反而会让开发者误以为删除生效。所以 CopyOnWriteArrayList 直接禁用 `iterator.remove()`，避免误用。要删除元素只能调 `list.remove(index)`。

### COWIterator 看不到新数据，是 bug 吗？

不是，是设计。CopyOnWriteArrayList 强调"读一致性"——迭代过程中即使有写线程修改，迭代器仍然看到一致的快照。这种弱一致性在事件通知等场景反而是优点（避免半新半旧的中间状态）。如果需要强实时性，请用 `synchronizedList`。

### CopyOnWriteArraySet 是什么？

基于 `CopyOnWriteArrayList` 实现的 Set，`add` 时遍历 list 检查是否已存在，不存在才追加。所以 `add` 是 `O(n)`，只适合元素数量少的去重场景。

## 易错点

- 读到的是快照，不是强实时视图，监控/计数场景慎用。
- 写操作 `O(n)`，大数据量高频写入会拖垮系统。
- 迭代器不支持 `remove` / `set` / `add`，调了抛 `UnsupportedOperationException`。
- `volatile Object[]` 保证的是引用可见性，不是元素级可见性，不要反射改元素。
- 不要把它当 ArrayList 的"并发版"无脑替换，写多场景反而更糟。

## 总结

CopyOnWriteArrayList 的核心是"读无锁 + 写时复制 + volatile 发布"，定位是读多写少小数据量的并发 List。和 `synchronizedList` 比，它读性能更好但写更贵；和 `ConcurrentLinkedQueue` 比，它支持随机访问但写更贵。选型时先问自己：写是否少？数据量是否小？读是否容忍快照？三者都满足才适合用。

## 参考资料

- [OpenJDK CopyOnWriteArrayList 源码](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/concurrent/CopyOnWriteArrayList.java)
- [Java Concurrency in Practice - 5.2 CopyOnWriteArrayList](https://jcip.net/)
