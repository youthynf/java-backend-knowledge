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

---

<!-- interview-detail-2026-06-24 -->

## 面试版详细讲解补充

### 核心概念
- 工具类Collection和Collections有什么区别？ 的核心是理解集合的数据结构、复杂度、线程安全边界以及与 equals/hashCode/扩容策略的关系。
- 复习时不要只记一句结论，要把“定义、底层原因、使用边界、工程取舍”串起来。

### 面试官想考什么
- 面试通常考底层结构、扩容/并发问题、为什么这样设计，以及在业务中如何选型。
- 能否把该知识点和常见线上问题、代码设计、性能/并发/可维护性联系起来。

### 标准回答
回答 工具类Collection和Collections有什么区别？ 时，先说明适用场景，再讲底层机制和关键参数，最后补充并发环境下的替代方案。集合类默认多数不是线程安全的，需要根据读写比例选择 synchronized 包装、并发容器或不可变集合。

如果是口述面试，建议先给一句结论，再补充 2~3 个关键细节，最后用项目场景收尾。这样既有结构，也能给面试官继续追问的抓手。

### 深挖追问
- 扩容何时触发？迭代时修改为什么抛 ConcurrentModificationException？并发容器如何降低锁粒度？
- 如果让你在项目里落地这个知识点，你会如何设计测试用例验证边界？
- 遇到性能、并发或可维护性问题时，有哪些替代方案？

### 示例/实战场景
```java
List<String> safe = Collections.synchronizedList(new ArrayList<>()); // 简单同步包装，复杂并发优先考虑 JUC 容器
```

实战中建议把该知识点放到具体场景里理解：例如接口参数校验、集合选型、线程池治理、金额计算、JVM 排障或框架扩展点，而不是孤立背概念。

### 易错点/总结
- 不要只背结论，要能结合容量、负载因子、hash 分布、读写比例解释取舍。
- 面试表达要避免绝对化，例如“永远”“一定”“只会”，很多 Java 行为都与版本、实现、参数和上下文有关。
- 最后用一句话收束：先讲清楚它解决什么问题，再讲清楚它的限制和替代方案。

