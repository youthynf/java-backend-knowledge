# Comparable 与 Comparator 区别是什么？

## 核心概念

`Comparable` 和 `Comparator` 都用于对象排序，但定位不同：

- `Comparable`：对象自身具备的“自然排序”能力。
- `Comparator`：外部传入的“自定义排序”策略。

## Comparable：类自身定义排序规则

`Comparable` 位于 `java.lang` 包中，类实现该接口后，需要重写 `compareTo()` 方法。

适合场景：排序规则稳定，并且可以作为对象默认排序规则。

```java
class Student implements Comparable<Student> {
    private int score;

    @Override
    public int compareTo(Student other) {
        return Integer.compare(this.score, other.score);
    }
}
```

## Comparator：外部定义排序规则

`Comparator` 位于 `java.util` 包中，不要求修改目标类本身，可以为同一个类定义多种排序方式。

适合场景：

- 不能修改目标类源码。
- 同一个对象在不同业务场景下有不同排序方式。
- 排序逻辑是临时的、外部的、可组合的。

```java
students.sort(Comparator.comparing(Student::getScore));
students.sort(Comparator.comparing(Student::getName));
```

## 核心区别

| 对比项 | Comparable | Comparator |
|---|---|---|
| 所属包 | `java.lang` | `java.util` |
| 方法 | `compareTo(T o)` | `compare(T o1, T o2)` |
| 侵入性 | 需要修改类本身 | 不需要修改类 |
| 排序规则 | 通常只有一个自然排序 | 可以定义多个排序器 |
| 典型场景 | 默认排序 | 业务排序、临时排序、多维排序 |

## 总结

如果排序规则是对象天然属性的一部分，优先使用 `Comparable`；如果排序规则由业务场景决定，优先使用 `Comparator`。

---
