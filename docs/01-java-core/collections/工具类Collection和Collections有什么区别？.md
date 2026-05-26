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
