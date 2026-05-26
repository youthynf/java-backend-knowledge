# JDK8新特性概览

JDK8新特性概览
概述
Java 8 是 Java 语言的重要里程碑，引入了函数式编程、流式处理和API 增强等革命性特性。以下是其核心特性的分类详解：

一、Lambda 表达式（函数式编程核心）
作用：简化匿名内部类，支持函数式编程。  
示例：

// 旧写法（匿名内部类）
Runnable r1 = new Runnable() {
   @Override
   public void run() {
       System.out.println("Hello");
   }
};

// Lambda 写法
Runnable r2 = () -> System.out.println("Hello");
关键点：
•  必须匹配函数式接口（如Runnable、Comparator）。
•  类型推断可省略参数类型（如 (a, b) -> a + b）。

二、函数式接口（Functional Interface）
定义：仅含一个抽象方法的接口（可含默认/静态方法）。  
注解：@FunctionalInterface（非强制，但推荐显式声明）。  
常见内置接口：
•  Predicate<T> ：boolean test(T t)，用于条件判断（如filter）；
•  Consumer<T>：void accept(T t)，用于消费数据（如 `forEach`）；
•  Function<T, R>：R apply(T t)，用于数据转换（如 `map`）；
•  Supplier<T>：T get()，用于数据生成（如Stream.generate）；
示例：

Predicate<String> isEmpty = s -> s.isEmpty();
Consumer<String> printer = s -> System.out.println(s);
Function<String, Integer> toLength = String::length;

三、Stream API（流式数据处理）
核心思想：以声明式操作集合（类似 SQL），支持并行处理。  
操作类型：
1. 中间操作（Intermediate）：返回新流（如filter, map, sorted）。  
2. 终端操作（Terminal）：触发计算并关闭流（如collect, forEach, reduce）。  

示例：

List<String> names = Arrays.asList("Alice", "Bob", "Charlie");

// 链式操作：过滤 → 转大写 → 排序 → 收集
List<String> result = names.stream()
   .filter(name -> name.length() > 3)
   .map(String::toUpperCase)
   .sorted()
   .collect(Collectors.toList()); // 输出: ["ALICE", "CHARLIE"]
关键特性：
•  惰性求值：终端操作触发时才执行。
•  并行流：parallelStream()自动利用多核。

四、方法引用（Method References）
作用：进一步简化 Lambda，直接引用现有方法。  
四种语法：
1. 静态方法：ClassName::staticMethod

Function<String, Integer> parser = Integer::parseInt;

2. 实例方法：instance::method

Consumer<String> printer = System.out::println;

3. 类的任意实例方法：ClassName::instanceMethod

Function<String, String> upper = String::toUpperCase;

4. 构造方法：ClassName::new

Supplier<List<String>> listSupplier = ArrayList::new;

五、默认方法与静态方法（接口增强）
默认方法（Default Method）
作用：在接口中提供默认实现，避免破坏现有实现类。  
语法：

interface Vehicle {
   default void start() {
       System.out.println("Engine started");
   }
}
冲突解决：  
若多个接口有同名默认方法，实现类必须重写：

class Car implements Vehicle, Engine {
   @Override
   public void start() {
       Vehicle.super.start(); // 显式指定接口
   }
}

静态方法
作用：在接口中��义工具方法。  
示例：

interface MathUtils {
   static int add(int a, int b) {
       return a + b;
   }
}
int sum = MathUtils.add(1, 2);

六、Optional 类（空指针防护）
作用：封装可能为null的值，避免显式判空。  
核心方法：
•  Optional.ofNullable(value)：允许 `null` 的包装。  
•  orElse(default)：为空时返回默认值。  
•  ifPresent(Consumer)：值存在时执行操作。  
示例：

Optional<String> name = Optional.ofNullable(getName());
String result = name.orElse("Unknown");
name.ifPresent(System.out::println);

七、新的日期时间 API（java.time）
解决痛点：旧Date/Calendar的线程不安全与设计混乱。  
核心类：
•  Instant：时间戳
•  LocalDate：日期（如2023-10-01）。  
•  LocalTime：时间（如14:30:00）。  
•  LocalDateTime：日期 + 时间。  
•  ZonedDateTime：带时区的日期时间。  
•  Duration：计算时间间隔，精确到纳秒；
•  Period：计算日期间隔（天、月、年）；
•  DateTimeFormatter：格式化输出
示例：

