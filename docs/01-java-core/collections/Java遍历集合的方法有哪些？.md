# Java 遍历集合的方法有哪些？

## 核心概念

Java 集合遍历方式很多，常见有：

- 普通 `for` 循环
- 增强 `for-each`
- `Iterator` 迭代器
- `ListIterator`
- `forEach` 方法
- Stream API
- Map 的 `keySet`、`values`、`entrySet`

面试中这道题不只是让你罗列语法，更重要的是能说明不同遍历方式的适用场景、删除元素的安全方式，以及 Map 遍历的性能差异。

## 面试官想考什么

常见考点包括：

- 遍历时删除元素为什么容易出错？
- `Iterator.remove()` 和 `List.remove()` 有什么区别？
- Map 遍历为什么推荐 `entrySet()`？
- `forEach` / Stream 遍历适合什么场景？
- `ArrayList` 和 `LinkedList` 用普通 for 遍历性能一样吗？

## 标准回答

### 1. 普通 for 循环

适合支持随机访问的 List，比如 `ArrayList`：

```java
List<String> list = Arrays.asList("A", "B", "C");
for (int i = 0; i < list.size(); i++) {
    System.out.println(list.get(i));
}
```

对 `LinkedList` 不推荐这样遍历，因为每次 `get(i)` 都可能从头或尾查找，整体容易退化成 O(n²)。

### 2. 增强 for 循环

增强 for 本质上是语法糖，底层通常使用 Iterator：

```java
for (String item : list) {
    System.out.println(item);
}
```

它写法简洁，适合只读遍历。但遍历过程中不要直接调用集合的 `remove()` 修改集合。

### 3. Iterator 迭代器

如果遍历时需要删除元素，推荐使用 Iterator：

```java
Iterator<String> iterator = list.iterator();
while (iterator.hasNext()) {
    String item = iterator.next();
    if (item.startsWith("tmp")) {
        iterator.remove();
    }
}
```

`Iterator.remove()` 会同步更新迭代器内部状态，避免 fail-fast 问题。

### 4. ListIterator

`ListIterator` 是 List 专用迭代器，支持双向遍历、修改、添加元素：

```java
ListIterator<String> iterator = list.listIterator();
while (iterator.hasNext()) {
    String item = iterator.next();
    if ("A".equals(item)) {
        iterator.set("AA");
    }
}
```

### 5. forEach 和 Lambda

Java 8 后可以使用 `forEach`：

```java
list.forEach(item -> System.out.println(item));
```

写法简洁，适合表达“对每个元素执行某个动作”。但复杂控制流、提前退出、异常处理比较多时，可读性不一定比普通循环好。

### 6. Stream API

Stream 更适合声明式的数据处理：过滤、映射、聚合。

```java
List<String> result = list.stream()
        .filter(s -> s.length() > 1)
        .map(String::toUpperCase)
        .collect(Collectors.toList());
```

它强调数据处理管道，而不只是遍历。

### 7. Map 遍历

Map 常见遍历方式：

```java
// 只需要 key
for (String key : map.keySet()) {
    System.out.println(key);
}

// 只需要 value
for (Integer value : map.values()) {
    System.out.println(value);
}

// 同时需要 key 和 value，推荐 entrySet
for (Map.Entry<String, Integer> entry : map.entrySet()) {
    System.out.println(entry.getKey() + ":" + entry.getValue());
}
```

如果同时需要 key 和 value，`entrySet()` 通常比 `keySet() + get()` 更合适，因为后者会多一次查找。

## 深挖追问

### 1. 为什么增强 for 中不能直接 remove？

增强 for 底层使用 Iterator。遍历时如果直接调用集合的 `remove()`，集合的修改次数 `modCount` 会变化，但迭代器的期望修改次数没有同步更新，下一次迭代可能抛出 `ConcurrentModificationException`。

错误示例：

```java
for (String item : list) {
    if (item.startsWith("tmp")) {
        list.remove(item); // 不推荐
    }
}
```

### 2. fail-fast 是线程安全机制吗？

不是。fail-fast 是一种快速失败检测机制，用来尽早发现遍历期间的并发修改问题。它不能保证线程安全，也不能作为并发控制手段。

### 3. parallelStream 遍历一定更快吗？

不一定。并行流有线程调度、任务拆分、结果合并成本。数据量小、每个元素处理很轻、或者存在共享状态竞争时，parallelStream 可能更慢甚至引入并发问题。

## 实战场景

### 场景 1：安全删除列表元素

```java
List<String> users = new ArrayList<>(Arrays.asList("tmp_a", "boss", "tmp_b"));
Iterator<String> iterator = users.iterator();
while (iterator.hasNext()) {
    if (iterator.next().startsWith("tmp")) {
        iterator.remove();
    }
}
```

这种写法比在 for-each 里直接删除更安全。

### 场景 2：遍历 Map 构建展示数据

```java
Map<String, Integer> scoreMap = new HashMap<>();
scoreMap.put("Tom", 90);
scoreMap.put("Jerry", 95);

for (Map.Entry<String, Integer> entry : scoreMap.entrySet()) {
    System.out.println(entry.getKey() + " scored " + entry.getValue());
}
```

同时需要 key 和 value 时，优先使用 `entrySet()`。

### 场景 3：用 Stream 做过滤和转换

```java
List<String> names = Arrays.asList("alice", "bob", "anna");
List<String> result = names.stream()
        .filter(name -> name.startsWith("a"))
        .map(String::toUpperCase)
        .collect(Collectors.toList());
```

Stream 适合表达数据处理流程，不适合写大量副作用逻辑。

## 易错点

- 增强 for 遍历时不要直接调用集合 `remove()`。
- 遍历 Map 时，同时需要 key/value 推荐 `entrySet()`。
- `LinkedList` 不适合用下标 for 循环频繁 `get(i)`。
- Stream 不是银弹，复杂业务逻辑可能普通循环更清晰。
- parallelStream 不一定更快，尤其要警惕共享变量和线程安全问题。

## 总结

只读遍历用增强 for 或 forEach；遍历时删除用 Iterator；List 双向遍历或修改用 ListIterator；Map 同时取 key/value 用 entrySet；数据过滤转换可以用 Stream。面试时重点补充删除元素、fail-fast、Map 遍历性能这些细节。
