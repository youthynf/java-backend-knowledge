# Java 遍历集合的方法有哪些

## 核心概念

Java 集合遍历方式有 7 种：普通 for、增强 for-each、Iterator、ListIterator、forEach（Lambda）、Stream API、Map 的 `keySet/values/entrySet`。每种有不同的适用场景，关键是知道**遍历时怎么安全删除元素**、**Map 遍历为什么推荐 entrySet**、**fail-fast 是什么**。

底层共性：所有 Collection 都实现了 `Iterable` 接口，增强 for-each 编译后等价于 Iterator。所以增强 for 不能直接调集合的 `remove`，会触发 fail-fast。

## 标准回答

一句话结论：**只读遍历用增强 for 或 `forEach`；遍历时删除用 `Iterator.remove()`；List 双向遍历或修改用 `ListIterator`；Map 同时取 key/value 用 `entrySet()`；数据过滤转换用 Stream。**

7 种方式速查：

| 方式 | 适用 | 删除元素 | 备注 |
|------|------|---------|------|
| 普通 for | List（支持随机访问） | 倒序遍历可删 | LinkedList 退化 `O(n²)` |
| 增强 for-each | 任何 Iterable | **不能直接删**，抛 CME | 底层是 Iterator |
| Iterator | 任何 Collection | `iterator.remove()` 安全 | 推荐 |
| ListIterator | List | `set/add/remove` 安全 | 双向遍历 |
| forEach + Lambda | 任何 Iterable | 不能删 | 简洁，单线程 |
| Stream API | 任何 Collection | 不删，转换为新集合 | 声明式 |
| Map entrySet | Map | `it.remove()` 安全 | 同时取 key/value |

## 实现原理

### 1. 普通 for（下标遍历）

```java
List<String> list = new ArrayList<>(Arrays.asList("A", "B", "C"));
for (int i = 0; i < list.size(); i++) {
    System.out.println(list.get(i));
}
```

只适合支持随机访问的 List（ArrayList）。LinkedList 的 `get(i)` 是 `O(n)`，整体退化 `O(n²)`。

### 2. 增强 for-each

```java
for (String s : list) {
    System.out.println(s);
}
```

编译后等价于：

```java
Iterator<String> it = list.iterator();
while (it.hasNext()) {
    String s = it.next();
    System.out.println(s);
}
```

所以增强 for 中调 `list.remove(s)` 会抛 `ConcurrentModificationException`，因为它绕过了迭代器的修改记录。

### 3. Iterator（推荐用于遍历中删除）

```java
Iterator<String> it = list.iterator();
while (it.hasNext()) {
    String s = it.next();
    if (s.startsWith("tmp")) {
        it.remove();          // 安全：同步更新 modCount
    }
}
```

`Iterator.remove()` 会在删除元素后同步更新迭代器内部的 `expectedModCount`，不会抛 CME。

### 4. ListIterator（List 双向遍历 + 修改）

```java
ListIterator<String> it = list.listIterator();
while (it.hasNext()) {
    String s = it.next();
    if ("A".equals(s)) {
        it.set("AA");         // 替换当前元素
    }
    if ("B".equals(s)) {
        it.add("BB");         // 在当前位置后插入
    }
}
// 反向遍历
while (it.hasPrevious()) {
    String s = it.previous();
}
```

### 5. forEach + Lambda（Java 8+）

```java
list.forEach(s -> System.out.println(s));
list.forEach(System.out::println);
```

简洁，但**不能在 Lambda 中删除元素**（既不能调 list.remove，也没有 iterator.remove 句柄）。复杂控制流也不如普通循环清晰。

### 6. Stream API

```java
List<String> result = list.stream()
    .filter(s -> s.length() > 1)
    .map(String::toUpperCase)
    .collect(Collectors.toList());
```

Stream 不是"遍历"，而是声明式数据处理管道。适合过滤、映射、聚合，不适合副作用逻辑。

```java
// parallelStream 慎用
list.parallelStream().forEach(System.out::println);   // 顺序不保证
```

### 7. Map 遍历

```java
Map<String, Integer> map = new HashMap<>();
map.put("a", 1);

// 只取 key
for (String key : map.keySet()) { ... }

// 只取 value
for (Integer v : map.values()) { ... }

// 同时取 key 和 value：推荐 entrySet
for (Map.Entry<String, Integer> e : map.entrySet()) {
    System.out.println(e.getKey() + "=" + e.getValue());
}

// Java 8+ forEach
map.forEach((k, v) -> System.out.println(k + "=" + v));
```

`entrySet()` 比 `keySet() + get(k)` 高效——后者每个 key 都要多一次 hash 查找。

### fail-fast 机制

```java
// AbstractList 内部
transient int modCount;            // 集合修改次数

// 迭代器内部
int expectedModCount = modCount;   // 创建迭代器时的快照

public E next() {
    checkForComodification();
    // ...
}

final void checkForComodification() {
    if (modCount != expectedModCount)
        throw new ConcurrentModificationException();
}
```

`modCount` 是集合的结构修改次数。迭代器创建时记录 `expectedModCount`，每次 `next()` 比较两者，不一致就抛 CME。

注意：fail-fast 是**尽力检测**机制，不是线程安全保证。多线程下可能不抛 CME 而是出现其他错误，单线程下增强 for 中调 `list.remove` 必抛。

## 代码示例

### 安全删除元素