// 当前 UTC 时间
Instant now = Instant.now(); 
// 转为毫秒时间戳
long epochMilli = now.toEpochMilli(); 

// 2023-10-01
LocalDate date = LocalDate.of(2023, Month.OCTOBER, 1);
// 14:30:00
LocalTime time = LocalTime.parse("14:30:00");
// 2023-10-01T14:30:00
LocalDateTime dateTime = date.atTime(time);

// 获取当前时间
LocalDate today = LocalDate.now();          // 当前日期
LocalTime now = LocalTime.now();            // 当前时间
LocalDateTime current = LocalDateTime.now(); // 当前日期 + 时间

// 时间加减
LocalDateTime tomorrow = LocalDateTime.now().plusDays(1);
LocalTime inAnHour = LocalTime.now().plusHours(1);

// 时区转换
ZonedDateTime utcTime = ZonedDateTime.now(ZoneId.of("UTC"));
ZonedDateTime shanghaiTime = utcTime.withZoneSameInstant(ZoneId.of("Asia/Shanghai"));

// 解析字符串
LocalDate date = LocalDate.parse("2023-10-01");
LocalDateTime datetime = LocalDateTime.parse("2023-10-01T14:30:00", 
    DateTimeFormatter.ISO_LOCAL_DATE_TIME);

// 2023-10-01T02:30:00-04:00[America/New_York]
ZonedDateTime zdt = ZonedDateTime.now(ZoneId.of("America/New_York"));
System.out.println(zdt); 

// 间隔小时数
Duration duration = Duration.between(startTime, endTime);
System.out.println(duration.toHours());

// 间隔月数
Period period = Period.between(startDate, endDate);
System.out.println(period.getMonths()); 

// "2023-10-01 14:30:00"
DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
String formatted = LocalDateTime.now().format(formatter);

与旧版API对比：
线程安全：旧版线程不安全，新版所有类都是不可变的（immutable）；
涉及清晰度：旧版混乱Month从0开始，新版更直观（Month.JANUARY为1）；
时区处理：旧版依赖TimeZone手动调整，新版内置ZoneId和ZonedDateTime；
格式化：SimpleDateFormat非线程安全，DateTimeFormatter线程安全；

八、其他重要特性
重复注解：
同一注解可多次使用（需定义@Repeatable）。  
•  Java8之前需要使用另一个注解来存储重复注解：

public @interface Authority {
     String role();
}

public @interface Authorities {
    Authority[] value();
}

public class RepeatAnnotationUseOldVersion {

    @Authorities({@Authority(role="Admin"),@Authority(role="Manager")})
    public void doSomeThing(){
    }
}

•  Java8重复注解使用：

@Repeatable(Authorities.class)
public @interface Authority {
     String role();
}

public @interface Authorities {
    Authority[] value();
}

public class RepeatAnnotationUseNewVersion {
    @Authority(role="Admin")
    @Authority(role="Manager")
    public void doSomeThing(){ }
}


2. 类型注解：
Java8之前，注解只能是用于声明类、方法和属性，Java8中注解可以应用在任何地方。

// 创建类实例
new @Interned MyObject();

// 类型映射
myString = (@NonNull String) str;

// implements语句中
class UnmodifiableList<T> implements @Readonly List<@Readonly T> { … }

// throw exception声明
void monitorTemperature() throws @Critical TemperatureException { … }

// 向下兼容jdk5,6,7
import checkers.nullness.quals.*;
public class GetStarted {
    void sample() {
        /*@NonNull*/ Object ref = null;
    }
}

3. Nashorn JavaScript 引擎：支持在JVM中运行JS代码（后续版本已移除）。  

StampedLock
在java5之前，实现同步主要是使用synchronized。它是Java语言的关键字，当它用来修饰一个方法或者一个代码块的时候，能够保证在同一时刻最多只有一个线程执行该段代码。Lock是Java5在java.util.concurrent.locks新增的一个API，它是一个接口，核心方法是lock()，unlock()，tryLock()，实现类有ReentrantLock, ReentrantReadWriteLock.ReadLock, ReentrantReadWriteLock.WriteLock；

