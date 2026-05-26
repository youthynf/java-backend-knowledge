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
