# ThreadPoolExecutor线程池任务执行流程是怎么样的？

ThreadPoolExecutor线程池任务执行流程是怎么样的？
ThreadPoolExecutor提供了有返回值和无返回值的执行任务的方法：
void execute(Runnable command)：无返回值的任务提交
Future submit(Runnable task)：提交Runnable任务，获取执行结果
Future submit(Runnable task, T result)：提交Runnable任务并指定执行结果
Future submit(Callabletask)：提交Callable任务
其中submit实际上最终还是调用execute方法，只是增加返回一个Future对象，用来获取任务执行结果。

execute(Runnable command)方法执行步骤：
提交Runnable时，不管当前线程是否存在空闲线程，只要线程数量小于核心线程数，则创建新的线程，否则加入等待队列；
如果等待队列已满，则判断当前线程数是否小于最大线程数，如果是则创建新的线程执行，并将当前Runnable作为线程的第一个执行任务；
如果线程数大于等于最大线程数，且等待队列已满，则新增的Runnable任务将会执行指定的拒绝策略。
助记：优先创建核心线程，不管线程是否空闲，直到达到核心线程数；其次加入阻塞队列，直到队列已满；再次创建线程，直到达到最大线程数；最后执行拒绝策略。
