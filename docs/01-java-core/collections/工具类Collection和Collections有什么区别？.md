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

## 面试复习要点

面试中回答“工具类Collection和Collections有什么区别”时，不要只给结论，建议按 **定位 → 原理 → 使用边界 → 排查方式** 展开：

1. **先讲定位**：说明它解决的核心问题，以及在整个技术栈中处于哪一层。
2. **再讲原理**：把关键流程、核心数据结构或关键组件讲清楚，避免只背名词。
3. **补充边界**：说明它适合什么场景，不适合什么场景，以及常见误用。
4. **结合排查**：如果线上出现性能、稳定性或一致性问题，要能说出观测指标、日志线索和排查顺序。

## 标准回答思路

可以这样组织答案：**工具类Collection和Collections有什么区别 的核心价值是解决特定场景下的工程问题。实际使用时，需要理解它的工作机制、成本和限制，不能只看 API 或表面现象。在线上落地时，还要结合监控、日志和压测结果判断是否真的适合当前业务。**

## 常见追问

- 它和相近方案的区别是什么？
- 如果数据量、并发量或链路复杂度上来，会先暴露什么问题？
- 线上出现异常时，你会先看哪些指标，如何缩小范围？
