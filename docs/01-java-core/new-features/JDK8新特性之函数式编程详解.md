# JDK8新特性之函数式编程详解

JDK8新特性之函数式编程详解
概述
面向对象编程是对数据进行抽象；函数式编程是对行为进行抽象。核心思想: 使用不可变值和函数，函数对一个值进行处理，映射成另一个值。对核心类库的改进主要包括集合类的API和新引入的流Stream，流使程序员可以站在更高的抽象层次上对集合进行操作。
一、lambda表达式
Lambda 表达式在 Java 中只能用于 函数式接口（Functional Interface），而函数式接口的定义是：
•  @FunctionalInterface 注解标记的接口（显式声明）。
•  自带且仅有一个抽象方法（Single Abstract Method, SAM）的接口（即使没有注解，只要符合 SAM 规则，也是函数式接口）。

特殊情况与边界案例：
•  默认方法不影响函数式接口
即使接口有多个默认方法，只要有一个抽象方法，仍然是函数式接口：

@FunctionalInterface
interface Greeter {
    void greet();  // 唯一的抽象方法

    default void log() {
        System.out.println("Logged");
    }
}

•  继承父接口的抽象方法
如果子接口继承了父接口的抽象方法，且总抽象方法数量为1，它仍然是函数式接口：

interface Parent {
    void doSomething();
}

@FunctionalInterface
interface Child extends Parent {}  // 合法，因为只有一个抽象方法

•  重写Object类的方法不算抽象方法

@FunctionalInterface
interface MyInterface {
    void execute();

    String toString();  // 来自 Object，不计入抽象方法
}

方法引用
当方法不修改lambda表达式提供的参数时，可以使用方法引用，否则不能使用，需要键入完整的lambda表达式：

// 可以使用方法引用
list.forEach(n -> System.out.println(n)); 
list.forEach(System.out::println);  

// 不可使用方法引用
list.forEach((String s) -> System.out.println("*" + s + "*"));
事实上，可以省略这里的lambda参数的类型声明，编译器可以从列表的类属性推测出来。

使用注意事项
•  lambda内部可以使用静态变量、非静态变量和局部变量；
•  lambda表达式在Java中又称为闭包或匿名函数；
•  lambda方法在编译器内部被翻译成私有方法，并派发invokeddynamic字节码指令来进行调用。
•  lambda表达式只能引用final或final局部变量，即内部不能修改定义在域外的变量。

二、Stream API使用
求值方法
•  惰性求值方法：没有做实际性工作，filter只是描述了stream，没有产生新的集合

lists.stream().filter(f -> f.getName().equals("p1"))

•  及早求值方法：collection最终会从stream产生新值，拥有终止操作。

List<Person> list2 = lists.stream().filter(f -> f.getName().equals("p1")).collect(Collectors.toList());

steam&parallelStream
每个Stream都有两种模式：顺序执行和并行执行

// 顺序流
List <Person> people = list.getStream.collect(Collectors.toList());

// 并行流
List <Person> people = list.getStream.parallel().collect(Collectors.toList());
parallelStream原理：数组会被分成多个段，其中每一个都在不同的线程中处理，然后将结果一起输出。

List originalList = someData;
split1 = originalList(0, mid);//将数据分小部分
split2 = originalList(mid,end);
new Runnable(split1.process());//小部分执行操作
new Runnable(split2.process());
List revisedList = split1 + split2;//将结果合并

常见用法
•  Filter&Predicate

public static void main(args[]){
    List languages = Arrays.asList("Java", "Scala", "C++", "Haskell", "Lisp");
 
    System.out.println("Languages which starts with J :");
    filter(languages, (str)->str.startsWith("J"));
 
    System.out.println("Languages which ends with a ");
    filter(languages, (str)->str.endsWith("a"));
 
    System.out.println("Print all languages :");
    filter(languages, (str)->true);
 
    System.out.println("Print no language : ");
    filter(languages, (str)->false);
 
    System.out.println("Print language whose length greater than 4:");
    filter(languages, (str)->str.length() > 4);
}
 
public static void filter(List names, Predicate condition) {
    names.stream().filter((name) -> (condition.test(name))).forEach((name) -> {
        System.out.println(name + " ");
    });
}
多个Predicate组合filter：

// 可以用and()、or()和xor()逻辑函数来合并Predicate，
// 例如要找到所有以J开始，长度为四个字母的名字，你可以合并两个Predicate并传入
Predicate<String> startsWithJ = (n) -> n.startsWith("J");
Predicate<String> fourLetterLong = (n) -> n.length() == 4;
names.stream()
    .filter(startsWithJ.and(fourLetterLong))
    .forEach((n) -> System.out.print("nName, which starts with 'J' and four letter long is : " + n));

•  Map&Reduce
map将集合类(例如列表)元素进行转换的。还有一个 reduce() 函数可以将所有值合并成一个。

