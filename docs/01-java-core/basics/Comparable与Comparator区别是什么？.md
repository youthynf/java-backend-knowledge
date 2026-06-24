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

<!-- interview-review-enhanced -->

## 面试复习版

### 核心概念
- 该主题是 Java 基础面试高频点，需要从定义、机制、场景和坑点四层回答。
- 重点关注语言规范、JDK 实现差异和业务使用边界。

### 面试官想考什么
- 能否用准确术语讲清概念。
- 能否结合代码说明适用场景和易错点。

### 标准回答
Comparable与Comparator区别是什么？ 的回答建议先给结论，再解释底层机制，最后补充实际开发中的选择依据和常见误区。遇到与 JDK 版本相关的细节，应说明版本前提，避免绝对化。

### 深挖追问
- 这个机制解决什么问题？
- 有哪些替代方案？
- 在生产中最容易踩什么坑？

### 实战场景/代码示例
```java
// 建议准备一个最小可运行示例，展示该知识点的核心行为。
```

### 易错点/总结
- 先结论后原因。
- 不确定的实现细节注明版本或避免展开。

---

<!-- interview-detail-2026-06-24 -->

## 面试版详细讲解补充

### 核心概念
- Comparable 表示类自身的自然排序；Comparator 表示外部定制排序，可为同一类提供多套规则。
- 复习时不要只记一句结论，要把“定义、底层原因、使用边界、工程取舍”串起来。

### 面试官想考什么
- 自然排序与定制排序怎么选、比较器约定、TreeSet/TreeMap 去重与排序的关系。
- 能否把该知识点和常见线上问题、代码设计、性能/并发/可维护性联系起来。

### 标准回答
稳定的默认排序放 Comparable；业务排序放 Comparator。比较逻辑必须满足自反、反对称、传递，推荐 Comparator.comparing/thenComparing。

如果是口述面试，建议先给一句结论，再补充 2~3 个关键细节，最后用项目场景收尾。这样既有结构，也能给面试官继续追问的抓手。

### 深挖追问
- compareTo 与 equals 不一致会怎样？为什么不要 return a-b？null 怎么排序？
- 如果让你在项目里落地这个知识点，你会如何设计测试用例验证边界？
- 遇到性能、并发或可维护性问题时，有哪些替代方案？

### 示例/实战场景
```java
users.sort(Comparator.comparing(User::getAge).thenComparing(User::getName));
```

实战中建议把该知识点放到具体场景里理解：例如接口参数校验、集合选型、线程池治理、金额计算、JVM 排障或框架扩展点，而不是孤立背概念。

### 易错点/总结
- TreeSet 认为 compare==0 就是重复；手写相减可能溢出。
- 面试表达要避免绝对化，例如“永远”“一定”“只会”，很多 Java 行为都与版本、实现、参数和上下文有关。
- 最后用一句话收束：先讲清楚它解决什么问题，再讲清楚它的限制和替代方案。

