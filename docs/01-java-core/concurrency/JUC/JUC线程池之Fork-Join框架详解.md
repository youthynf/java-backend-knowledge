# JUC线程池之Fork/Join框架详解

JUC线程池之Fork/Join框架详解
一、Fork/Join框架概述
Fork/Join是 Java 7 引入的并行任务执行框架，基于分治算法（Divide-and-Conquer）和工作窃取（Work-Stealing）机制，可以将一个大任务差费为很多小任务来异步执行，适用于可拆分的计算密集型任务（如大规模数据处理、递归计算等）。

二、核心思想
分治策略（Fork/Join）
•  Fork（拆分）：将大任务递归拆分为小任务，直到任务足够小（达到阈值）。
•  Join（合并）：将子任务的结果合并，得到最终结果。

工作窃取（Work-Stealing）
•  每个线程（ForkJoinWorkerThread）维护一个双端队列（Deque）的任务队列（WorkQueue），存放自己的任务，工作线程优先处理来自自身队列的任务。
•  空闲线程会从其他线程的队列尾部“窃取”任务执行，提高CPU利用率。

具体思路：
•  每个线程都有自己的一个WorkQueue，该工作队列是一个双端队列。
•  队列支持三个功能push、pop、poll；
•  push/pop只能被队列的所有者线程调用，而poll可以被其他线程调用。
•  划分的子任务调用fork时，都会被push到自己的队列中。
•  默认情况下，工作线程从自己的双端队列获出任务并执行。
•  当自己的队列为空时，线程随机从另一个线程的队列末尾调用poll方法窃取任务。
三、核心模块
•  任务对象：ForkJoinTask（包括RecursiveTask有返回值、RecursiveAction无返回值和CountedCompleter）；
•  执行Fork/Join任务的线程：ForkJoinWorkerThread；
•  线程池：ForkJoinPool（任务执行线程池，管理 worker 线程和工作队列）
这三者的关系是: ForkJoinPool可以通过池中的ForkJoinWorkerThread来处理ForkJoinTask任务。
ForkJoinPool只接收ForkJoinTask任务（在实际使用中，也可以接收Runnable/Callable任务，但在真正运行时，也会把这些任务封装成ForkJoinTask类型的任务），RecursiveTask是ForkJoinTask的子类，是一个可以递归执行的ForkJoinTask，RecursiveAction 是一个无返回值的 RecursiveTask，CountedCompleter 在任务完成执行后会触发执行一个自定义的钩子函数。在实际运用中，我们一般都会继承RecursiveTask、RecursiveAction或CountedCompleter来实现我们的业务需求，而不会直接继承 ForkJoinTask 类。

四、任务执行流程
ForkJoinPool中的任务执行分为两种：
•  直接通过FJP提交的外部任务(external/submissions task)，存放在workQueues的偶数槽位；
•  通过内部fork分割的子任务(Worker task)，存放在workQueues的奇数槽位。

向ForkJoinPool提交任务有三种方式：
•  invoke()会等待任务计算完毕并返回计算结果；
•  execute()是直接向池提交一个任务来异步执行，无返回结果；
•  submit()也是异步执行，但是会返回提交的任务，在适当的时候可通过task.get()获取执行结果。这三种提交方式都都是调用externalPush()方法来完成

五、示例代码
提交任务

ForkJoinPool pool = new ForkJoinPool();
MyTask task = new MyTask(...); // 自定义 ForkJoinTask
pool.invoke(task); // 同步执行，并返回结果
// 或
pool.submit(task); // 异步提交，返回 Future

任务拆分（Fork）
在compute()方法中：

protected V compute() {
   if (任务足够小) {
       return 直接计算结果;
   } else {
       MyTask leftTask = new MyTask(...); // 拆分子任务1
       MyTask rightTask = new MyTask(...); // 拆分子任务2
       leftTask.fork(); // 异步执行子任务1
       rightTask.fork(); // 异步执行子任务2
       return leftTask.join() + rightTask.join(); // 合并结果
   }
}

3 工作窃取（Work-Stealing）
•  每个ForkJoinWorkerThread从自己的队列头部取任务。
•  空闲线程从其他线程的队列尾部窃取任务，减少竞争。