List costBeforeTax = Arrays.asList(100, 200, 300, 400, 500);
double bill = costBeforeTax.stream().map((cost) -> cost + .12*cost).reduce((sum, cost) -> sum + cost).get();
System.out.println("Total : " + bill);

•  Collectors

// 将字符串换成大写并用逗号链接起来
List<String> G7 = Arrays.asList("USA", "Japan", "France", "Germany", "Italy", "U.K.","Canada");
String G7Countries = G7.stream().map(x -> x.toUpperCase()).collect(Collectors.joining(", "));
System.out.println(G7Countries);

Collectors.joining(", ")
Collectors.toList()
Collectors.toSet() 
Collectors.toMap(MemberModel::getUid, Function.identity())
Collectors.toMap(ImageModel::getAid, o -> IMAGE_ADDRESS_PREFIX + o.getUrl())

•  flatMap
将多个Stream连接成一个Stream。

List<Integer> result= Stream.of(Arrays.asList(1,3),Arrays.asList(5,6)).flatMap(a->a.stream()).collect(Collectors.toList());

•  其他用法

// distinct去重
List<Long> likeTidList = likeDOs.stream().map(LikeDO::getTid)
                .distinct().collect(Collectors.toList());

// count计总数
int countOfAdult=persons.stream()
                       .filter(p -> p.getAge() > 18)
                       .map(person -> new Adult(person))
                       .count();

// Match匹配
boolean anyStartsWithA =
    stringCollection
        .stream()
        .anyMatch((s) -> s.startsWith("a"));
        
// min,max,summaryStatics
List<Person> lists = new ArrayList<Person>();
lists.add(new Person(1L, "p1"));
lists.add(new Person(2L, "p2"));
lists.add(new Person(3L, "p3"));
lists.add(new Person(4L, "p4"));
Person a = lists.stream().max(Comparator.comparing(t -> t.getId())).get();
System.out.println(a.getId());

//获取数字的个数、最小值、最大值、总和以及平均值
List<Integer> primes = Arrays.asList(2, 3, 5, 7, 11, 13, 17, 19, 23, 29);
IntSummaryStatistics stats = primes.stream().mapToInt((x) -> x).summaryStatistics();
System.out.println("Highest prime number in List : " + stats.getMax());
System.out.println("Lowest prime number in List : " + stats.getMin());
System.out.println("Sum of all prime numbers : " + stats.getSum());
System.out.println("Average of all prime numbers : " + stats.getAverage());

// peek用于调试或观察流中的元素
List<Person> lists = new ArrayList<Person>();
lists.add(new Person(1L, "p1"));
lists.add(new Person(2L, "p2"));
lists.add(new Person(3L, "p3"));
lists.add(new Person(4L, "p4"));
System.out.println(lists);

List<Person> list2 = lists.stream()
                                 .filter(f -> f.getName().startsWith("p"))
                .peek(t -> {
                    System.out.println(t.getName());
                })
                .collect(Collectors.toList());
System.out.println(list2);

三、FunctionalInterface
理解@FunctionInterface
•  被它注解的接口只能有一个抽象方法
•  如果一个类型被这个注解，那么这个类型必须是一个interface，并且满足function interface的所有要求；
•  编译器会自动把满足function interface要求的接口自动识别为function interface，所以不需要显式使用@FunctionInterface注解；

自定义函数接口

@FunctionalInterface
public interface IMyInterface {
    void study();
}

package com.isea.java;
public class TestIMyInterface {
    public static void main(String[] args) {
        IMyInterface iMyInterface = () -> System.out.println("I like study");
        iMyInterface.study();
    }
}

内置四大函数接口
•  消费型接口：Consumer<T> void accept(T t)有参数，无返回值的抽象方法

Consumer<Person> greeter = (p) -> System.out.println("Hello, " + p.firstName);
greeter.accept(new Person("Luke", "Skywalker"));

•  供给型接口：Supplier<T> T get()无参有返回值的抽象方法

Supplier<Person> personSupplier = Person::new;
personSupplier.get();   // new Person

•  断定型接口：Predicate<T> boolean test(T t)有参，但是返回值类型固定是boolean

Predicate<String> predicate = (s) -> s.length() > 0;

predicate.test("foo");              // true
predicate.negate().test("foo");     // false

Predicate<Boolean> nonNull = Objects::nonNull;
Predicate<Boolean> isNull = Objects::isNull;

Predicate<String> isEmpty = String::isEmpty;
Predicate<String> isNotEmpty = isEmpty.negate();

•  函数型接口：Function<T, R> R apply(T t)有参数有返回值的抽象方法

Function<String, Integer> toInteger = Integer::valueOf;
Function<String, String> backToString = toInteger.andThen(String::valueOf);

backToString.apply("123");     // "123"
