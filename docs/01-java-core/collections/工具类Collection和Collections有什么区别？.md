# 工具类Collection和Collections有什么区别？

工具类Collection和Collections有什么区别？
Collection
接口：Collection 是 Java 集合框架中的一个根接口
位置：java.util.Collection
作用：定义了集合类的基本操作，如添加、删除、遍历等
子接口：List, Set, Queue 等都继承自 Collection
示例方法：

boolean add(E e)
boolean remove(Object o)
int size()
Iterator<E> iterator()

Collections
工具类：Collections 是一个包含静态方法的工具类
位置：java.util.Collections
作用：提供操作集合的实用方法，如排序、搜索、同步化等
特点：所有方法都是静态的，不能实例化
示例方法：

static void sort(List<T> list)
static <T> int binarySearch(List<T> list, T key)
static <T> void reverse(List<T> list)
static <T> Collection<T> synchronizedCollection(Collection<T> c)

---

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- Collection 是集合根接口之一；Collections 是集合工具类。
- 集合体系常分 List、Set、Queue、Map（Map 不继承 Collection）。

### 面试官想考什么
- 集合类层次结构。
- 工具类方法如 sort、unmodifiable、synchronized。

### 标准回答
Collection 定义集合通用行为，Collections 提供静态工具方法。回答集合体系时要区分接口、实现类和工具类。

### 深挖追问
- Collection 和 Map 什么关系？
- unmodifiableList 是否真正不可变？
- Arrays.asList 有什么坑？

### 实战场景/代码示例
```java
List<Integer> list=new ArrayList<>();
Collections.sort(list);
List<Integer> ro=Collections.unmodifiableList(list);
```

### 易错点/总结
- Collections.unmodifiableXxx 是不可修改视图，底层集合变了视图也变。
- Collection 与 Collections 名字相近但角色完全不同。

