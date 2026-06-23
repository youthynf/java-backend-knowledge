# Comparable与Comparator区别是什么？

Comparable与Comparator区别是什么？
Comparable 是一个接口，需要继承该接口并重写compareTo方法来制定类本身的排序规则，需要更改类代码：

import java.util.*;

class Student implements Comparable<Student> {
   private String name;
   private int score;

   // 构造方法
   public Student(String name, int score) {
       this.name = name;
       this.score = score;
   }

   // Getter 方法
   public String getName() {
       return name;
   }

   public int getScore() {
       return score;
   }

   // 实现 Comparable 接口
   @Override
   public int compareTo(Student other) {
       // 按分数升序排序
       return Integer.compare(this.score, other.score);
   }

   // 重写 toString() 方法便于打印
   @Override
   public String toString() {
       return "Student{name='" + name + "', score=" + score + "}";
   }
}

// 使用 Collections.sort() 排序 Collections.sort(students);

Comparator 是独立的排序规则，不需要修改类本身代码，可以定义多个不同的排序方式，结合Collections.sort使用：

Comparator<Student> byName = (s1, s2) -> s1.getName().compareTo(s2.getName());
Collections.sort(students, byName);
助记：Comparable需要修改排序对象的类代码，而Comparator是独立的排序，可以定义多个不同的排序，无需修改类代码。

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

