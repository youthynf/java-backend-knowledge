# JUC线程池之FutureTask详解

JUC线程池之FutureTask详解
一、概述
FutureTask为Future提供了基础实现，如获取任务执行结果(get)和取消任务(cancel)等。如果任务尚未完成，获取任务执行结果时将会阻塞。一旦执行结束，任务就不能被重启或取消(除非使用runAndReset执行计算)。FutureTask常用来封装Callable和Runnable，也可以作为一个任务提交到线程池中执行。FutureTask的线程安全由CAS来保证。

二、类关系
FutureTask实现了RunnableFuture接口，而RunnableFuture接口继承了Runnable接口和Future接口，所以FutureTask既能当做一个Runnable直接被Thread执行，也能作为Future用来得到Callable的计算结果。

三、源码解析
Callable接口
Callable是个泛型接口，泛型V就是要call()方法返回的类型。对比Runnable接口，Runnable不会返回数据也不能抛出异常。

public interface Callable<V> {
   /**
    * Computes a result, or throws an exception if unable to do so.
    *
    * @return computed result
    * @throws Exception if unable to compute a result
    */
   V call() throws Exception;
}

2. Future接口
Future接口代表异步计算的结果，通过Future接口提供的方法可以查看异步计算是否执行完成，或者等待执行结果并获取执行结果，同时还可以取消执行。Future接口的定义如下：

public interface Future<V> {
   boolean cancel(boolean mayInterruptIfRunning);
   boolean isCancelled();
   boolean isDone();
   V get() throws InterruptedException, ExecutionException;
   V get(long timeout, TimeUnit unit)
       throws InterruptedException, ExecutionException, TimeoutException;
}
•  cancel()：cancel()方法用来取消异步任务的执行。如果异步任务已经完成或者已经被取消，或者由于某些原因不能取消，则会返回false。如果任务还没有被执行，则会返回true并且异步任务不会被执行。如果任务已经开始执行了但是还没有执行完成，若mayInterruptIfRunning为true，则会立即中断执行任务的线程并返回true，若mayInterruptIfRunning为false，则会返回true且不会中断任务执行线程。
•  isCanceled()：判断任务是否被取消，如果任务在结束(正常执行结束或者执行异常结束)前被取消则返回true，否则返回false。
•  isDone()：判断任务是否已经完成，如果完成则返回true，否则返回false。需要注意的是：任务执行过程中发生异常、任务被取消也属于任务已完成，也会返回true。
•  get()：获取任务执行结果，如果任务还没完成则会阻塞等待直到任务执行完成。如果任务被取消则会抛出CancellationException异常，如果任务执行过程发生异常则会抛出ExecutionException异常，如果阻塞等待过程中被中断则会抛出InterruptedException异常。
•  get(long timeout,Timeunit unit)：带超时时间的get()版本，如果阻塞等待过程中超时则会抛出TimeoutException异常。
核心属性

//内部持有的callable任务，运行完毕后置空
private Callable<V> callable;

//从get()中返回的结果或抛出的异常
private Object outcome; // non-volatile, protected by state reads/writes

//运行callable的线程
private volatile Thread runner;

//使用Treiber栈保存等待线程
private volatile WaitNode waiters;

//任务状态
private volatile int state;
private static final int NEW          = 0;
private static final int COMPLETING   = 1;
private static final int NORMAL       = 2;
private static final int EXCEPTIONAL  = 3;
private static final int CANCELLED    = 4;
private static final int INTERRUPTING = 5;
private static final int INTERRUPTED  = 6;
其中需要注意的是state是volatile类型的，也就是说只要有任何一个线程修改了这个变量，那么其他所有的线程都会知道最新的值。7种状态具体表示：
•  NEW：表示是个新的任务或者还没被执行完的任务。这是初始状态。
•  COMPLETING：任务已经执行完成或者执行任务的时候发生异常，但是任务执行结果或者异常原因还没有保存到outcome字段(outcome字段用来保存任务执行结果，如果发生异常，则用来保存异常原因)的时候，状态会从NEW变更到COMPLETING。但是这个状态会时间会比较短，属于中间状态。
•  NORMAL：任务已经执行完成并且任务执行结果已经保存到outcome字段，状态会从COMPLETING转换到NORMAL。这是一个最终态。
•  EXCEPTIONAL：任务执行发生异常并且异常原因已经保存到outcome字段中后，状态会从COMPLETING转换到EXCEPTIONAL。这是一个最终态。
•  CANCELLED：任务还没开始执行或者已经开始执行但是还没有执行完成的时候，用户调用了cancel(false)方法取消任务且不中断任务执行线程，这个时候状态会从NEW转化为CANCELLED状态。这是一个最终态。
•  INTERRUPTING：任务还没开始执行或者已经执行但是还没有执行完成的时候，用户调用了cancel(true)方法取消任务并且要中断任务执行线程但是还没有中断任务执行线程之前，状态会从NEW转化为INTERRUPTING。这是一个中间状态。
•  INTERRUPTED：调用interrupt()中断任务执行线程之后状态会从INTERRUPTING转换到INTERRUPTED。这是一个最终态。 有一点需要注意的是，所有值大于COMPLETING的状态都表示任务已经执行完成(任务正常执行完成，任务执行异常或者任务被取消)。

四、FutureTask示例
常用使用方式：
•  第一种方式：Future + ExecutorService
•  第二种方式：FutureTask + ExecutorService
•  第三种方式：FutureTask + Thread

import java.util.concurrent.*;

public class CallDemo {

   public static void main(String[] args) throws ExecutionException, InterruptedException {

       /**
        * 第一种方式:Future + ExecutorService
        * Task task = new Task();
        * ExecutorService service = Executors.newCachedThreadPool();
        * Future<Integer> future = service.submit(task1);
        * service.shutdown();
        */


       /**
        * 第二种方式: FutureTask + ExecutorService
        * ExecutorService executor = Executors.newCachedThreadPool();
        * Task task = new Task();
        * FutureTask<Integer> futureTask = new FutureTask<Integer>(task);
        * executor.submit(futureTask);
        * executor.shutdown();
        */

       /**
        * 第三种方式:FutureTask + Thread
        */
       // 2. 新建FutureTask,需要一个实现了Callable接口的类的实例作为构造函数参数
       FutureTask<Integer> futureTask = new FutureTask<Integer>(new Task());
       // 3. 新建Thread对象并启动
       Thread thread = new Thread(futureTask);
       thread.setName("Task thread");
       thread.start();

       try {
           Thread.sleep(1000);
       } catch (InterruptedException e) {
           e.printStackTrace();
       }

       System.out.println("Thread [" + Thread.currentThread().getName() + "] is running");

       // 4. 调用isDone()判断任务是否结束
       if(!futureTask.isDone()) {
           System.out.println("Task is not done");
           try {
               Thread.sleep(2000);
           } catch (InterruptedException e) {
               e.printStackTrace();
           }
       }
       int result = 0;
       try {
           // 5. 调用get()方法获取任务结果,如果任务没有执行完成则阻塞等待
           result = futureTask.get();
       } catch (Exception e) {
           e.printStackTrace();
       }

       System.out.println("result is " + result);

   }

   // 1. 继承Callable接口,实现call()方法,泛型参数为要返回的类型
   static class Task implements Callable<Integer> {
       @Override
       public Integer call() throws Exception {
           System.out.println("Thread [" + Thread.currentThread().getName() + "] is running");
           int result = 0;
           for(int i = 0; i < 100;++i) {
               result += i;
           }

           Thread.sleep(3000);
           return result;
       }
   }
}
