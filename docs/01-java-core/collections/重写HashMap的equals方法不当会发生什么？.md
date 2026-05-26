# 重写HashMap的equals方法不当会发生什么？

重写HashMap的equals方法不当会发生什么？
HashMap比较元素时，先比较hashCode是否相同，相同则继续比较equals()方法是否相同。

其中equals()和hashCode()的实现应该遵循以下规则：
若equals()结果相等，则hashCode()一定相等
反之，hashCode()相等，但equals()可能不相等；

如果我们只是重写了equals()方法，而没有重写hashCode方法，会存在equals()相同，而hashCode不相同的情况，违反了不允许存储重复数据的集合类的规则。导致的问题是：
原本相同的对象，因为因为改写了equals()导致不相同，而存放了重复的数据；
原本不相同的两个对象，因为equals()改写后相同了，而导致数据覆盖。