```java
List<String> users = new ArrayList<>(Arrays.asList("tmp_a", "boss", "tmp_b"));

// 正确：Iterator.remove
Iterator<String> it = users.iterator();
while (it.hasNext()) {
    if (it.next().startsWith("tmp")) {
        it.remove();
    }
}

// 错误：增强 for 中直接 remove
for (String u : users) {
    if (u.startsWith("tmp")) {
        users.remove(u);   // 抛 ConcurrentModificationException
    }
}

// 替代：Java 8+ removeIf
users.removeIf(u -> u.startsWith("tmp"));
```

### Map 遍历构建展示数据

```java
Map<String, Integer> scores = new HashMap<>();
scores.put("Tom", 90);
scores.put("Jerry", 95);

// 推荐：entrySet，一次拿到 key+value
for (Map.Entry<String, Integer> e : scores.entrySet()) {
    System.out.println(e.getKey() + " scored " + e.getValue());
}

// 反例：keySet + get，多一次 hash 查找
for (String name : scores.keySet()) {
    System.out.println(name + " scored " + scores.get(name));
}
```

### Stream 过滤转换

```java
List<String> names = Arrays.asList("alice", "bob", "anna");

List<String> upperA = names.stream()
    .filter(n -> n.startsWith("a"))
    .map(String::toUpperCase)
    .collect(Collectors.toList());
// [ALICE, ANNA]
```

### 倒序遍历删除（List 下标法）

```java
List<Integer> nums = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
// 倒序遍历，避免删除后下标错位
for (int i = nums.size() - 1; i >= 0; i--) {
    if (nums.get(i) % 2 == 0) {
        nums.remove(i);
    }
}
```

## 实战场景

| 场景 | 推荐方式 | 注意点 |
|------|---------|--------|
| 只读遍历 List | 增强 for / forEach | 简洁，无法删 |
| 遍历时删除 | `Iterator.remove()` 或 `removeIf` | 增强 for 中直接 remove 必抛 CME |
| LinkedList 遍历 | 增强 for / Iterator | 不要用下标 for，`O(n²)` |
| Map 同时取 key/value | `entrySet()` | 比 `keySet + get` 少一次 hash 查找 |
| Map 遍历中删除 | `entrySet().iterator().remove()` | 不要在 for-each 中调 map.remove |
| 数据过滤转换 | Stream API | 不要在 forEach 里写副作用 |
| 大数据并行处理 | `parallelStream` | 数据量小或 IO 密集时反而慢 |
| 双向遍历 List | `ListIterator` | 普通迭代器只能向后 |

## 深挖追问

### 为什么增强 for 中不能直接 remove？

增强 for 编译后是 Iterator 调用。集合的 `remove()` 会增加 `modCount`，但迭代器的 `expectedModCount` 不会同步更新。下次 `next()` 时 `checkForComodification` 发现不一致，抛 `ConcurrentModificationException`。

### Iterator.remove() 为什么安全？

`Iterator.remove()` 在删除元素后**同步更新 `expectedModCount = modCount`**，所以不会触发 CME。注意 `remove()` 必须在 `next()` 之后调用，否则抛 `IllegalStateException`。

### fail-fast 是线程安全机制吗？

不是。fail-fast 是 bug 检测机制，用于尽早发现"迭代期间被修改"。它基于 `modCount` 比较，多线程下可能因内存可见性延迟未及时检测到。**真正的线程安全要靠同步容器或并发容器**。

### Map 遍历为什么推荐 entrySet？

`entrySet()` 一次拿到 key+value 对象，直接访问。`keySet() + get(k)` 每个 key 都要多做一次 `hash + (n-1)&hash + 桶内查找`，遍历 N 个元素就多 N 次 hash 查找。所以 entrySet 更快。

### parallelStream 一定更快吗？

不一定。并行流有任务拆分、线程调度、结果合并成本。满足以下条件才更快：

- 数据量大（万级以上）。
- 每个元素处理是 CPU 密集型，且耗时较长。
- 元素间无共享状态竞争。

数据量小、IO 密集、有共享变量时，parallelStream 可能更慢甚至引发并发问题。

### forEach 和 for-each 哪个更好？

简单遍历两者差不多。forEach 适合"对每个元素执行一个动作"的简洁表达；for-each 适合有 break/continue/异常处理的复杂逻辑。forEach 的 Lambda 不能直接抛受检异常，有受检异常时改用普通循环。

## 易错点

- 增强 for 中调 `list.remove()` 必抛 CME，要用 `Iterator.remove()` 或 `removeIf`。
- `LinkedList` 不要用下标 for，每次 `get(i)` 都从头遍历，`O(n²)`。
- Map 同时取 key/value 用 `entrySet()`，不要用 `keySet + get`。
- `Iterator.remove()` 必须在 `next()` 之后调用，否则抛 `IllegalStateException`。
- `parallelStream` 不一定快，数据量小或 IO 密集时反而慢。
- fail-fast 不是线程安全保证，多线程下不能依赖它。

## 总结

记忆口诀：只读用 for-each，删除用 Iterator，List 双向用 ListIterator，Map 用 entrySet，过滤转换用 Stream。重点是理解 fail-fast 机制——`modCount` 比较，迭代器只认自己创建瞬间的 `expectedModCount`，所以增强 for 中调集合 remove 必抛 CME。

## 参考资料

- [OpenJDK AbstractList 源码 - modCount 机制](https://github.com/openjdk/jdk/blob/jdk8u/jdk/src/share/classes/java/util/AbstractList.java)
- [The Java Tutorials - Collections Traversal](https://docs.oracle.com/javase/tutorial/collections/interfaces/collection.html)