与synchronized不同的是，Lock完全用Java写成，在java这个层面是无关JVM实现的。Lock提供更灵活的锁机制，很多synchronized 没有提供的许多特性，比如锁投票，定时锁等候和中断锁等候，但因为lock是通过代码实现的，要保证锁定一定会被释放，就必须将unLock()放到finally{}中。

StampedLock是java8在java.util.concurrent.locks新增的一个API。StampedLock控制锁有三种模式(写，读，乐观读)，一个StampedLock状态是由版本和模式两个部分组成，锁获取方法返回一个数字作为票据stamp，它用相应的锁状态表示并控制访问，数字0表示没有写锁被授权访问。在读锁上分为悲观锁和乐观锁。所谓的乐观读模式，也就是若读的操作很多，写的操作很少的情况下，你可以乐观地认为，写入与读取同时发生几率很少，因此不悲观地使用完全的读取锁定，程序可以查看读取资料之后，是否遭到写入执行的变更，再采取后续的措施(重新读取变更信息，或者抛出异常) ，这一个小小改进，可大幅度提高程序的吞吐量！！

class Point {
   private double x, y;
   private final StampedLock sl = new StampedLock();
   void move(double deltaX, double deltaY) { // an exclusively locked method
     long stamp = sl.writeLock();
     try {
       x += deltaX;
       y += deltaY;
     } finally {
       sl.unlockWrite(stamp);
     }
   }
  //下面看看乐观读锁案例
   double distanceFromOrigin() { // A read-only method
     long stamp = sl.tryOptimisticRead(); //获得一个乐观读锁
     double currentX = x, currentY = y; //将两个字段读入本地局部变量
     if (!sl.validate(stamp)) { //检查发出乐观读锁后同时是否有其他写锁发生? 
        stamp = sl.readLock(); //如果没有，我们再次获得一个读悲观锁
        try {
          currentX = x; // 将两个字段读入本地局部变量
          currentY = y; // 将两个字段读入本地局部变量
        } finally {
           sl.unlockRead(stamp);
        }
     }
     return Math.sqrt(currentX * currentX + currentY * currentY);
   }
        //下面是悲观读锁案例
   void moveIfAtOrigin(double newX, double newY) { // upgrade
     // Could instead start with optimistic, not read mode
     long stamp = sl.readLock();
     try {
       while (x == 0.0 && y == 0.0) { //循环，检查当前状态是否符合
         long ws = sl.tryConvertToWriteLock(stamp); //将读锁转为写锁
         if (ws != 0L) { //这是确认转为写锁是否成功
           stamp = ws; //如果成功 替换票据
           x = newX; //进行状态改变
           y = newY; //进行状态改变
           break;
         }
         else { //如果不能成功转换为写锁
           sl.unlockRead(stamp); //我们显式释放读锁
           stamp = sl.writeLock(); //显式直接进行写锁 然后再通过循环再试
         }
       }
     } finally {
       sl.unlock(stamp); //释放读锁或写锁
     }
   }
 }

移除PermGen
PermGen space的全称是Permanent Generation space,是指内存的永久保存区域，说说为什么会内存益出: 这一部分用于存放Class和Meta的信息,Class在被 Load的时候被放入PermGen space区域，它和和存放Instance的Heap区域不同,所以如果你的APP会LOAD很多CLASS的话,就很可能出现PermGen space错误。这种错误常见在web服务器对JSP进行pre compile的时候。

JDK8 HotSpot JVM 将移除永久区，使用本地内存来存储类元数据信息并称之为: 元空间(Metaspace)。默认情况下，类元数据只受可用的本地内存限制(容量取决于是32位或是64位操作系统的可用虚拟内存大小)。新参数(MaxMetaspaceSize)用于限制本地内存分配给类元数据的大小。如果没有指定这个参数，元空间会在运行时根据需要动态调整。对于僵死的类及类加载器的垃圾回收将在元数据使用达到“MaxMetaspaceSize”参数的设定值时进行。
