# Java遍历集合的方法有哪些？

Java遍历集合的方法有哪些？
传统的for循环（适用于数组）:

int[] array = {1, 2, 3, 4, 5};
for (int i = 0; i < array.length; i++) {
   System.out.println(array[i]);
}

for-each循环（适用于数组和集合）:

int[] array = {1, 2, 3, 4, 5};
for (int value : array) {
   System.out.println(value);
}

// 对于集合
List<String> list = Arrays.asList("Java", "Python", "C++");
for (String language : list) {
   System.out.println(language);
}

使用Iterator迭代器（适用于集合）:

List<Integer> list = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
Iterator<Integer> iterator = list.iterator();
while (iterator.hasNext()) {
   System.out.println(iterator.next());
}

4.使用增强型for循环（适用于集合）

List<Integer> list = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
for (Integer number : list) {
   System.out.println(number);
}

5.使用Java 8的Stream API（适用于集合）

List<String> languages = Arrays.asList("Java", "Python", "C++");
languages.stream().forEach(System.out::println);

6.使用Java 8的forEach方法（适用于集合）

List<Integer> numbers = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
numbers.forEach(System.out::println);

7.使用递归（适用于数组和集合）

void printArray(int[] array, int index) {
   if (index < array.length) {
       System.out.println(array[index]);
       printArray(array, index + 1);
   }
}

// 对于集合
void printList(List<Integer> list, int index) {
   if (index < list.size()) {
       System.out.println(list.get(index));
       printList(list, index + 1);
   }
}

8.使用Apache Commons Collections（适用于集合）

List<Integer> list = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
CollectionUtils.forAllDo(list, new Closure() {
   public void execute(Object input) {
       System.out.println(input);
   }
});

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- 集合遍历方式包括 for、增强 for、Iterator、forEach、Stream。
- Iterator 支持安全删除当前元素。

### 面试官想考什么
- fail-fast 与迭代删除。
- 不同遍历方式的可读性和性能取舍。

### 标准回答
遍历集合时如果需要删除元素，优先使用 Iterator.remove 或 removeIf；增强 for 底层也是迭代器，直接 list.remove 会触发并发修改异常。

### 深挖追问
- fail-fast 是强保证吗？
- Stream 遍历适合修改外部状态吗？
- 并发集合迭代器有何不同？

### 实战场景/代码示例
```java
Iterator<String> it=list.iterator();
while(it.hasNext()){
  if(it.next().isBlank()) it.remove();
}
```

### 易错点/总结
- 遍历时不要结构性修改原集合。
- 并行流不适合有共享可变状态的操作。