六、关键源码分析
ForkJoinPool` 的任务调度
•  线程池初始化：

public ForkJoinPool(int parallelism) { // parallelism = CPU核心数
     this(parallelism, defaultForkJoinWorkerThreadFactory, null, false);
}
•  工作队列（WorkQueue）：
每个线程有一个WorkQueue，存放待执行任务。
队列采用双端队列（Deque），支持 push/pop（LIFO）和poll（FIFO）。
ForkJoinTask.fork()

public final ForkJoinTask<V> fork() {
   Thread t = Thread.currentThread();
   if (t instanceof ForkJoinWorkerThread) {
       ((ForkJoinWorkerThread)t).workQueue.push(this); // 放入自己的队列
   } else {
       ForkJoinPool.common.externalPush(this); // 非ForkJoin线程提交任务
   }
   return this;
}

ForkJoinTask.join()

public final V join() {
   int s;
   if ((s = doJoin() & DONE_MASK) != NORMAL) {
       reportException(s); // 处理异常
   }
   return getRawResult(); // 返回结果
}
doJoin()会等待任务完成，并返回状态。

七、使用示例
计算 1+2+...+n（RecursiveTask）

class SumTask extends RecursiveTask<Long> {
   private final long start, end;
   private static final long THRESHOLD = 1000; // 拆分阈值

   SumTask(long start, long end) {
       this.start = start;
       this.end = end;
   }

   @Override
   protected Long compute() {
       if (end - start <= THRESHOLD) {
           long sum = 0;
           for (long i = start; i <= end; i++) sum += i;
           return sum;
       } else {
           long mid = (start + end) / 2;
           SumTask left = new SumTask(start, mid);
           SumTask right = new SumTask(mid + 1, end);
           left.fork(); // 异步执行左半部分
           return right.compute() + left.join(); // 同步计算右半部分 + 合并结果
       }
   }
}

// 调用
ForkJoinPool pool = new ForkJoinPool();
long result = pool.invoke(new SumTask(1, 1_000_000));

并行排序（RecursiveAction）

class SortTask extends RecursiveAction {
   private final int[] array;
   private final int start, end;

   SortTask(int[] array, int start, int end) {
       this.array = array;
       this.start = start;
       this.end = end;
   }

   @Override
   protected void compute() {
       if (end - start <= 100) {
           Arrays.sort(array, start, end); // 小任务直接排序
       } else {
           int mid = (start + end) / 2;
           invokeAll(
               new SortTask(array, start, mid),
               new SortTask(array, mid, end)
           ); // 并行执行子任务
           merge(array, start, mid, end); // 合并结果
       }
   }
}

八、性能优化建议
合理设置阈值：
•  任务太小 → 拆分和调度的开销可能超过计算本身。
•  任务太大 → 无法充分利用并行性。

避免阻塞操作：
•  Fork/Join适合计算密集型任务，不适合IO密集型任务（会导致线程阻塞）。

避免共享可变状态：
•  任务之间尽量无状态，减少同步开销。

使用invokeAll替代多次fork：

invokeAll(leftTask, rightTask); // 优于 leftTask.fork(); rightTask.fork();

注意fork()、compute()、join()的顺序
compute()执行任务并等待结果，fork()异步执行任务，join()等待fork()异步计算结果，如果三个方法调用顺序不合理，实际上并没有并行效果。

九、对比传统线程池
任务调度：ForkJoinPool使用工作窃取（Work-Stealing），而ThreadPoolExecutor采用固定线程+任务队列；
适用场景：ForkJoinPool适用于递归/分治任务，而ThreadPoolExecutor适用于通用任务（尤其是IO密集型）；
线程数：ForkJoinPool默认为CPU核心数，而ThreadPoolExecutor需手动配置；
任务队列：ForkJoinPool每个线程一个双端队列，而ThreadPoolExecutor全局共享队列；

十、总结
•  核心机制：分治（Fork/Join）+ 工作窃取（Work-Stealing）。
•  适用场景：递归计算、排序、并行流（parallelStream）等计算密集型任务。
•  最佳实践：
任务粒度适中（避免过小或过大）。
    - 使用RecursiveTask（有返回值）或RecursiveAction（无返回值）。
    - 避免阻塞和共享状态。
Fork/Join是 Java 并行编程的重要工具，合理使用可以显著提升计算性能！
